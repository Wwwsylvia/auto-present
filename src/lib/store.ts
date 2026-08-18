import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDirectory } from "@/lib/config";
import { Project, projectSchema, type ProjectInput } from "@/lib/domain";
import { hydrateRenderJobs } from "@/lib/render-queue";

const projectsFile = path.join(dataDirectory(), "projects.json");

let writeQueue = Promise.resolve();
let warnedAboutIncompatibleProjects = false;

function partitionProjectRecords(records: unknown[]): {
  projects: Project[];
  incompatible: unknown[];
} {
  const projects: Project[] = [];
  const incompatible: unknown[] = [];
  for (const record of records) {
    const parsed = projectSchema.safeParse(record);
    if (parsed.success) projects.push(parsed.data);
    else incompatible.push(record);
  }
  return { projects, incompatible };
}

async function readProjectRecords(): Promise<{
  projects: Project[];
  incompatible: unknown[];
}> {
  try {
    const raw = await fs.readFile(projectsFile, "utf8");
    const records = JSON.parse(raw) as unknown;
    if (!Array.isArray(records)) throw new Error("Project storage must contain an array");
    return partitionProjectRecords(records);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { projects: [], incompatible: [] };
    }
    throw error;
  }
}

async function readProjects(): Promise<Project[]> {
  const { projects, incompatible } = await readProjectRecords();
  if (incompatible.length > 0 && !warnedAboutIncompatibleProjects) {
    warnedAboutIncompatibleProjects = true;
    console.warn(
      `Ignored ${incompatible.length} incompatible saved project(s). Regenerate them for deck-intelligence v2; their records remain preserved.`,
    );
  }
  return projects;
}

async function writeProjects(projects: Project[]): Promise<void> {
  await fs.mkdir(dataDirectory(), { recursive: true });
  const { incompatible } = await readProjectRecords();
  const temporaryFile = `${projectsFile}.${randomUUID()}.tmp`;
  await fs.writeFile(
    temporaryFile,
    JSON.stringify([...incompatible, ...projects], null, 2),
    "utf8",
  );
  await fs.rename(temporaryFile, projectsFile);
}

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function listProjects(): Promise<Project[]> {
  const projects = await Promise.all((await readProjects()).map(hydrateRenderJobs));
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | undefined> {
  const project = (await readProjects()).find((item) => item.id === id);
  return project ? hydrateRenderJobs(project) : undefined;
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    stage: "plan",
    input,
    repository: null,
    revisions: [],
    activeRevisionId: null,
    approvedPlanRevisionId: null,
    approvedDeckRevisionId: null,
    renderJobs: [],
    assets: [],
    lastError: null,
  };
  return serializeWrite(async () => {
    const projects = await readProjects();
    projects.push(project);
    await writeProjects(projects);
    return project;
  });
}

export async function updateProject(
  id: string,
  update: (project: Project) => Project | Promise<Project>,
  options: { beforeCommit?: (project: Project) => Promise<void> } = {},
): Promise<Project> {
  return serializeWrite(async () => {
    const projects = await readProjects();
    const index = projects.findIndex((project) => project.id === id);
    if (index < 0) {
      throw new Error("Project not found");
    }
    const next = projectSchema.parse({
      ...(await update(structuredClone(projects[index]))),
      updatedAt: new Date().toISOString(),
    });
    await options.beforeCommit?.(next);
    projects[index] = next;
    await writeProjects(projects);
    return next;
  });
}
