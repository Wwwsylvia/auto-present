# Azure and localhost runbook

## Operating model

Idea2Impact runs its web application on localhost. Microsoft Foundry and Azure AI
Speech remain server-side dependencies, and a manual Azure Container Apps Job is
available for optional cloud rendering. The web Container App has no ingress,
no FQDN, and a minimum replica count of zero. Do not enable external ingress
unless authentication is configured intentionally.

## Prerequisites

- Azure CLI authenticated to the target tenant
- PowerShell 7
- Node.js 22 and npm 11
- FFmpeg and ffprobe on `PATH`
- Permission to deploy resource-group resources and role assignments
- `Cognitive Services Speech User` on the Speech resource for each local
  developer who renders narrated output

The verified environment uses subscription
`edd0c578-a7c3-4a61-9536-63273eb9bc9b`, resource group
`rg-idea2impact-806d03f5`, and East US 2.

## Resource inventory

| Resource | Name | Purpose |
| --- | --- | --- |
| Azure Container Registry | `idea2impactxtfdg4bmi4v2macr` | Stores the shared web/worker image |
| Log Analytics workspace | `idea2impact-xtfdg4bmi4v2m-log` | Container Apps logs |
| Container Apps environment | `idea2impact-xtfdg4bmi4v2m-env` | Web and job runtime |
| Storage account | `idea2impactxtfdg4bmi4v2m` | Azure Files backing store |
| Azure Files share | `idea2impact-data` | Project, upload, manifest, status, and render files |
| Foundry/AIServices account | `idea2impact-xtfdg4bmi4v2m-ai` | Model host |
| Foundry project | `idea2impact-project` | Project endpoint |
| Model deployment | `gpt-5-4-mini` | GPT-5.4 mini, version `2026-03-17` |
| Speech account | `idea2impact-xtfdg4bmi4v2m-speech` | Narration and sentence boundaries |
| Web managed identity | `idea2impact-xtfdg4bmi4v2m-web-id` | Foundry inference, ACR pull, job dispatch |
| Job managed identity | `idea2impact-xtfdg4bmi4v2m-job-id` | Speech access and ACR pull |
| Web Container App | `idea2impact-xtfdg4bmi4v2m-web` | Disabled-ingress deployment target |
| Render job | `idea2impact-xtfdg4bmi4v2m-render` | One immutable manifest per execution |

## Deploy or update infrastructure

The deployment is idempotent and keeps ingress disabled unless
`-EnableExternalIngress` is passed explicitly.

```powershell
az login
.\scripts\Deploy-Infrastructure.ps1 `
  -SubscriptionId edd0c578-a7c3-4a61-9536-63273eb9bc9b `
  -ResourceGroupName rg-idea2impact-806d03f5
```

Build an image in ACR and update the disabled web target and render job:

```powershell
.\scripts\Build-PushImage.ps1 `
  -SubscriptionId edd0c578-a7c3-4a61-9536-63273eb9bc9b `
  -ResourceGroupName rg-idea2impact-806d03f5 `
  -ImageTag <immutable-tag>
```

The build script queues ACR builds without live log streaming and polls status.
This avoids Azure CLI Unicode failures seen when streaming Next.js build output
on Windows.

## Configure localhost

Assign the signed-in developer the Speech role once:

```powershell
$speechId = az cognitiveservices account show `
  --subscription edd0c578-a7c3-4a61-9536-63273eb9bc9b `
  --resource-group rg-idea2impact-806d03f5 `
  --name idea2impact-xtfdg4bmi4v2m-speech `
  --query id -o tsv
$principalId = az ad signed-in-user show --query id -o tsv
az role assignment create `
  --assignee-object-id $principalId `
  --assignee-principal-type User `
  --role "Cognitive Services Speech User" `
  --scope $speechId
```

Copy `.env.example` to `.env.local` and set:

```dotenv
FOUNDRY_PROJECT_ENDPOINT=https://idea2impact-xtfdg4bmi4v2m-ai.services.ai.azure.com/api/projects/idea2impact-project
FOUNDRY_MODEL_DEPLOYMENT=gpt-5-4-mini
AZURE_SPEECH_REGION=eastus2
AZURE_SPEECH_ENDPOINT=https://idea2impact-xtfdg4bmi4v2m-speech.cognitiveservices.azure.com/
AZURE_SPEECH_USE_MANAGED_IDENTITY=true
RENDER_EXECUTION_MODE=local
IDEA2IMPACT_DATA_DIR=<absolute-local-data-directory>
```

Do not add credentials to the file. Foundry and managed-identity Speech
authentication use `DefaultAzureCredential`, which can use the Azure CLI
session.

Alternatively, the checked-in launcher applies the provisioned non-secret
endpoints, verifies Azure CLI authentication and local prerequisites, starts the
server, waits for health, and opens the browser:

```powershell
.\scripts\Start-Local.ps1
```

Use `-Port 3002`, `-DataDirectory <path>`, `-NoBrowser`, or `-DemoMode` as
needed. Use `-Build` for an optimized build and localhost production launch, or
`-Production` to reuse an existing build. The launcher does not store
credentials; Azure SDK authentication still comes from the active Azure CLI
session. `-DemoMode` skips the launcher's provisioned service settings but does
not clear values already supplied by the shell or `.env.local`. See
[Build and launch](build-and-launch.md) for the complete workflow.

## Optional Container Apps Job rendering

Set `RENDER_EXECUTION_MODE=container-apps-job` and configure
`AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, and
`AZURE_CONTAINER_APP_JOB_NAME`. The caller must have Container Apps Jobs
Operator on the render job. The web and job workloads must mount the same Azure
Files share at `/data`.

Inspect executions and logs:

```powershell
az containerapp job execution list `
  --subscription edd0c578-a7c3-4a61-9536-63273eb9bc9b `
  --resource-group rg-idea2impact-806d03f5 `
  --name idea2impact-xtfdg4bmi4v2m-render -o table

az monitor log-analytics query `
  --workspace idea2impact-xtfdg4bmi4v2m-log `
  --analytics-query "ContainerAppConsoleLogs_CL | where ContainerJobName_s == 'idea2impact-xtfdg4bmi4v2m-render' | order by TimeGenerated desc | take 100"
```

The worker validates the immutable manifest, writes atomic status, and refuses
to make a stale render current. A prior cloud execution completed while the web
status remained at 5%; reconciliation should be reverified before depending on
cloud mode for unattended operation.

## Security and identity

- Speech local authentication is disabled; use managed identity or Azure CLI
  credentials with the Speech User role.
- The web identity has Cognitive Services OpenAI User on Foundry, AcrPull on
  ACR, and Container Apps Jobs Operator on the render job.
- The job identity has Cognitive Services Speech User on Speech and AcrPull on
  ACR.
- Foundry and Speech credentials never reach the browser.
- Entra application creation is not required for localhost operation. The
  tenant requires a real internal `serviceManagementReference` for new app
  registrations; never invent one.

## Verify no public endpoint

```powershell
az containerapp show `
  --subscription edd0c578-a7c3-4a61-9536-63273eb9bc9b `
  --resource-group rg-idea2impact-806d03f5 `
  --name idea2impact-xtfdg4bmi4v2m-web `
  --query "{fqdn:properties.configuration.ingress.fqdn,external:properties.configuration.ingress.external,minReplicas:properties.template.scale.minReplicas}"
```

The expected values are null FQDN, null external ingress, and zero minimum
replicas.

## Cost control, rollback, and teardown

The model deployment, Speech S0 account, ACR, Log Analytics, storage, and
Container Apps environment can accrue charges even when web replicas are zero.
Review Azure Cost Management and remove unused images, logs, and render files.
Rollback uses an existing immutable ACR tag with `az containerapp update` and
`az containerapp job update`.

Delete the dedicated environment only when all retained data is no longer
needed:

```powershell
az group delete `
  --subscription edd0c578-a7c3-4a61-9536-63273eb9bc9b `
  --name rg-idea2impact-806d03f5 `
  --yes
```

Resource-group deletion removes the managed identities and scoped role
assignments. Remove any developer role assignments outside the resource group
separately.
