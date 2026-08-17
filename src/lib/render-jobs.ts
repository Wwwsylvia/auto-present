import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DefaultAzureCredential } from "@azure/identity";
import { z } from "zod";
import {
  activeRevision,
  projectSchema,
  renderJobSchema,
  type Project,
  type RenderJob,
} from "@/lib/domain";
import { dataDirectory, renderDirectory } from "@/lib/data-paths";
import { renderPresentation } from "@/lib/render";

const renderManifestSchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  kind: z.enum(["preview", "final"]),
  project: projectSchema,
});

const jobResourceSchema = z.object({
  properties: z.object({
    template: z.object({
      containers: z.array(
        z.object({
          name: z.string(),
          env: z.array(z.object({ name: z.string() }).passthrough()).optional(),
        }).passthrough(),
      ),
    }).passthrough(),
  }),
});

function validateJobId(id: string): string {
  return z.uuid().parse(id);
}

function jobsDirectory(): string {
  return path.join(dataDirectory(), "jobs");
}

function manifestPath(id: string): string {
  return path.join(jobsDirectory(), `${validateJobId(id)}.manifest.json`);
}

function statusPath(id: string): string {
  return path.join(jobsDirectory(), `${validateJobId(id)}.status.json`);
}

function claimLockPath(id: string): string {
  return path.join(jobsDirectory(), `${validateJobId(id)}.claim.lock`);
}

function claimTransitionLockPath(id: string): string {
  return path.join(jobsDirectory(), `${validateJobId(id)}.claim-transition.lock`);
}

export function renderClaimDirectory(id: string, claimToken: string): string {
  return path.join(
    /* turbopackIgnore: true */ renderDirectory(),
    `${validateJobId(id)}.${z.uuid().parse(claimToken)}`,
  );
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporaryFile, file);
}

export function createQueuedRenderJob(project: Project, kind: RenderJob["kind"]): RenderJob {
  const revision = activeRevision(project);
  if (!revision || project.approvedDeckRevisionId !== revision.id) {
    throw new Error("Approve the current deck before rendering");
  }
  const id = randomUUID();
  return {
    id,
    revisionId: revision.id,
    kind,
    status: "queued",
    progress: 0,
    outputUrl: `/api/renders/${id}`,
  };
}

export async function writeRenderManifest(
  job: RenderJob,
  project: Project,
): Promise<void> {
  const manifest = renderManifestSchema.parse({
    id: job.id,
    createdAt: new Date().toISOString(),
    kind: job.kind,
    project,
  });
  await writeJsonAtomic(manifestPath(job.id), manifest);
  await writeRenderStatus(job);
}

export async function writeRenderStatus(job: RenderJob): Promise<void> {
  await writeJsonAtomic(statusPath(job.id), renderJobSchema.parse(job));
}

export async function readRenderStatus(id: string): Promise<RenderJob | undefined> {
  try {
    return renderJobSchema.parse(JSON.parse(await fs.readFile(statusPath(id), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function withClaimTransition<T>(id: string, operation: () => Promise<T>): Promise<T> {
  await fs.mkdir(jobsDirectory(), { recursive: true });
  const transitionPath = claimTransitionLockPath(id);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let transition: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      transition = await fs.open(transitionPath, "wx");
      return await operation();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stats = await fs.stat(transitionPath).catch(() => undefined);
      if (stats && Date.now() - stats.mtimeMs > 60_000) {
        await fs.rm(transitionPath, { force: true });
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      await transition?.close();
      if (transition) await fs.rm(transitionPath, { force: true });
    }
  }
  throw new Error("Timed out waiting to claim render job");
}

async function claimRenderJob(
  id: string,
  manifest: z.infer<typeof renderManifestSchema>,
): Promise<{ claimToken: string; job: RenderJob }> {
  return withClaimTransition(id, async () => {
    const current = await readRenderStatus(id);
    if (!current) throw new Error("Render status is missing");
    if (current?.status === "stale") throw new Error("Render job is stale");
    if (current.status !== "queued" && current.status !== "rendering") {
      throw new Error(`Render job cannot be claimed from status '${current.status}'`);
    }
    if (
      current?.status === "rendering" &&
      current.leaseExpiresAt &&
      Date.parse(current.leaseExpiresAt) > Date.now()
    ) {
      throw new Error("Render job is already claimed");
    }

    if (current?.status === "rendering") {
      await fs.rm(claimLockPath(id), { force: true });
    } else {
      const lockStats = await fs.stat(claimLockPath(id)).catch(() => undefined);
      if (lockStats && Date.now() - lockStats.mtimeMs <= 60_000) {
        throw new Error("Render job claim is being established");
      }
      if (lockStats) await fs.rm(claimLockPath(id), { force: true });
    }

    const claimToken = randomUUID();
    const lock = await fs.open(claimLockPath(id), "wx");
    try {
      await lock.writeFile(claimToken, "utf8");
    } finally {
      await lock.close();
    }
    const baseJob = createQueuedRenderJob(manifest.project, manifest.kind);
    const job: RenderJob = {
      ...baseJob,
      id: manifest.id,
      revisionId: activeRevision(manifest.project)!.id,
      status: "rendering",
      progress: 5,
      outputUrl: `/api/renders/${manifest.id}`,
      claimToken,
      leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      dispatchLeaseExpiresAt: undefined,
    };
    try {
      await writeRenderStatus(job);
      return { claimToken, job };
    } catch (error) {
      await releaseClaimLock(id, claimToken);
      throw error;
    }
  });
}

export async function executeRenderJob(id: string): Promise<RenderJob> {
  const manifest = renderManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath(id), "utf8")),
  );
  const { claimToken, job } = await claimRenderJob(id, manifest);
  const claimDirectory = renderClaimDirectory(id, claimToken);
  try {
    const result = await renderPresentation(manifest.project, manifest.kind, {
      jobId: `${manifest.id}.${claimToken}`,
      onProgress: async (progress) => {
        await withClaimTransition(id, async () => {
          const latest = await readRenderStatus(id);
          if (latest?.claimToken !== claimToken || latest.status !== "rendering") {
            throw new Error("Render claim is no longer active");
          }
          job.progress = progress;
          job.leaseExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
          await writeRenderStatus(job);
        });
      },
    });
    const completed = await promoteClaimOutput(id, claimToken, {
      ...result.job,
      id,
      revisionId: job.revisionId,
      outputUrl: `/api/renders/${id}`,
    });
    if (!completed) {
      await fs.rm(claimDirectory, { recursive: true, force: true });
      throw new Error("Render claim is no longer active");
    }
    await releaseClaimLock(id, claimToken);
    return result.job;
  } catch (error) {
    await withClaimTransition(id, async () => {
      const latest = await readRenderStatus(id);
      if (latest?.claimToken !== claimToken || latest.status === "stale") return;
      const failed: RenderJob = {
        ...job,
        status: "failed",
        progress: job.progress,
        error: error instanceof Error ? error.message : "Rendering failed",
        claimToken: undefined,
        leaseExpiresAt: undefined,
      };
      await writeRenderStatus(failed);
    });
    await fs.rm(claimDirectory, { recursive: true, force: true });
    await releaseClaimLock(id, claimToken);
    throw error;
  }
}

export async function promoteClaimOutput(
  id: string,
  claimToken: string,
  completedJob: RenderJob,
): Promise<boolean> {
  return withClaimTransition(id, async () => {
    const latest = await readRenderStatus(id);
    if (latest?.claimToken !== claimToken || latest.status !== "rendering") {
      return false;
    }
    const canonicalDirectory = path.join(renderDirectory(), validateJobId(id));
    await fs.rm(canonicalDirectory, { recursive: true, force: true });
    await fs.rename(renderClaimDirectory(id, claimToken), canonicalDirectory);
    await writeRenderStatus({
      ...completedJob,
      id,
      status: "complete",
      progress: 100,
      outputUrl: `/api/renders/${id}`,
      claimToken: undefined,
      leaseExpiresAt: undefined,
      dispatchLeaseExpiresAt: undefined,
    });
    return true;
  });
}

async function releaseClaimLock(id: string, claimToken: string): Promise<void> {
  try {
    if ((await fs.readFile(claimLockPath(id), "utf8")) === claimToken) {
      await fs.rm(claimLockPath(id), { force: true });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function startContainerAppsJob(id: string): Promise<void> {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP;
  const jobName = process.env.AZURE_CONTAINER_APP_JOB_NAME;
  if (!subscriptionId || !resourceGroup || !jobName) {
    throw new Error(
      "Container Apps Job dispatch requires AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, and AZURE_CONTAINER_APP_JOB_NAME",
    );
  }

  const apiVersion = "2024-03-01";
  const resourceUrl =
    `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}` +
    `/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.App/jobs/` +
    `${encodeURIComponent(jobName)}`;
  const token = await new DefaultAzureCredential().getToken(
    "https://management.azure.com/.default",
  );
  const headers = {
    Authorization: `Bearer ${token.token}`,
    "Content-Type": "application/json",
  };
  const getResponse = await fetch(`${resourceUrl}?api-version=${apiVersion}`, { headers });
  if (!getResponse.ok) {
    throw new Error(`Could not read Container Apps Job: ${await getResponse.text()}`);
  }
  const resource = jobResourceSchema.parse(await getResponse.json());
  const template = {
    containers: resource.properties.template.containers.map((container) => ({
      ...container,
      env: [
        ...(container.env ?? []).filter((item) => item.name !== "RENDER_JOB_ID"),
        { name: "RENDER_JOB_ID", value: id },
      ],
    })),
  };
  const startResponse = await fetch(
    `${resourceUrl}/start?api-version=${apiVersion}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(template),
    },
  );
  if (!startResponse.ok) {
    throw new Error(`Could not start Container Apps Job: ${await startResponse.text()}`);
  }
}

export async function dispatchRenderJob(id: string): Promise<void> {
  const mode = process.env.RENDER_EXECUTION_MODE ?? "local";
  if (mode === "local") {
    await executeRenderJob(id);
    return;
  }
  if (mode === "container-apps-job") {
    if (process.env.APP_HOSTING_MODE !== "azure") {
      throw new Error(
        "Localhost-triggered cloud rendering is disabled because local files are not mounted in the Container Apps worker. Use local rendering.",
      );
    }
    const shouldDispatch = await prepareCloudDispatch(id);
    if (!shouldDispatch) return;
    try {
      await startContainerAppsJob(id);
    } catch (error) {
      await withClaimTransition(id, async () => {
        const current = await readRenderStatus(id);
        if (current?.status !== "queued") return;
        await writeRenderStatus({
          ...current,
          error: error instanceof Error ? error.message : "Cloud dispatch failed",
          dispatchLeaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
        });
      });
      throw error;
    }
    return;
  }

  async function prepareCloudDispatch(id: string): Promise<boolean> {
    return withClaimTransition(id, async () => {
      const current = await readRenderStatus(id);
      if (!current || current.status === "stale" || current.status === "complete") return false;
      const now = Date.now();
      if (
        current.status === "rendering" &&
        current.leaseExpiresAt &&
        Date.parse(current.leaseExpiresAt) > now
      ) {
        return false;
      }
      if (
        current.status === "queued" &&
        current.dispatchLeaseExpiresAt &&
        Date.parse(current.dispatchLeaseExpiresAt) > now
      ) {
        return false;
      }
      if (current.status === "rendering") {
        await fs.rm(claimLockPath(id), { force: true });
      }
      await writeRenderStatus({
        ...current,
        status: "queued",
        progress: 0,
        claimToken: undefined,
        leaseExpiresAt: undefined,
        dispatchLeaseExpiresAt: new Date(now + 2 * 60_000).toISOString(),
      });
      return true;
    });
  }
  throw new Error(`Unsupported render execution mode: ${mode}`);
}

export async function markRenderJobsStale(jobs: RenderJob[]): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      await withClaimTransition(job.id, async () => {
        const current = await readRenderStatus(job.id);
        if (!current) return;
        await writeRenderStatus({
          ...current,
          status: "stale",
          progress: 0,
          outputUrl: undefined,
          error: undefined,
          claimToken: undefined,
          leaseExpiresAt: undefined,
          dispatchLeaseExpiresAt: undefined,
        });
      });
      try {
        await fs.rm(path.join(renderDirectory(), validateJobId(job.id)), {
          recursive: true,
          force: true,
        });
      } catch {
        console.warn(`[Idea2Impact] Could not remove stale render output ${job.id}`);
      }
    }),
  );
}

export async function discardRenderJob(id: string): Promise<void> {
  await Promise.all([
    fs.rm(manifestPath(id), { force: true }),
    fs.rm(statusPath(id), { force: true }),
    fs.rm(claimLockPath(id), { force: true }),
    fs.rm(claimTransitionLockPath(id), { force: true }),
    fs.rm(path.join(renderDirectory(), validateJobId(id)), {
      recursive: true,
      force: true,
    }),
  ]);
}

export async function reconcileRenderJobs(project: Project): Promise<RenderJob[]> {
  return Promise.all(
    project.renderJobs.map(async (job) => {
      if (job.status === "stale") return job;
      let status = await readRenderStatus(job.id);
      const abandoned =
        process.env.APP_HOSTING_MODE === "azure" &&
        process.env.RENDER_EXECUTION_MODE === "container-apps-job" &&
        renderNeedsRedispatch(status, Date.now());
      if (abandoned) {
        await dispatchRenderJob(job.id).catch((error) => {
          console.warn(
            `[Idea2Impact] Could not redispatch abandoned render ${job.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
        status = await readRenderStatus(job.id);
      }
      return status?.revisionId === job.revisionId
        ? {
            ...status,
            claimToken: undefined,
            leaseExpiresAt: undefined,
            dispatchLeaseExpiresAt: undefined,
          }
        : job;
    }),
  );
}

export function renderNeedsRedispatch(
  status: RenderJob | undefined,
  now: number,
): boolean {
  return Boolean(
    (status?.status === "rendering" &&
      status.leaseExpiresAt &&
      Date.parse(status.leaseExpiresAt) <= now) ||
      (status?.status === "queued" &&
        (!status.dispatchLeaseExpiresAt ||
          Date.parse(status.dispatchLeaseExpiresAt) <= now)),
  );
}

export async function isRenderDownloadAvailable(id: string): Promise<boolean> {
  const status = await readRenderStatus(id);
  if (status?.status !== "complete") return false;
  try {
    await fs.access(path.join(renderDirectory(), validateJobId(id), "presentation.mp4"));
    return true;
  } catch {
    return false;
  }
}
