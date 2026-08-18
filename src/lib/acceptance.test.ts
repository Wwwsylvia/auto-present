import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Project } from "@/lib/domain";
import { evaluatePresentation, validateCaptions } from "@/lib/acceptance";

function selfPresentation(): Project {
  const slides = [
    {
      id: "one",
      title: "The presentation problem",
      purpose: "Show friction for hackathon teams",
      audienceTakeaway: "Presentation production costs builders valuable time.",
      layout: "problem" as const,
      bullets: ["Builders and judges need a clear story"],
      visual: { type: "statement" as const, statement: "Strong ideas deserve clear stories." },
      narration: "Teams lose time producing presentations for their audience.",
      durationSeconds: 40,
      evidencePaths: [],
    },
    {
      id: "two",
      title: "Microsoft Foundry solution architecture",
      purpose: "Show the workflow",
      audienceTakeaway: "A validated pipeline turns context into a finished presentation.",
      layout: "architecture" as const,
      bullets: ["Foundry", "Typed revisions", "Local worker"],
      visual: {
        type: "flow" as const,
        steps: [{ label: "Foundry" }, { label: "Typed revision" }, { label: "Local worker" }],
      },
      narration: "Microsoft Foundry generates the solution through a validated workflow.",
      durationSeconds: 40,
      evidencePaths: [],
    },
    {
      id: "three",
      title: "From idea to impact",
      purpose: "Close",
      audienceTakeaway: "Builders can focus on the product while Idea2Impact shapes the story.",
      layout: "closing" as const,
      bullets: ["Generate", "Create", "Produce"],
      visual: { type: "statement" as const, statement: "Turn every strong idea into impact." },
      narration: "Idea2Impact gives every user a reliable presentation workflow.",
      durationSeconds: 40,
      evidencePaths: [],
    },
  ];
  return {
    id: "project",
    createdAt: "",
    updatedAt: "",
    stage: "produce",
    input: {
      idea: "A detailed self presentation idea for Idea2Impact.",
      audience: "Judges",
      tone: "confident",
      durationMinutes: 2,
      githubUrl: "",
    },
    repository: null,
    revisions: [{
      id: "revision",
      version: 1,
      createdAt: "",
      title: "Idea2Impact",
      tagline: "A solution for builders",
      summary: "Solve the presentation problem for teams.",
      strategy: {
        audienceGoal: "Show judges how Idea2Impact saves builders time.",
        coreMessage: "Idea2Impact turns project context into a clear presentation.",
        problem: "Builders lose time producing presentations instead of improving products.",
        solution: "A validated Foundry workflow creates and renders the presentation.",
        differentiators: ["Structured revisions", "Local deterministic rendering"],
        proofPoints: [],
        narrativeArc: ["problem", "solution", "close"],
        voiceoverDirection: "Use concise, outcome-focused narration.",
        demoPlan: {
          recommendation: "omit",
          rationale: "The acceptance fixture validates the core narrative without footage.",
        },
      },
      slides,
      promptVersion: "test",
      source: "foundry",
    }],
    activeRevisionId: "revision",
    approvedPlanRevisionId: "revision",
    approvedDeckRevisionId: "revision",
    renderJobs: [],
    assets: [],
    lastError: null,
  };
}

test("checks required two-minute self-presentation coverage", () => {
  const checks = evaluatePresentation(selfPresentation());
  assert.equal(checks.every((check) => check.passed), true);
});

test("validates monotonic captions bounded by media duration", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "idea2impact-captions-"));
  const file = path.join(directory, "captions.srt");
  try {
    await fs.writeFile(
      file,
      "1\n00:00:00,000 --> 00:00:01,000\nFirst\n\n2\n00:00:01,000 --> 00:00:02,000\nSecond\n",
    );
    assert.equal((await validateCaptions(file, 2)).passed, true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
