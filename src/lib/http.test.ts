import assert from "node:assert/strict";
import test from "node:test";
import { redactSensitive, rejectNonLocalRequest } from "@/lib/http";

test("accepts loopback same-origin mutations", () => {
  const request = new Request("http://127.0.0.1:3000/api/projects", {
    method: "POST",
    headers: {
      Host: "127.0.0.1:3000",
      Origin: "http://127.0.0.1:3000",
    },
  });
  assert.equal(rejectNonLocalRequest(request), undefined);
});

test("accepts a loopback Host when the framework reconstructs a different internal URL", () => {
  const request = new Request("http://localhost:3001/api/projects", {
    method: "POST",
    headers: {
      Host: "127.0.0.1:3000",
      Origin: "http://127.0.0.1:3000",
    },
  });
  assert.equal(rejectNonLocalRequest(request), undefined);
});

test("rejects non-loopback, forged Host, and cross-origin requests", () => {
  assert.equal(
    rejectNonLocalRequest(
      new Request("http://192.168.1.10:3000/api/projects", {
        headers: { Host: "192.168.1.10:3000" },
      }),
    )?.status,
    403,
  );
  assert.equal(
    rejectNonLocalRequest(
      new Request("http://127.0.0.1:3000/api/projects", {
        headers: { Host: "attacker.example:3000" },
      }),
    )?.status,
    403,
  );
  assert.equal(
    rejectNonLocalRequest(
      new Request("http://127.0.0.1:3000/api/projects", {
        headers: {
          Host: "127.0.0.1:3000",
          Origin: "https://example.com",
        },
      }),
    )?.status,
    403,
  );
  assert.equal(
    rejectNonLocalRequest(
      new Request("http://localhost:3001/api/projects", {
        headers: {
          Host: "127.0.0.1:3000",
          Origin: "http://localhost:3000",
        },
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
