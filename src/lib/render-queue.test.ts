import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Project } from "@/lib/domain";
import {
  activateRenderJob,
  claimNextRenderJob,
  completeRenderJob,
  createRenderJob,
  discardDeferredRenderJob,
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
    assert.ok(claimed?.claimToken);

    const recovered = await claimNextRenderJob(
      new Date(Date.now() + 16 * 60_000),
    );
    assert.equal(recovered?.job.status, "rendering");
    assert.equal(recovered?.job.attempts, 2);

    await failRenderJob(
      record.job.id,
      recovered?.claimToken ?? "",
      "Temporary failure",
    );
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

test("deferred jobs cannot be claimed and can be compensated", async () => {
  const previous = process.env.IDEA2IMPACT_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "idea2impact-deferred-"));
  process.env.IDEA2IMPACT_DATA_DIR = directory;
  try {
    const discarded = createRenderJob(approvedProject(), "preview");
    await enqueueRender(discarded, { deferClaim: true });
    assert.equal(await claimNextRenderJob(), undefined);
    await discardDeferredRenderJob(discarded.job.id);
    assert.equal(await getRenderJob(discarded.job.id), undefined);

    const activated = createRenderJob(approvedProject(), "preview");
    await enqueueRender(activated, { deferClaim: true });
    await activateRenderJob(activated.job.id);
    assert.equal((await claimNextRenderJob())?.job.id, activated.job.id);
  } finally {
    process.env.IDEA2IMPACT_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("an invalidated active claim cannot revive obsolete output", async () => {
  const previous = process.env.IDEA2IMPACT_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "idea2impact-race-"));
  process.env.IDEA2IMPACT_DATA_DIR = directory;
  try {
    const record = createRenderJob(approvedProject(), "preview");
    await enqueueRender(record);
    const claimed = await claimNextRenderJob();
    const token = claimed?.claimToken;
    assert.ok(token);

    await invalidateRenderJobs("project", "new-revision");
    await assert.rejects(
      completeRenderJob(record.job.id, token),
      /claim is no longer active/i,
    );
    await assert.rejects(
      failRenderJob(record.job.id, token, "late failure"),
      /claim is no longer active/i,
    );
    assert.equal((await getRenderJob(record.job.id))?.status, "stale");
  } finally {
    process.env.IDEA2IMPACT_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
