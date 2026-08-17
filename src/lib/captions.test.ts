import assert from "node:assert/strict";
import test from "node:test";
import { cuesToSrt, sentenceCaptionCues } from "@/lib/captions";

test("creates sentence cues from actual Speech offsets", () => {
  const narration = "First sentence. Second sentence!";
  const cues = sentenceCaptionCues(
    narration,
    [
      {
        text: "First sentence.",
        textOffset: 0,
        audioOffsetSeconds: 0.2,
        durationSeconds: 1.1,
      },
      {
        text: "Second sentence!",
        textOffset: 16,
        audioOffsetSeconds: 1.5,
        durationSeconds: 1.2,
      },
    ],
    2.8,
  );

  assert.deepEqual(cues, [
    { text: "First sentence.", startSeconds: 0.2, endSeconds: 1.5 },
    { text: "Second sentence!", startSeconds: 1.5, endSeconds: 2.7 },
  ]);
  assert.match(cuesToSrt(cues), /00:00:00,200 --> 00:00:01,500/);
});

test("rejects synthesis without sentence timing", () => {
  assert.throws(
    () => sentenceCaptionCues("Narration.", [], 1),
    /no sentence boundaries/,
  );
});
