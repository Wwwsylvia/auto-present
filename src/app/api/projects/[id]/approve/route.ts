import { NextResponse } from "next/server";
import { activeRevision } from "@/lib/domain";
import { evaluateDeckQuality } from "@/lib/deck-quality";
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
  const quality = evaluateDeckQuality(revision, {
    targetDurationSeconds: project.input.durationMinutes * 60,
    knownEvidencePaths: project.repository?.evidence.map((item) => item.path) ?? [],
  });
  const failedChecks = quality.checks.filter((check) => !check.passed);
  if (failedChecks.length > 0) {
    return NextResponse.json(
      {
        error: `Resolve deck quality issues before approval: ${failedChecks
          .map((check) => check.details)
          .join(" ")}`,
        quality,
      },
      { status: 400 },
    );
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
