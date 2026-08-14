import { promises as fs } from "node:fs";
import path from "node:path";
import {
  evaluatePresentation,
  probeRenderedVideo,
  validateCaptions,
  writeAcceptanceReport,
} from "../src/lib/acceptance";
import { dataDirectory, foundryConfigured, speechConfigured } from "../src/lib/config";
import type { Project } from "../src/lib/domain";

const projectFile = process.argv[2];
const renderId = process.argv[3];
if (!projectFile || !renderId) {
  console.error(
    "Usage: npm run acceptance -- <project-json-path> <completed-render-id>",
  );
  process.exit(2);
}
if (!foundryConfigured() || !speechConfigured()) {
  console.error(
    "Real-service acceptance requires Foundry endpoint/deployment and Azure Speech region/authentication.",
  );
  process.exit(2);
}

const input = JSON.parse(await fs.readFile(path.resolve(projectFile), "utf8")) as
  | Project
  | Project[];
const project = Array.isArray(input)
  ? input.find((candidate) =>
      candidate.renderJobs.some((job) => job.id === renderId),
    )
  : input;
if (!project) {
  console.error("The project file does not contain the requested render job.");
  process.exit(2);
}
const renderDirectory = path.join(dataDirectory(), "renders", renderId);
const video = await probeRenderedVideo(path.join(renderDirectory, "presentation.mp4"));
const checks = [
  ...evaluatePresentation(project),
  {
    name: "real Foundry source",
    passed: project.revisions.some((revision) => revision.source === "foundry"),
    detail: "At least one persisted revision must come from Microsoft Foundry",
  },
  {
    name: "playable MP4 streams",
    passed: video.hasVideo && video.hasAudio,
    detail: `video=${video.hasVideo}, audio=${video.hasAudio}`,
  },
  {
    name: "rendered duration",
    passed: Math.abs(video.durationSeconds - 120) <= 12,
    detail: `${video.durationSeconds.toFixed(2)} seconds`,
  },
  await validateCaptions(
    path.join(renderDirectory, "captions.srt"),
    video.durationSeconds,
  ),
];
const report = await writeAcceptanceReport(renderDirectory, checks);
console.log(`${checks.every((check) => check.passed) ? "PASS" : "FAIL"} ${report}`);
if (checks.some((check) => !check.passed)) process.exit(1);
