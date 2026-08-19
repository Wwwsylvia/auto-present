import { randomUUID } from "node:crypto";
import type { Project } from "@/lib/domain";

export function invalidateDeckOutputs(project: Project): Project {
  return {
    ...project,
    stage: "create",
    approvedDeckRevisionId: null,
    renderJobs: project.renderJobs.map((job) =>
      job.status === "failed" || job.status === "stale"
        ? job
        : { ...job, status: "stale" as const },
    ),
  };
}

export function restoreProjectRevision(
  project: Project,
  revisionId: string,
  expectedActiveRevisionId: string,
): Project {
  if (project.activeRevisionId !== expectedActiveRevisionId) {
    throw new Error("REVISION_CONFLICT");
  }
  const revision = project.revisions.find((candidate) => candidate.id === revisionId);
  if (!revision) throw new Error("REVISION_NOT_FOUND");
  const restored = {
    ...revision,
    id: randomUUID(),
    version: Math.max(...project.revisions.map((candidate) => candidate.version), 0) + 1,
    createdAt: new Date().toISOString(),
  };
  const assets = project.assets.filter((asset) => {
    if (asset.slideId) {
      return restored.slides.some((slide) => slide.id === asset.slideId);
    }
    return restored.slides.some(
      (slide) => slide.layout === "demo" && slide.visual.type === "demo",
    );
  });
  return invalidateDeckOutputs({
    ...project,
    revisions: [...project.revisions, restored],
    activeRevisionId: restored.id,
    assets,
    lastError: null,
  });
}
