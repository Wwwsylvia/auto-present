# Idea2Impact

Idea2Impact turns a rough project idea into a structured, editable presentation and a downloadable MP4. It is an MVP for hackathon teams that need to spend their final hours building rather than assembling slides and video.

> **Localhost application:** The Idea2Impact website is designed and operated on
> the developer's machine. Azure hosts backend AI, Speech, storage, image, and
> optional render-job resources; it does not host a public website. The retained
> web Container App has ingress disabled, no FQDN, and zero minimum replicas.

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

## Install and launch

From a checkout of the current `deployment-v1` branch, install dependencies:

```powershell
npm install
```

Authenticate to Azure and launch the localhost development server:

```powershell
az login
.\scripts\Start-Local.ps1
```

It validates Node.js, npm, FFmpeg, Azure CLI authentication, starts the app in
the background, waits for the health endpoint, and opens the browser. Use
`-Port 3002` to select another port, `-NoBrowser` to skip opening the browser,
or `-DemoMode` to skip the launcher's provisioned Foundry and Speech settings.
Existing shell variables or `.env.local` values can still configure those
services.

Build and launch the optimized localhost production server with:

```powershell
.\scripts\Start-Local.ps1 -Build
```

Subsequent production launches can use `.\scripts\Start-Local.ps1 -Production`
without rebuilding. Open `http://localhost:3000`; this is always a local URL,
including in production mode.

For manual environment setup, complete build commands, health verification, data
locations, and troubleshooting, see [Build and launch](docs/build-and-launch.md).

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
| `AZURE_SUBSCRIPTION_ID` | Azure subscription containing the render job; required for cloud dispatch |
| `AZURE_RESOURCE_GROUP` | Resource group containing the render job; required for cloud dispatch |
| `AZURE_CONTAINER_APP_JOB_NAME` | Container Apps Job name; required for cloud dispatch |

Foundry and managed-identity Speech authentication use `DefaultAzureCredential`,
which can use the local Azure CLI session. No cloud credential is sent to the
browser.

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

- Single-user localhost application with file-backed persistence
- Public GitHub repositories only
- One optional demo clip
- No PPTX import/export, accounts, sharing, or automatic browser recording
- Rendering runs in the application process locally; the provisioned Azure Container Apps Job can execute the same immutable render input when cloud rendering is selected

See [product scope](docs/product.md), [architecture](docs/architecture.md), and [AI contracts](docs/ai-contracts.md).
