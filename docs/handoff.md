# Idea2Impact handoff

## Operating model

Idea2Impact is localhost-only. Use `npm run dev` during development, or `npm run build` followed by `npm start` to run the optimized local build. Both commands bind the web application to `127.0.0.1` and supervise a separate local render worker. See `docs/local-operation.md` for setup, launch, validation, shutdown, and retention details.

## Current state

The MVP implements a complete local workflow:

1. Create a project from an idea, audience, tone, duration, and optional public GitHub URL.
2. Generate a typed presentation using Microsoft Foundry when configured, or deterministic demo content otherwise.
3. Review and directly edit slides and narration using immutable revisions.
4. Request validated contextual revisions from Foundry.
5. Approve the plan and deck through the Plan, Create, and Produce stages.
6. Optionally upload a demo clip.
7. Queue a durable background render and download a sentence-captioned MP4. Local previews can be silent; final output requires Azure AI Speech.

The product is named **Idea2Impact**. The completed MVP was developed on `agents/idea2impact-mvp`.

## Verified

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Browser inspection of the landing page and editor
- End-to-end API flow from project creation through both approvals
- Real FFmpeg preview render and MP4 download
- Local web/worker separation, durable queue retries, upload probing, and localhost request boundaries
- Real Microsoft Foundry initial generation and contextual revision through the configured Idea2Impact project
- Real passwordless Azure AI Speech narration through the signed-in Azure CLI identity
- `npm run acceptance:self` on 2026-08-14: all checks passed, including required story coverage, architecture, explicit Foundry emphasis, generated demo footage, three-failure/manual-retry recovery, audio/video streams, 30 bounded caption cues, and a 120.04-second MP4

## Configuration needed for a cloud-backed demo

Copy `.env.example` to `.env.local` and configure:

- `FOUNDRY_PROJECT_ENDPOINT`
- `FOUNDRY_MODEL_DEPLOYMENT`
- `AZURE_SPEECH_REGION`
- Optionally `AZURE_SPEECH_KEY` as a fallback
- Optionally `AZURE_SPEECH_VOICE` and `GITHUB_TOKEN`

Use `az login` locally so `DefaultAzureCredential` can authenticate to Foundry and Speech. Grant only model inference access and Cognitive Services Speech User. This MVP must not be deployed.

## Remaining work, in priority order

1. **Polish the editing experience**
   - Add slide reorder, duplicate, delete, and slide-level regeneration.
   - Add uploaded demo trim and fit controls.
   - Add an embedded preview player rather than download-only output.
   - Improve responsive behavior for narrower screens.

## Known limitations and risks

- Persistence is JSON/file-backed and intended for a single-user demo.
- The MVP is intentionally localhost-only and is not suitable for hosted or multi-user operation. It accepts data-bearing API requests only through literal loopback hosts (`localhost`, `127.0.0.1`, or `[::1]`), not custom local DNS names.
- Public GitHub analysis is intentionally limited to selected root files.
- Private repositories, accounts, sharing, PPTX, and automatic browser recording are out of scope.
- Acceptance media and reports remain local under `.data/acceptance` and are intentionally ignored by Git.
- `npm audit --omit=dev` currently reports advisories through the installed Next.js/PostCSS dependency chain. The suggested automatic fix downgrades Next.js to an incompatible old version; reassess when a patched compatible release is available.
- Another worktree currently exists on `agents/idea2impact-presentation-generator`; inspect it before starting overlapping work.

## Recommended next-session prompt

> Configure local Foundry and Speech access with `az login`, run the two-minute Idea2Impact self-presentation acceptance test, and record the real-service report. Keep the web and worker loopback-only and do not deploy, push, or merge.
