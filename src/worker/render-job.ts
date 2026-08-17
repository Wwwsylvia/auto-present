import { executeNextRenderJob, executeRenderJob } from "@/lib/render-jobs";

async function main(): Promise<void> {
  const jobId = process.env.RENDER_JOB_ID ?? process.argv[2];
  if (jobId) await executeRenderJob(jobId);
  else await executeNextRenderJob();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
