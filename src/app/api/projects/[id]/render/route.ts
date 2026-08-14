import { NextResponse } from "next/server";
import {
  createQueuedRenderJob,
  dispatchRenderJob,
  readRenderStatus,
  writeRenderManifest,
  writeRenderStatus,
} from "@/lib/render-jobs";
import type { RenderJob } from "@/lib/domain";
import { getProject, updateProject } from "@/lib/store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind === "final" ? "final" : "preview";
  let job: RenderJob | undefined;
  try {
    const queuedJob = createQueuedRenderJob(project, kind);
    job = queuedJob;
    const projectWithJob = {
      ...project,
      renderJobs: [...project.renderJobs, queuedJob],
    };
    await writeRenderManifest(queuedJob, projectWithJob);
    await updateProject(id, (current) => ({
      ...current,
      renderJobs: [...current.renderJobs, queuedJob],
      lastError: null,
    }));
    await dispatchRenderJob(queuedJob.id);
    const status = (await readRenderStatus(queuedJob.id)) ?? queuedJob;
    const updated = await updateProject(id, (current) => ({
      ...current,
      renderJobs: current.renderJobs.map((item) =>
        item.id === queuedJob.id ? status : item,
      ),
      lastError: status.error ?? null,
    }));
    return NextResponse.json(updated, { status: status.status === "queued" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rendering failed";
    if (job) {
      const failed = { ...job, status: "failed" as const, error: message };
      await writeRenderStatus(failed);
      await updateProject(id, (current) => ({
        ...current,
        renderJobs: current.renderJobs.map((item) => (item.id === job?.id ? failed : item)),
        lastError: message,
      }));
    } else {
      await updateProject(id, (current) => ({ ...current, lastError: message }));
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
