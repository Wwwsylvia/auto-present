import { NextResponse } from "next/server";
import { activeRevision } from "@/lib/domain";
import { getProject, updateProject } from "@/lib/store";
import { rejectUnsafeRequest } from "@/lib/http";

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
    return NextResponse.json({ error: "Generate a presentation first" }, { status: 400 });
  }
  try {
    const updated = await updateProject(id, (current) => {
      if (current.activeRevisionId !== revision.id) {
        throw new Error("REVISION_CONFLICT");
      }
      return {
        ...current,
        stage: "produce",
        approvedPlanRevisionId: current.approvedPlanRevisionId ?? revision.id,
        approvedDeckRevisionId: revision.id,
        lastError: null,
      };
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "REVISION_CONFLICT") {
      return NextResponse.json(
        { error: "The deck changed before approval. Review the latest revision and try again." },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "Could not approve the deck";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
