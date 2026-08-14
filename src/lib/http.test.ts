import assert from "node:assert/strict";
import test from "node:test";
import { redactSensitive, rejectNonLocalMutation } from "@/lib/http";

test("accepts loopback same-origin mutations", () => {
  const request = new Request("http://127.0.0.1:3000/api/projects", {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:3000" },
  });
  assert.equal(rejectNonLocalMutation(request), undefined);
});

test("rejects non-loopback and cross-origin mutations", () => {
  assert.equal(
    rejectNonLocalMutation(new Request("http://192.168.1.10:3000/api/projects"))?.status,
    403,
  );
  assert.equal(
    rejectNonLocalMutation(
      new Request("http://127.0.0.1:3000/api/projects", {
        headers: { Origin: "https://example.com" },
      }),
    )?.status,
    403,
  );
});

test("redacts configured secrets and local paths", () => {
  const previous = process.env.AZURE_SPEECH_KEY;
  process.env.AZURE_SPEECH_KEY = "secret-value";
  try {
    const redacted = redactSensitive(
      "token=abc secret-value C:\\Users\\person\\private.txt",
    );
    assert.doesNotMatch(redacted, /secret-value|private\.txt|token=abc/);
  } finally {
    process.env.AZURE_SPEECH_KEY = previous;
  }
});
