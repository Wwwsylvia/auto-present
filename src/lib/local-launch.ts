import { createHash } from "node:crypto";
import path from "node:path";

export const localLaunchFingerprintVariables = [
  "APP_HOSTING_MODE",
  "RENDER_EXECUTION_MODE",
  "FOUNDRY_PROJECT_ENDPOINT",
  "FOUNDRY_MODEL_DEPLOYMENT",
  "AZURE_SPEECH_ENDPOINT",
  "AZURE_SPEECH_REGION",
  "AZURE_SPEECH_KEY",
  "AZURE_SPEECH_USE_MANAGED_IDENTITY",
  "AZURE_SPEECH_VOICE",
  "AZURE_CONFIG_DIR",
  "AZURE_AUTHORITY_HOST",
  "AZURE_TOKEN_CREDENTIALS",
  "GITHUB_TOKEN",
] as const;

export function localLaunchConfigurationFingerprint(): string {
  const input = localLaunchFingerprintVariables
    .map((name) => `${name}=${process.env[name] ?? ""}`)
    .join("\n");
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function localLaunchMetadata() {
  const mode = process.env.IDEA2IMPACT_LOCAL_LAUNCH_MODE;
  const serverMode = process.env.IDEA2IMPACT_LOCAL_SERVER_MODE;
  if (
    (mode !== "demo" && mode !== "azure-backed") ||
    (serverMode !== "development" && serverMode !== "production")
  ) {
    return null;
  }
  return {
    protocol: "idea2impact-local/v1" as const,
    mode,
    serverMode,
    dataDirectory: path.resolve(
      /* turbopackIgnore: true */ process.env.IDEA2IMPACT_DATA_DIR ?? ".data",
    ),
    configurationFingerprint: localLaunchConfigurationFingerprint(),
  };
}
