import assert from "node:assert/strict";
import test from "node:test";
import { sentenceCues } from "@/lib/speech";

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
