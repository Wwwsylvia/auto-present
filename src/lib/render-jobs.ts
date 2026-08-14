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
import { dataDirectory } from "@/lib/data-paths";
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

export async function executeRenderJob(id: string): Promise<RenderJob> {
  const manifest = renderManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath(id), "utf8")),
  );
  const baseJob = createQueuedRenderJob(manifest.project, manifest.kind);
  const job: RenderJob = {
    ...baseJob,
    id: manifest.id,
    revisionId: activeRevision(manifest.project)!.id,
    status: "rendering",
    progress: 5,
    outputUrl: `/api/renders/${manifest.id}`,
  };
  await writeRenderStatus(job);
  try {
    const result = await renderPresentation(manifest.project, manifest.kind, {
      jobId: manifest.id,
      onProgress: async (progress) => {
        job.progress = progress;
        await writeRenderStatus(job);
      },
    });
    await writeRenderStatus(result.job);
    return result.job;
  } catch (error) {
    const failed: RenderJob = {
      ...job,
      status: "failed",
      progress: job.progress,
      error: error instanceof Error ? error.message : "Rendering failed",
    };
    await writeRenderStatus(failed);
    throw error;
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
    await startContainerAppsJob(id);
    return;
  }
  throw new Error(`Unsupported render execution mode: ${mode}`);
}

export async function reconcileRenderJobs(project: Project): Promise<RenderJob[]> {
  return Promise.all(
    project.renderJobs.map(async (job) => {
      if (job.status === "stale") return job;
      const status = await readRenderStatus(job.id);
      return status?.revisionId === job.revisionId ? status : job;
    }),
  );
}
