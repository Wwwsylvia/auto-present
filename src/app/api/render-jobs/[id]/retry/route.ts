import { NextResponse } from "next/server";
import {
  publicErrorResponse,
  rejectNonLocalMutation,
} from "@/lib/http";
import { retryRenderJob } from "@/lib/render-queue";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectNonLocalMutation(request);
  if (rejection) return rejection;
  try {
    const { id } = await params;
    return NextResponse.json(await retryRenderJob(id));
  } catch (error) {
    return publicErrorResponse(error, "The render job could not be retried.", 409);
  }
}
