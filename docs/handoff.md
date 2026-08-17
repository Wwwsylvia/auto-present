# Idea2Impact handoff

## Current state

The MVP implements a complete local workflow:

1. Create a project from an idea, audience, tone, duration, and optional public GitHub URL; generation begins immediately.
2. Generate a typed presentation using Microsoft Foundry when configured, or deterministic demo content otherwise, with visible progress feedback.
3. Review and directly edit slides and narration using immutable revisions, then approve the entire deck with one clear action.
4. Request validated contextual revisions from Foundry.
5. Move through the Brief, Review deck, and Produce video stages.
6. Optionally upload a demo clip that appears immediately before the closing slide.
7. Render and download a captioned MP4. Local previews can be silent; final output requires Azure AI Speech.

The product is named **Idea2Impact**. The completed MVP was developed on `agents/idea2impact-mvp`.

## Verified

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Browser inspection of the landing page and editor
- End-to-end API flow from project creation through both approvals
- Real FFmpeg preview render and MP4 download

## Configuration needed for a cloud-backed demo

Copy `.env.example` to `.env.local` and configure:

- `FOUNDRY_PROJECT_ENDPOINT`
- `FOUNDRY_MODEL_DEPLOYMENT`
- `NEXT_PUBLIC_FOUNDRY_CONFIGURED=true`
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- Optionally `AZURE_SPEECH_VOICE` and `GITHUB_TOKEN`

Use `az login` locally so `DefaultAzureCredential` can authenticate to Foundry. In Azure, use managed identity rather than storing Foundry credentials.

## Remaining work, in priority order

1. **Verify real Foundry generation**
   - Exercise initial generation and contextual revisions against the selected deployed model.
   - Confirm its JSON output consistently satisfies the Zod contracts.
   - Add fixture-backed integration tests for Foundry failures and malformed output.

2. **Verify Azure Speech output**
   - Generate a narrated two-minute video.
   - Check voice quality, caption timing, final duration, and transitions.
   - Decide whether captions should be split into sentence-level cues instead of one cue per slide.

3. **Deploy to Azure**
   - Provision the Foundry project/model, Speech, Container Apps environment, storage, and managed identity.
   - Deploy the included Docker image.
   - Mount persistent storage or replace file-backed persistence with PostgreSQL and Blob Storage.
   - Move long-running rendering from the web request into a Container Apps Job before public use.

4. **Run the self-presentation acceptance test**
   - Have Idea2Impact create its own two-minute hackathon pitch.
   - Require problem, use cases, solution, architecture, and visible Foundry usage.
   - Add a short uploaded demo clip and export the final MP4.
   - Record defects found during this run as the demo-polish backlog.

5. **Improve production reliability**
   - Add queued/background render status and retries.
   - Validate uploaded videos with `ffprobe`, including duration and decodability.
   - Add cleanup/retention for replaced uploads and obsolete renders.
   - Add signed Blob Storage URLs when moving away from local files.
   - Add Application Insights tracing and a judge-facing Foundry evaluation view.

6. **Polish the editing experience**
   - Add slide reorder, duplicate, delete, and slide-level regeneration.
   - Add uploaded demo trim and fit controls.
   - Add an embedded preview player rather than download-only output.
   - Improve responsive behavior for narrower screens.

## Known limitations and risks

- Persistence is JSON/file-backed and intended for a single-user demo.
- Rendering runs synchronously in a Next.js request; this can time out in hosted environments.
- Public GitHub analysis is intentionally limited to selected root files.
- Private repositories, accounts, sharing, PPTX, and automatic browser recording are out of scope.
- `npm audit --omit=dev` currently reports advisories through the installed Next.js/PostCSS dependency chain. The suggested automatic fix downgrades Next.js to an incompatible old version; reassess when a patched compatible release is available.
- Another worktree currently exists on `agents/idea2impact-presentation-generator`; inspect it before starting overlapping work.

## Recommended next-session prompt

> Configure and deploy the Idea2Impact MVP to Azure. Verify real Microsoft Foundry generation and contextual revisions, verify Azure Speech narration and caption timing, move rendering to a Container Apps Job, and complete the two-minute Idea2Impact self-presentation acceptance test. Preserve the current typed revision contracts and document every deployed Azure resource.
