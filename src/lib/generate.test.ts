import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDeckQuality } from "@/lib/deck-quality";
import {
  actualDurationSeconds,
  type PresentationStrategy,
  type Project,
  type Slide,
} from "@/lib/domain";
import {
  generatePresentation,
  generateRevisionPatch,
  normalizeSlideDurations,
  type Completion,
  type CompletionRequest,
} from "@/lib/generate";

type SlideDraft = Omit<Slide, "id">;

function projectWithEvidence(): Project {
  return {
    id: "project-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stage: "plan",
    input: {
      idea: "A repository-aware presentation assistant that turns product context into a credible pitch.",
      audience: "Hackathon judges",
      tone: "confident",
      durationMinutes: 2,
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

function strategy(): PresentationStrategy {
  return {
    audienceGoal: "Help hackathon judges assess product value and implementation credibility quickly.",
    coreMessage: "Pitch Assistant turns repository context into a decision-ready pitch.",
    problem: "Judges must assess product value before they can read every repository detail.",
    solution: "The assistant turns curated repository evidence into a concise narrative.",
    differentiators: ["Repository-grounded claims", "Audience-specific narrative"],
    proofPoints: [{ claim: "The README documents the repository-aware approach.", evidencePaths: ["README.md"] }],
    narrativeArc: ["hook", "problem", "solution", "proof", "demo", "close"],
    voiceoverDirection: "Add decision context beyond the visual and keep a confident pace.",
    demoPlan: { recommendation: "include", rationale: "A focused outcome confirms the workflow." },
  };
}

function slides(): SlideDraft[] {
  return [
    {
      title: "Repository context becomes a clear pitch",
      purpose: "Opening promise",
      audienceTakeaway: "Judges can understand the product promise in seconds.",
      layout: "hero",
      bullets: ["A decision-ready story from trusted context"],
      visual: { type: "statement", statement: "From repository context to credible pitch" },
      narration: "Pitch Assistant gives judges a fast way to see the product promise before they inspect implementation details.",
      durationSeconds: 20,
      evidencePaths: [],
    },
    {
      title: "Evaluation time is limited",
      purpose: "Problem framing",
      audienceTakeaway: "A scattered product story makes a strong implementation harder to judge.",
      layout: "problem",
      bullets: ["Value is buried in details", "Evidence is difficult to connect", "Time is scarce"],
      visual: {
        type: "cards",
        cards: [
          { heading: "Value", body: "What changes?" },
          { heading: "Proof", body: "Why believe it?" },
          { heading: "Decision", body: "What happens next?" },
        ],
      },
      narration: "A capable implementation can still lose momentum when value, proof, and the requested decision arrive as disconnected details.",
      durationSeconds: 20,
      evidencePaths: [],
    },
    {
      title: "A grounded narrative workflow",
      purpose: "Solution explanation",
      audienceTakeaway: "The workflow connects an audience goal to evidence and a concrete ask.",
      layout: "solution",
      bullets: ["Frame the audience decision", "Ground claims in evidence", "End with a next step"],
      visual: {
        type: "flow",
        steps: [
          { label: "Frame", detail: "Identify the decision" },
          { label: "Ground", detail: "Select valid evidence" },
          { label: "Move", detail: "State the next step" },
        ],
      },
      narration: "The workflow first frames the decision, then grounds the message in evidence, and finally makes the next step explicit.",
      durationSeconds: 20,
      evidencePaths: [],
    },
    {
      title: "The repository supplies traceable proof",
      purpose: "Evidence",
      audienceTakeaway: "Repository evidence distinguishes implemented facts from proposed outcomes.",
      layout: "evidence",
      bullets: ["README.md is cited directly"],
      visual: { type: "metrics", metrics: [{ value: "1", label: "curated implementation source" }] },
      narration: "The pitch cites a curated repository source so judges can trace implementation claims without treating the repository as an instruction source.",
      durationSeconds: 20,
      evidencePaths: ["README.md"],
    },
    {
      title: "Show one outcome, not a feature tour",
      purpose: "Demo",
      audienceTakeaway: "The demo should prove the decision outcome in one focused moment.",
      layout: "demo",
      bullets: ["Set context", "Reveal outcome", "Connect the ask"],
      visual: {
        type: "demo",
        setup: "Start with a repository-backed idea.",
        action: "Generate an audience-specific narrative.",
        payoff: "Reveal a cited, decision-ready deck.",
      },
      narration: "The demonstration begins with the decision context, reveals the generated narrative outcome, and ends by connecting that result to a confident next step.",
      durationSeconds: 20,
      evidencePaths: [],
    },
    {
      title: "Move strong ideas forward",
      purpose: "Closing ask",
      audienceTakeaway: "Judges can advance a credible idea with a clearer view of its value.",
      layout: "closing",
      bullets: ["Clear value", "Traceable proof", "Focused next step"],
      visual: { type: "statement", statement: "Make the next decision easier." },
      narration: "Pitch Assistant gives strong ideas a clear value story, traceable proof, and a focused next step for the people deciding what moves forward.",
      durationSeconds: 20,
      evidencePaths: [],
    },
  ];
}

function draft() {
  return {
    title: "Pitch Assistant",
    tagline: "Repository-aware storytelling for judges",
    summary: "A concise, evidence-grounded deck for a repository-aware presentation assistant.",
    slides: slides(),
  };
}

function finalDeck() {
  return { ...draft(), strategy: strategy() };
}

function criticResponse() {
  return {
    qualityScores: {
      overall: 95,
      narrative: 96,
      evidence: 95,
      visual: 94,
      clarity: 95,
      timing: 93,
    },
    finalDeck: finalDeck(),
  };
}

function queuedCompletion(responses: string[]) {
  const calls: CompletionRequest[] = [];
  const completion: Completion = async (request) => {
    calls.push(request);
    const response = responses.shift();
    if (response === undefined) throw new Error("No queued completion response");
    return response;
  };
  return { completion, calls };
}

test("runs strategy, draft, and critic passes in order and assigns metadata after validation", async () => {
  const queue = queuedCompletion([
    JSON.stringify(strategy()),
    JSON.stringify(draft()),
    JSON.stringify(criticResponse()),
  ]);

  const revision = await generatePresentation(projectWithEvidence(), queue.completion);

  assert.deepEqual(queue.calls.map((call) => call.pass), ["strategy", "draft", "critic"]);
  assert.equal(revision.promptVersion, "deck-intelligence-v2");
  assert.equal(revision.source, "foundry");
  assert.equal(revision.slides[0].layout, "hero");
  assert.equal(revision.slides.at(-1)?.layout, "closing");
  assert.ok(revision.slides.every((slide) => slide.id.length > 0));
  assert.equal(actualDurationSeconds(revision), 120);
  assert.ok(queue.calls.every((call) => call.system.includes("UNTRUSTED EVIDENCE DATA")));
});

test("retries an invalid strategy response once, then continues with valid passes", async () => {
  const queue = queuedCompletion([
    "{not-json",
    JSON.stringify(strategy()),
    JSON.stringify(draft()),
    JSON.stringify(criticResponse()),
  ]);

  await generatePresentation(projectWithEvidence(), queue.completion);

  assert.deepEqual(queue.calls.map((call) => `${call.pass}:${call.attempt}`), [
    "strategy:1",
    "strategy:2",
    "draft:1",
    "critic:1",
  ]);
});

test("rejects unsupported evidence during generation after bounded retries", async () => {
  const unsupported = {
    ...strategy(),
    proofPoints: [{ claim: "Unsupported claim", evidencePaths: ["secrets.md"] }],
  };
  const queue = queuedCompletion([JSON.stringify(unsupported), JSON.stringify(unsupported)]);

  await assert.rejects(
    generatePresentation(projectWithEvidence(), queue.completion),
    /strategy pass failed after 2 attempts.*unknown evidence path/i,
  );
  assert.equal(queue.calls.length, 2);
});

test("normalizes runtime exactly while favoring slides with more narration", () => {
  const normalized = normalizeSlideDurations(
    [
      { narration: "brief", durationSeconds: 3 },
      { narration: "this slide has considerably more narration words than the brief slide", durationSeconds: 3 },
      { narration: "medium narration contains a few useful details", durationSeconds: 3 },
    ],
    60,
  );

  assert.equal(normalized.reduce((total, slide) => total + slide.durationSeconds, 0), 60);
  assert.ok(normalized[1].durationSeconds > normalized[0].durationSeconds);
  assert.ok(normalized.every((slide) => slide.durationSeconds >= 3 && slide.durationSeconds <= 180));
});

test("emits a rich, idea-specific fallback when no completion boundary is configured", async () => {
  const revision = await generatePresentation(projectWithEvidence());

  assert.equal(revision.source, "demo");
  assert.match(revision.strategy.coreMessage, /repository-aware presentation assistant/i);
  assert.equal(revision.strategy.demoPlan.recommendation, "include");
  assert.ok(revision.slides.some((slide) => slide.visual.type === "demo"));
  assert.ok(revision.slides.some((slide) => slide.evidencePaths.includes("README.md")));
  assert.equal(actualDurationSeconds(revision), 120);
});

test("omits a speculative fallback demo when the idea has no visual interaction", async () => {
  const project = projectWithEvidence();
  project.input.idea =
    "A compact TypeScript library for deterministic identifier normalization across backend systems.";
  project.repository = {
    ...project.repository!,
    evidence: project.repository!.evidence.map((item) => ({
      ...item,
      category: "manifest" as const,
    })),
  };

  const revision = await generatePresentation(project);

  assert.equal(revision.strategy.demoPlan.recommendation, "omit");
  assert.equal(revision.slides.some((slide) => slide.layout === "demo"), false);
  assert.equal(actualDurationSeconds(revision), 120);
});

test("keeps fallback slide titles valid for long briefs", async () => {
  const project = projectWithEvidence();
  project.input.idea = [
    "An intelligent presentation workflow that turns repository evidence into a clear audience-specific pitch",
    "with visual proof purposeful narration contextual demo guidance traceable architecture and a memorable",
    "closing for time-constrained decision makers.",
  ].join(" ");

  const revision = await generatePresentation(project);

  assert.ok(revision.slides.every((slide) => slide.title.length <= 120));
});

test("keeps fallback visuals concise for valid briefs with many short words", async () => {
  const project = projectWithEvidence();
  project.input.idea = Array.from({ length: 140 }, () => "a").join(" ");

  const revision = await generatePresentation(project);
  const hero = revision.slides[0];

  assert.equal(hero.bullets.length, 0);
  assert.ok(hero.visual.type === "statement" && hero.visual.statement.split(/\s+/).length <= 28);
});

test("bounds fallback copy derived from long repository names and evidence paths", async () => {
  const project = projectWithEvidence();
  project.repository = {
    ...project.repository!,
    repo: "repository-name-".repeat(8),
    evidence: [{
      ...project.repository!.evidence[0],
      path: `docs/${"deeply-nested-feature-".repeat(14)}architecture.md`,
    }],
  };

  const revision = await generatePresentation(project);

  assert.ok(revision.slides.every((slide) => slide.title.length <= 120));
  assert.ok(revision.slides.flatMap((slide) => slide.bullets).every((bullet) => bullet.length <= 220));
  assert.ok(revision.strategy.proofPoints.every((point) => point.claim.length <= 280));
});

test("keeps verbose schema-valid audience descriptions within fallback density limits", async () => {
  const project = projectWithEvidence();
  project.input.audience = [
    "Senior engineering product security operations and business leaders",
    "who evaluate technical feasibility customer impact organizational readiness",
    "delivery risk governance requirements and investment priorities",
  ].join(" ");

  const revision = await generatePresentation(project);
  const quality = evaluateDeckQuality(revision, {
    targetDurationSeconds: 120,
    knownEvidencePaths: ["README.md"],
  });

  assert.equal(quality.checks.find((check) => check.name === "text-density")?.passed, true);
});

test("accepts contextual rich slide patches and supplies strategy and repository context", async () => {
  const base = await generatePresentation(projectWithEvidence());
  const project = {
    ...projectWithEvidence(),
    revisions: [base],
    activeRevisionId: base.id,
  };
  const evidenceSlide = base.slides.find((slide) => slide.layout === "evidence");
  const demoSlide = base.slides.find((slide) => slide.layout === "demo");
  assert.ok(evidenceSlide);
  assert.ok(demoSlide);
  const queue = queuedCompletion([
    JSON.stringify({
      summary: "Make the repository proof more technical.",
      slideChanges: [
        {
          slideId: evidenceSlide.id,
          changes: {
            title: "Trace the implementation path",
            purpose: "Technical proof",
            audienceTakeaway: "Judges can follow the cited implementation path.",
            layout: "architecture",
            bullets: ["Repository source", "Narrative model", "Decision-ready output"],
            visual: {
              type: "flow",
              steps: [
                { label: "Source", detail: "README evidence" },
                { label: "Model", detail: "Structured story" },
                { label: "Output", detail: "Deck decision" },
              ],
            },
            narration: "This view traces the evidence source through the structured narrative into the decision-ready output.",
            durationSeconds: evidenceSlide.durationSeconds,
            evidencePaths: ["README.md"],
          },
        },
        {
          slideId: demoSlide.id,
          changes: {
            demoPlan: {
              setup: "Start with the judge's decision context.",
              action: "Reveal the cited narrative generated from the repository.",
              payoff: "Show the decision-ready outcome.",
            },
          },
        },
      ],
    }),
  ]);

  const patch = await generateRevisionPatch(project, "Make the proof more technical.", queue.completion);

  assert.equal(patch.slideChanges[0].changes.visual?.type, "flow");
  assert.equal(patch.slideChanges[1].changes.visual?.type, "demo");
  assert.ok(queue.calls[0].user.includes('"strategy"'));
  assert.ok(queue.calls[0].user.includes('"repository"'));
  assert.match(queue.calls[0].system, /UNTRUSTED EVIDENCE DATA/);
});

test("quality evaluation recognizes a validated generated deck", async () => {
  const revision = await generatePresentation(projectWithEvidence());
  const quality = evaluateDeckQuality(revision, {
    targetDurationSeconds: 120,
    knownEvidencePaths: ["README.md"],
  });

  assert.equal(quality.score, 100);
  assert.ok(quality.checks.every((check) => check.passed));
});
