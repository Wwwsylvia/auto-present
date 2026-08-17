import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  activeRevision,
  actualDurationSeconds,
  presentationRevisionSchema,
} from "@/lib/domain";
import { generateRevisionPatch } from "@/lib/generate";
import { getProject, updateProject } from "@/lib/store";
import {
  PublicError,
  publicErrorResponse,
  rejectNonLocalMutation,
} from "@/lib/http";
import { invalidateRenderJobs } from "@/lib/render-queue";

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
  const body = (await request.json()) as { instruction?: string; expectedVersion?: number };
  const instruction = body.instruction?.trim();
  if (!instruction || instruction.length > 2000) {
    return NextResponse.json({ error: "Enter a revision request under 2,000 characters" }, { status: 400 });
  }
  if (body.expectedVersion !== revision.version) {
    return NextResponse.json({ error: "The presentation changed. Refresh before revising." }, { status: 409 });
  }
  try {
    const patch = await generateRevisionPatch(project, instruction);
    const changes = new Map(patch.slideChanges.map((change) => [change.slideId, change.changes]));
    const nextRevision = presentationRevisionSchema.parse({
      ...revision,
      id: randomUUID(),
      version: revision.version + 1,
      createdAt: new Date().toISOString(),
      source: "foundry" as const,
      slides: revision.slides.map((slide) => ({ ...slide, ...changes.get(slide.id) })),
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
    const updated = await updateProject(id, (current) => {
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
      return {
        ...current,
        revisions: [...current.revisions, nextRevision],
        activeRevisionId: nextRevision.id,
        approvedDeckRevisionId: null,
        renderJobs: current.renderJobs.map((job) =>
          job.status === "complete" ? { ...job, status: "stale" as const } : job,
        ),
        lastError: null,
      };
    });
    await invalidateRenderJobs(id, nextRevision.id);
    return NextResponse.json({ project: updated, summary: patch.summary });
  } catch (error) {
    return publicErrorResponse(error, "AI revision failed. Check local service access and try again.", 502);
  }
}
