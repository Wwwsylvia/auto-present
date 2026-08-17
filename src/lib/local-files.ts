import { promises as fs } from "node:fs";

export async function removeFilesBestEffort(files: string[]): Promise<void> {
  const results = await Promise.allSettled(files.map((file) => fs.rm(file, { force: true })));
  const failures = results.filter((result) => result.status === "rejected").length;
  if (failures > 0) {
    console.warn(`[Idea2Impact] Could not remove ${failures} replaced local upload(s)`);
  }
}

export async function runBestEffort(
  warning: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch {
    console.warn(`[Idea2Impact] ${warning}`);
  }
}
