import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { rejectNonLocalRequest } from "@/lib/http";
import { renderOutputPath } from "@/lib/render";
import { rejectUnsafeRequest } from "@/lib/http";
import { isRenderDownloadAvailable } from "@/lib/render-jobs";
import { listProjects } from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectUnsafeRequest(request);
  if (rejection) return rejection;
  try {
    const { id } = await params;
    const projects = await listProjects();
    const current = projects.some((project) =>
      project.renderJobs.some((job) => job.id === id && job.status === "complete"),
    );
    if (!current || !(await isRenderDownloadAvailable(id))) {
      return NextResponse.json({ error: "Render not found" }, { status: 404 });
    }
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
