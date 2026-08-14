import assert from "node:assert/strict";
import test from "node:test";
import { PublicError } from "@/lib/http";
import { validateDemoProbe } from "@/lib/media";

test("accepts bounded supported demo media", () => {
  assert.doesNotThrow(() =>
    validateDemoProbe({
      durationSeconds: 120,
      formatNames: ["mov", "mp4"],
      width: 1920,
      height: 1080,
    }),
  );
});

test("rejects unsupported, oversized, or overlong demo media", () => {
  for (const probe of [
    { durationSeconds: 181, formatNames: ["mp4"], width: 1920, height: 1080 },
    { durationSeconds: 10, formatNames: ["avi"], width: 1920, height: 1080 },
    { durationSeconds: 10, formatNames: ["mp4"], width: 4096, height: 2160 },
  ]) {
    assert.throws(
      () => validateDemoProbe(probe),
      (error) => error instanceof PublicError,
    );
  }
});
