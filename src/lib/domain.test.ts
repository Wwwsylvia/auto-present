import assert from "node:assert/strict";
import test from "node:test";
import { parseGitHubUrl } from "@/lib/github";
import {
  projectInputSchema,
  targetSlideCountFromSeconds,
} from "@/lib/domain";

test("accepts the supported duration range", () => {
  assert.equal(
    projectInputSchema.parse({
      idea: "A sufficiently detailed product idea for a presentation.",
      audience: "Judges",
      tone: "confident",
      durationMinutes: 2,
      githubUrl: "",
    }).durationMinutes,
    2,
  );
  assert.throws(() =>
    projectInputSchema.parse({
      idea: "A sufficiently detailed product idea for a presentation.",
      audience: "Judges",
      tone: "confident",
      durationMinutes: 11,
      githubUrl: "",
    }),
  );
});

test("derives adaptive slide counts from presentation duration", () => {
  assert.deepEqual(
    [1, 2, 3, 5, 10].map((minutes) => targetSlideCountFromSeconds(minutes * 60)),
    [3, 4, 6, 10, 20],
  );
});

test("only accepts canonical public GitHub repository URLs", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/microsoft/typescript"), {
    owner: "microsoft",
    repo: "typescript",
  });
  assert.throws(() => parseGitHubUrl("https://gitlab.com/example/project"));
});
