import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  audioTimingFilter,
  findDemoSlideIndex,
  renderPresentation,
  renderSlideSvg,
  resolveDemoFootageIndex,
} from "@/lib/render";
import type { Project, Slide, Visual } from "@/lib/domain";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed: ${stderr.slice(-1000)}`));
    });
  });
}

function slide(visual: Visual, layout: Slide["layout"] = "solution"): Slide {
  return {
    id: "slide-1",
    title: "A deliberate title that demonstrates useful wrapping in a rendered slide",
    purpose: "Explain the decision",
    audienceTakeaway: "The visual makes the message easier to evaluate.",
    layout,
    bullets: ["Supporting detail is preserved across multiple lines instead of being silently shortened."],
    visual,
    narration: "Narration is not relevant to SVG rendering.",
    durationSeconds: 10,
    evidencePaths: [],
  };
}

const visuals: readonly Visual[] = [
  { type: "statement", statement: "One clear point gives the audience a reason to keep listening." },
  { type: "cards", cards: [{ heading: "First signal", body: "A concise explanation." }, { heading: "Second signal", body: "Another concise explanation." }] },
  { type: "flow", steps: [{ label: "Frame", detail: "Set the decision." }, { label: "Move", detail: "Show the next step." }] },
  { type: "comparison", leftLabel: "Before", rightLabel: "After", rows: [{ label: "Clarity", left: "Scattered", right: "Focused" }, { label: "Proof", left: "Implicit", right: "Traceable" }] },
  { type: "metrics", metrics: [{ value: "82%", label: "faster evaluation", detail: "A focused proof point." }] },
  { type: "timeline", events: [{ label: "Input", detail: "Capture context." }, { label: "Outcome", detail: "Make the ask." }] },
  { type: "demo", setup: "Open a grounded project.", action: "Generate the deck.", payoff: "Show the decision-ready outcome." },
];

test("renders a distinctive composition for every visual payload", () => {
  for (const visual of visuals) {
    const svg = renderSlideSvg(slide(visual, visual.type === "demo" ? "demo" : "solution"), 0);
    assert.match(svg, new RegExp(`data-visual="${visual.type}"`));
    assert.match(svg, new RegExp(`visual-${visual.type}`));
  }
});

test("embeds generated imagery with its accessible caption in rendered SVG", () => {
  const visual: Visual = {
    type: "image",
    prompt: "A team reviewing a finished presentation.",
    altText: "A team gathered around a presentation display.",
    caption: "Shared context becomes a clear decision",
    assetId: "00000000-0000-4000-8000-000000000001",
    fallback: { type: "statement", statement: "A structured fallback" },
  };
  const svg = renderSlideSvg(slide(visual), 0, "data:image/png;base64,AA==");
  assert.match(svg, /data-visual="image"/);
  assert.match(svg, /data:image\/png;base64,AA==/);
  assert.match(svg, /Shared context becomes a clear decision/);
});

test("renders every layout with its layout-specific composition", () => {
  const layouts: readonly Slide["layout"][] = [
    "hero", "problem", "solution", "comparison", "process", "architecture", "evidence", "demo", "closing",
  ];
  const output = layouts.map((layout) => renderSlideSvg(
    slide(
      layout === "demo"
        ? { type: "demo", setup: "Set up.", action: "Act.", payoff: "Deliver." }
        : { type: "statement", statement: "A strong rendered statement." },
      layout,
    ),
    1,
  ));

  for (const [index, layout] of layouts.entries()) {
    assert.match(output[index], new RegExp(`data-layout="${layout}"`));
  }
  assert.notEqual(output[0], output[1]);
  assert.notEqual(output[5], output[6]);
});

test("wraps and XML-escapes multiline presentation text without dropping bullet content", () => {
  const statement = `A & B < C > D "quoted" 'apostrophe' with enough additional words to wrap safely.`;
  const bullet = `A long & detailed bullet <must> keep every word, including "quotes" and 'apostrophes', when it wraps.`;
  const svg = renderSlideSvg({ ...slide({ type: "statement", statement }), bullets: [bullet] }, 0);

  assert.match(svg, /A &amp; B &lt; C &gt; D &quot;quoted&quot; &apos;apostrophe&apos;/);
  assert.match(svg, /bullet-rail/);
  assert.match(svg, /&lt;must&gt; keep every word/);
  assert.ok((svg.match(/<tspan/g) ?? []).length > 4);
});

test("selects demo footage by semantic layout and visual type", () => {
  const slides = [
    { ...slide({ type: "demo", setup: "Start.", action: "Act.", payoff: "Show." }, "demo"), id: "slide-1" },
    { ...slide({ type: "statement", statement: "Not a demo." }, "closing"), id: "slide-2" },
    { ...slide({ type: "statement", statement: "Also not a demo." }, "demo"), id: "slide-3" },
    { ...slide({ type: "statement", statement: "Final slide." }, "closing"), id: "slide-4" },
  ];

  assert.equal(findDemoSlideIndex(slides), 0);
  assert.equal(resolveDemoFootageIndex(slides, true), 0);
  assert.equal(resolveDemoFootageIndex(slides, true, slides[2].id), 2);
});

test("rejects an uploaded demo asset when the approved deck has no semantic demo slide", () => {
  const slides = [
    slide({ type: "statement", statement: "This is only styled like a demo." }, "demo"),
    slide({ type: "statement", statement: "There is no demo payload." }, "closing"),
  ];

  assert.throws(
    () => resolveDemoFootageIndex(slides, true),
    /legacy demo video asset has no semantic demo slide/,
  );
  assert.equal(resolveDemoFootageIndex(slides, false), undefined);
  assert.throws(
    () => resolveDemoFootageIndex(slides, true, "missing-slide"),
    /no longer contains the demo clip target slide/,
  );
});

test("integrates a targeted demo clip into the rendered presentation", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "idea2impact-demo-render-"));
  const previousDataDirectory = process.env.IDEA2IMPACT_DATA_DIR;
  const speechVariables = [
    "AZURE_SPEECH_REGION",
    "AZURE_SPEECH_KEY",
    "AZURE_SPEECH_RESOURCE_ID",
  ] as const;
  const previousSpeech = new Map(
    speechVariables.map((name) => [name, process.env[name]]),
  );
  process.env.IDEA2IMPACT_DATA_DIR = directory;
  for (const name of speechVariables) delete process.env[name];
  try {
    const clip = path.join(directory, "demo.mp4");
    await run("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "color=c=0x33aa66:s=320x180:d=1",
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip,
    ]);
    const slides = [
      { ...slide({ type: "statement", statement: "Opening promise" }, "hero"), id: "opening", durationSeconds: 3 },
      { ...slide({ type: "flow", steps: [{ label: "Input" }, { label: "Outcome" }] }), id: "clip-target", durationSeconds: 3 },
      { ...slide({ type: "statement", statement: "Closing decision" }, "closing"), id: "closing", durationSeconds: 3 },
    ];
    const revisionId = "revision";
    const project: Project = {
      id: "project",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stage: "produce",
      input: {
        idea: "A valid product concept that demonstrates targeted demo clip rendering.",
        audience: "Reviewers",
        tone: "confident",
        durationMinutes: 1,
        githubUrl: "",
      },
      repository: null,
      revisions: [{
        id: revisionId,
        version: 1,
        createdAt: new Date().toISOString(),
        title: "Demo clip integration",
        tagline: "A rendered proof",
        summary: "The chosen slide visual is replaced by uploaded footage.",
        strategy: {
          audienceGoal: "Show reviewers that uploaded footage appears in the presentation.",
          audienceLens: {
            decision: "Confirm that the render includes the selected clip.",
            priorKnowledge: "Reviewers understand presentation video.",
            priorities: ["Visible integration"],
            objections: [],
            preferredProof: "The encoded MP4 contains the targeted footage.",
            callToAction: "Approve the integrated render.",
          },
          coreMessage: "Demo footage appears at the selected story moment.",
          problem: "Detached demo clips weaken the presentation.",
          solution: "Target the clip to an approved slide.",
          differentiators: ["Explicit placement"],
          proofPoints: [],
          narrativeArc: ["hook", "solution", "close"],
          voiceoverDirection: "Keep narration focused on the outcome.",
          demoPlan: { recommendation: "omit", rationale: "Placement is user-selected." },
        },
        slides,
        promptVersion: "test",
        source: "demo",
        imageWarnings: [],
      }],
      activeRevisionId: revisionId,
      approvedPlanRevisionId: revisionId,
      approvedDeckRevisionId: revisionId,
      renderJobs: [],
      assets: [{
        id: "asset",
        kind: "demo-video",
        name: "demo.mp4",
        mimeType: "video/mp4",
        size: (await fs.stat(clip)).size,
        localPath: clip,
        slideId: "clip-target",
        durationSeconds: 1,
      }],
      lastError: null,
    };

    const result = await renderPresentation(project, "preview", "job");
    assert.equal(result.usedDemoAsset, true);
    assert.equal(result.durationSeconds, 9);
    await fs.access(result.outputPath);
  } finally {
    if (previousDataDirectory === undefined) delete process.env.IDEA2IMPACT_DATA_DIR;
    else process.env.IDEA2IMPACT_DATA_DIR = previousDataDirectory;
    for (const name of speechVariables) {
      const value = previousSpeech.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("preserves natural audio speed and rejects narration overruns", () => {
  assert.equal(audioTimingFilter(20, 20), "apad,atrim=duration=20");
  assert.equal(audioTimingFilter(5, 20), "apad,atrim=duration=20");
  assert.throws(() => audioTimingFilter(21, 20), /longer than the slide duration/);
});

test("bounds unbroken schema-valid text inside SVG text regions", () => {
  const longToken = "x".repeat(120);
  const svg = renderSlideSvg({
    ...slide({ type: "statement", statement: "y".repeat(220) }, "hero"),
    title: longToken,
    purpose: "z".repeat(240),
  }, 0);

  assert.doesNotMatch(svg, new RegExp(longToken));
  assert.doesNotMatch(svg, /z{100}/);
  assert.match(svg, /…/);
});
