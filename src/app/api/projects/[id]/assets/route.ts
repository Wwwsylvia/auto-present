import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { updateProject } from "@/lib/store";

const maxUploadSize = 100 * 1024 * 1024;
const allowedTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const form = await request.formData();
  const upload = form.get("file");
  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Choose a demo video" }, { status: 400 });
  }
  if (!allowedTypes.has(upload.type)) {
    return NextResponse.json({ error: "Use an MP4, WebM, or QuickTime video" }, { status: 400 });
  }
  if (upload.size <= 0 || upload.size > maxUploadSize) {
    return NextResponse.json({ error: "Demo videos must be under 100 MB" }, { status: 400 });
  }
  const extension = path.extname(upload.name).toLowerCase() || ".mp4";
  const assetId = randomUUID();
  const directory = path.join(process.cwd(), ".data", "uploads", id);
  const localPath = path.join(directory, `${assetId}${extension}`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(localPath, Buffer.from(await upload.arrayBuffer()));
  let replacedPath = "";
  try {
    const project = await updateProject(id, (current) => {
      replacedPath = current.assets.find((asset) => asset.kind === "demo-video")?.localPath ?? "";
      return {
        ...current,
        assets: [
          ...current.assets.filter((asset) => asset.kind !== "demo-video"),
          {
            id: assetId,
            kind: "demo-video" as const,
            name: upload.name,
            mimeType: upload.type,
            size: upload.size,
            localPath,
          },
        ],
      };
    });
    if (replacedPath && replacedPath !== localPath) {
      try {
        await fs.rm(replacedPath, { force: true });
      } catch (error) {
        console.error("Could not remove replaced demo clip", error);
      }
    }
    return NextResponse.json(project);
  } catch (error) {
    await fs.rm(localPath, { force: true });
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let removedPath = "";
  try {
    const project = await updateProject(id, (current) => {
      removedPath = current.assets.find((asset) => asset.kind === "demo-video")?.localPath ?? "";
      return {
        ...current,
        assets: current.assets.filter((asset) => asset.kind !== "demo-video"),
      };
    });
    if (removedPath) await fs.rm(removedPath, { force: true });
    return NextResponse.json(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove the demo clip";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
