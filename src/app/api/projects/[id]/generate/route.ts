import { NextResponse } from "next/server";
import { generatePresentation } from "@/lib/generate";
import { inspectPublicRepository } from "@/lib/github";
import { getProject, updateProject } from "@/lib/store";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      stage: "create",
      repository,
      revisions: [...current.revisions, revision],
      activeRevisionId: revision.id,
      approvedPlanRevisionId: revision.id,
      lastError: null,
    }));
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    await updateProject(id, (current) => ({ ...current, lastError: message }));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
