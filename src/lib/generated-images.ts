import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getBearerTokenProvider } from "@azure/identity";
import { DefaultAzureCredential } from "@azure/identity";
import OpenAI from "openai";
import sharp from "sharp";
import { dataDirectory, foundryImageConfigured } from "@/lib/config";
import type { Slide } from "@/lib/domain";

export type ImageGenerator = (prompt: string) => Promise<Buffer>;

function imageDirectory(projectId: string): string {
  return path.join(dataDirectory(), "generated-images", projectId);
}

export function generatedImagePath(projectId: string, assetId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
    throw new Error("Generated image asset ID is invalid");
  }
  return path.join(imageDirectory(projectId), `${assetId}.png`);
}

function foundryImageClient(): OpenAI {
  const endpoint = process.env.FOUNDRY_IMAGE_ENDPOINT;
  if (!endpoint) throw new Error("FOUNDRY_IMAGE_ENDPOINT is not configured");
  const tokenProvider = getBearerTokenProvider(
    new DefaultAzureCredential(),
    "https://ai.azure.com/.default",
  );
  return new OpenAI({
    baseURL: `${endpoint.replace(/\/+$/, "")}/openai/v1/`,
    apiKey: tokenProvider,
  });
}

export async function generateFoundryImage(prompt: string): Promise<Buffer> {
  const deployment = process.env.FOUNDRY_IMAGE_MODEL_DEPLOYMENT;
  if (!deployment) throw new Error("FOUNDRY_IMAGE_MODEL_DEPLOYMENT is not configured");
  const response = await foundryImageClient().images.generate({
    model: deployment,
    prompt: [
      prompt,
      "Create a polished editorial presentation visual in a wide 16:9 composition.",
      "Do not include words, labels, logos, watermarks, UI chrome, or readable text.",
      "Keep the subject clear when cropped and leave breathing room for slide typography.",
    ].join(" "),
    n: 1,
    size: "1280x720",
    quality: "medium",
    output_format: "png",
  });
  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) throw new Error("Foundry image generation returned no image data");
  return Buffer.from(encoded, "base64");
}

export async function materializeSlideImages(
  projectId: string,
  slides: readonly Omit<Slide, "id">[],
  generator: ImageGenerator = generateFoundryImage,
): Promise<{
  slides: Omit<Slide, "id">[];
  warnings: string[];
  assetIds: string[];
}> {
  const warnings: string[] = [];
  const assetIds: string[] = [];
  const configured = foundryImageConfigured();
  const directory = imageDirectory(projectId);
  const nextSlides: Omit<Slide, "id">[] = [];

  for (const slide of slides) {
    if (slide.visual.type !== "image") {
      nextSlides.push(slide);
      continue;
    }
    if (slide.visual.assetId) {
      nextSlides.push(slide);
      continue;
    }
    if (!configured && generator === generateFoundryImage) {
      warnings.push(`"${slide.title}": image generation is not configured; using the structured fallback.`);
      nextSlides.push({ ...slide, visual: slide.visual.fallback });
      continue;
    }

    const assetId = randomUUID();
    const output = generatedImagePath(projectId, assetId);
    const temporary = path.join(directory, `${assetId}.tmp`);
    try {
      const generated = await generator(slide.visual.prompt);
      await fs.mkdir(directory, { recursive: true });
      await sharp(generated)
        .resize(1280, 720, { fit: "cover", position: "attention" })
        .png()
        .toFile(temporary);
      await fs.rename(temporary, output);
      assetIds.push(assetId);
      nextSlides.push({
        ...slide,
        visual: { ...slide.visual, assetId },
      });
    } catch (error) {
      await fs.rm(temporary, { force: true });
      await fs.rm(output, { force: true });
      const rawDetail = error instanceof Error ? error.message : String(error);
      const detail = /content|policy|safety|filter/i.test(rawDetail)
        ? "request blocked by the image content policy"
        : "the image service was unavailable";
      warnings.push(`"${slide.title}": image generation failed (${detail}); using the structured fallback.`);
      nextSlides.push({ ...slide, visual: slide.visual.fallback });
    }
  }

  return { slides: nextSlides, warnings, assetIds };
}

export async function removeGeneratedImages(
  projectId: string,
  assetIds: readonly string[],
): Promise<void> {
  await Promise.all(
    assetIds.map((assetId) =>
      fs.rm(generatedImagePath(projectId, assetId), { force: true }),
    ),
  );
}
