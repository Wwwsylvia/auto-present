import { NextResponse } from "next/server";
import { activeRevision } from "@/lib/domain";
import { getProject, updateProject } from "@/lib/store";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  const revision = project && activeRevision(project);
  if (!project || !revision) {
    return NextResponse.json({ error: "Generate a presentation first" }, { status: 400 });
  }
  const updated = await updateProject(id, (current) => ({
    ...current,
    stage: "produce",
    approvedPlanRevisionId: current.approvedPlanRevisionId ?? revision.id,
    approvedDeckRevisionId: revision.id,
    lastError: null,
  }));
  return NextResponse.json(updated);
}
