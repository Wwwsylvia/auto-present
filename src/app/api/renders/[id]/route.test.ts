import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GET } from "@/app/api/renders/[id]/route";
import { writeRenderStatus } from "@/lib/render-jobs";

test("stale render URLs return not found even if an old file remains", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "idea2impact-download-"));
  const previous = process.env.IDEA2IMPACT_DATA_DIR;
  process.env.IDEA2IMPACT_DATA_DIR = directory;
  const id = "26de4585-f05e-4a21-a5b4-598b7b295ece";
  try {
    await writeRenderStatus({
      id,
      revisionId: "obsolete-revision",
      kind: "preview",
      status: "stale",
      progress: 0,
    });
    const output = path.join(directory, "renders", id, "presentation.mp4");
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, "obsolete");

    const response = await GET(
      new Request(`http://127.0.0.1:3000/api/renders/${id}`, {
        headers: { Host: "127.0.0.1:3000" },
      }),
      { params: Promise.resolve({ id }) },
    );
    assert.equal(response.status, 404);
  } finally {
    if (previous === undefined) delete process.env.IDEA2IMPACT_DATA_DIR;
    else process.env.IDEA2IMPACT_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
