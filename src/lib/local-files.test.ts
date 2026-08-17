import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { removeFilesBestEffort } from "@/lib/local-files";

test("replaced-file cleanup is best effort", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "idea2impact-files-"));
  const retained = path.join(directory, "retained.txt");
  const removed = path.join(directory, "removed.txt");
  try {
    await writeFile(retained, "keep");
    await writeFile(removed, "remove");
    await removeFilesBestEffort([removed, path.join(directory, "missing.txt")]);
    assert.equal(await readFile(retained, "utf8"), "keep");
    await assert.rejects(readFile(removed, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
