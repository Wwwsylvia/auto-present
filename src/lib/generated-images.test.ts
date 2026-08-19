import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  generatedImagePath,
  materializeSlideImages,
} from "@/lib/generated-images";
import type { Slide } from "@/lib/domain";

function imageSlide(): Omit<Slide, "id"> {
  return {
    title: "A visible transformation",
    purpose: "Human outcome",
    audienceTakeaway: "The audience sees the result in a recognizable setting.",
    layout: "solution",
    bullets: ["Concrete before and after"],
    visual: {
      type: "image",
      prompt: "A product team turning scattered notes into a clear presentation.",
      altText: "A team reviewing a polished presentation together.",
      caption: "From scattered context to shared clarity",
      fallback: {
        type: "comparison",
        leftLabel: "Before",
        rightLabel: "After",
        rows: [
          { label: "Context", left: "Scattered", right: "Focused" },
          { label: "Decision", left: "Slow", right: "Clear" },
        ],
      },
    },
    narration: "The outcome becomes tangible when the team can move from scattered context to one shared decision.",
    durationSeconds: 30,
    evidencePaths: [],
  };
}

test("persists generated images and attaches revision-safe asset IDs", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "idea2impact-images-"));
  const previous = process.env.IDEA2IMPACT_DATA_DIR;
  process.env.IDEA2IMPACT_DATA_DIR = directory;
  try {
    const source = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#1c4938" },
    }).png().toBuffer();
    const result = await materializeSlideImages("project", [imageSlide()], async () => source);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.assetIds.length, 1);
    assert.equal(result.slides[0].visual.type, "image");
    assert.ok(result.slides[0].visual.type === "image" && result.slides[0].visual.assetId);
    await fs.access(generatedImagePath("project", result.assetIds[0]));
  } finally {
    if (previous === undefined) delete process.env.IDEA2IMPACT_DATA_DIR;
    else process.env.IDEA2IMPACT_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("keeps a structured fallback and warning when image generation fails", async () => {
  const result = await materializeSlideImages("project", [imageSlide()], async () => {
    throw new Error("content policy");
  });
  assert.equal(result.slides[0].visual.type, "comparison");
  assert.match(result.warnings[0], /content policy.*structured fallback/i);
  assert.deepEqual(result.assetIds, []);
});
