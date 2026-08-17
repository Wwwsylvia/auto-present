# Idea2Impact

Idea2Impact turns a project idea into an editable presentation and downloadable
video. The safest current operating mode is a single-user localhost app.

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
and never returned in deployment outputs. Post-deployment auth configuration is
disabled to avoid an unauthenticated exposure window.

See [build and launch](docs/build-and-launch.md), the
[Azure runbook](docs/azure-runbook.md), [architecture](docs/architecture.md),
and [security](docs/security.md).

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
