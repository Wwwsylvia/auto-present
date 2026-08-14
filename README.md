# Idea2Impact

Idea2Impact turns a rough project idea into a structured, editable presentation and a downloadable MP4. It is an MVP for hackathon teams that need to spend their final hours building rather than assembling slides and video.

> **Localhost-only:** Idea2Impact is designed to run on one developer machine. The web server binds to `127.0.0.1`, project data and media remain on the local filesystem, and the separate render worker runs locally. Do not deploy this MVP, expose it through public ingress, or publish its data directory. Microsoft Foundry, Azure AI Speech, and GitHub are outbound server-side dependencies only.

## What works

- Guided brief with a required idea, audience, tone, and 1–10 minute target
- Optional bounded analysis of public GitHub repositories
- Microsoft Foundry-backed structured presentation generation
- Deterministic demo generation when Foundry is not configured
- Three-stage Plan → Create → Produce workflow with approval gates
- Revision-safe direct slide and narration editing
- Contextual Foundry revisions expressed as validated typed patches
- Optional MP4, WebM, or QuickTime demo-clip insertion
- Passwordless Azure AI Speech narration and sentence-timed FFmpeg captions
- Silent low-quality preview in local demo mode and narrated final MP4 with Azure Speech

## Requirements

- Node.js 22+
- npm 11+
- FFmpeg available on `PATH`
- For AI generation: a Microsoft Foundry project and model deployment
- For narrated output: an Azure AI Speech resource

## Install and configure

```powershell
npm ci
Copy-Item .env.example .env.local
npm run preflight
```

Use `npm ci` for a reproducible install from `package-lock.json`. Edit `.env.local` only if Foundry, Speech narration, or authenticated GitHub access is needed. The deterministic presentation generator and silent preview rendering work without Azure configuration.

## Launch for development

```powershell
npm run dev
```

Open `http://127.0.0.1:3000`. The command supervises both:

- the Next.js development server, bound only to `127.0.0.1`; and
- the separate durable local render worker.

Press `Ctrl+C` in the launch terminal to stop both processes. To debug them independently, run `npm run dev:web` and `npm run worker` in separate terminals.

Without Foundry configuration the app clearly identifies deterministic demo generation mode. A configured Foundry error never silently falls back. Preview rendering still works without Speech, but final rendering requires Azure Speech.

## Build and launch the local production build

Build the optimized Next.js application:

```powershell
npm ci
npm run build
```

After a successful build, launch the built web application and local render worker:

```powershell
npm start
```

Then open `http://127.0.0.1:3000`. `npm start` remains localhost-only; “production build” describes the optimized Next.js build mode, not a hosted deployment. Press `Ctrl+C` to stop both processes.

## Configuration

| Variable | Purpose |
| --- | --- |
| `FOUNDRY_PROJECT_ENDPOINT` | Microsoft Foundry project endpoint |
| `FOUNDRY_MODEL_DEPLOYMENT` | Deployed model name |
| `AZURE_SPEECH_KEY` | Optional Azure AI Speech subscription-key fallback |
| `AZURE_SPEECH_REGION` | Azure AI Speech region |
| `AZURE_SPEECH_ENDPOINT` | Custom Speech resource endpoint; required for passwordless authentication |
| `AZURE_SPEECH_RESOURCE_ID` | Full Azure resource ID; required to construct passwordless Speech authorization |
| `AZURE_SPEECH_VOICE` | Optional voice; defaults to `en-US-AvaMultilingualNeural` |
| `AZURE_SPEECH_USE_AZURE_CREDENTIAL` | Use passwordless Azure CLI identity; defaults to `true` |
| `GITHUB_TOKEN` | Optional token to raise public GitHub API limits |
| `IDEA2IMPACT_DATA_DIR` | Persistent project/render directory; defaults to `.data` |

Run `az login` locally. `DefaultAzureCredential` uses that identity for Foundry and, by default, Speech. Grant only the relevant Foundry inference access and the **Cognitive Services Speech User** role. Keep `.env.local` limited to non-secret endpoint, deployment, and region values where possible.

## Validation

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

For the complete real two-minute self-presentation check:

```powershell
npm run acceptance:self
```

This invokes real Foundry generation and contextual revision, exercises the durable queue, synthesizes real Speech narration, renders the final MP4, validates streams/captions/duration/story coverage, and writes a non-secret report next to the MP4.

To validate an existing completed UI render instead, run:

```powershell
npm run acceptance -- .data\projects.json <completed-render-id>
```

The first argument must be a JSON file containing the single project under test. The runner requires real Foundry/Speech configuration and writes a non-secret `acceptance-report.json` next to the completed MP4.

## Current MVP limits

- Single-user localhost operation with file-backed persistence
- Development and built modes both bind the web server exclusively to `127.0.0.1`
- Public GitHub repositories only
- One optional demo clip
- No PPTX import/export, accounts, sharing, or automatic browser recording
- Rendering uses a separate durable local worker with three bounded retry attempts and manual retry
- No deployment, public ingress, public storage URL, or non-loopback server binding

See [local build and operation](docs/local-operation.md), [product scope](docs/product.md), [architecture](docs/architecture.md), and [AI contracts](docs/ai-contracts.md).
Review the [local security checklist](docs/security-checklist.md) before the demo.
