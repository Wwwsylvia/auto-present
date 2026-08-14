import { z } from "zod";

export const projectStageSchema = z.enum(["plan", "create", "produce"]);
export type ProjectStage = z.infer<typeof projectStageSchema>;

export const projectInputSchema = z.object({
  idea: z.string().trim().min(20, "Describe your idea in at least 20 characters").max(8000),
  audience: z.string().trim().min(2).max(200).default("Hackathon judges"),
  tone: z.enum(["confident", "conversational", "technical", "inspiring"]).default("confident"),
  durationMinutes: z.coerce.number().min(1).max(10),
  githubUrl: z.union([z.literal(""), z.url()]).default(""),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const evidenceSchema = z.object({
  path: z.string(),
  excerpt: z.string(),
  url: z.string(),
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

export const slideLayoutSchema = z.enum([
  "hero",
  "problem",
  "features",
  "architecture",
  "demo",
  "closing",
]);

export const slideSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  purpose: z.string().min(1).max(240),
  layout: slideLayoutSchema,
  bullets: z.array(z.string().min(1).max(220)).max(5),
  narration: z.string().min(1).max(2400),
  durationSeconds: z.number().min(3).max(180),
  evidencePaths: z.array(z.string()).default([]),
});
export type Slide = z.infer<typeof slideSchema>;

export const presentationRevisionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  title: z.string().min(1).max(120),
  tagline: z.string().min(1).max(220),
  summary: z.string().min(1).max(1200),
  slides: z.array(slideSchema).min(3).max(20),
  promptVersion: z.string(),
  source: z.enum(["foundry", "demo"]),
});
export type PresentationRevision = z.infer<typeof presentationRevisionSchema>;

export const renderJobSchema = z.object({
  id: z.string(),
  revisionId: z.string(),
  kind: z.enum(["preview", "final"]),
  status: z.enum(["queued", "rendering", "complete", "failed", "stale"]),
  progress: z.number().min(0).max(100),
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

export const updateSlideSchema = z.object({
  expectedVersion: z.number().int().positive(),
  slideId: z.string(),
  changes: slideSchema
    .pick({
      title: true,
      purpose: true,
      bullets: true,
      narration: true,
      durationSeconds: true,
    })
    .partial(),
});

export const revisionPatchSchema = z.object({
  summary: z.string().min(1).max(300),
  slideChanges: z.array(
    z.object({
      slideId: z.string(),
      changes: slideSchema
        .pick({
          title: true,
          purpose: true,
          bullets: true,
          narration: true,
          durationSeconds: true,
        })
        .partial()
        .refine((changes) => Object.keys(changes).length > 0, "A slide change cannot be empty"),
    }),
  ).min(1).max(20),
});
export type RevisionPatch = z.infer<typeof revisionPatchSchema>;

export function activeRevision(project: Project): PresentationRevision | undefined {
  return project.revisions.find((revision) => revision.id === project.activeRevisionId);
}

export function targetDurationSeconds(project: Pick<Project, "input">): number {
  return project.input.durationMinutes * 60;
}

export function actualDurationSeconds(revision: PresentationRevision): number {
  return revision.slides.reduce((total, slide) => total + slide.durationSeconds, 0);
}

export function durationDriftPercent(project: Project, revision: PresentationRevision): number {
  return (
    ((actualDurationSeconds(revision) - targetDurationSeconds(project)) /
      targetDurationSeconds(project)) *
    100
  );
}
