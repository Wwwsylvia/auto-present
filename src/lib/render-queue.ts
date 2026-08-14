import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataDirectory } from "@/lib/config";
import {
  activeRevision,
  projectSchema,
  renderJobSchema,
  type Project,
  type RenderJob,
} from "@/lib/domain";

const queueRecordSchema = z.object({
  job: renderJobSchema,
  project: projectSchema,
  leaseExpiresAt: z.string().optional(),
});
type QueueRecord = z.infer<typeof queueRecordSchema>;

function queueDirectory(): string {
  return path.join(dataDirectory(), "render-queue");
}

function recordPath(id: string): string {
  return path.join(queueDirectory(), `${id}.json`);
}

function lockPath(id: string): string {
  return path.join(queueDirectory(), `${id}.lock`);
}

export function renderDirectory(id: string): string {
  return path.join(dataDirectory(), "renders", id);
}

function assertId(id: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid render ID");
}

async function atomicWrite(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporary, file);
}

async function readRecord(id: string): Promise<QueueRecord | undefined> {
  assertId(id);
  try {
    return queueRecordSchema.parse(
      JSON.parse(await fs.readFile(recordPath(id), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function createRenderJob(
  project: Project,
  kind: RenderJob["kind"],
): QueueRecord {
  const revision = activeRevision(project);
  if (!revision || project.approvedDeckRevisionId !== revision.id) {
    throw new Error("Approve the current deck before rendering");
  }
  const now = new Date().toISOString();
  return {
    project: structuredClone(project),
    job: {
      id: randomUUID(),
      projectId: project.id,
      revisionId: revision.id,
      kind,
      status: "queued",
      progress: 0,
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export async function enqueueRender(record: QueueRecord): Promise<void> {
  await atomicWrite(recordPath(record.job.id), record);
}

export async function getRenderJob(id: string): Promise<RenderJob | undefined> {
  return (await readRecord(id))?.job;
}

export async function hydrateRenderJobs(project: Project): Promise<Project> {
  const renderJobs = await Promise.all(
    project.renderJobs.map(async (stored) => (await getRenderJob(stored.id)) ?? stored),
  );
  return { ...project, renderJobs };
}

export async function updateRenderJob(
  id: string,
  update: (job: RenderJob) => RenderJob,
): Promise<RenderJob> {
  const record = await readRecord(id);
  if (!record) throw new Error("Render job not found");
  record.job = renderJobSchema.parse({
    ...update(record.job),
    updatedAt: new Date().toISOString(),
  });
  await atomicWrite(recordPath(id), record);
  return record.job;
}

export async function claimNextRenderJob(
  now = new Date(),
): Promise<QueueRecord | undefined> {
  await fs.mkdir(queueDirectory(), { recursive: true });
  const files = (await fs.readdir(queueDirectory()))
    .filter((file) => /^[0-9a-f-]{36}\.json$/i.test(file))
    .sort();
  for (const file of files) {
    const id = file.slice(0, -5);
    const record = await readRecord(id);
    if (!record) continue;
    const due =
      record.job.status === "queued" ||
      (record.job.status === "retrying" &&
        (!record.job.nextAttemptAt ||
          Date.parse(record.job.nextAttemptAt) <= now.getTime())) ||
      (record.job.status === "rendering" &&
        record.leaseExpiresAt &&
        Date.parse(record.leaseExpiresAt) <= now.getTime());
    if (!due) continue;
    if (record.job.status === "rendering" && record.leaseExpiresAt) {
      await fs.rm(lockPath(id), { force: true });
    } else {
      try {
        const lockStats = await fs.stat(lockPath(id));
        if (now.getTime() - lockStats.mtimeMs > 15 * 60_000) {
          await fs.rm(lockPath(id), { force: true });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    let lock: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      lock = await fs.open(lockPath(id), "wx");
      const latest = await readRecord(id);
      if (!latest) continue;
      latest.job = {
        ...latest.job,
        status: "rendering",
        progress: Math.max(1, latest.job.progress),
        attempts: latest.job.attempts + 1,
        nextAttemptAt: undefined,
        error: undefined,
        updatedAt: now.toISOString(),
      };
      latest.leaseExpiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
      await atomicWrite(recordPath(id), latest);
      return latest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    } finally {
      await lock?.close();
    }
  }
}

export async function heartbeatRenderJob(
  id: string,
  progress: number,
): Promise<void> {
  const record = await readRecord(id);
  if (!record) throw new Error("Render job not found");
  record.job = {
    ...record.job,
    progress: Math.max(record.job.progress, Math.min(99, progress)),
    updatedAt: new Date().toISOString(),
  };
  record.leaseExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await atomicWrite(recordPath(id), record);
}

export async function completeRenderJob(id: string): Promise<void> {
  await updateRenderJob(id, (job) => ({
    ...job,
    status: "complete",
    progress: 100,
    outputUrl: `/api/renders/${id}`,
    error: undefined,
  }));
  await fs.rm(lockPath(id), { force: true });
}

export async function failRenderJob(id: string, message: string): Promise<void> {
  const record = await readRecord(id);
  if (!record) throw new Error("Render job not found");
  const retry = record.job.attempts < record.job.maxAttempts;
  const backoffSeconds = Math.min(30, 2 ** record.job.attempts);
  record.job = {
    ...record.job,
    status: retry ? "retrying" : "failed",
    progress: 0,
    error: message,
    nextAttemptAt: retry
      ? new Date(Date.now() + backoffSeconds * 1000).toISOString()
      : undefined,
    updatedAt: new Date().toISOString(),
  };
  record.leaseExpiresAt = undefined;
  await atomicWrite(recordPath(id), record);
  await fs.rm(renderDirectory(id), { recursive: true, force: true });
  await fs.rm(lockPath(id), { force: true });
}

export async function retryRenderJob(id: string): Promise<RenderJob> {
  await fs.rm(renderDirectory(id), { recursive: true, force: true });
  return updateRenderJob(id, (job) => {
    if (job.status !== "failed") {
      throw new Error("Only failed render jobs can be retried");
    }
    return {
      ...job,
      status: "queued",
      progress: 0,
      attempts: 0,
      nextAttemptAt: undefined,
      error: undefined,
      outputUrl: undefined,
    };
  });
}

export async function invalidateRenderJobs(
  projectId: string,
  activeRevisionId: string,
): Promise<void> {
  await fs.mkdir(queueDirectory(), { recursive: true });
  const files = (await fs.readdir(queueDirectory())).filter((file) =>
    /^[0-9a-f-]{36}\.json$/i.test(file),
  );
  await Promise.all(
    files.map(async (file) => {
      const id = file.slice(0, -5);
      const record = await readRecord(id);
      if (
        !record ||
        record.job.projectId !== projectId ||
        record.job.revisionId === activeRevisionId
      ) {
        return;
      }
      record.job = {
        ...record.job,
        status: "stale",
        progress: 0,
        outputUrl: undefined,
        error: undefined,
        updatedAt: new Date().toISOString(),
      };
      record.leaseExpiresAt = undefined;
      await atomicWrite(recordPath(id), record);
      await fs.rm(renderDirectory(id), { recursive: true, force: true });
      await fs.rm(lockPath(id), { force: true });
    }),
  );
}

export async function releaseRenderLock(id: string): Promise<void> {
  await fs.rm(lockPath(id), { force: true });
}
