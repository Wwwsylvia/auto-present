import assert from "node:assert/strict";
import test from "node:test";
import {
  localLaunchConfigurationFingerprint,
  localLaunchFingerprintVariables,
  localLaunchMetadata,
} from "@/lib/local-launch";

test("local launch health metadata is explicit and credential-safe", () => {
  const previous = { ...process.env };
  try {
    process.env.IDEA2IMPACT_LOCAL_LAUNCH_MODE = "azure-backed";
    process.env.IDEA2IMPACT_LOCAL_SERVER_MODE = "development";
    process.env.IDEA2IMPACT_DATA_DIR = ".data";
    process.env.AZURE_SPEECH_KEY = "secret-value";
    const fingerprint = localLaunchConfigurationFingerprint();
    const metadata = localLaunchMetadata();
    assert.equal(metadata?.protocol, "idea2impact-local/v1");
    assert.equal(metadata?.configurationFingerprint, fingerprint);
    assert.equal(JSON.stringify(metadata).includes("secret-value"), false);
    assert.deepEqual(localLaunchFingerprintVariables, [
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
    ]);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
});

test("manual servers do not publish reusable launch metadata", () => {
  const previousMode = process.env.IDEA2IMPACT_LOCAL_LAUNCH_MODE;
  delete process.env.IDEA2IMPACT_LOCAL_LAUNCH_MODE;
  try {
    assert.equal(localLaunchMetadata(), null);
  } finally {
    if (previousMode !== undefined) {
      process.env.IDEA2IMPACT_LOCAL_LAUNCH_MODE = previousMode;
    }
  }
});
