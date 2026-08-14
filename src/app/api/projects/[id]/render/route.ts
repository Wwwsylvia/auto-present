import { NextResponse } from "next/server";
import { renderPresentation } from "@/lib/render";
import { getProject, updateProject } from "@/lib/store";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind === "final" ? "final" : "preview";
  try {
    const { job } = await renderPresentation(project, kind);
    const updated = await updateProject(id, (current) => ({
      ...current,
      renderJobs: [...current.renderJobs, job],
      lastError: null,
    }));
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rendering failed";
    await updateProject(id, (current) => ({ ...current, lastError: message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
