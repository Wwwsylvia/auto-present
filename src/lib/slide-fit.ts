import type { Slide, Visual } from "@/lib/domain";

type SlideCopy = Pick<
  Slide,
  "title" | "purpose" | "audienceTakeaway" | "bullets" | "visual"
>;

type TextBudget = {
  words: number;
  characters: number;
};

const titleBudget: TextBudget = { words: 10, characters: 84 };
const purposeBudget: TextBudget = { words: 8, characters: 96 };
const takeawayBudget: TextBudget = { words: 14, characters: 150 };
const bulletBudget: TextBudget = { words: 8, characters: 96 };

function compactText(value: string, budget: TextBudget): string {
  const words = value.replaceAll(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const wordBounded = words.slice(0, budget.words).join(" ");
  if (wordBounded.length <= budget.characters) return wordBounded;
  const shortened = wordBounded.slice(0, budget.characters + 1);
  const boundary = shortened.lastIndexOf(" ");
  return shortened.slice(0, boundary > budget.characters * 0.6 ? boundary : budget.characters).trim();
}

function textFits(value: string, budget: TextBudget): boolean {
  const compacted = value.replaceAll(/\s+/g, " ").trim();
  return (
    compacted.length <= budget.characters &&
    compacted.split(" ").filter(Boolean).length <= budget.words
  );
}

function fitVisual(visual: Visual): Visual {
  switch (visual.type) {
    case "statement":
      return {
        type: "statement",
        statement: compactText(visual.statement, { words: 16, characters: 120 }),
      };
    case "cards":
      return {
        type: "cards",
        cards: visual.cards.slice(0, 4).map((card) => ({
          heading: compactText(card.heading, { words: 3, characters: 42 }),
          ...(card.body
            ? { body: compactText(card.body, { words: 6, characters: 72 }) }
            : {}),
        })),
      };
    case "flow":
      return {
        type: "flow",
        steps: visual.steps.slice(0, 4).map((step) => ({
          label: compactText(step.label, { words: 3, characters: 36 }),
          ...(step.detail
            ? { detail: compactText(step.detail, { words: 5, characters: 64 }) }
            : {}),
        })),
      };
    case "comparison":
      return {
        type: "comparison",
        leftLabel: compactText(visual.leftLabel, { words: 3, characters: 36 }),
        rightLabel: compactText(visual.rightLabel, { words: 3, characters: 36 }),
        rows: visual.rows.slice(0, 3).map((row) => ({
          label: compactText(row.label, { words: 2, characters: 24 }),
          left: compactText(row.left, { words: 4, characters: 48 }),
          right: compactText(row.right, { words: 4, characters: 48 }),
        })),
      };
    case "metrics":
      return {
        type: "metrics",
        metrics: visual.metrics.slice(0, 3).map((metric) => ({
          value: compactText(metric.value, { words: 2, characters: 18 }),
          label: compactText(metric.label, { words: 4, characters: 48 }),
          ...(metric.detail
            ? { detail: compactText(metric.detail, { words: 4, characters: 52 }) }
            : {}),
        })),
      };
    case "timeline":
      return {
        type: "timeline",
        events: visual.events.slice(0, 4).map((event) => ({
          label: compactText(event.label, { words: 3, characters: 36 }),
          ...(event.detail
            ? { detail: compactText(event.detail, { words: 5, characters: 64 }) }
            : {}),
        })),
      };
    case "demo":
      return {
        type: "demo",
        setup: compactText(visual.setup, { words: 7, characters: 76 }),
        action: compactText(visual.action, { words: 7, characters: 76 }),
        payoff: compactText(visual.payoff, { words: 7, characters: 76 }),
      };
  }
}

function visualFitIssues(visual: Visual): string[] {
  switch (visual.type) {
    case "statement":
      return textFits(visual.statement, { words: 16, characters: 120 }) ? [] : ["statement"];
    case "cards":
      return [
        ...(visual.cards.length > 4 ? ["card count"] : []),
        ...visual.cards.flatMap((card, index) => [
          ...(textFits(card.heading, { words: 3, characters: 42 }) ? [] : [`card ${index + 1} heading`]),
          ...(!card.body || textFits(card.body, { words: 6, characters: 72 })
            ? []
            : [`card ${index + 1} body`]),
        ]),
      ];
    case "flow":
      return [
        ...(visual.steps.length > 4 ? ["flow step count"] : []),
        ...visual.steps.flatMap((step, index) => [
          ...(textFits(step.label, { words: 3, characters: 36 }) ? [] : [`step ${index + 1} label`]),
          ...(!step.detail || textFits(step.detail, { words: 5, characters: 64 })
            ? []
            : [`step ${index + 1} detail`]),
        ]),
      ];
    case "comparison":
      return [
        ...(visual.rows.length > 3 ? ["comparison row count"] : []),
        ...(textFits(visual.leftLabel, { words: 3, characters: 36 }) ? [] : ["left label"]),
        ...(textFits(visual.rightLabel, { words: 3, characters: 36 }) ? [] : ["right label"]),
        ...visual.rows.flatMap((row, index) => [
          ...(textFits(row.label, { words: 2, characters: 24 }) ? [] : [`row ${index + 1} label`]),
          ...(textFits(row.left, { words: 4, characters: 48 }) ? [] : [`row ${index + 1} left`]),
          ...(textFits(row.right, { words: 4, characters: 48 }) ? [] : [`row ${index + 1} right`]),
        ]),
      ];
    case "metrics":
      return [
        ...(visual.metrics.length > 3 ? ["metric count"] : []),
        ...visual.metrics.flatMap((metric, index) => [
          ...(textFits(metric.value, { words: 2, characters: 18 }) ? [] : [`metric ${index + 1} value`]),
          ...(textFits(metric.label, { words: 4, characters: 48 }) ? [] : [`metric ${index + 1} label`]),
          ...(!metric.detail || textFits(metric.detail, { words: 4, characters: 52 })
            ? []
            : [`metric ${index + 1} detail`]),
        ]),
      ];
    case "timeline":
      return [
        ...(visual.events.length > 4 ? ["timeline event count"] : []),
        ...visual.events.flatMap((event, index) => [
          ...(textFits(event.label, { words: 3, characters: 36 }) ? [] : [`event ${index + 1} label`]),
          ...(!event.detail || textFits(event.detail, { words: 5, characters: 64 })
            ? []
            : [`event ${index + 1} detail`]),
        ]),
      ];
    case "demo":
      return [
        ...(textFits(visual.setup, { words: 7, characters: 76 }) ? [] : ["demo setup"]),
        ...(textFits(visual.action, { words: 7, characters: 76 }) ? [] : ["demo action"]),
        ...(textFits(visual.payoff, { words: 7, characters: 76 }) ? [] : ["demo payoff"]),
      ];
  }
}

export function fitSlideCopy<T extends SlideCopy>(slide: T): T {
  return {
    ...slide,
    title: compactText(slide.title, titleBudget),
    purpose: compactText(slide.purpose, purposeBudget),
    audienceTakeaway: compactText(slide.audienceTakeaway, takeawayBudget),
    bullets: slide.bullets.slice(0, 3).map((bullet) => compactText(bullet, bulletBudget)),
    visual: fitVisual(slide.visual),
  };
}

export function slideCopyFitIssues(slide: SlideCopy): string[] {
  return [
    ...(textFits(slide.title, titleBudget) ? [] : ["title"]),
    ...(textFits(slide.purpose, purposeBudget) ? [] : ["purpose"]),
    ...(textFits(slide.audienceTakeaway, takeawayBudget) ? [] : ["audience takeaway"]),
    ...(slide.bullets.length <= 3 ? [] : ["bullet count"]),
    ...slide.bullets.flatMap((bullet, index) =>
      textFits(bullet, bulletBudget) ? [] : [`bullet ${index + 1}`],
    ),
    ...visualFitIssues(slide.visual),
  ];
}
