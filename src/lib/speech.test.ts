import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sentenceCues, synthesizeSpeech } from "@/lib/speech";

test("uses Speech sentence boundaries and clamps them to audio duration", () => {
  const cues = sentenceCues("First. Second.", 4, [
    { text: "First.", startSeconds: 0, durationSeconds: 1.5 },
    { text: "Second.", startSeconds: 2, durationSeconds: 4 },
  ]);
  assert.deepEqual(cues, [
    { text: "First.", startSeconds: 0, endSeconds: 2 },
    { text: "Second.", startSeconds: 2, endSeconds: 4 },
  ]);
});

test("falls back to monotonic sentence-level estimated cues", () => {
  const cues = sentenceCues("First sentence. Second sentence!", 6, []);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startSeconds, 0);
  assert.equal(cues[1].endSeconds, 6);
  assert.ok(cues[0].endSeconds <= cues[1].startSeconds);
});

test("uses the regional synthesis endpoint even when a custom resource endpoint is configured", async () => {
  const previousFetch = globalThis.fetch;
  const previousRegion = process.env.AZURE_SPEECH_REGION;
  const previousKey = process.env.AZURE_SPEECH_KEY;
  const previousEndpoint = process.env.AZURE_SPEECH_ENDPOINT;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "idea2impact-speech-"));
  let requestedUrl = "";
  process.env.AZURE_SPEECH_REGION = "eastus";
  process.env.AZURE_SPEECH_KEY = "test-key";
  process.env.AZURE_SPEECH_ENDPOINT = "https://speech-resource.cognitiveservices.azure.com/";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(new Uint8Array([1]), { status: 200 });
  };
  try {
    await synthesizeSpeech("Hello.", path.join(directory, "speech.wav"));
    assert.equal(
      requestedUrl,
      "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1",
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousRegion === undefined) delete process.env.AZURE_SPEECH_REGION;
    else process.env.AZURE_SPEECH_REGION = previousRegion;
    if (previousKey === undefined) delete process.env.AZURE_SPEECH_KEY;
    else process.env.AZURE_SPEECH_KEY = previousKey;
    if (previousEndpoint === undefined) delete process.env.AZURE_SPEECH_ENDPOINT;
    else process.env.AZURE_SPEECH_ENDPOINT = previousEndpoint;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
