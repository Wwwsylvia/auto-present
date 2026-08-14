import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ZodError } from "zod";
import responses from "@/lib/fixtures/foundry-responses.json";
import {
  buildPresentationRequest,
  generatePresentation,
  generatePresentationWithCompletion,
  generateRevisionPatch,
  generateRevisionPatchWithCompletion,
  parsePresentationResponse,
  parseRevisionResponse,
  type FoundryChatRequest,
} from "@/lib/generate";
import { createGenerateTestProject } from "@/lib/generate.fixtures";

const malformedResponse = readFileSync(
  new URL("fixtures/malformed-foundry-response.txt", import.meta.url),
  "utf8",
);
const emptyResponse = readFileSync(
  new URL("fixtures/empty-foundry-response.txt", import.meta.url),
  "utf8",
);

test("generates a validated presentation from a Foundry response fixture", async () => {
  const project = createGenerateTestProject();
  let request: FoundryChatRequest | undefined;
  const revision = await generatePresentationWithCompletion(
    project,
    "fixture-deployment",
    async (value) => {
      request = value;
      return JSON.stringify(responses.validGeneration);
    },
  );

  assert.equal(request?.model, "fixture-deployment");
  assert.equal(revision.source, "foundry");
  assert.equal(revision.version, 2);
  assert.equal(revision.slides.length, 3);
  assert.ok(revision.id);
  assert.ok(revision.slides.every((slide) => slide.id));
});

test("rejects empty presentation and revision output", () => {
  const project = createGenerateTestProject();
  assert.throws(
    () => parsePresentationResponse(emptyResponse, project),
    /empty presentation/,
  );
  assert.throws(
    () => parseRevisionResponse(emptyResponse, project),
    /empty revision/,
  );
});

test("rejects malformed JSON", () => {
  assert.throws(
    () => parsePresentationResponse(malformedResponse, createGenerateTestProject()),
    SyntaxError,
  );
});

test("rejects schema-invalid presentation output", () => {
  assert.throws(
    () =>
      parsePresentationResponse(
        JSON.stringify(responses.schemaInvalidGeneration),
        createGenerateTestProject(),
      ),
    ZodError,
  );
});

test("returns a valid contextual revision patch", async () => {
  const project = createGenerateTestProject();
  let request: FoundryChatRequest | undefined;
  const patch = await generateRevisionPatchWithCompletion(
    project,
    "Make the opening stronger",
    "fixture-deployment",
    async (value) => {
      request = value;
      return JSON.stringify(responses.validPatch);
    },
  );

  assert.deepEqual(patch, responses.validPatch);
  const context = JSON.parse(request?.messages[1]?.content ?? "{}");
  assert.equal(context.instruction, "Make the opening stronger");
  assert.equal(context.slides[0].id, "slide-1");
});

test("rejects revision patches referencing unknown slide IDs", () => {
  assert.throws(
    () =>
      parseRevisionResponse(
        JSON.stringify(responses.unknownSlidePatch),
        createGenerateTestProject(),
      ),
    /unknown slide/,
  );
});

test("rejects empty, invalid, and out-of-range revision patches", async (t) => {
  const project = createGenerateTestProject();
  const invalidFixtures = [
    ["empty patch", responses.emptyPatch],
    ["invalid field", responses.invalidFieldPatch],
    ["out-of-range value", responses.outOfRangePatch],
  ] as const;

  for (const [name, fixture] of invalidFixtures) {
    await t.test(name, () => {
      assert.throws(
        () => parseRevisionResponse(JSON.stringify(fixture), project),
        ZodError,
      );
    });
  }
});

test("serializes repository evidence in user context, not system content", () => {
  const project = createGenerateTestProject();
  const request = buildPresentationRequest(project, "fixture-deployment");
  const systemContent = request.messages[0].content;
  const userContext = JSON.parse(request.messages[1].content);

  assert.equal(systemContent.includes("README.md"), false);
  assert.equal(systemContent.includes(project.repository!.evidence[0].excerpt), false);
  assert.deepEqual(userContext.repository, project.repository);
});

test(
  "verifies generation against a configured Azure Foundry deployment",
  {
    skip:
      process.env.RUN_FOUNDRY_VERIFY !== "1" ||
      !process.env.FOUNDRY_PROJECT_ENDPOINT ||
      !process.env.FOUNDRY_MODEL_DEPLOYMENT,
  },
  async () => {
    const project = createGenerateTestProject();
    const revision = await generatePresentation(project);
    assert.equal(revision.source, "foundry");
    assert.ok(revision.slides.length >= 3);

    const generatedProject = {
      ...project,
      revisions: [...project.revisions, revision],
      activeRevisionId: revision.id,
    };
    const patch = await generateRevisionPatch(
      generatedProject,
      "Make the opening slide title more concise.",
    );
    assert.ok(patch.slideChanges.length > 0);
    const slideIds = new Set(revision.slides.map((slide) => slide.id));
    assert.ok(patch.slideChanges.every((change) => slideIds.has(change.slideId)));
  },
);
