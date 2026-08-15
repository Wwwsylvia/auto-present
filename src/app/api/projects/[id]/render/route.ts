import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/store";
import {
  activateRenderJob,
  createRenderJob,
  discardDeferredRenderJob,
  enqueueRender,
} from "@/lib/render-queue";
import {
  publicErrorResponse,
  rejectNonLocalMutation,
} from "@/lib/http";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectNonLocalMutation(request);
  if (rejection) return rejection;
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind === "final" ? "final" : "preview";
  let deferredJobId: string | undefined;
  let projectPersisted = false;
  try {
    const updated = await updateProject(id, async (current) => {
      const record = createRenderJob(current, kind);
      await enqueueRender(record, { deferClaim: true });
      deferredJobId = record.job.id;
      return {
        ...current,
        renderJobs: [...current.renderJobs, record.job],
        lastError: null,
      };
    });
    projectPersisted = true;
    if (!deferredJobId) throw new Error("Deferred render job was not created");
    await activateRenderJob(deferredJobId);
    deferredJobId = undefined;
    return NextResponse.json(updated, { status: 202 });
  } catch (error) {
    if (deferredJobId && !projectPersisted) {
      await discardDeferredRenderJob(deferredJobId);
    }
    await updateProject(id, (current) => ({
      ...current,
      lastError: "Could not queue the render.",
    }));
    return publicErrorResponse(error, "Could not queue the render.", 500);
  }
}
