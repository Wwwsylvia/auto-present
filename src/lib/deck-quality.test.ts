import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDeckQuality } from "@/lib/deck-quality";
import { generatePresentation } from "@/lib/generate";
import type { Project } from "@/lib/domain";

function project(): Project {
  return {
    id: "quality-project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stage: "plan",
    input: {
      idea: "A repository-aware presentation assistant that turns product context into a credible pitch.",
      audience: "Hackathon judges",
      tone: "confident",
      durationMinutes: 1,
      githubUrl: "https://github.com/example/pitch-assistant",
    },
    repository: {
      url: "https://github.com/example/pitch-assistant",
      owner: "example",
      repo: "pitch-assistant",
      commitSha: "abc123",
      description: "A presentation assistant",
      languages: ["TypeScript"],
      evidence: [
        {
          path: "README.md",
          excerpt: "Repository-aware pitch creation.",
          url: "https://github.com/example/pitch-assistant/blob/abc123/README.md",
          category: "readme",
        },
      ],
    },
    revisions: [],
    activeRevisionId: null,
    approvedPlanRevisionId: null,
    approvedDeckRevisionId: null,
    renderJobs: [],
    assets: [],
    lastError: null,
  };
}

test("returns typed quality checks for a valid deck", async () => {
  const revision = await generatePresentation(project());
  const quality = evaluateDeckQuality(revision, {
    targetDurationSeconds: 60,
    knownEvidencePaths: ["README.md"],
  });

  assert.equal(quality.score, 100);
  assert.deepEqual(
    quality.checks.map((check) => check.name),
    [
      "narrative",
      "slide-count",
      "audience-specificity",
      "concrete-content",
      "known-evidence",
      "visual-diversity",
      "text-density",
      "repeated-claims",
      "narration",
      "narration-fit",
      "demo-consistency",
      "exact-duration",
    ],
  );
  assert.ok(quality.checks.every((check) => check.passed && check.score === 100));
});

test("reports each deterministic quality failure without model access", async () => {
  const revision = await generatePresentation(project());
  const denseText = Array.from({ length: 75 }, (_, index) => `word${index}`).join(" ");
  const broken = {
    ...revision,
    strategy: {
      ...revision.strategy,
      audienceLens: {
        ...revision.strategy.audienceLens,
        decision: "Same",
        callToAction: "Same",
        preferredProof: "Vague",
      },
      demoPlan: { recommendation: "include" as const, rationale: "A walkthrough is required." },
    },
    slides: revision.slides.map((slide, index) => ({
      ...slide,
      title: index < 2 ? "Repeated claim" : slide.title,
      bullets: [],
      audienceTakeaway: index === 0 ? denseText : slide.audienceTakeaway,
      layout: index === 0 ? ("solution" as const) : slide.layout,
      visual: { type: "statement" as const, statement: "Same visual treatment" },
      narration:
        index === 1
          ? ""
          : index === 2
            ? Array.from({ length: 80 }, () => "word").join(" ")
            : slide.narration,
      durationSeconds: index === 0 ? slide.durationSeconds + 3 : slide.durationSeconds,
      evidencePaths: index === 2 ? ["unknown.md"] : slide.evidencePaths,
    })),
  };
  const quality = evaluateDeckQuality(broken, {
    targetDurationSeconds: 60,
    targetSlideCount: 4,
    knownEvidencePaths: ["README.md"],
  });
  const failed = new Set(quality.checks.filter((check) => !check.passed).map((check) => check.name));

  assert.equal(quality.score, 0);
  assert.deepEqual(failed, new Set([
    "narrative",
    "slide-count",
    "audience-specificity",
    "concrete-content",
    "known-evidence",
    "visual-diversity",
    "text-density",
    "repeated-claims",
    "narration",
    "narration-fit",
    "demo-consistency",
    "exact-duration",
  ]));
});

test("rejects narration that would require accelerated speech", async () => {
  const revision = await generatePresentation(project());
  const edited = {
    ...revision,
    slides: revision.slides.map((slide, index) => ({
      ...slide,
      narration: index === 0 ? Array.from({ length: 80 }, () => "word").join(" ") : slide.narration,
    })),
  };

  const quality = evaluateDeckQuality(edited, {
    targetDurationSeconds: 60,
    knownEvidencePaths: ["README.md"],
  });

  assert.equal(quality.checks.find((check) => check.name === "narration-fit")?.passed, false);
});

test("rejects mouse-action narration from direct edits", async () => {
  const revision = await generatePresentation(project());
  const edited = {
    ...revision,
    slides: revision.slides.map((slide, index) => ({
      ...slide,
      narration:
        index === 0
          ? "Clicking Generate and hovering over the result reveals the next step."
          : slide.narration,
    })),
  };

  const quality = evaluateDeckQuality(edited, {
    targetDurationSeconds: 60,
    knownEvidencePaths: ["README.md"],
  });

  assert.equal(quality.checks.find((check) => check.name === "narration")?.passed, false);
});
