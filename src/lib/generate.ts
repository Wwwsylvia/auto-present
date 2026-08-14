import { randomUUID } from "node:crypto";
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import {
  presentationRevisionSchema,
  type PresentationRevision,
  type Project,
  type RevisionPatch,
  type Slide,
  revisionPatchSchema,
  slideSchema,
} from "@/lib/domain";
import { z } from "zod";

const promptVersion = "presentation-v1";

export type FoundryChatRequest = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format: { type: "json_object" };
};

export type FoundryChatCompletion = (
  request: FoundryChatRequest,
) => Promise<string | null | undefined>;

export const generatedPresentationSchema = presentationRevisionSchema
  .omit({
    id: true,
    version: true,
    createdAt: true,
    promptVersion: true,
    source: true,
    slides: true,
  })
  .extend({
    slides: z.array(slideSchema.omit({ id: true })).min(3).max(20),
  });

const presentationSystemPrompt =
  "You are the Idea2Impact presentation copilot. Return only valid JSON. Ground claims in supplied evidence, respect the exact duration budget, and create 3-12 concise slides.";

const revisionSystemPrompt =
  "Apply the user's request as the smallest possible set of structured slide changes. Return JSON with summary and slideChanges. Use only slide IDs provided. Never include unchanged fields.";

function allocateDurations(slideCount: number, totalSeconds: number): number[] {
  const base = Math.floor(totalSeconds / slideCount);
  const remainder = totalSeconds - base * slideCount;
  return Array.from({ length: slideCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function createDemoRevision(project: Project): PresentationRevision {
  const productName = project.repository?.repo ?? "Your idea";
  const durations = allocateDurations(6, project.input.durationMinutes * 60);
  const languageDetail = project.repository?.languages.length
    ? `Built with ${project.repository.languages.slice(0, 3).join(", ")}`
    : "Designed to move from idea to impact";
  const slides: Slide[] = [
    {
      id: randomUUID(),
      title: productName,
      purpose: "Open with a crisp promise",
      layout: "hero",
      bullets: [project.input.idea.slice(0, 180)],
      narration: `${productName} turns a compelling idea into an outcome people can understand and support. In the next few minutes, here is the problem, the solution, and why it matters.`,
      durationSeconds: durations[0],
      evidencePaths: [],
    },
    {
      id: randomUUID(),
      title: "The friction is real",
      purpose: "Establish the user pain",
      layout: "problem",
      bullets: [
        "Strong ideas are difficult to communicate quickly",
        "Manual storytelling and production consume scarce build time",
        "Inconsistent delivery hides the value of the solution",
      ],
      narration: "Teams often spend their final hours polishing a presentation instead of improving the product. The result is rushed storytelling, inconsistent visuals, and a demo whose impact is harder to see.",
      durationSeconds: durations[1],
      evidencePaths: [],
    },
    {
      id: randomUUID(),
      title: "A guided path to impact",
      purpose: "Explain the solution",
      layout: "features",
      bullets: [
        "Start from a lightweight project brief",
        "Shape the story with structured AI collaboration",
        "Produce a clear, timed presentation",
      ],
      narration: "The solution is a guided workflow. It starts with the intent, turns that into a focused narrative, and produces a presentation with the structure and timing needed to land the message.",
      durationSeconds: durations[2],
      evidencePaths: [],
    },
    {
      id: randomUUID(),
      title: "How it works",
      purpose: "Show the technical architecture",
      layout: "architecture",
      bullets: ["Project context", "AI orchestration", "Structured deck", "Media output"],
      narration: "The architecture keeps each artifact structured and traceable. Project context feeds an AI orchestration layer, which produces a validated deck model. Deterministic rendering then turns that model into a consistent media output.",
      durationSeconds: durations[3],
      evidencePaths: project.repository?.evidence.map((item) => item.path).slice(0, 2) ?? [],
    },
    {
      id: randomUUID(),
      title: "Built for momentum",
      purpose: "Highlight differentiators",
      layout: "demo",
      bullets: [languageDetail, "Fast revisions without restarting", "A result ready to share"],
      narration: `The experience is designed for momentum. ${languageDetail}. Users can refine individual parts without regenerating everything, then move directly to a result that is ready to share.`,
      durationSeconds: durations[4],
      evidencePaths: project.repository?.evidence.map((item) => item.path).slice(0, 2) ?? [],
    },
    {
      id: randomUUID(),
      title: "Turn the idea into impact",
      purpose: "Close with a memorable call to action",
      layout: "closing",
      bullets: ["Less production overhead", "Clearer stories", "More time to build"],
      narration: `${productName} gives builders more time for the product and a clearer way to tell its story. Start with the idea, shape the narrative, and turn it into impact.`,
      durationSeconds: durations[5],
      evidencePaths: [],
    },
  ];
  return {
    id: randomUUID(),
    version: project.revisions.length + 1,
    createdAt: new Date().toISOString(),
    title: productName,
    tagline: "From a rough idea to a presentation that lands",
    summary: project.input.idea.slice(0, 1000),
    slides,
    promptVersion,
    source: "demo",
  };
}

export async function generatePresentation(project: Project): Promise<PresentationRevision> {
  const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
  const deployment = process.env.FOUNDRY_MODEL_DEPLOYMENT;
  if (!endpoint || !deployment) {
    return createDemoRevision(project);
  }

  return generatePresentationWithCompletion(
    project,
    deployment,
    createAzureCompletion(endpoint),
  );
}

export function buildPresentationRequest(
  project: Project,
  deployment: string,
): FoundryChatRequest {
  return {
    model: deployment,
    messages: [
      {
        role: "system",
        content: presentationSystemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify({
          idea: project.input.idea,
          audience: project.input.audience,
          tone: project.input.tone,
          durationSeconds: project.input.durationMinutes * 60,
          repository: project.repository,
          schema: {
            title: "string",
            tagline: "string",
            summary: "string",
            slides: [
              {
                title: "string",
                purpose: "string",
                layout: "hero|problem|features|architecture|demo|closing",
                bullets: ["string"],
                narration: "string",
                durationSeconds: "number",
                evidencePaths: ["string"],
              },
            ],
          },
        }),
      },
    ],
    response_format: { type: "json_object" },
  };
}

export function parsePresentationResponse(
  raw: string | null | undefined,
  project: Project,
): PresentationRevision {
  if (!raw) throw new Error("Microsoft Foundry returned an empty presentation");
  const generated = generatedPresentationSchema.parse(JSON.parse(raw));
  return presentationRevisionSchema.parse({
    ...generated,
    id: randomUUID(),
    version: project.revisions.length + 1,
    createdAt: new Date().toISOString(),
    promptVersion,
    source: "foundry",
    slides: generated.slides.map((slide) => ({ ...slide, id: randomUUID() })),
  });
}

export async function generatePresentationWithCompletion(
  project: Project,
  deployment: string,
  complete: FoundryChatCompletion,
): Promise<PresentationRevision> {
  const raw = await complete(buildPresentationRequest(project, deployment));
  return parsePresentationResponse(raw, project);
}

export async function generateRevisionPatch(
  project: Project,
  instruction: string,
): Promise<RevisionPatch> {
  const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
  const deployment = process.env.FOUNDRY_MODEL_DEPLOYMENT;
  const revision = project.revisions.find((item) => item.id === project.activeRevisionId);
  if (!endpoint || !deployment) {
    throw new Error("Contextual AI revisions require Microsoft Foundry configuration");
  }
  if (!revision) throw new Error("Generate a presentation before requesting revisions");
  return generateRevisionPatchWithCompletion(
    project,
    instruction,
    deployment,
    createAzureCompletion(endpoint),
  );
}

export function buildRevisionRequest(
  project: Project,
  instruction: string,
  deployment: string,
): FoundryChatRequest {
  const revision = project.revisions.find((item) => item.id === project.activeRevisionId);
  if (!revision) throw new Error("Generate a presentation before requesting revisions");
  return {
    model: deployment,
    messages: [
      {
        role: "system",
        content: revisionSystemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify({
          instruction,
          targetDurationSeconds: project.input.durationMinutes * 60,
          slides: revision.slides,
          responseShape: {
            summary: "string",
            slideChanges: [
              {
                slideId: "existing ID",
                changes: {
                  title: "optional",
                  bullets: ["optional"],
                  narration: "optional",
                  durationSeconds: "optional",
                },
              },
            ],
          },
        }),
      },
    ],
    response_format: { type: "json_object" },
  };
}

export function parseRevisionResponse(
  raw: string | null | undefined,
  project: Project,
): RevisionPatch {
  if (!raw) throw new Error("Microsoft Foundry returned an empty revision");
  const patch = revisionPatchSchema.parse(JSON.parse(raw));
  const revision = project.revisions.find((item) => item.id === project.activeRevisionId);
  if (!revision) throw new Error("Generate a presentation before requesting revisions");
  const slideIds = new Set(revision.slides.map((slide) => slide.id));
  if (patch.slideChanges.some((change) => !slideIds.has(change.slideId))) {
    throw new Error("Microsoft Foundry referenced an unknown slide");
  }
  return patch;
}

export async function generateRevisionPatchWithCompletion(
  project: Project,
  instruction: string,
  deployment: string,
  complete: FoundryChatCompletion,
): Promise<RevisionPatch> {
  const raw = await complete(buildRevisionRequest(project, instruction, deployment));
  return parseRevisionResponse(raw, project);
}

function createAzureCompletion(endpoint: string): FoundryChatCompletion {
  const client = new AIProjectClient(endpoint, new DefaultAzureCredential());
  const openAI = client.getOpenAIClient();
  return async (request) => {
    const response = await openAI.chat.completions.create(request);
    return response.choices[0]?.message.content;
  };
}
