import { NextResponse } from "next/server";
import { createProjectSchema } from "@/lib/domain";
import { createProject, listProjects } from "@/lib/store";
import { rejectUnsafeRequest } from "@/lib/http";

export async function GET(request: Request) {
  const rejection = rejectUnsafeRequest(request);
  if (rejection) return rejection;
  return NextResponse.json(await listProjects());
}

export async function POST(request: Request) {
  const rejection = rejectUnsafeRequest(request);
  if (rejection) return rejection;
  const parsed = createProjectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid project brief" },
      { status: 400 },
    );
  }
  const project = await createProject(parsed.data);
  return NextResponse.json(project, { status: 201 });
}
