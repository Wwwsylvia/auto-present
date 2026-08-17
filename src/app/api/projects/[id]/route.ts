import { NextResponse } from "next/server";
import { reconcileRenderJobs } from "@/lib/render-jobs";
import { getProject, updateProject } from "@/lib/store";
import { rejectUnsafeRequest } from "@/lib/http";

export async function GET(
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
  const renderJobs = await reconcileRenderJobs(project);
  const changed = renderJobs.some((job, index) => {
    const current = project.renderJobs[index];
    return job.status !== current.status || job.progress !== current.progress || job.error !== current.error;
  });
  if (!changed) return NextResponse.json(project);
  const statuses = new Map(renderJobs.map((job) => [job.id, job]));
  const updated = await updateProject(id, (current) => ({
    ...current,
    renderJobs: current.renderJobs.map((job) =>
      job.status === "stale" ? job : (statuses.get(job.id) ?? job),
    ),
  }));
  return NextResponse.json(updated);
}
