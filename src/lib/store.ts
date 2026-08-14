import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Project, projectSchema, type ProjectInput } from "@/lib/domain";

const dataDirectory = process.env.IDEA2IMPACT_DATA_DIR
  ? path.resolve(process.env.IDEA2IMPACT_DATA_DIR)
  : path.join(process.cwd(), ".data");
const projectsFile = path.join(dataDirectory, "projects.json");

let writeQueue = Promise.resolve();

async function readProjects(): Promise<Project[]> {
  try {
    const raw = await fs.readFile(projectsFile, "utf8");
    return projectSchema.array().parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeProjects(projects: Project[]): Promise<void> {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${projectsFile}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(projects, null, 2), "utf8");
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
  return (await readProjects()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await readProjects()).find((project) => project.id === id);
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
  update: (project: Project) => Project,
): Promise<Project> {
  return serializeWrite(async () => {
    const projects = await readProjects();
    const index = projects.findIndex((project) => project.id === id);
    if (index < 0) {
      throw new Error("Project not found");
    }
    const next = projectSchema.parse({
      ...update(structuredClone(projects[index])),
      updatedAt: new Date().toISOString(),
    });
    projects[index] = next;
    await writeProjects(projects);
    return next;
  });
}
