import assert from "node:assert/strict";
import test from "node:test";
import {
  audioTimingFilter,
  findDemoSlideIndex,
  renderSlideSvg,
  resolveDemoFootageIndex,
} from "@/lib/render";
import type { Slide, Visual } from "@/lib/domain";

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
    slide({ type: "demo", setup: "Start.", action: "Act.", payoff: "Show." }, "demo"),
    slide({ type: "statement", statement: "Not a demo." }, "closing"),
    slide({ type: "statement", statement: "Also not a demo." }, "demo"),
    slide({ type: "statement", statement: "Final slide." }, "closing"),
  ];

  assert.equal(findDemoSlideIndex(slides), 0);
  assert.equal(resolveDemoFootageIndex(slides, true), 0);
});

test("rejects an uploaded demo asset when the approved deck has no semantic demo slide", () => {
  const slides = [
    slide({ type: "statement", statement: "This is only styled like a demo." }, "demo"),
    slide({ type: "statement", statement: "There is no demo payload." }, "closing"),
  ];

  assert.throws(
    () => resolveDemoFootageIndex(slides, true),
    /demo video asset but no semantic demo slide/,
  );
  assert.equal(resolveDemoFootageIndex(slides, false), undefined);
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
