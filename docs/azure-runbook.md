# Azure runbook

## Topology and posture

Bicep provisions ACR, Log Analytics, a Container Apps environment, an
Azure Files share, Foundry/project/model resources, Speech, a web Container App,
and a separate manual render Job. Web and worker use separate user-assigned
identities and mount the same share at `/data`.

External ingress defaults to disabled and the web app scales to zero. If ingress
is enabled, Bicep requires Entra tenant/client/secret parameters and creates
Container Apps built-in authentication that redirects unauthenticated requests
to Microsoft Entra ID and disallows anonymous access.
`Configure-EntraAuth.ps1` intentionally refuses post-deployment configuration.

## Deploy private localhost support

```powershell
$operatorId = az ad signed-in-user show --query id -o tsv
.\scripts\Deploy-Infrastructure.ps1 `
  -SubscriptionId <subscription-id> `
  -ResourceGroupName <resource-group> `
  -Bootstrap `
  -LocalOperatorPrincipalId $operatorId
```

The operator receives `Cognitive Services OpenAI User` at the Foundry account
and `Cognitive Services Speech User` at Speech. Omit the parameter only when
roles are managed separately.

`-Bootstrap` explicitly selects the temporary hello-world image for a first
infrastructure deployment. Subsequent runs preserve the current web image from
the prior deployment unless `-ContainerImage` is supplied. Production changes
should pass one immutable image explicitly.

The script returns non-secret deployment outputs: registry, environment,
storage, Foundry endpoint/project/model deployment, Speech endpoint/region, web
app, render job, ingress state, and auth state. Start-Local consumes these
outputs; no resource name or endpoint is hard-coded.

## Entra-protected external ingress

Create a single-tenant Entra web app with this callback after the target
Container App hostname is known:

`https://<container-app-host>/.auth/login/aad/callback`

For a first deployment, deploy with internal ingress, obtain the generated
internal hostname from `webHost`, configure the app registration, then redeploy.
Bicep keeps ingress internal while it provisions Entra auth. The deployment
script verifies auth enforcement and only then enables external ingress, so a
failed auth deployment remains private:

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

The deployment fails before resource submission if required auth inputs are
missing. Never place the secret in a checked-in parameter file or shell history.
Rotate it in Entra and redeploy with a new SecureString.

## Reuse existing resources

The deployment can target an existing resource group, including
`rg-idea2impact-806d03f5` in subscription
`edd0c578-a7c3-4a61-9536-63273eb9bc9b`, only when those values are passed
explicitly. They are not defaults.

Use `-AdoptExistingResources` with explicit names. The script verifies resource
type, location, Cognitive Services kind, the Azure Files share, and the Foundry
model deployment before Bicep runs:

```powershell
.\scripts\Deploy-Infrastructure.ps1 `
  -SubscriptionId <subscription-id> `
  -ResourceGroupName <resource-group> `
  -AdoptExistingResources `
  -RegistryName <acr> `
  -LogAnalyticsWorkspaceName <workspace> `
  -StorageAccountName <storage> `
  -StorageFileShareName <share> `
  -ContainerAppsEnvironmentName <environment> `
  -FoundryAccountName <foundry-account> `
  -FoundryProjectName <project> `
  -ModelDeploymentName <deployment> `
  -SpeechAccountName <speech> `
  -WebContainerAppName <web-app> `
  -RenderContainerAppJobName <render-job>
```

Safe candidates are dedicated, same-region ACR, Log Analytics, StorageV2/Azure
Files, Container Apps environment, AIServices Foundry, SpeechServices, and the
existing dedicated web app/job. Bicep converges their declared settings without
deleting persisted data. Adopting a web app or job replaces its configured
user-assigned identity set with the identities declared by this template. Do not reuse a shared resource
when enabling ACR public access, storage shared-key access, account public
network access, or the declared SKU/configuration would violate its owners'
policy. Existing app/job names mean this deployment takes configuration
ownership of those workloads. Cross-resource-group resources, incompatible
kinds/regions/SKUs, unrelated shared apps/jobs, and resources with protected
network policy are not adoptable by this template; create dedicated resources
or extend the template deliberately.

## Images and cloud rendering

```powershell
.\scripts\Build-PushImage.ps1 `
  -SubscriptionId <subscription-id> `
  -ResourceGroupName <resource-group> `
  -ImageTag <immutable-tag>
```

The Dockerfile uses `npm ci`. Cloud render manifests, uploads, statuses, and
outputs use the shared `/data` mount. The Azure web app can dispatch the Job by
managed identity. A local Windows app cannot dispatch it because its local data
directory is not that mount; this path fails clearly instead of creating an
unreadable manifest.

The Job uses zero platform replica retries. A persisted dispatch lease prevents
duplicate starts, and normal web polling redispatches a queued dispatch or
rendering claim only after its lease expires. Claim-specific staging directories
prevent a superseded worker from deleting or publishing the replacement
worker's output.

## Verification

```powershell
az deployment group show -g <resource-group> -n idea2impact-infra `
  --query properties.outputs
az containerapp show -g <resource-group> -n <web-app> `
  --query "{external:properties.configuration.ingress.external,fqdn:properties.configuration.ingress.fqdn}"
az containerapp auth show -g <resource-group> -n <web-app>
az containerapp job execution list -g <resource-group> -n <render-job> -o table
```

Confirm private deployments have no external ingress. For public deployments,
confirm anonymous requests redirect to Entra and authenticated requests reach
`/api/health`. Live Azure deployment, role propagation, Entra login, Job
execution, and Azure Files behavior are not verified by local tests.

## Rollback and teardown

Rollback web and Job images to the same known immutable ACR tag. If an auth
deployment fails, leave ingress disabled; do not use the deprecated post-deploy
script. Delete the dedicated resource group only after retaining required files.
Role assignments scoped to resources are deleted with those resources.
