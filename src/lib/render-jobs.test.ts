import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Project } from "@/lib/domain";
import {
  createQueuedRenderJob,
  reconcileRenderJobs,
  writeRenderManifest,
  writeRenderStatus,
} from "@/lib/render-jobs";

function approvedProject(): Project {
  const revisionId = "8abfb030-8907-4c28-a8a7-6f51f205a4e4";
  return {
    id: "26de4585-f05e-4a21-a5b4-598b7b295ece",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    stage: "produce",
    input: {
      idea: "A sufficiently detailed Idea2Impact acceptance test project.",
      audience: "Judges",
      tone: "confident",
      durationMinutes: 2,
      githubUrl: "",
    },
    repository: null,
    revisions: [
      {
        id: revisionId,
        version: 1,
        createdAt: "2026-08-14T00:00:00.000Z",
        title: "Idea2Impact",
        tagline: "Idea to impact",
        summary: "A typed presentation workflow.",
        promptVersion: "presentation-v1",
        source: "foundry",
        slides: [
          {
            id: "slide-1",
            title: "Problem",
            purpose: "Explain the problem",
            layout: "problem",
            bullets: ["Teams lose build time"],
            narration: "Teams lose build time while preparing presentations.",
            durationSeconds: 40,
            evidencePaths: [],
          },
          {
            id: "slide-2",
            title: "Solution",
            purpose: "Explain the solution",
            layout: "features",
            bullets: ["Generate typed stories"],
            narration: "Idea2Impact generates a typed and editable story.",
            durationSeconds: 40,
            evidencePaths: [],
          },
          {
            id: "slide-3",
            title: "Impact",
            purpose: "Close the story",
            layout: "closing",
            bullets: ["More time to build"],
            narration: "Teams get more time to build and a clearer pitch.",
            durationSeconds: 40,
            evidencePaths: [],
          },
        ],
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

test("creates queued jobs only for the approved active revision", () => {
  const project = approvedProject();
  const job = createQueuedRenderJob(project, "final");
  assert.equal(job.status, "queued");
  assert.equal(job.revisionId, project.activeRevisionId);
  assert.match(job.outputUrl!, new RegExp(job.id));

  assert.throws(
    () => createQueuedRenderJob({ ...project, approvedDeckRevisionId: null }, "final"),
    /Approve the current deck/,
  );
});

test("reconciles worker state without reviving stale jobs", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "idea2impact-jobs-"));
  const previous = process.env.IDEA2IMPACT_DATA_DIR;
  process.env.IDEA2IMPACT_DATA_DIR = directory;
  try {
    const project = approvedProject();
    const job = createQueuedRenderJob(project, "preview");
    project.renderJobs.push(job);
    await writeRenderManifest(job, project);
    await writeRenderStatus({ ...job, status: "complete", progress: 100 });
    assert.equal((await reconcileRenderJobs(project))[0].status, "complete");

    project.renderJobs[0] = { ...job, status: "stale" };
    assert.equal((await reconcileRenderJobs(project))[0].status, "stale");
  } finally {
    if (previous === undefined) delete process.env.IDEA2IMPACT_DATA_DIR;
    else process.env.IDEA2IMPACT_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
