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
      layout: "problem" as const,
      bullets: ["Builders and judges need a clear story"],
      narration: "Teams lose time producing presentations for their audience.",
      durationSeconds: 40,
      evidencePaths: [],
    },
    {
      id: "two",
      title: "Microsoft Foundry solution architecture",
      purpose: "Show the workflow",
      layout: "architecture" as const,
      bullets: ["Foundry", "Typed revisions", "Local worker"],
      narration: "Microsoft Foundry generates the solution through a validated workflow.",
      durationSeconds: 40,
      evidencePaths: [],
    },
    {
      id: "three",
      title: "From idea to impact",
      purpose: "Close",
      layout: "closing" as const,
      bullets: ["Generate", "Create", "Produce"],
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
