import assert from "node:assert/strict";
import test from "node:test";
import type { Project } from "@/lib/domain";
import { generatePresentation } from "@/lib/generate";
import { invalidateDeckOutputs, restoreProjectRevision } from "@/lib/project-state";

test("invalidates approval and completed renders while preserving history", () => {
  const project = {
    stage: "produce",
    approvedDeckRevisionId: "revision-2",
    renderJobs: [
      { id: "complete", revisionId: "revision-2", kind: "preview", status: "complete", progress: 100 },
      { id: "rendering", revisionId: "revision-2", kind: "final", status: "rendering", progress: 50 },
      { id: "failed", revisionId: "revision-1", kind: "final", status: "failed", progress: 0 },
    ],
  } as Project;

  const updated = invalidateDeckOutputs(project);

  assert.equal(updated.stage, "create");
  assert.equal(updated.approvedDeckRevisionId, null);
  assert.deepEqual(updated.renderJobs.map((job) => job.status), ["stale", "stale", "failed"]);
});

test("restores history by appending a new immutable revision", async () => {
  const base: Project = {
    id: "project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stage: "produce",
    input: {
      idea: "A focused product idea with enough detail to generate a useful presentation.",
      audience: "Hackathon judges",
      tone: "confident",
      durationMinutes: 1,
      githubUrl: "",
    },
    repository: null,
    revisions: [],
    activeRevisionId: null,
    approvedPlanRevisionId: null,
    approvedDeckRevisionId: null,
    renderJobs: [],
    assets: [],
    lastError: null,
  };
  const first = await generatePresentation(base);
  const second = {
    ...first,
    id: "revision-2",
    version: 2,
    createdAt: "2026-01-02T00:00:00.000Z",
  };
  const project: Project = {
    ...base,
    activeRevisionId: second.id,
    approvedDeckRevisionId: second.id,
    revisions: [first, second],
  };

  const restored = restoreProjectRevision(project, first.id, second.id);

  assert.equal(restored.revisions.length, 3);
  assert.equal(restored.revisions.at(-1)?.version, 3);
  assert.notEqual(restored.revisions.at(-1)?.id, first.id);
  assert.equal(restored.activeRevisionId, restored.revisions.at(-1)?.id);
  assert.equal(project.revisions.length, 2);
});

test("removes demo footage that cannot target the restored revision", async () => {
  const base: Project = {
    id: "project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stage: "produce",
    input: {
      idea: "A focused product idea with enough detail to generate a useful presentation.",
      audience: "Hackathon judges",
      tone: "confident",
      durationMinutes: 1,
      githubUrl: "",
    },
    repository: null,
    revisions: [],
    activeRevisionId: null,
    approvedPlanRevisionId: null,
    approvedDeckRevisionId: null,
    renderJobs: [],
    assets: [],
    lastError: null,
  };
  const first = await generatePresentation(base);
  const second = {
    ...first,
    id: "revision-2",
    version: 2,
    createdAt: "2026-01-02T00:00:00.000Z",
    slides: first.slides.map((slide, index) => ({
      ...slide,
      id: `replacement-slide-${index}`,
    })),
  };
  const project: Project = {
    ...base,
    activeRevisionId: second.id,
    approvedDeckRevisionId: second.id,
    revisions: [first, second],
    assets: [{
      id: "demo",
      kind: "demo-video",
      name: "demo.mp4",
      mimeType: "video/mp4",
      size: 100,
      localPath: "uploads/demo.mp4",
      slideId: second.slides[0].id,
      durationSeconds: 3,
    }],
  };

  const restored = restoreProjectRevision(project, first.id, second.id);

  assert.deepEqual(restored.assets, []);
});
