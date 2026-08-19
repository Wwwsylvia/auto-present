import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  activeRevision,
  actualDurationSeconds,
  presentationRevisionSchema,
  revisionScopeSchema,
  slideSchema,
} from "@/lib/domain";
import { generateRevisionPatch } from "@/lib/generate";
import {
  materializeSlideImages,
  removeGeneratedImages,
} from "@/lib/generated-images";
import { getProject, updateProject } from "@/lib/store";
import {
  PublicError,
  publicErrorResponse,
  rejectNonLocalMutation,
} from "@/lib/http";
import { invalidateRenderJobs } from "@/lib/render-queue";
import { invalidateDeckOutputs } from "@/lib/project-state";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectNonLocalMutation(request);
  if (rejection) return rejection;
  const { id } = await params;
  const project = await getProject(id);
  const revision = project && activeRevision(project);
  if (!project || !revision) {
    return NextResponse.json({ error: "Project or revision not found" }, { status: 404 });
  }
  const body = (await request.json()) as {
    instruction?: string;
    expectedVersion?: number;
    scope?: unknown;
    selectedSlideId?: unknown;
  };
  const instruction = body.instruction?.trim();
  if (!instruction || instruction.length > 2000) {
    return NextResponse.json({ error: "Enter a revision request under 2,000 characters" }, { status: 400 });
  }
  if (body.expectedVersion !== revision.version) {
    return NextResponse.json({ error: "The presentation changed. Refresh before revising." }, { status: 409 });
  }
  const scope = revisionScopeSchema.safeParse(body.scope ?? "deck");
  if (!scope.success) {
    return NextResponse.json({ error: "Choose a valid revision scope" }, { status: 400 });
  }
  const selectedSlideId =
    typeof body.selectedSlideId === "string" ? body.selectedSlideId : undefined;
  if (
    scope.data === "slide" &&
    !revision.slides.some((slide) => slide.id === selectedSlideId)
  ) {
    return NextResponse.json({ error: "Choose a valid slide to revise" }, { status: 400 });
  }
  let generatedAssetIds: string[] = [];
  try {
    const patch = await generateRevisionPatch(
      project,
      instruction,
      scope.data,
      selectedSlideId,
    );
    const changes = new Map(patch.slideChanges.map((change) => [change.slideId, change.changes]));
    const patchedSlides = revision.slides.map((slide) => ({
      ...slide,
      ...changes.get(slide.id),
    }));
    const materialized = await materializeSlideImages(
      project.id,
      patchedSlides.map((slide) => slideSchema.omit({ id: true }).parse(slide)),
    );
    generatedAssetIds = materialized.assetIds;
    const nextRevision = presentationRevisionSchema.parse({
      ...revision,
      id: randomUUID(),
      version: revision.version + 1,
      createdAt: new Date().toISOString(),
      source: "foundry" as const,
      imageWarnings: [...revision.imageWarnings, ...materialized.warnings],
      slides: materialized.slides.map((slide, index) => ({
        ...slide,
        id: patchedSlides[index].id,
      })),
    });
    const targetDuration = project.input.durationMinutes * 60;
    if (
      Math.abs(actualDurationSeconds(nextRevision) - targetDuration) >
      targetDuration * 0.1
    ) {
      throw new PublicError(
        "Microsoft Foundry returned a revision outside the requested duration budget.",
        502,
      );
    }
    const updated = await updateProject(
      id,
      (current) => {
        const currentRevision = activeRevision(current);
        if (
          !currentRevision ||
          currentRevision.id !== revision.id ||
          currentRevision.version !== body.expectedVersion
        ) {
          throw new PublicError(
            "The presentation changed while the revision was generated. Refresh and try again.",
            409,
          );
        }
        return invalidateDeckOutputs({
          ...current,
          revisions: [...current.revisions, nextRevision],
          activeRevisionId: nextRevision.id,
          lastError: null,
        });
      },
      { beforeCommit: () => invalidateRenderJobs(id, nextRevision.id) },
    );
    return NextResponse.json({ project: updated, summary: patch.summary });
  } catch (error) {
    await removeGeneratedImages(project.id, generatedAssetIds);
    return publicErrorResponse(error, "AI revision failed. Check local service access and try again.", 502);
  }
}
