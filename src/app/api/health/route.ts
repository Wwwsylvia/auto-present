import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    services: {
      foundry: Boolean(
        process.env.FOUNDRY_PROJECT_ENDPOINT && process.env.FOUNDRY_MODEL_DEPLOYMENT,
      ),
      renderMode: process.env.RENDER_EXECUTION_MODE ?? "local",
      speech: Boolean(
        process.env.AZURE_SPEECH_REGION &&
          (process.env.AZURE_SPEECH_KEY ||
            process.env.AZURE_SPEECH_USE_MANAGED_IDENTITY === "true"),
      ),
    },
  });
}
