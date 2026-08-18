import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  evaluatePresentation,
  probeRenderedVideo,
  validateCaptions,
  writeAcceptanceReport,
} from "../src/lib/acceptance";
import { dataDirectory, foundryConfigured, speechConfigured } from "../src/lib/config";
import type { Project } from "../src/lib/domain";
import {
  generatePresentation,
  generateRevisionPatch,
} from "../src/lib/generate";
import {
  claimNextRenderJob,
  completeRenderJob,
  createRenderJob,
  enqueueRender,
  failRenderJob,
  getRenderJob,
  heartbeatRenderJob,
  retryRenderJob,
  updateRenderJob,
} from "../src/lib/render-queue";
import { renderPresentation } from "../src/lib/render";

if (!foundryConfigured() || !speechConfigured()) {
  console.error(
    "Set FOUNDRY_PROJECT_ENDPOINT, FOUNDRY_MODEL_DEPLOYMENT, and AZURE_SPEECH_REGION before running real-service acceptance.",
  );
  process.exit(2);
}
const acceptanceRoot = path.join(
  dataDirectory(),
  "acceptance",
  new Date().toISOString().replaceAll(":", "-"),
);
process.env.IDEA2IMPACT_DATA_DIR = acceptanceRoot;

function createDemoFixture(output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1280x720:rate=30",
        "-t",
        "3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        output,
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Could not create demo fixture")),
    );
  });
}

const now = new Date().toISOString();
let project: Project = {
  id: randomUUID(),
  createdAt: now,
  updatedAt: now,
  stage: "plan",
  input: {
    idea:
      "Create Idea2Impact's own two-minute hackathon pitch. Cover the presentation-production problem, concrete hackathon-team use cases, the Plan-Create-Produce solution, a technical architecture slide, a demo-layout slide for optional footage, and explicitly emphasize how Microsoft Foundry performs typed generation and contextual revisions. Include narration for every slide and a strong closing.",
    audience: "Microsoft hackathon judges",
    tone: "confident",
    durationMinutes: 2,
    githubUrl: "",
  },
  repository: null,
  revisions: [],
  activeRevisionId: null,
  approvedPlanRevisionId: null,
  approvedDeckRevisionId: null,
  renderJobs: [],
  assets: [],
  lastError: null,
};

console.log("Calling Microsoft Foundry for initial generation...");
const initial = await generatePresentation(project);
project = {
  ...project,
  revisions: [initial],
  activeRevisionId: initial.id,
  approvedPlanRevisionId: initial.id,
  stage: "create",
};

console.log("Calling Microsoft Foundry for contextual revision...");
const patch = await generateRevisionPatch(
  project,
  "Strengthen the explicit Microsoft Foundry emphasis and architecture explanation while preserving the exact two-minute total duration.",
);
const changes = new Map(
  patch.slideChanges.map((change) => [change.slideId, change.changes]),
);
const revised = {
  ...initial,
  id: randomUUID(),
  version: initial.version + 1,
  createdAt: new Date().toISOString(),
  source: "foundry" as const,
  slides: initial.slides.map((slide) => ({ ...slide, ...changes.get(slide.id) })),
};
project = {
  ...project,
  revisions: [...project.revisions, revised],
  activeRevisionId: revised.id,
  approvedDeckRevisionId: revised.id,
  stage: "produce",
};
const demoPath = path.join(acceptanceRoot, "demo-fixture.mp4");
await fs.mkdir(acceptanceRoot, { recursive: true });
await createDemoFixture(demoPath);
project = {
  ...project,
  assets: [
    {
      id: randomUUID(),
      kind: "demo-video",
      name: "generated-local-demo.mp4",
      mimeType: "video/mp4",
      size: (await fs.stat(demoPath)).size,
      localPath: demoPath,
    },
  ],
};

const recoveryRecord = createRenderJob(project, "preview");
await enqueueRender(recoveryRecord);
let recoveryVerified = true;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const claimedRecovery = await claimNextRenderJob(
    new Date(Date.now() + attempt * 60_000),
  );
  recoveryVerified &&=
    claimedRecovery?.job.id === recoveryRecord.job.id &&
    claimedRecovery.job.attempts === attempt;
  if (!claimedRecovery?.claimToken) throw new Error("Recovery claim token missing");
  await failRenderJob(
    recoveryRecord.job.id,
    claimedRecovery.claimToken,
    "Injected acceptance failure",
  );
}
recoveryVerified &&=
  (await getRenderJob(recoveryRecord.job.id))?.status === "failed";
recoveryVerified &&=
  (await retryRenderJob(recoveryRecord.job.id)).status === "queued";
await updateRenderJob(recoveryRecord.job.id, (job) => ({
  ...job,
  status: "stale",
}));

const record = createRenderJob(project, "final");
await enqueueRender(record);
project = { ...project, renderJobs: [record.job] };
const claimed = await claimNextRenderJob();
if (!claimed || claimed.job.id !== record.job.id) {
  throw new Error("The durable worker queue did not claim the acceptance render");
}
if (!claimed.claimToken) throw new Error("Acceptance render claim token missing");

console.log("Rendering narrated final MP4 with Azure Speech...");
let renderResult: Awaited<ReturnType<typeof renderPresentation>>;
try {
  renderResult = await renderPresentation(project, "final", record.job.id, (progress) =>
    heartbeatRenderJob(record.job.id, claimed.claimToken ?? "", progress),
  );
  await completeRenderJob(record.job.id, claimed.claimToken);
} catch (error) {
  await failRenderJob(
    record.job.id,
    claimed.claimToken,
    error instanceof Error ? error.message : "Acceptance render failed",
  );
  throw error;
}

const renderDirectory = path.join(dataDirectory(), "renders", record.job.id);
const video = await probeRenderedVideo(path.join(renderDirectory, "presentation.mp4"));
const checks = [
  ...evaluatePresentation(project),
  {
    name: "real Foundry generation",
    passed: initial.source === "foundry",
    detail: `Initial revision source: ${initial.source}`,
  },
  {
    name: "contextual revision",
    passed: patch.slideChanges.length > 0 && revised.version === 2,
    detail: patch.summary,
  },
  {
    name: "durable render queue",
    passed: true,
    detail: `Claimed and completed job ${record.job.id}`,
  },
  {
    name: "optional demo footage",
    passed:
      revised.slides.some((slide) => slide.layout === "demo") &&
      renderResult.usedDemoAsset,
    detail: renderResult.usedDemoAsset
      ? "Generated local demo fixture was incorporated"
      : "No demo footage was incorporated",
  },
  {
    name: "service failure recovery",
    passed: recoveryVerified,
    detail:
      "Injected three failed attempts, observed terminal failure, and manually requeued the durable job",
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
await fs.writeFile(
  path.join(renderDirectory, "acceptance-project.json"),
  JSON.stringify(project, null, 2),
  "utf8",
);
const report = await writeAcceptanceReport(renderDirectory, checks);
console.log(`${checks.every((check) => check.passed) ? "PASS" : "FAIL"} ${report}`);
if (checks.some((check) => !check.passed)) process.exit(1);
