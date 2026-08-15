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
  claimToken: z.string().uuid().optional(),
  claimable: z.boolean().optional(),
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

function transitionLockPath(id: string): string {
  return path.join(queueDirectory(), `${id}.transition.lock`);
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

async function withTransitionLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const file = transitionLockPath(id);
  await fs.mkdir(queueDirectory(), { recursive: true });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let lock: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      lock = await fs.open(file, "wx");
      return await operation();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const stats = await fs.stat(file);
        if (Date.now() - stats.mtimeMs > 60_000) await fs.rm(file, { force: true });
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== "ENOENT") throw statError;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      await lock?.close();
      if (lock) await fs.rm(file, { force: true });
    }
  }
  throw new Error("Timed out waiting to update render job");
}

export class RenderClaimLostError extends Error {
  constructor() {
    super("Render claim is no longer active");
  }
}

function hasClaim(record: QueueRecord, claimToken: string): boolean {
  return record.job.status === "rendering" && record.claimToken === claimToken;
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

export async function enqueueRender(
  record: QueueRecord,
  options: { deferClaim?: boolean } = {},
): Promise<void> {
  await atomicWrite(recordPath(record.job.id), {
    ...record,
    claimable: !options.deferClaim,
  });
}

export async function activateRenderJob(id: string): Promise<void> {
  await withTransitionLock(id, async () => {
    const record = await readRecord(id);
    if (!record || record.job.status !== "queued") {
      throw new Error("Queued render job not found");
    }
    record.claimable = true;
    await atomicWrite(recordPath(id), record);
  });
}

export async function discardDeferredRenderJob(id: string): Promise<void> {
  await withTransitionLock(id, async () => {
    const record = await readRecord(id);
    if (!record) return;
    if (record.job.status !== "queued" || record.claimable !== false) {
      throw new Error("Only a deferred queued render job can be discarded");
    }
    await fs.rm(recordPath(id), { force: true });
  });
  await fs.rm(renderDirectory(id), { recursive: true, force: true });
  await fs.rm(lockPath(id), { force: true });
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
  return withTransitionLock(id, async () => {
    const record = await readRecord(id);
    if (!record) throw new Error("Render job not found");
    record.job = renderJobSchema.parse({
      ...update(record.job),
      updatedAt: new Date().toISOString(),
    });
    await atomicWrite(recordPath(id), record);
    return record.job;
  });
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
    if (record.claimable === false) continue;
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
    let claimed = false;
    try {
      lock = await fs.open(lockPath(id), "wx");
      const claimToken = randomUUID();
      await lock.writeFile(claimToken, "utf8");
      const latest = await withTransitionLock(id, async () => {
        const current = await readRecord(id);
        if (!current) return undefined;
        if (current.claimable === false) return undefined;
        const stillDue =
          current.job.status === "queued" ||
          (current.job.status === "retrying" &&
            (!current.job.nextAttemptAt ||
              Date.parse(current.job.nextAttemptAt) <= now.getTime())) ||
          (current.job.status === "rendering" &&
            Boolean(current.leaseExpiresAt) &&
            Date.parse(current.leaseExpiresAt ?? "") <= now.getTime());
        if (!stillDue) return undefined;
        current.job = {
          ...current.job,
          status: "rendering",
          progress: Math.max(1, current.job.progress),
          attempts: current.job.attempts + 1,
          nextAttemptAt: undefined,
          error: undefined,
          updatedAt: now.toISOString(),
        };
        current.claimToken = claimToken;
        current.leaseExpiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
        await atomicWrite(recordPath(id), current);
        return current;
      });
      if (!latest) continue;
      claimed = true;
      return latest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    } finally {
      await lock?.close();
      if (lock && !claimed) await fs.rm(lockPath(id), { force: true });
    }
  }
}

export async function heartbeatRenderJob(
  id: string,
  claimToken: string,
  progress: number,
): Promise<void> {
  await withTransitionLock(id, async () => {
    const record = await readRecord(id);
    if (!record || !hasClaim(record, claimToken)) throw new RenderClaimLostError();
    record.job = {
      ...record.job,
      progress: Math.max(record.job.progress, Math.min(99, progress)),
      updatedAt: new Date().toISOString(),
    };
    record.leaseExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    await atomicWrite(recordPath(id), record);
  });
}

export async function completeRenderJob(id: string, claimToken: string): Promise<void> {
  let invalidated = false;
  await withTransitionLock(id, async () => {
    const record = await readRecord(id);
    if (!record || !hasClaim(record, claimToken)) {
      invalidated = record?.job.status === "stale" && record.claimToken === undefined;
      throw new RenderClaimLostError();
    }
    record.job = renderJobSchema.parse({
      ...record.job,
      status: "complete",
      progress: 100,
      outputUrl: `/api/renders/${id}`,
      error: undefined,
      updatedAt: new Date().toISOString(),
    });
    record.claimToken = undefined;
    record.leaseExpiresAt = undefined;
    await atomicWrite(recordPath(id), record);
  }).catch(async (error) => {
    if (invalidated) await fs.rm(renderDirectory(id), { recursive: true, force: true });
    throw error;
  });
  await releaseRenderLock(id, claimToken);
}

export async function failRenderJob(
  id: string,
  claimToken: string,
  message: string,
): Promise<void> {
  let invalidated = false;
  await withTransitionLock(id, async () => {
    const record = await readRecord(id);
    if (!record) throw new Error("Render job not found");
    if (!hasClaim(record, claimToken)) {
      invalidated = record.job.status === "stale" && record.claimToken === undefined;
      throw new RenderClaimLostError();
    }
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
    record.claimToken = undefined;
    record.leaseExpiresAt = undefined;
    await atomicWrite(recordPath(id), record);
  }).catch(async (error) => {
    if (invalidated) await fs.rm(renderDirectory(id), { recursive: true, force: true });
    throw error;
  });
  await fs.rm(renderDirectory(id), { recursive: true, force: true });
  await releaseRenderLock(id, claimToken);
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
      await withTransitionLock(id, async () => {
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
        record.claimToken = undefined;
        record.leaseExpiresAt = undefined;
        await atomicWrite(recordPath(id), record);
      });
      await fs.rm(renderDirectory(id), { recursive: true, force: true });
      await fs.rm(lockPath(id), { force: true });
    }),
  );
}

export async function releaseRenderLock(id: string, claimToken: string): Promise<void> {
  try {
    if ((await fs.readFile(lockPath(id), "utf8")) === claimToken) {
      await fs.rm(lockPath(id), { force: true });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
