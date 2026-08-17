import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { activeRevision, updateSlideSchema } from "@/lib/domain";
import { slideCopyFitIssues } from "@/lib/slide-fit";
import { getProject, updateProject } from "@/lib/store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> },
) {
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
  const currentSlide = revision.slides.find((slide) => slide.id === slideId);
  if (!currentSlide) {
    return NextResponse.json({ error: "Slide not found" }, { status: 404 });
  }
  const fitIssues = slideCopyFitIssues({ ...currentSlide, ...parsed.data.changes });
  if (fitIssues.length > 0) {
    return NextResponse.json(
      {
        error: `Shorten the slide copy so it fits: ${fitIssues.join(", ")}.`,
      },
      { status: 400 },
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
    renderJobs: current.renderJobs.map((job) =>
      job.status === "complete" ? { ...job, status: "stale" as const } : job,
    ),
  }));
  return NextResponse.json(updated);
}
