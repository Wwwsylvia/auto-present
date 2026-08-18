import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RenderJob } from "@/lib/domain";
import { renderPresentation } from "@/lib/render";
import { getProject, updateProject } from "@/lib/store";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind === "final" ? "final" : "preview";
  const jobId = randomUUID();
  const queuedJob: RenderJob = {
    id: jobId,
    revisionId: project.activeRevisionId ?? "",
    kind,
    status: "queued",
    progress: 0,
  };
  try {
    await updateProject(id, (current) => ({
      ...current,
      renderJobs: [...current.renderJobs, queuedJob],
      lastError: null,
    }));
    const renderingProject = await updateProject(id, (current) => ({
      ...current,
      renderJobs: current.renderJobs.map((job) =>
        job.id === jobId ? { ...job, status: "rendering" as const, progress: 10 } : job,
      ),
    }));
    const { job } = await renderPresentation(renderingProject, kind, jobId);
    const updated = await updateProject(id, (current) => {
      const invalidated = current.renderJobs.some(
        (currentJob) => currentJob.id === jobId && currentJob.status === "stale",
      );
      return {
        ...current,
        renderJobs: current.renderJobs.map((currentJob) =>
          currentJob.id === jobId && currentJob.status !== "stale" ? job : currentJob,
        ),
        lastError: invalidated ? current.lastError : null,
      };
    });
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rendering failed";
    await updateProject(id, (current) => {
      const invalidated = current.renderJobs.some(
        (job) => job.id === jobId && job.status === "stale",
      );
      return {
        ...current,
        lastError: invalidated ? current.lastError : message,
        renderJobs: current.renderJobs.map((job) =>
          job.id === jobId && job.status !== "stale"
            ? { ...job, status: "failed" as const, error: message, progress: 0 }
            : job,
        ),
      };
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
