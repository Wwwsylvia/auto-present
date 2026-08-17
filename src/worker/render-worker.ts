import {
  claimNextRenderJob,
  completeRenderJob,
  failRenderJob,
  heartbeatRenderJob,
  RenderClaimLostError,
  releaseRenderLock,
} from "@/lib/render-queue";
import { renderPresentation } from "@/lib/render";
import { PublicError, redactSensitive } from "@/lib/http";

const pollMilliseconds = 1_000;
let stopping = false;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function processNext(): Promise<boolean> {
  const record = await claimNextRenderJob();
  if (!record) return false;
  const claimToken = record.claimToken;
  if (!claimToken) throw new Error("Claimed render job is missing its claim token");
  try {
    await renderPresentation(
      record.project,
      record.job.kind,
      record.job.id,
      (progress) => heartbeatRenderJob(record.job.id, claimToken, progress),
    );
    await completeRenderJob(record.job.id, claimToken);
  } catch (error) {
    if (error instanceof RenderClaimLostError) {
      console.log(`[Idea2Impact worker] Render ${record.job.id} was invalidated`);
      return true;
    }
    const detail =
      error instanceof Error ? redactSensitive(error.message) : "Rendering failed";
    console.error(`[Idea2Impact worker] ${detail}`);
    const message =
      error instanceof PublicError
        ? error.publicMessage
        : "Render attempt failed. Verify FFmpeg and local service configuration.";
    await failRenderJob(
      record.job.id,
      claimToken,
      message.length <= 300 ? message : "Rendering failed. Check local worker logs.",
    ).catch((failure) => {
      if (!(failure instanceof RenderClaimLostError)) throw failure;
    });
  } finally {
    await releaseRenderLock(record.job.id, claimToken);
  }
  return true;
}

async function main(): Promise<void> {
  console.log("[Idea2Impact worker] Ready for local render jobs");
  while (!stopping) {
    try {
      if (!(await processNext())) await delay(pollMilliseconds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Idea2Impact worker] ${redactSensitive(message)}`);
      await delay(pollMilliseconds);
    }
  }
}

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

void main();
