import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { activeRevision, updateSlideSchema } from "@/lib/domain";
import { getProject, updateProject } from "@/lib/store";
import { rejectUnsafeRequest } from "@/lib/http";
import { runBestEffort } from "@/lib/local-files";
import { markRenderJobsStale } from "@/lib/render-jobs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> },
) {
  const rejection = rejectUnsafeRequest(request);
  if (rejection) return rejection;
  const { id, slideId } = await params;
  const parsed = updateSlideSchema.safeParse({
    ...(await request.json()),
    slideId,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid slide update" },
      { status: 400 },
    );
  }
  const project = await getProject(id);
  const revision = project && activeRevision(project);
  if (!project || !revision) {
    return NextResponse.json({ error: "Project or revision not found" }, { status: 404 });
  }
  if (revision.version !== parsed.data.expectedVersion) {
    return NextResponse.json(
      { error: "This presentation changed elsewhere. Refresh before editing." },
      { status: 409 },
    );
  }
  const nextRevision = {
    ...revision,
    id: randomUUID(),
    version: revision.version + 1,
    createdAt: new Date().toISOString(),
    slides: revision.slides.map((slide) =>
      slide.id === slideId ? { ...slide, ...parsed.data.changes } : slide,
    ),
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
  }));
  await runBestEffort("Could not invalidate obsolete render state", () =>
    markRenderJobsStale(updated.renderJobs),
  );
  return NextResponse.json(updated);
}
