import path from "node:path";

export function dataDirectory(): string {
  return process.env.IDEA2IMPACT_DATA_DIR
    ? path.resolve(process.env.IDEA2IMPACT_DATA_DIR)
    : path.join(process.cwd(), ".data");
}

export function foundryConfigured(): boolean {
  return Boolean(
    process.env.FOUNDRY_PROJECT_ENDPOINT && process.env.FOUNDRY_MODEL_DEPLOYMENT,
  );
}

export function speechConfigured(): boolean {
  return Boolean(
    process.env.AZURE_SPEECH_REGION &&
      (process.env.AZURE_SPEECH_ENDPOINT || process.env.AZURE_SPEECH_KEY) &&
      (process.env.AZURE_SPEECH_KEY ||
        (process.env.AZURE_SPEECH_USE_AZURE_CREDENTIAL !== "false" &&
          process.env.AZURE_SPEECH_RESOURCE_ID)),
  );
}
