import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { generatedImagePath } from "@/lib/generated-images";
import { rejectNonLocalRequest } from "@/lib/http";
import { getProject } from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const rejection = rejectNonLocalRequest(request);
  if (rejection) return rejection;
  const { id, assetId } = await params;
  const project = await getProject(id);
  const referenced = project?.revisions.some((revision) =>
    revision.slides.some(
      (slide) => slide.visual.type === "image" && slide.visual.assetId === assetId,
    ),
  );
  if (!referenced) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
  try {
    return new NextResponse(await fs.readFile(generatedImagePath(id, assetId)), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}
