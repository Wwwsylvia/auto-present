import { promises as fs } from "node:fs";

export async function runBestEffort(
  warning: string,
  operation: () => Promise<unknown>,
  warn: (message: string) => void = console.warn,
): Promise<void> {
  try {
    await operation();
  } catch {
    warn(`[Idea2Impact] ${warning}`);
  }
}

export async function removeFilesBestEffort(
  files: string[],
  removeFile: (file: string) => Promise<unknown> = (file) =>
    fs.rm(file, { force: true }),
): Promise<void> {
  const results = await Promise.allSettled(files.map(removeFile));
  const failures = results.filter((result) => result.status === "rejected").length;
  if (failures > 0) {
    console.warn(`[Idea2Impact] Could not remove ${failures} replaced local upload(s)`);
  }
}
