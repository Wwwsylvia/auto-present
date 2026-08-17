import { NextResponse } from "next/server";
import {
  createQueuedRenderJob,
  dispatchRenderJob,
  discardRenderJob,
  readRenderStatus,
  writeRenderManifest,
  writeRenderStatus,
  findActiveRenderJob,
} from "@/lib/render-jobs";
import type { RenderJob } from "@/lib/domain";
import { updateProject } from "@/lib/store";
import { publicErrorMessage, rejectUnsafeRequest } from "@/lib/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectUnsafeRequest(request);
  if (rejection) return rejection;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind === "final" ? "final" : "preview";
  let job: RenderJob | undefined;
  let created = false;
  try {
    await updateProject(id, async (current) => {
      const activeJob = findActiveRenderJob(current, kind);
      if (activeJob) {
        job = activeJob;
        return current;
      }
      const queuedJob = createQueuedRenderJob(current, kind);
      job = queuedJob;
      created = true;
      const projectWithJob = {
        ...current,
        renderJobs: [...current.renderJobs, queuedJob],
        lastError: null,
      };
      await writeRenderManifest(queuedJob, projectWithJob);
      return projectWithJob;
    });
    if (!job) throw new Error("Render job registration failed");
    if (created) await dispatchRenderJob(job.id);
    const status = (await readRenderStatus(job.id)) ?? job;
    const updated = await updateProject(id, (current) => ({
      ...current,
      renderJobs: current.renderJobs.map((item) =>
        item.id === job?.id && item.status !== "stale" ? status : item,
      ),
      lastError:
        current.renderJobs.find((item) => item.id === job?.id)?.status === "stale"
          ? current.lastError
          : (status.error ?? null),
    }));
    return NextResponse.json(updated, { status: status.status === "queued" ? 202 : 200 });
  } catch (error) {
    const message = publicErrorMessage(error, "Rendering failed");
    if (job && created && !(await readRenderStatus(job.id))) {
      await updateProject(id, (current) => ({
        ...current,
        renderJobs: current.renderJobs.filter((item) => item.id !== job?.id),
      })).catch(() => undefined);
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
      await updateProject(id, (current) => ({ ...current, lastError: message })).catch(
        () => undefined,
      );
    }
    return NextResponse.json(
      { error: message },
      { status: message === "Project not found" ? 404 : 500 },
    );
  }
}
