import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { activeRevision } from "@/lib/domain";
import { generateRevisionPatch } from "@/lib/generate";
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
    const nextRevision = {
      ...revision,
      id: randomUUID(),
      version: revision.version + 1,
      createdAt: new Date().toISOString(),
      source: "foundry" as const,
      slides: revision.slides.map((slide) => ({ ...slide, ...changes.get(slide.id) })),
    };
    const updated = await updateProject(id, (current) => ({
      ...current,
      revisions: [...current.revisions, nextRevision],
      activeRevisionId: nextRevision.id,
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
    return NextResponse.json({ project: updated, summary: patch.summary });
  } catch (error) {
    const message = publicErrorMessage(error, "AI revision failed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
