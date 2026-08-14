import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { actualDurationSeconds, type Project } from "@/lib/domain";

const requiredStoryPatterns = {
  problem: /\b(problem|friction|pain|challenge)\b/i,
  useCases: /\b(use case|team|builder|judge|user|audience)\b/i,
  solution: /\b(solution|workflow|create|produce|generate)\b/i,
  foundry: /\b(Microsoft Foundry|Foundry)\b/i,
};

export type AcceptanceCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export function evaluatePresentation(project: Project): AcceptanceCheck[] {
  const revision = project.revisions.find(
    (item) => item.id === project.activeRevisionId,
  );
  if (!revision) {
    return [{ name: "active revision", passed: false, detail: "No active revision" }];
  }
  const searchable = [
    revision.title,
    revision.tagline,
    revision.summary,
    ...revision.slides.flatMap((slide) => [
      slide.title,
      slide.purpose,
      ...slide.bullets,
      slide.narration,
    ]),
  ].join("\n");
  const duration = actualDurationSeconds(revision);
  return [
    ...Object.entries(requiredStoryPatterns).map(([name, pattern]) => ({
      name: `story:${name}`,
      passed: pattern.test(searchable),
      detail: pattern.test(searchable) ? "Covered" : "Missing required story coverage",
    })),
    {
      name: "architecture slide",
      passed: revision.slides.some((slide) => slide.layout === "architecture"),
      detail: "At least one slide must use the architecture layout",
    },
    {
      name: "two-minute duration",
      passed: Math.abs(duration - 120) <= 12,
      detail: `${duration} seconds (target 120 ± 12)`,
    },
    {
      name: "narration",
      passed: revision.slides.every((slide) => slide.narration.trim().length > 0),
      detail: "Every slide must include narration",
    },
  ];
}

export function probeRenderedVideo(file: string): Promise<{
  durationSeconds: number;
  hasVideo: boolean;
  hasAudio: boolean;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type",
        "-of",
        "json",
        file,
      ],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${stderr}`));
        return;
      }
      const parsed = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: Array<{ codec_type?: string }>;
      };
      resolve({
        durationSeconds: Number(parsed.format?.duration ?? 0),
        hasVideo: parsed.streams?.some((stream) => stream.codec_type === "video") ?? false,
        hasAudio: parsed.streams?.some((stream) => stream.codec_type === "audio") ?? false,
      });
    });
  });
}

export async function validateCaptions(
  file: string,
  mediaDuration: number,
): Promise<AcceptanceCheck> {
  const contents = await fs.readFile(file, "utf8");
  const timestamps = [...contents.matchAll(
    /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/g,
  )].map((match) => {
    const toSeconds = (offset: number) =>
      Number(match[offset]) * 3600 +
      Number(match[offset + 1]) * 60 +
      Number(match[offset + 2]) +
      Number(match[offset + 3]) / 1000;
    return { start: toSeconds(1), end: toSeconds(5) };
  });
  const monotonic = timestamps.every(
    (cue, index) =>
      cue.start >= 0 &&
      cue.end > cue.start &&
      cue.end <= mediaDuration + 0.25 &&
      (index === 0 || cue.start >= timestamps[index - 1].end - 0.01),
  );
  return {
    name: "caption timing",
    passed: timestamps.length > 0 && monotonic,
    detail: `${timestamps.length} cues checked against ${mediaDuration.toFixed(2)} seconds`,
  };
}

export async function writeAcceptanceReport(
  outputDirectory: string,
  checks: AcceptanceCheck[],
): Promise<string> {
  await fs.mkdir(outputDirectory, { recursive: true });
  const reportPath = path.join(outputDirectory, "acceptance-report.json");
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        passed: checks.every((check) => check.passed),
        checks,
      },
      null,
      2,
    ),
    "utf8",
  );
  return reportPath;
}
