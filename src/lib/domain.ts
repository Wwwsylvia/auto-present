import { z } from "zod";

export const projectStageSchema = z.enum(["plan", "create", "produce"]);
export type ProjectStage = z.infer<typeof projectStageSchema>;

export const projectInputSchema = z.object({
  idea: z.string().trim().min(20, "Describe your idea in at least 20 characters").max(8000),
  audience: z.string().trim().min(2).max(200).default("Hackathon judges"),
  tone: z.enum(["confident", "conversational", "technical", "inspiring"]).default("confident"),
  durationMinutes: z
    .coerce
    .number()
    .min(1)
    .max(10)
    .refine((minutes) => Number.isInteger(minutes * 60), "Choose a duration that resolves to whole seconds"),
  githubUrl: z.union([z.literal(""), z.url()]).default(""),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const evidenceSchema = z.object({
  path: z.string(),
  excerpt: z.string(),
  url: z.string(),
  category: z
    .enum(["readme", "documentation", "manifest", "entry-point", "route", "schema", "test", "deployment"])
    .default("documentation"),
});

export const repositorySnapshotSchema = z.object({
  url: z.string(),
  owner: z.string(),
  repo: z.string(),
  commitSha: z.string(),
  description: z.string().nullable(),
  languages: z.array(z.string()),
  evidence: z.array(evidenceSchema),
});
export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;

const shortText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const slideLayoutSchema = z.enum([
  "hero",
  "problem",
  "solution",
  "comparison",
  "process",
  "architecture",
  "evidence",
  "demo",
  "closing",
]);
export type SlideLayout = z.infer<typeof slideLayoutSchema>;

const visualCardSchema = z.object({
  heading: shortText(80),
  body: shortText(180).optional(),
});

export const structuredVisualSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("statement"),
    statement: shortText(220),
  }),
  z.object({
    type: z.literal("cards"),
    cards: z.array(visualCardSchema).min(2).max(4),
  }),
  z.object({
    type: z.literal("flow"),
    steps: z.array(z.object({ label: shortText(80), detail: shortText(160).optional() })).min(2).max(6),
  }),
  z.object({
    type: z.literal("comparison"),
    leftLabel: shortText(80),
    rightLabel: shortText(80),
    rows: z
      .array(z.object({ label: shortText(80), left: shortText(140), right: shortText(140) }))
      .min(2)
      .max(5),
  }),
  z.object({
    type: z.literal("metrics"),
    metrics: z
      .array(z.object({ value: shortText(40), label: shortText(100), detail: shortText(140).optional() }))
      .min(1)
      .max(4),
  }),
  z.object({
    type: z.literal("timeline"),
    events: z.array(z.object({ label: shortText(80), detail: shortText(160).optional() })).min(2).max(6),
  }),
  z.object({
    type: z.literal("demo"),
    setup: shortText(180),
    action: shortText(180),
    payoff: shortText(180),
  }),
]);
export type StructuredVisual = z.infer<typeof structuredVisualSchema>;

export const visualSchema = z.discriminatedUnion("type", [
  ...structuredVisualSchema.options,
  z.object({
    type: z.literal("image"),
    prompt: shortText(1200),
    altText: shortText(280),
    caption: shortText(180),
    assetId: z.uuid().optional(),
    fallback: structuredVisualSchema,
  }),
]);
export type Visual = z.infer<typeof visualSchema>;

export const narrativeStageSchema = z.enum(["hook", "problem", "solution", "proof", "demo", "close"]);
export type NarrativeStage = z.infer<typeof narrativeStageSchema>;

export const demoPlanSchema = z.object({
  recommendation: z.enum(["include", "omit"]),
  rationale: shortText(360),
});
export type DemoPlan = z.infer<typeof demoPlanSchema>;

export const proofPointSchema = z.object({
  claim: shortText(280),
  evidencePaths: z.array(z.string().min(1)).min(1).max(4),
});
export type ProofPoint = z.infer<typeof proofPointSchema>;

export const presentationStrategySchema = z.object({
  audienceGoal: shortText(360),
  audienceLens: z.object({
    decision: shortText(280),
    priorKnowledge: shortText(280),
    priorities: z.array(shortText(160)).min(1).max(5),
    objections: z.array(shortText(180)).max(4),
    preferredProof: shortText(280),
    callToAction: shortText(280),
  }).default({
    decision: "Decide whether the idea should move forward.",
    priorKnowledge: "Assume only the context supplied in the brief.",
    priorities: ["Clear value", "Credible proof"],
    objections: [],
    preferredProof: "Concrete outcomes supported by available evidence.",
    callToAction: "Advance the next validation step.",
  }),
  coreMessage: shortText(360),
  problem: shortText(600),
  solution: shortText(600),
  differentiators: z.array(shortText(240)).min(1).max(5),
  proofPoints: z.array(proofPointSchema).max(6),
  narrativeArc: z.array(narrativeStageSchema).min(3).max(6),
  voiceoverDirection: shortText(600),
  demoPlan: demoPlanSchema,
});
export type PresentationStrategy = z.infer<typeof presentationStrategySchema>;

export const slideSchema = z.object({
  id: z.string(),
  title: shortText(120),
  purpose: shortText(240),
  audienceTakeaway: shortText(280),
  layout: slideLayoutSchema,
  bullets: z.array(shortText(220)).max(5),
  visual: visualSchema,
  narration: shortText(2400),
  durationSeconds: z.number().int().min(3).max(180),
  evidencePaths: z.array(z.string().min(1)).max(6),
});
export type Slide = z.infer<typeof slideSchema>;

export const maximumNaturalWordsPerSecond = 2.5;

export function narrationFit(
  slide: Pick<Slide, "narration" | "durationSeconds">,
): { fits: boolean; wordCount: number; maximumWords: number; wordsPerSecond: number } {
  const wordCount = slide.narration.trim().split(/\s+/).filter(Boolean).length;
  const maximumWords = Math.floor(slide.durationSeconds * maximumNaturalWordsPerSecond);
  return {
    fits: wordCount <= maximumWords,
    wordCount,
    maximumWords,
    wordsPerSecond: wordCount / slide.durationSeconds,
  };
}

export const presentationRevisionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  title: shortText(120),
  tagline: shortText(220),
  summary: shortText(1200),
  strategy: presentationStrategySchema,
  slides: z.array(slideSchema).min(3).max(20),
  promptVersion: z.string(),
  source: z.enum(["foundry", "demo"]),
  imageWarnings: z.array(shortText(500)).default([]),
});
export type PresentationRevision = z.infer<typeof presentationRevisionSchema>;

export const renderJobSchema = z.object({
  id: z.string(),
  projectId: z.string().default(""),
  revisionId: z.string(),
  kind: z.enum(["preview", "final"]),
  status: z.enum(["queued", "rendering", "retrying", "complete", "failed", "stale"]),
  progress: z.number().min(0).max(100),
  attempts: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).default(3),
  createdAt: z.string().default(""),
  updatedAt: z.string().default(""),
  nextAttemptAt: z.string().optional(),
  outputUrl: z.string().optional(),
  error: z.string().optional(),
});
export type RenderJob = z.infer<typeof renderJobSchema>;

export const assetSchema = z.object({
  id: z.string(),
  kind: z.literal("demo-video"),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().positive(),
  localPath: z.string(),
  slideId: z.string().optional(),
  durationSeconds: z.number().positive().max(180).optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const projectSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  stage: projectStageSchema,
  input: projectInputSchema,
  repository: repositorySnapshotSchema.nullable(),
  revisions: z.array(presentationRevisionSchema),
  activeRevisionId: z.string().nullable(),
  approvedPlanRevisionId: z.string().nullable(),
  approvedDeckRevisionId: z.string().nullable(),
  renderJobs: z.array(renderJobSchema),
  assets: z.array(assetSchema).default([]),
  lastError: z.string().nullable(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = projectInputSchema;

const slideChangeFieldsSchema = slideSchema
  .pick({
    title: true,
    purpose: true,
    audienceTakeaway: true,
    layout: true,
    bullets: true,
    visual: true,
    narration: true,
    durationSeconds: true,
    evidencePaths: true,
  })
  .partial();

export const slideChangesSchema = z
  .preprocess((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const changes = value as Record<string, unknown>;
    if (!("demoPlan" in changes)) return changes;
    if ("visual" in changes) return { ...changes, visual: { type: "invalid-demo-plan" } };
    const { demoPlan, ...otherChanges } = changes;
    return {
      ...otherChanges,
      visual: { type: "demo", ...(demoPlan as Record<string, unknown>) },
    };
  }, slideChangeFieldsSchema)
  .refine((changes) => Object.keys(changes).length > 0, "A slide change cannot be empty");

export const updateSlideSchema = z.object({
  expectedVersion: z.number().int().positive(),
  slideId: z.string(),
  changes: slideChangesSchema,
});

export const revisionPatchSchema = z.object({
  summary: shortText(300),
  slideChanges: z
    .array(
      z.object({
        slideId: z.string(),
        changes: slideChangesSchema,
      }),
    )
    .min(1)
    .max(20),
});
export type RevisionPatch = z.infer<typeof revisionPatchSchema>;

export const revisionScopeSchema = z.enum(["slide", "deck"]);
export type RevisionScope = z.infer<typeof revisionScopeSchema>;

export function activeRevision(project: Project): PresentationRevision | undefined {
  return project.revisions.find((revision) => revision.id === project.activeRevisionId);
}

export function targetDurationSeconds(project: Pick<Project, "input">): number {
  return project.input.durationMinutes * 60;
}

export function targetSlideCountFromSeconds(seconds: number): number {
  return Math.max(3, Math.min(20, Math.round(seconds / 30)));
}

export function targetSlideCount(project: Pick<Project, "input">): number {
  return targetSlideCountFromSeconds(targetDurationSeconds(project));
}

export function requiresFullNarrative(slideCount: number): boolean {
  return slideCount >= 4;
}

export function actualDurationSeconds(revision: { slides: readonly Pick<Slide, "durationSeconds">[] }): number {
  return revision.slides.reduce((total, slide) => total + slide.durationSeconds, 0);
}

export function durationDriftPercent(project: Project, revision: PresentationRevision): number {
  return (
    ((actualDurationSeconds(revision) - targetDurationSeconds(project)) /
      targetDurationSeconds(project)) *
    100
  );
}
