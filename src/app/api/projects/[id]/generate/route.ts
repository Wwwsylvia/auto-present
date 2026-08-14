import { NextResponse } from "next/server";
import { generatePresentation } from "@/lib/generate";
import { inspectPublicRepository } from "@/lib/github";
import { getProject, updateProject } from "@/lib/store";
import {
  publicErrorResponse,
  rejectNonLocalMutation,
} from "@/lib/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectNonLocalMutation(request);
  if (rejection) return rejection;
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
      repository,
      revisions: [...current.revisions, revision],
      activeRevisionId: revision.id,
      lastError: null,
    }));
    return NextResponse.json(updated);
  } catch (error) {
    await updateProject(id, (current) => ({
      ...current,
      lastError: "Generation failed. Review the error and try again.",
    }));
    return publicErrorResponse(error, "Generation failed. Check local service access and try again.", 502);
  }
}
