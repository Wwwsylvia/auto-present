import assert from "node:assert/strict";
import test from "node:test";
import type { Project } from "@/lib/domain";
import {
  generatePresentation,
  generateRevisionPatch,
} from "@/lib/generate";
import { PublicError } from "@/lib/http";

function project(): Project {
  return {
    id: "project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stage: "plan",
    input: {
      idea: "A detailed product idea that is long enough for validation.",
      audience: "Judges",
      tone: "technical",
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
}

function generatedJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: "Idea2Impact",
    tagline: "From idea to impact",
    summary: "A structured presentation workflow.",
    slides: ["hero", "architecture", "closing"].map((layout, index) => ({
      title: `Slide ${index + 1}`,
      purpose: "Explain the story",
      layout,
      bullets: ["A concise point"],
      narration: "A concise narrated explanation.",
      durationSeconds: 20,
      evidencePaths: [],
    })),
    ...overrides,
  });
}

test("validates a Foundry presentation through the injected completion boundary", async () => {
  const revision = await generatePresentation(project(), async () => generatedJson());
  assert.equal(revision.source, "foundry");
  assert.equal(revision.slides.length, 3);
});

test("rejects malformed and out-of-budget Foundry output", async () => {
  await assert.rejects(
    generatePresentation(project(), async () => "{not-json"),
    (error) =>
      error instanceof PublicError && /invalid JSON/.test(error.publicMessage),
  );
  await assert.rejects(
    generatePresentation(project(), async () =>
      generatedJson({
        slides: JSON.parse(generatedJson()).slides.map(
          (slide: Record<string, unknown>) => ({ ...slide, durationSeconds: 5 }),
        ),
      }),
    ),
    /duration budget/,
  );
});

test("retries contract-invalid Foundry output up to the bounded limit", async () => {
  let attempts = 0;
  const revision = await generatePresentation(project(), async () => {
    attempts += 1;
    return attempts === 1 ? "{not-json" : generatedJson();
  });
  assert.equal(attempts, 2);
  assert.equal(revision.source, "foundry");
});

test("rejects unknown evidence paths", async () => {
  const value = JSON.parse(generatedJson());
  value.slides[0].evidencePaths = ["README.md"];
  await assert.rejects(
    generatePresentation(project(), async () => JSON.stringify(value)),
    /evidence that was not supplied/,
  );
});

test("validates contextual patches and rejects unknown slide IDs", async () => {
  const initial = await generatePresentation(project(), async () => generatedJson());
  const current = {
    ...project(),
    revisions: [initial],
    activeRevisionId: initial.id,
  };
  const patch = await generateRevisionPatch(current, "Tighten the opening", async () =>
    JSON.stringify({
      summary: "Tightened the opening",
      slideChanges: [{ slideId: initial.slides[0].id, changes: { title: "Sharper" } }],
    }),
  );
  assert.equal(patch.slideChanges[0].changes.title, "Sharper");
  await assert.rejects(
    generateRevisionPatch(current, "Change it", async () =>
      JSON.stringify({
        summary: "Changed it",
        slideChanges: [{ slideId: "unknown", changes: { title: "No" } }],
      }),
    ),
    /unknown slide/,
  );
});

test("marks repository material as untrusted evidence in the prompt", async () => {
  let prompt = "";
  await generatePresentation(project(), async (messages) => {
    prompt = messages.map((message) => message.content).join("\n");
    return generatedJson();
  });
  assert.match(prompt, /untrusted/i);
  assert.match(prompt, /not instructions/i);
});
