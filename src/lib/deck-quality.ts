import {
  actualDurationSeconds,
  narrationFit,
  type PresentationStrategy,
  type Slide,
  type Visual,
} from "@/lib/domain";
import { slideCopyFitIssues } from "@/lib/slide-fit";

export type DeckQualityCheckName =
  | "narrative"
  | "known-evidence"
  | "visual-diversity"
  | "text-density"
  | "repeated-claims"
  | "narration"
  | "narration-fit"
  | "demo-consistency"
  | "exact-duration";

export type DeckQualityCheck = {
  name: DeckQualityCheckName;
  passed: boolean;
  score: number;
  details: string;
};

export type DeckQuality = {
  score: number;
  checks: DeckQualityCheck[];
};

export type DeckQualityOptions = {
  targetDurationSeconds: number;
  knownEvidencePaths?: Iterable<string>;
};

type DeckQualityDeck = {
  strategy: PresentationStrategy;
  slides: readonly Pick<
    Slide,
    "title" | "purpose" | "audienceTakeaway" | "bullets" | "visual" | "narration" | "layout" | "durationSeconds" | "evidencePaths"
  >[];
};

export function visualText(visual: Visual): string[] {
  switch (visual.type) {
    case "statement":
      return [visual.statement];
    case "cards":
      return visual.cards.flatMap((card) => [card.heading, card.body ?? ""]);
    case "flow":
      return visual.steps.flatMap((step) => [step.label, step.detail ?? ""]);
    case "comparison":
      return [
        visual.leftLabel,
        visual.rightLabel,
        ...visual.rows.flatMap((row) => [row.label, row.left, row.right]),
      ];
    case "metrics":
      return visual.metrics.flatMap((metric) => [metric.value, metric.label, metric.detail ?? ""]);
    case "timeline":
      return visual.events.flatMap((event) => [event.label, event.detail ?? ""]);
    case "demo":
      return [visual.setup, visual.action, visual.payoff];
  }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizedClaim(text: string): string {
  return text.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();
}

export function containsMouseActionNarration(text: string): boolean {
  return /\b(?:click(?:s|ed|ing)?|tap(?:s|ped|ping)?|hover(?:s|ed|ing)?|mouse|cursor)\b/i.test(
    text,
  );
}

function check(name: DeckQualityCheckName, passed: boolean, details: string): DeckQualityCheck {
  return { name, passed, score: passed ? 100 : 0, details };
}

export function evaluateDeckQuality(
  revision: DeckQualityDeck,
  options: DeckQualityOptions,
): DeckQuality {
  const { slides } = revision;
  const narrativeMissing = [
    slides[0]?.layout === "hero" ? undefined : "hero must be first",
    slides.some((slide) => slide.layout === "problem") ? undefined : "problem layout is missing",
    slides.some((slide) => slide.layout === "solution") ? undefined : "solution layout is missing",
    slides.at(-1)?.layout === "closing" ? undefined : "closing must be last",
  ].filter((item): item is string => Boolean(item));

  const allEvidencePaths = [
    ...revision.strategy.proofPoints.flatMap((point) => point.evidencePaths),
    ...slides.flatMap((slide) => slide.evidencePaths),
  ];
  const knownPaths = options.knownEvidencePaths ? new Set(options.knownEvidencePaths) : undefined;
  const unknownPaths = knownPaths
    ? allEvidencePaths.filter((path) => !knownPaths.has(path))
    : [];

  const visualTypes = new Set(slides.map((slide) => slide.visual.type));
  const requiredVisualTypes = Math.min(3, slides.length);
  const textHeavySlides = slides.filter((slide) => {
    const text = [
      slide.purpose,
      slide.title,
      slide.audienceTakeaway,
      ...slide.bullets,
      ...visualText(slide.visual),
    ].join(" ");
    return wordCount(text) > 55 || slideCopyFitIssues(slide).length > 0;
  });

  const claims = slides.flatMap((slide) => [slide.title, slide.audienceTakeaway, ...slide.bullets]);
  const seenClaims = new Set<string>();
  const repeatedClaims = claims.filter((claim) => {
    const normalized = normalizedClaim(claim);
    if (!normalized || !seenClaims.has(normalized)) {
      if (normalized) seenClaims.add(normalized);
      return false;
    }
    return true;
  });

  const demoSlides = slides.filter((slide) => slide.layout === "demo" || slide.visual.type === "demo");
  const demoPayloadsMatchLayout = demoSlides.every(
    (slide) => slide.layout === "demo" && slide.visual.type === "demo",
  );
  const wantsDemo = revision.strategy.demoPlan.recommendation === "include";
  const demoConsistent =
    demoPayloadsMatchLayout && (wantsDemo ? demoSlides.length === 1 : demoSlides.length === 0);
  const totalDuration = actualDurationSeconds({ slides });
  const missingNarration = slides.filter((slide) => !slide.narration.trim());
  const mouseActionNarration = slides.filter((slide) =>
    containsMouseActionNarration(slide.narration),
  );
  const narrationValid = missingNarration.length === 0 && mouseActionNarration.length === 0;
  const narrationOverruns = slides.filter((slide) => !narrationFit(slide).fits);

  const checks: DeckQualityCheck[] = [
    check(
      "narrative",
      narrativeMissing.length === 0,
      narrativeMissing.length === 0 ? "Hero, problem, solution, and closing stages are present." : narrativeMissing.join("; "),
    ),
    check(
      "known-evidence",
      unknownPaths.length === 0,
      knownPaths
        ? unknownPaths.length === 0
          ? "All proof points and slide citations use supplied evidence."
          : `Unknown evidence paths: ${unknownPaths.join(", ")}`
        : "No evidence context was supplied for validation.",
    ),
    check(
      "visual-diversity",
      visualTypes.size >= requiredVisualTypes,
      `${visualTypes.size} visual types used; ${requiredVisualTypes} required.`,
    ),
    check(
      "text-density",
      textHeavySlides.length === 0,
      textHeavySlides.length === 0
        ? "All slides keep on-screen copy concise."
        : `Dense slides: ${textHeavySlides.map((slide) => slide.title).join(", ")}`,
    ),
    check(
      "repeated-claims",
      repeatedClaims.length === 0,
      repeatedClaims.length === 0
        ? "No repeated on-screen claims."
        : `Repeated claims: ${repeatedClaims.join(", ")}`,
    ),
    check(
      "narration",
      narrationValid,
      narrationValid
        ? "Every slide has complementary narration without mouse-action directions."
        : [
            missingNarration.length > 0
              ? `Missing narration: ${missingNarration.map((slide) => slide.title).join(", ")}.`
              : "",
            mouseActionNarration.length > 0
              ? `Mouse-action narration: ${mouseActionNarration.map((slide) => slide.title).join(", ")}.`
              : "",
          ].filter(Boolean).join(" "),
    ),
    check(
      "narration-fit",
      narrationOverruns.length === 0,
      narrationOverruns.length === 0
        ? "Every voiceover fits its slide at a natural speaking rate."
        : `Shorten narration or increase duration for: ${narrationOverruns
            .map((slide) => slide.title)
            .join(", ")}.`,
    ),
    check(
      "demo-consistency",
      demoConsistent,
      wantsDemo
        ? demoConsistent
          ? "One demo slide matches the recommended demo plan."
          : "The recommended demo needs exactly one demo layout with a demo visual."
        : demoConsistent
          ? "No demo slide appears because the strategy omits a demo."
          : "The strategy omits a demo, but a demo slide or visual is present.",
    ),
    check(
      "exact-duration",
      totalDuration === options.targetDurationSeconds,
      `Deck duration is ${totalDuration}s; target is ${options.targetDurationSeconds}s.`,
    ),
  ];

  return {
    score: Math.round(checks.reduce((total, item) => total + item.score, 0) / checks.length),
    checks,
  };
}
