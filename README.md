# Idea2Impact

Idea2Impact turns a rough project idea into a structured, editable presentation and a downloadable MP4. It is an MVP for hackathon teams that need to spend their final hours building rather than assembling slides and video.

## What works

- Guided brief with a required idea, audience, tone, and 1–10 minute target
- Optional bounded analysis of public GitHub repositories
- Microsoft Foundry-backed structured presentation generation
- Deterministic demo generation when Foundry is not configured
- Three-stage Plan → Create → Produce workflow with approval gates
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

The checked-in Azure deployment defaults to no web ingress. Use the application on localhost while retaining Foundry and Speech for server-side calls. Do not enable external Container Apps ingress unless authentication has been configured intentionally.

## Configuration

| Variable | Purpose |
| --- | --- |
| `FOUNDRY_PROJECT_ENDPOINT` | Microsoft Foundry project endpoint |
| `FOUNDRY_MODEL_DEPLOYMENT` | Deployed model name |
| `AZURE_SPEECH_KEY` | Azure AI Speech subscription key |
| `AZURE_SPEECH_REGION` | Azure AI Speech region |
| `AZURE_SPEECH_ENDPOINT` | Custom Speech endpoint used with managed identity |
| `AZURE_SPEECH_VOICE` | Optional voice; defaults to `en-US-AvaMultilingualNeural` |
| `AZURE_SPEECH_USE_MANAGED_IDENTITY` | Set to `true` to use `DefaultAzureCredential` instead of a Speech key |
| `GITHUB_TOKEN` | Optional token to raise public GitHub API limits |
| `IDEA2IMPACT_DATA_DIR` | Persistent project/render directory; defaults to `.data` |
| `RENDER_EXECUTION_MODE` | `local` for localhost rendering or `container-apps-job` for cloud dispatch |

Use Azure managed identity for Foundry authentication in production. `DefaultAzureCredential` supports local Azure CLI login during development.

For the provisioned localhost-first Azure environment, including role assignments,
image updates, job operations, costs, and teardown, see the
[Azure runbook](docs/azure-runbook.md). The verified self-presentation results are
recorded in the [acceptance report](docs/acceptance.md).

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
- Rendering runs in the application process locally; the provisioned Azure Container Apps Job can execute the same immutable render input when cloud rendering is selected

See [product scope](docs/product.md), [architecture](docs/architecture.md), and [AI contracts](docs/ai-contracts.md).
