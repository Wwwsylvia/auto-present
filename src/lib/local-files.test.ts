import assert from "node:assert/strict";
import test from "node:test";
import { removeFilesBestEffort, runBestEffort } from "@/lib/local-files";

test("replaced-file cleanup is best effort", async () => {
  const removed: string[] = [];
  await removeFilesBestEffort(["old.mp4", "missing.mp4"], async (file) => {
    if (file === "missing.mp4") throw new Error("simulated cleanup failure");
    removed.push(file);
  });
  assert.deepEqual(removed, ["old.mp4"]);
});

test("post-commit cleanup failures are warning-only", async () => {
  const warnings: string[] = [];
  await runBestEffort(
    "Could not invalidate obsolete renders",
    async () => {
      throw new Error("simulated invalidation failure");
    },
    (message) => warnings.push(message),
  );
  assert.deepEqual(warnings, [
    "[Idea2Impact] Could not invalidate obsolete renders",
  ]);
});
