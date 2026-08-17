# Idea2Impact

Idea2Impact turns a rough project idea into a structured, editable presentation
and a downloadable MP4. It is an MVP for hackathon teams that need to spend
their final hours building rather than assembling slides and video. The safest
current operating mode is a single-user localhost app.

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

## Operating modes

| Mode | Command | Services | Security boundary |
| --- | --- | --- | --- |
| Local demo | `.\scripts\Start-Local.ps1` | Deterministic generation, silent preview rendering | Binds only to `127.0.0.1`; Host and Origin are loopback-validated |
| Azure-backed localhost | `.\scripts\Start-Local.ps1 -AzureBacked -SubscriptionId <id> -ResourceGroupName <rg>` | Foundry generation, Speech narration, local FFmpeg | Same loopback boundary; `DefaultAzureCredential` uses the operator's Azure login |
| Azure hosted | Bicep deployment | Container Apps web/worker, managed identities, Azure Files | External ingress is off by default; enabling it requires Entra parameters in the same deployment |

Localhost-triggered Container Apps Job rendering is intentionally disabled:
Windows-local manifests and uploads are not visible in the Linux worker. Local
rendering remains supported. Cloud rendering is available only when the Azure
web and worker share the provisioned `/data` Azure Files mount.

## Local prerequisites

- Node.js 22+, npm 11+, FFmpeg and ffprobe
- For local demo: no Azure account
- For Azure-backed localhost: Azure CLI login plus `Cognitive Services OpenAI
  User` on Foundry and `Cognitive Services Speech User` on Speech

Install with the lockfile:

```powershell
npm ci
```

Launch the offline/demo path:

```powershell
.\scripts\Start-Local.ps1
```

Launch against an existing deployment. The launcher reads non-secret endpoints
and resource identifiers from deployment outputs:

```powershell
az login
.\scripts\Start-Local.ps1 -AzureBacked `
  -SubscriptionId <subscription-id> `
  -ResourceGroupName <resource-group>
```

Both development and production-local launches bind explicitly to
`127.0.0.1`. Use `-Build` to build and launch production-local mode or
`-Production` to reuse an existing build.

## Configuration

Copy `.env.example` to `.env.local` when launching without the helper script.
The supported settings include:

| Variable | Purpose |
| --- | --- |
| `APP_HOSTING_MODE` | Selects the localhost or Azure request-security boundary |
| `FOUNDRY_PROJECT_ENDPOINT` | Microsoft Foundry project endpoint |
| `FOUNDRY_MODEL_DEPLOYMENT` | Deployed model name |
| `AZURE_SPEECH_ENDPOINT` | Azure AI Speech endpoint |
| `AZURE_SPEECH_REGION` | Azure AI Speech region |
| `AZURE_SPEECH_KEY` | Optional local Speech key; managed identity is preferred |
| `AZURE_SPEECH_USE_MANAGED_IDENTITY` | Enables managed-identity Speech authentication |
| `AZURE_SPEECH_VOICE` | Optional voice; defaults to `en-US-AvaMultilingualNeural` |
| `GITHUB_TOKEN` | Optional token to raise public GitHub API limits |
| `IDEA2IMPACT_DATA_DIR` | Persistent project/render directory; defaults to `.data` |
| `RENDER_EXECUTION_MODE` | Selects local or Container Apps Job rendering |

Use Azure managed identity for Foundry and Speech authentication in hosted
deployments. `DefaultAzureCredential` supports local Azure CLI login during
development.

## Azure deployment

Infrastructure includes ACR, Container Apps, separate web and render-job
identities, Azure Files, Foundry, Speech, health probes, and scoped role
assignments. It emits non-secret endpoints and names for scripts to consume.

Provision the signed-in operator's data-plane roles during deployment:

```powershell
$operatorId = az ad signed-in-user show --query id -o tsv
.\scripts\Deploy-Infrastructure.ps1 `
  -SubscriptionId <subscription-id> `
  -ResourceGroupName <resource-group> `
  -Bootstrap `
  -LocalOperatorPrincipalId $operatorId
```

External ingress cannot be deployed without complete Entra configuration:

```powershell
$secret = Read-Host 'Entra client secret' -AsSecureString
.\scripts\Deploy-Infrastructure.ps1 `
  -SubscriptionId <subscription-id> `
  -ResourceGroupName <resource-group> `
  -ContainerImage <registry>/<repository>:<immutable-tag> `
  -EnableExternalIngress `
  -EntraTenantId <tenant-id> `
  -EntraClientId <client-id> `
  -EntraClientSecret $secret
```

The secret is a secure Bicep parameter, stored only as a Container Apps secret,
and never returned in deployment outputs. The deployment script passes it
through a per-run process environment variable read by a temporary non-secret
`.bicepparam` next to the Bicep template; the secret is never an Azure CLI
argument, and both artifacts are cleared in `finally`. Post-deployment auth
configuration is disabled to avoid an unauthenticated exposure window.

See [build and launch](docs/build-and-launch.md), the
[Azure runbook](docs/azure-runbook.md), [architecture](docs/architecture.md),
[security](docs/security.md), and the gated
[Azure integration testing guide](docs/azure-integration-testing.md).

## Validation

```powershell
git diff --check
npm test
npm run lint
npm run typecheck
npm run build
az bicep build --file infra/main.bicep
```

Azure resource deployment and live Entra sign-in require tenant-specific
credentials and must be validated in the target subscription; repository checks
do not prove a live Azure deployment.

## Current MVP limits

- Single-user deployment with file-backed persistence and one web replica
- Public GitHub repositories only
- One optional demo clip
- No PPTX import/export, accounts, sharing, collaboration, billing, or automatic browser recording
- Local rendering runs on the user's machine; hosted rendering requires the web app and Container Apps Job to share `/data`
- Multi-user or multi-replica hosting requires transactional metadata, durable queuing, project ownership, and stronger authorization

See [product scope](docs/product.md), [architecture](docs/architecture.md),
[AI contracts](docs/ai-contracts.md), and [handoff](docs/handoff.md).
