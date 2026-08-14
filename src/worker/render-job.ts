import { executeRenderJob } from "@/lib/render-jobs";

const jobId = process.env.RENDER_JOB_ID ?? process.argv[2];
if (!jobId) {
  throw new Error("Set RENDER_JOB_ID or pass a render job ID");
}

await executeRenderJob(jobId);
