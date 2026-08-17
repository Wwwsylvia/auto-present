import { NextResponse } from "next/server";
import {
  createQueuedRenderJob,
  dispatchRenderJob,
  discardRenderJob,
  readRenderStatus,
  writeRenderManifest,
  writeRenderStatus,
} from "@/lib/render-jobs";
import type { RenderJob } from "@/lib/domain";
import { getProject, updateProject } from "@/lib/store";
import { publicErrorMessage, rejectUnsafeRequest } from "@/lib/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectUnsafeRequest(request);
  if (rejection) return rejection;
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind === "final" ? "final" : "preview";
  let job: RenderJob | undefined;
  let registered = false;
  try {
    const queuedJob = createQueuedRenderJob(project, kind);
    job = queuedJob;
    const projectWithJob = {
      ...project,
      renderJobs: [...project.renderJobs, queuedJob],
    };
    await writeRenderManifest(queuedJob, projectWithJob);
    await updateProject(id, (current) => {
      if (
        current.activeRevisionId !== queuedJob.revisionId ||
        current.approvedDeckRevisionId !== queuedJob.revisionId
      ) {
        throw new Error("The approved presentation changed before rendering started");
      }
      return {
        ...current,
        renderJobs: [...current.renderJobs, queuedJob],
        lastError: null,
      };
    });
    registered = true;
    await dispatchRenderJob(queuedJob.id);
    const status = (await readRenderStatus(queuedJob.id)) ?? queuedJob;
    const updated = await updateProject(id, (current) => ({
      ...current,
      renderJobs: current.renderJobs.map((item) =>
        item.id === queuedJob.id && item.status !== "stale" ? status : item,
      ),
      lastError:
        current.renderJobs.find((item) => item.id === queuedJob.id)?.status === "stale"
          ? current.lastError
          : (status.error ?? null),
    }));
    return NextResponse.json(updated, { status: status.status === "queued" ? 202 : 200 });
  } catch (error) {
    const message = publicErrorMessage(error, "Rendering failed");
    if (job && !registered) {
      await discardRenderJob(job.id);
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (job) {
      const currentStatus = await readRenderStatus(job.id);
      if (currentStatus?.status === "queued" && currentStatus.dispatchLeaseExpiresAt) {
        const updated = await updateProject(id, (current) => ({
          ...current,
          renderJobs: current.renderJobs.map((item) =>
            item.id === job?.id && item.status !== "stale" ? currentStatus : item,
          ),
          lastError: message,
        }));
        return NextResponse.json(updated, { status: 202 });
      }
      const failed =
        currentStatus?.status === "stale"
          ? currentStatus
          : { ...job, status: "failed" as const, error: message };
      if (failed.status !== "stale") await writeRenderStatus(failed);
      await updateProject(id, (current) => ({
        ...current,
        renderJobs: current.renderJobs.map((item) =>
          item.id === job?.id && item.status !== "stale" ? failed : item,
        ),
        lastError: failed.status === "stale" ? current.lastError : message,
      }));
    } else {
      await updateProject(id, (current) => ({ ...current, lastError: message }));
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
