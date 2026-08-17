import { NextResponse } from "next/server";
import { generatePresentation } from "@/lib/generate";
import { inspectPublicRepository } from "@/lib/github";
import { getProject, updateProject } from "@/lib/store";
import { publicErrorMessage, rejectUnsafeRequest } from "@/lib/http";
import { runBestEffort } from "@/lib/local-files";
import { markRenderJobsStale } from "@/lib/render-jobs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectUnsafeRequest(request);
  if (rejection) return rejection;
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const repository =
      project.input.githubUrl && !project.repository
        ? await inspectPublicRepository(project.input.githubUrl)
        : project.repository;
    const revision = await generatePresentation({ ...project, repository });
    const updated = await updateProject(id, (current) => ({
      ...current,
      repository,
      revisions: [...current.revisions, revision],
      activeRevisionId: revision.id,
      approvedDeckRevisionId: null,
      renderJobs: current.renderJobs.map((job) => ({
        ...job,
        status: "stale" as const,
        progress: 0,
        outputUrl: undefined,
      })),
      lastError: null,
    }));
    await runBestEffort("Could not invalidate obsolete render state", () =>
      markRenderJobsStale(updated.renderJobs),
    );
    return NextResponse.json(updated);
  } catch (error) {
    const message = publicErrorMessage(error, "Generation failed");
    await updateProject(id, (current) => ({ ...current, lastError: message }));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
