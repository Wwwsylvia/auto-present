import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Project } from "@/lib/domain";
import {
  claimNextRenderJob,
  createRenderJob,
  enqueueRender,
  failRenderJob,
  getRenderJob,
  invalidateRenderJobs,
  retryRenderJob,
  updateRenderJob,
} from "@/lib/render-queue";

function approvedProject(): Project {
  const revisionId = "revision";
  return {
    id: "project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stage: "produce",
    input: {
      idea: "A detailed product idea that is long enough for validation.",
      audience: "Judges",
      tone: "technical",
      durationMinutes: 1,
      githubUrl: "",
    },
    repository: null,
    revisions: [
      {
        id: revisionId,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        title: "Title",
        tagline: "Tagline",
        summary: "Summary",
        promptVersion: "test",
        source: "demo",
        slides: ["hero", "architecture", "closing"].map((layout, index) => ({
          id: `slide-${index}`,
          title: `Slide ${index}`,
          purpose: "Purpose",
          layout: layout as "hero" | "architecture" | "closing",
          bullets: ["Point"],
          narration: "Narration.",
          durationSeconds: 20,
          evidencePaths: [],
        })),
      },
    ],
    activeRevisionId: revisionId,
    approvedPlanRevisionId: revisionId,
    approvedDeckRevisionId: revisionId,
    renderJobs: [],
    assets: [],
    lastError: null,
  };
}

test("durably claims, retries, manually retries, and invalidates jobs", async () => {
  const previous = process.env.IDEA2IMPACT_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "idea2impact-queue-"));
  process.env.IDEA2IMPACT_DATA_DIR = directory;
  try {
    const record = createRenderJob(approvedProject(), "preview");
    await enqueueRender(record);
    const claimed = await claimNextRenderJob();
    assert.equal(claimed?.job.status, "rendering");
    assert.equal(claimed?.job.attempts, 1);

    const recovered = await claimNextRenderJob(
      new Date(Date.now() + 16 * 60_000),
    );
    assert.equal(recovered?.job.status, "rendering");
    assert.equal(recovered?.job.attempts, 2);

    await failRenderJob(record.job.id, "Temporary failure");
    const retrying = await getRenderJob(record.job.id);
    assert.equal(retrying?.status, "retrying");
    const reclaimed = await claimNextRenderJob(
      new Date(Date.parse(retrying?.nextAttemptAt ?? "") + 1),
    );
    assert.equal(reclaimed?.job.attempts, 3);

    await updateRenderJob(record.job.id, (job) => ({ ...job, status: "failed" }));
    assert.equal((await retryRenderJob(record.job.id)).status, "queued");

    await invalidateRenderJobs("project", "new-revision");
    assert.equal((await getRenderJob(record.job.id))?.status, "stale");
  } finally {
    process.env.IDEA2IMPACT_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
