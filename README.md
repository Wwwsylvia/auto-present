# Idea2Impact

Idea2Impact turns a rough project idea into a structured, editable presentation and a downloadable MP4. It is an MVP for hackathon teams that need to spend their final hours building rather than assembling slides and video.

## What works

- Guided brief with a required idea, audience, tone, and 1–10 minute target
- Optional bounded analysis of public GitHub repositories
- Microsoft Foundry-backed structured presentation generation
- Deterministic demo generation when Foundry is not configured
- Three-step Brief → Review deck → Produce video workflow with one whole-deck approval
- Revision-safe direct slide and narration editing
- Contextual Foundry revisions expressed as validated typed patches
- Optional MP4, WebM, or QuickTime demo-clip insertion
- Azure AI Speech narration and FFmpeg-rendered captions
- Silent low-quality preview in local demo mode and narrated final MP4 with Azure Speech

## Requirements

- Node.js 22+
- npm 11+
- FFmpeg available on `PATH`
- For AI generation: a Microsoft Foundry project and model deployment
- For narrated output: an Azure AI Speech resource

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Without cloud configuration the app clearly identifies demo generation mode. Preview rendering still works, but final rendering requires Azure Speech.

## Configuration

| Variable | Purpose |
| --- | --- |
| `FOUNDRY_PROJECT_ENDPOINT` | Microsoft Foundry project endpoint |
| `FOUNDRY_MODEL_DEPLOYMENT` | Deployed model name |
| `NEXT_PUBLIC_FOUNDRY_CONFIGURED` | Set to `true` when the server variables above are configured |
| `AZURE_SPEECH_KEY` | Azure AI Speech subscription key |
| `AZURE_SPEECH_REGION` | Azure AI Speech region |
| `AZURE_SPEECH_VOICE` | Optional voice; defaults to `en-US-AvaMultilingualNeural` |
| `GITHUB_TOKEN` | Optional token to raise public GitHub API limits |
| `IDEA2IMPACT_DATA_DIR` | Persistent project/render directory; defaults to `.data` |

Use Azure managed identity for Foundry authentication in production. `DefaultAzureCredential` supports local Azure CLI login during development.

## Validation

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

## Current MVP limits

- Single-user deployment with file-backed persistence
- Public GitHub repositories only
- One optional demo clip
- No PPTX import/export, accounts, sharing, or automatic browser recording
- Rendering runs in the application process locally; production should route the same immutable render input to an Azure Container Apps Job

See [product scope](docs/product.md), [architecture](docs/architecture.md), and [AI contracts](docs/ai-contracts.md).
