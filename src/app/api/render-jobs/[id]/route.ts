import { NextResponse } from "next/server";
import { getRenderJob } from "@/lib/render-queue";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const job = await getRenderJob(id);
    if (!job) {
      return NextResponse.json({ error: "Render job not found" }, { status: 404 });
    }
    return NextResponse.json(job, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Render job not found" }, { status: 404 });
  }
}
