import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { renderOutputPath } from "@/lib/render";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const contents = await fs.readFile(renderOutputPath(id));
    return new NextResponse(contents, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="idea2impact-presentation.mp4"',
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Render not found" }, { status: 404 });
  }
}
