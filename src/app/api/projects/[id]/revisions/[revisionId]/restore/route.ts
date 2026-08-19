import { NextResponse } from "next/server";
import { rejectNonLocalMutation } from "@/lib/http";
import { removeFilesBestEffort } from "@/lib/local-files";
import { restoreProjectRevision } from "@/lib/project-state";
import { invalidateRenderJobs } from "@/lib/render-queue";
import { getProject, updateProject } from "@/lib/store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
) {
  const rejection = rejectNonLocalMutation(request);
  if (rejection) return rejection;
  const { id, revisionId } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    expectedActiveRevisionId?: string;
  };
  if (!body.expectedActiveRevisionId) {
    return NextResponse.json({ error: "The active revision is required" }, { status: 400 });
  }

  try {
    let removedAssetPaths: string[] = [];
    const updated = await updateProject(
      id,
      (current) => {
        const restored = restoreProjectRevision(
          current,
          revisionId,
          body.expectedActiveRevisionId!,
        );
        const retainedAssetIds = new Set(restored.assets.map((asset) => asset.id));
        removedAssetPaths = current.assets
          .filter((asset) => !retainedAssetIds.has(asset.id))
          .map((asset) => asset.localPath);
        return restored;
      },
      {
        beforeCommit: (next) =>
          invalidateRenderJobs(id, next.activeRevisionId ?? ""),
      },
    );
    await removeFilesBestEffort(removedAssetPaths);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "REVISION_CONFLICT") {
      return NextResponse.json(
        { error: "The presentation changed. Review the latest revision before restoring." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "REVISION_NOT_FOUND") {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not restore the revision" }, { status: 500 });
  }
}
