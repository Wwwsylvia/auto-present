import assert from "node:assert/strict";
import test from "node:test";
import type { Slide } from "@/lib/domain";
import { fitSlideCopy, slideCopyFitIssues } from "@/lib/slide-fit";

const demoSlide: Slide = {
  id: "demo-slide",
  title: "See the complete workflow in one short and highly convincing live demo",
  purpose: "Show the strongest and most memorable proof within the strict time limit.",
  audienceTakeaway: "The value becomes obvious when the complete workflow runs from rough input to polished output.",
  layout: "demo",
  bullets: [
    "Fast setup with Azure Developer CLI and deployment assets.",
    "Azure infrastructure resources are included for production deployment.",
    "One complete run produces presentation-ready output without repeated work.",
    "This fourth bullet cannot fit the composition.",
  ],
  visual: {
    type: "demo",
    setup: "Open the application with an idea and optional repository context.",
    action: "Refine one central editable outline and approve the complete result once.",
    payoff: "Generate a presentation-ready HTML deck and fully editable speaker notes.",
  },
  narration: "Show the audience outcome without narrating controls.",
  durationSeconds: 20,
  evidencePaths: ["README.md"],
};

test("fits every copy region instead of relying on a total word count", () => {
  const fitted = fitSlideCopy(demoSlide);

  assert.deepEqual(slideCopyFitIssues(fitted), []);
  assert.equal(fitted.bullets.length, 3);
  assert.ok(fitted.visual.type === "demo");
  assert.ok(fitted.visual.setup.split(/\s+/).length <= 7);
  assert.ok(fitted.visual.action.split(/\s+/).length <= 7);
  assert.ok(fitted.visual.payoff.split(/\s+/).length <= 7);
});

test("reports local overflow even when the whole slide is not unusually dense", () => {
  const locallyOverfilled = {
    ...demoSlide,
    title: "A short title",
    purpose: "Concrete proof",
    audienceTakeaway: "Judges see the outcome.",
    bullets: [],
  };

  assert.ok(slideCopyFitIssues(locallyOverfilled).includes("demo setup"));
});
