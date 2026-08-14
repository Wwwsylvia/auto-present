import path from "node:path";

export function dataDirectory(): string {
  return process.env.IDEA2IMPACT_DATA_DIR
    ? path.resolve(process.env.IDEA2IMPACT_DATA_DIR)
    : path.join(process.cwd(), ".data");
}

export function renderDirectory(): string {
  return path.join(dataDirectory(), "renders");
}

export function uploadDirectory(projectId: string): string {
  return path.join(dataDirectory(), "uploads", projectId);
}
