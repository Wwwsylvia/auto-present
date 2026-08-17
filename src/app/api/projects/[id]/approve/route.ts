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
  const updated = await updateProject(id, (current) =>
    current.stage === "plan"
      ? {
          ...current,
          stage: "create",
          approvedPlanRevisionId: revision.id,
        }
      : {
          ...current,
          stage: "produce",
          approvedDeckRevisionId: revision.id,
        },
  );
  return NextResponse.json(updated);
}
