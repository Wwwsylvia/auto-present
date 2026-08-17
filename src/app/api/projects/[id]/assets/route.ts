import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { dataDirectory } from "@/lib/config";
import {
  publicErrorResponse,
  rejectNonLocalMutation,
} from "@/lib/http";
import { probeMedia, validateDemoProbe } from "@/lib/media";
import { removeFilesBestEffort, runBestEffort } from "@/lib/local-files";
import { invalidateRenderJobs } from "@/lib/render-queue";
import { getProject, updateProject } from "@/lib/store";

const maxUploadSize = 100 * 1024 * 1024;
const allowedTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const extensionsByType = new Map([
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectNonLocalMutation(request);
  if (rejection) return rejection;
  const { id } = await params;
  const existingProject = await getProject(id);
  if (!existingProject) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
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
  const extension = extensionsByType.get(upload.type);
  if (!extension) {
    return NextResponse.json({ error: "Unsupported demo video type" }, { status: 400 });
  }
  const assetId = randomUUID();
  const directory = path.join(dataDirectory(), "uploads", id);
  const localPath = path.join(directory, `${assetId}${extension}`);
  const temporaryPath = path.join(directory, `${assetId}.upload`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(temporaryPath, Buffer.from(await upload.arrayBuffer()), {
    flag: "wx",
  });
  let project: Awaited<ReturnType<typeof updateProject>>;
  try {
    validateDemoProbe(await probeMedia(temporaryPath));
    await fs.rename(temporaryPath, localPath);
    project = await updateProject(id, (current) => ({
      ...current,
      assets: [
        ...current.assets.filter((asset) => asset.kind !== "demo-video"),
        {
          id: assetId,
          kind: "demo-video" as const,
          name: path.basename(upload.name).slice(0, 255),
          mimeType: upload.type,
          size: upload.size,
          localPath,
        },
      ],
      renderJobs: current.renderJobs.map((job) => ({
        ...job,
        status: "stale" as const,
        progress: 0,
        outputUrl: undefined,
        error: undefined,
      })),
    }));
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    await fs.rm(localPath, { force: true });
    return publicErrorResponse(error, "Upload validation failed.", 400);
  }
  await runBestEffort(
    "Could not invalidate every obsolete render after replacing the demo upload",
    () => invalidateRenderJobs(id, ""),
  );
  await removeFilesBestEffort(
    existingProject.assets
      .filter((asset) => asset.kind === "demo-video" && asset.localPath !== localPath)
      .map((asset) => asset.localPath),
  );
  return NextResponse.json(project);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejection = rejectNonLocalMutation(request);
  if (rejection) return rejection;
  const { id } = await params;
  let removedPath = "";
  try {
    const project = await updateProject(id, (current) => {
      removedPath = current.assets.find((asset) => asset.kind === "demo-video")?.localPath ?? "";
      return {
        ...current,
        assets: current.assets.filter((asset) => asset.kind !== "demo-video"),
        renderJobs: current.renderJobs.map((job) => ({
          ...job,
          status: "stale" as const,
          progress: 0,
          outputUrl: undefined,
          error: undefined,
        })),
      };
    });
    await runBestEffort(
      "Could not invalidate every obsolete render after removing the demo upload",
      () => invalidateRenderJobs(id, ""),
    );
    if (removedPath) await removeFilesBestEffort([removedPath]);
    return NextResponse.json(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove the demo clip";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
