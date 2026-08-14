import { executeRenderJob } from "@/lib/render-jobs";

async function main(): Promise<void> {
  const jobId = process.env.RENDER_JOB_ID ?? process.argv[2];
  if (!jobId) {
    throw new Error("Set RENDER_JOB_ID or pass a render job ID");
  }

  await executeRenderJob(jobId);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
