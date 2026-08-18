import { NextResponse } from "next/server";
import { generatePresentation } from "@/lib/generate";
import { inspectPublicRepository } from "@/lib/github";
import { projectInputSchema } from "@/lib/domain";
import { invalidateDeckOutputs } from "@/lib/project-state";
import { invalidateRenderJobs } from "@/lib/render-queue";
import { getProject, updateProject } from "@/lib/store";
import {
  publicErrorResponse,
  rejectNonLocalMutation,
} from "@/lib/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectNonLocalMutation(request);
  if (rejection) return rejection;
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    input?: unknown;
    expectedActiveRevisionId?: string | null;
  };
  const input = projectInputSchema.safeParse(body.input ?? project.input);
  if (!input.success) {
    return NextResponse.json(
      { error: input.error.issues[0]?.message ?? "Invalid project brief" },
      { status: 400 },
    );
  }

  try {
    const repositoryChanged = input.data.githubUrl !== project.input.githubUrl;
    const repository =
      input.data.githubUrl && (repositoryChanged || !project.repository)
        ? await inspectPublicRepository(input.data.githubUrl)
        : input.data.githubUrl
          ? project.repository
          : null;
    const revision = await generatePresentation({ ...project, input: input.data, repository });
    const updated = await updateProject(
      id,
      (current) => {
        if (
          body.expectedActiveRevisionId !== undefined &&
          current.activeRevisionId !== body.expectedActiveRevisionId
        ) {
          throw new Error("REVISION_CONFLICT");
        }
        return invalidateDeckOutputs({
          ...current,
          input: input.data,
          repository,
          revisions: [...current.revisions, revision],
          activeRevisionId: revision.id,
          approvedPlanRevisionId: revision.id,
          lastError: null,
        });
      },
      { beforeCommit: () => invalidateRenderJobs(id, revision.id) },
    );
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "REVISION_CONFLICT") {
      return NextResponse.json(
        { error: "The project changed while regenerating. Review the latest version and try again." },
        { status: 409 },
      );
    }
    await updateProject(id, (current) => ({
      ...current,
      lastError: "Generation failed. Review the error and try again.",
    }));
    return publicErrorResponse(error, "Generation failed. Check local service access and try again.", 502);
  }
}
