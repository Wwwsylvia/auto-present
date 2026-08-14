import type { Project } from "@/lib/domain";

export function createGenerateTestProject(): Project {
  const slides = [
    {
      id: "slide-1",
      title: "Opening",
      purpose: "Introduce the idea",
      layout: "hero" as const,
      bullets: ["A clear opening"],
      narration: "This is the opening narration.",
      durationSeconds: 20,
      evidencePaths: ["README.md"],
    },
    {
      id: "slide-2",
      title: "Solution",
      purpose: "Explain the solution",
      layout: "features" as const,
      bullets: ["A useful capability"],
      narration: "This is the solution narration.",
      durationSeconds: 20,
      evidencePaths: ["src/app.ts"],
    },
    {
      id: "slide-3",
      title: "Close",
      purpose: "Close the story",
      layout: "closing" as const,
      bullets: ["A memorable close"],
      narration: "This is the closing narration.",
      durationSeconds: 20,
      evidencePaths: [],
    },
  ];

  return {
    id: "project-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stage: "create",
    input: {
      idea: "Turn repository evidence into a concise presentation.",
      audience: "Hackathon judges",
      tone: "confident",
      durationMinutes: 1,
      githubUrl: "https://github.com/example/project",
    },
    repository: {
      url: "https://github.com/example/project",
      owner: "example",
      repo: "project",
      commitSha: "abc123",
      description: "A fixture repository",
      languages: ["TypeScript"],
      evidence: [
        {
          path: "README.md",
          excerpt: "Repository evidence must remain user-provided context.",
          url: "https://github.com/example/project/blob/abc123/README.md",
        },
      ],
    },
    revisions: [
      {
        id: "revision-1",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        title: "Fixture deck",
        tagline: "A fixture tagline",
        summary: "A fixture presentation used for Foundry contract tests.",
        slides,
        promptVersion: "presentation-v1",
        source: "foundry",
      },
    ],
    activeRevisionId: "revision-1",
    approvedPlanRevisionId: null,
    approvedDeckRevisionId: null,
    renderJobs: [],
    assets: [],
    lastError: null,
  };
}
