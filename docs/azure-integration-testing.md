# Azure integration testing from an unsandboxed session

This runbook validates `localhost-azure` against existing Azure resources without
turning an unsandboxed agent session into an implicit deployment pipeline.

> **Safety rule:** do not mutate Azure until a human reviews the complete
> `what-if` result. Never delete resources during this procedure. External
> ingress stays disabled until the separate Entra phase is explicitly approved.

## 1. Prerequisites and checkout

Use PowerShell 7 with Git, Node.js 22+, npm 11+, FFmpeg/ffprobe, Azure CLI
2.54.0 or newer, and Bicep. The operator needs read access initially; later
phases require deployment, role-assignment, Container Apps, and relevant
data-plane permissions.

```powershell
git fetch origin
git switch --detach origin/localhost-azure
az login

$subscriptionId = 'edd0c578-a7c3-4a61-9536-63273eb9bc9b'
$resourceGroup = 'rg-idea2impact-806d03f5'
$deploymentName = 'idea2impact-infra'

az account set --subscription $subscriptionId
az account show --query '{subscription:id,tenant:tenantId,user:user.name}' -o table
```

**STOP:** confirm the subscription and tenant are intended. These values are
current inventory examples, never script or template defaults.

## 2. Local validation and production-local smoke

```powershell
npm ci
npm test
npm run lint
npm run typecheck
npm run build

$parseErrors = @()
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path '.\scripts\Start-Local.ps1'),
  [ref]$null,
  [ref]$parseErrors
) | Out-Null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path '.\scripts\Deploy-Infrastructure.ps1'),
  [ref]$null,
  [ref]$parseErrors
) | Out-Null
if ($parseErrors.Count) { $parseErrors | Format-List; throw 'PowerShell parse failed.' }

az bicep build --file .\infra\main.bicep --stdout | Out-Null
git diff --check
```

Launch the optimized demo server and capture only the PID printed by the
launcher:

```powershell
$launchOutput = @(& .\scripts\Start-Local.ps1 -DemoMode -Build -NoBrowser 6>&1 2>&1)
$launchOutput | ForEach-Object { Write-Host $_ }
$pidLine = $launchOutput | Select-String '^Process ID:\s+(\d+)$' | Select-Object -Last 1
if (-not $pidLine) { throw 'Launcher did not return a process ID.' }
$localAppPid = [int]$pidLine.Matches[0].Groups[1].Value

Invoke-RestMethod http://127.0.0.1:3000/api/health | ConvertTo-Json -Depth 5
Stop-Process -Id $localAppPid
Start-Sleep -Seconds 2
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  throw 'The returned launcher PID stopped but a descendant listener remains. Do not kill by name; record the PID-ownership blocker and stop this test.'
}
```

Never stop by process name. If the launcher reports a wildcard or non-loopback
listener, stop that specific process separately only after identifying it.

## 3. Read-only Azure inventory

The known inventory at the time of writing is:

| Type | Current example name |
| --- | --- |
| Web identity | `idea2impact-xtfdg4bmi4v2m-web-id` |
| Job identity | `idea2impact-xtfdg4bmi4v2m-job-id` |
| Storage | `idea2impactxtfdg4bmi4v2m` |
| Speech | `idea2impact-xtfdg4bmi4v2m-speech` |
| ACR | `idea2impactxtfdg4bmi4v2macr` |
| Foundry account | `idea2impact-xtfdg4bmi4v2m-ai` |
| Foundry project | `idea2impact-project` |
| Log Analytics | `idea2impact-xtfdg4bmi4v2m-log` |
| Container Apps environment | `idea2impact-xtfdg4bmi4v2m-env` |
| Web Container App | `idea2impact-xtfdg4bmi4v2m-web` |
| Render Job | `idea2impact-xtfdg4bmi4v2m-render` |

Re-discover instead of assuming:

```powershell
az resource list -g $resourceGroup `
  --query "[].{name:name,type:type,location:location,kind:kind}" -o table

az identity list -g $resourceGroup `
  --query "[].{name:name,id:id,principalId:principalId,clientId:clientId}" -o table

az acr list -g $resourceGroup --query "[].{name:name,loginServer:loginServer,sku:sku.name}" -o table
az storage account list -g $resourceGroup --query "[].{name:name,kind:kind,sku:sku.name}" -o table
az cognitiveservices account list -g $resourceGroup `
  --query "[].{name:name,kind:kind,location:location,publicNetworkAccess:properties.publicNetworkAccess}" -o table
az monitor log-analytics workspace list -g $resourceGroup -o table
az containerapp env list -g $resourceGroup -o table
az containerapp list -g $resourceGroup -o table
az containerapp job list -g $resourceGroup -o table
```

## 4. Discover exact reusable configuration

Set names only after inventory confirms them:

```powershell
$acrName = 'idea2impactxtfdg4bmi4v2macr'
$storageName = 'idea2impactxtfdg4bmi4v2m'
$speechName = 'idea2impact-xtfdg4bmi4v2m-speech'
$foundryName = 'idea2impact-xtfdg4bmi4v2m-ai'
$foundryProject = 'idea2impact-project'
$logName = 'idea2impact-xtfdg4bmi4v2m-log'
$environmentName = 'idea2impact-xtfdg4bmi4v2m-env'
$webName = 'idea2impact-xtfdg4bmi4v2m-web'
$jobName = 'idea2impact-xtfdg4bmi4v2m-render'

$fileShare = az storage share-rm list `
  --storage-account $storageName -g $resourceGroup `
  --query "[].name" -o tsv

$modelDeployment = az cognitiveservices account deployment list `
  --name $foundryName -g $resourceGroup `
  --query "[].name" -o tsv

$currentImage = az containerapp show -n $webName -g $resourceGroup `
  --query properties.template.containers[0].image -o tsv
$jobImage = az containerapp job show -n $jobName -g $resourceGroup `
  --query properties.template.containers[0].image -o tsv

az containerapp show -n $webName -g $resourceGroup `
  --query '{identity:identity,ingress:properties.configuration.ingress,mounts:properties.template.containers[0].volumeMounts,volumes:properties.template.volumes,probes:properties.template.containers[0].probes}' -o json
az containerapp auth show -n $webName -g $resourceGroup -o json
az containerapp job show -n $jobName -g $resourceGroup `
  --query '{identity:identity,configuration:properties.configuration,mounts:properties.template.containers[0].volumeMounts,volumes:properties.template.volumes,image:properties.template.containers[0].image}' -o json

az role assignment list -g $resourceGroup --all `
  --query "[].{principalId:principalId,role:roleDefinitionName,scope:scope}" -o table
```

These commands show IDs, secret references, and configuration, not secret
values. Do not run `listKeys`, print Container Apps secret values, or echo Entra
credentials.

**STOP:** confirm there is exactly one intended file share and model deployment,
the web/job image is immutable and compatible, identities are dedicated, mounts
target `/data`, ingress is not external, and no anonymous auth state is active.

## 5. Read-only Bicep what-if

Resolve the operator principal without exposing credentials:

```powershell
$operatorPrincipalId = az ad signed-in-user show --query id -o tsv
$location = az group show -n $resourceGroup --query location -o tsv
$groupTagsJson = az group show -n $resourceGroup --query tags -o json
$groupTags = $groupTagsJson | ConvertFrom-Json
$tagArguments = @($groupTags.psobject.Properties | ForEach-Object {
  "$($_.Name)=$($_.Value)"
})
```

Run what-if with explicit adoption parameters and private ingress:

```powershell
az deployment group what-if `
  --name "$deploymentName-whatif" `
  --resource-group $resourceGroup `
  --subscription $subscriptionId `
  --template-file .\infra\main.bicep `
  --parameters `
    namePrefix=idea2impact `
    location=$location `
    containerImage=$currentImage `
    enableExternalIngress=false `
    localOperatorPrincipalId=$operatorPrincipalId `
    localOperatorPrincipalType=User `
    registryName=$acrName `
    logAnalyticsWorkspaceName=$logName `
    storageName=$storageName `
    storageFileShareName=$fileShare `
    containerAppsEnvironmentName=$environmentName `
    foundryAccountName=$foundryName `
    foundryProjectName=$foundryProject `
    modelDeploymentName=$modelDeployment `
    speechAccountName=$speechName `
    webContainerAppName=$webName `
    renderContainerAppJobName=$jobName
```

If this becomes unwieldy, write a temporary **non-secret** parameters JSON under
`$env:TEMP`, pass it with `--parameters "@$parameterFile"`, and remove that exact
file afterward. Never place Entra secrets in it, never create it in the
repository/session artifact directory, and never commit it.

Expected changes are additive role assignments, required health/job settings,
and intentional configuration convergence described in the Azure runbook.
Red flags are any delete, resource replacement, external/public ingress, removal
of an unexpected identity, data/share removal, SKU downgrade, or weaker
storage/ACR/Cognitive Services network or authentication settings.

`Deploy-Infrastructure.ps1` also updates resource-group tags before the Bicep
deployment, so that mutation is outside the what-if result. The adoption command
below passes the exact discovered tags back to the script. Verify
`$tagArguments` before approval; an empty or incomplete value is a stop
condition.

**MANDATORY STOP:** save the complete what-if output and obtain human approval.
Do not continue merely because the command exited successfully.

## 6. Approved private adoption test

Capture rollback evidence outside the repository:

```powershell
$evidenceRoot = Join-Path $env:TEMP "idea2impact-azure-test-$(Get-Date -Format yyyyMMddHHmmss)"
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null

az deployment group show -g $resourceGroup -n $deploymentName -o json |
  Set-Content -LiteralPath (Join-Path $evidenceRoot 'deployment-before.json')
az group show -n $resourceGroup -o json |
  Set-Content -LiteralPath (Join-Path $evidenceRoot 'resource-group-before.json')
az containerapp show -g $resourceGroup -n $webName -o json |
  Set-Content -LiteralPath (Join-Path $evidenceRoot 'web-before.json')
az containerapp auth show -g $resourceGroup -n $webName -o json |
  Set-Content -LiteralPath (Join-Path $evidenceRoot 'auth-before.json')
az containerapp job show -g $resourceGroup -n $jobName -o json |
  Set-Content -LiteralPath (Join-Path $evidenceRoot 'job-before.json')
```

After explicit approval only:

```powershell
.\scripts\Deploy-Infrastructure.ps1 `
  -SubscriptionId $subscriptionId `
  -ResourceGroupName $resourceGroup `
  -DeploymentName $deploymentName `
  -Location $location `
  -ContainerImage $currentImage `
  -AdoptExistingResources `
  -LocalOperatorPrincipalId $operatorPrincipalId `
  -LocalOperatorPrincipalType User `
  -RegistryName $acrName `
  -LogAnalyticsWorkspaceName $logName `
  -StorageAccountName $storageName `
  -StorageFileShareName $fileShare `
  -ContainerAppsEnvironmentName $environmentName `
  -FoundryAccountName $foundryName `
  -FoundryProjectName $foundryProject `
  -ModelDeploymentName $modelDeployment `
  -SpeechAccountName $speechName `
  -WebContainerAppName $webName `
  -RenderContainerAppJobName $jobName `
  -Tags $tagArguments
```

Do not pass `-EnableExternalIngress`. Verify `external` remains false and compare
the post-deployment resource JSON with the captured snapshots.

## 7. Azure-backed localhost smoke

Allow role propagation time after deployment, then launch from outputs:

```powershell
$launchOutput = @(& .\scripts\Start-Local.ps1 `
  -AzureBacked `
  -SubscriptionId $subscriptionId `
  -ResourceGroupName $resourceGroup `
  -DeploymentName $deploymentName `
  -Build `
  -NoBrowser 6>&1 2>&1)
$launchOutput | ForEach-Object { Write-Host $_ }
$pidLine = $launchOutput | Select-String '^Process ID:\s+(\d+)$' | Select-Object -Last 1
if (-not $pidLine) { throw 'Launcher did not return a process ID.' }
$azureLocalPid = [int]$pidLine.Matches[0].Groups[1].Value

Invoke-RestMethod http://127.0.0.1:3000/api/health | ConvertTo-Json -Depth 5
```

Health booleans prove configuration only. In the UI, generate a deck with real
Foundry, approve it, and render a narrated final video with Speech. Record
timestamps and errors. A 403/401 from either service usually means role
propagation or an incorrect principal/scope. Stop only the captured PID:

```powershell
Stop-Process -Id $azureLocalPid
Start-Sleep -Seconds 2
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  throw 'The returned launcher PID stopped but a descendant listener remains. Do not kill by name; record the PID-ownership blocker and stop this test.'
}
```

## 8. Private cloud render test

The private Container App cannot be browsed from the public internet and normally
scales to zero. First inspect it:

```powershell
az containerapp revision list -g $resourceGroup -n $webName -o table
az containerapp replica list -g $resourceGroup -n $webName -o table
```

If there is no replica, **STOP for separate approval** before temporarily
changing scale. Capture the current scale, set one replica, perform the check,
then restore the captured value:

```powershell
$originalMinReplicas = az containerapp show -g $resourceGroup -n $webName `
  --query properties.template.scale.minReplicas -o tsv
az containerapp update -g $resourceGroup -n $webName --min-replicas 1 -o none
az containerapp replica list -g $resourceGroup -n $webName -o table
az containerapp exec -g $resourceGroup -n $webName
```

Inside the interactive container shell, run:

```sh
node -e "fetch('http://127.0.0.1:3000/api/health').then(async r => { console.log(r.status, await r.text()) })"
exit
```

Back in PowerShell:

```powershell
az containerapp update -g $resourceGroup -n $webName `
  --min-replicas $originalMinReplicas -o none
```

An end-to-end private render requires a manifest created by the hosted web app
on the shared `/data` mount. Use an approved in-environment client/jump host, or
the later Entra-protected endpoint; do not temporarily expose anonymous
ingress. Once a queued manifest ID exists, observe rather than repeatedly start:

```powershell
az containerapp job execution list -g $resourceGroup -n $jobName -o table
az containerapp job show -g $resourceGroup -n $jobName `
  --query '{retry:properties.configuration.replicaRetryLimit,timeout:properties.configuration.replicaTimeout}' -o json
```

Confirm one dispatch lease suppresses duplicate starts, a deliberately terminated
execution is redispatched only after lease expiry and web reconciliation, claim
staging uses `<job-id>.<claim-token>`, only the winning output is promoted, and a
subsequent revision makes the old download return 404. The current repository
does not include a noninteractive private tunnel or fault-injection harness;
record manual steps honestly and do not claim these behaviors from health alone.

## 9. Separately approved Entra phase

Prerequisites: a single-tenant Entra web app, callback
`https://<container-app-host>/.auth/login/aad/callback`, permission to update the
app registration, **ID tokens (used for implicit and hybrid flows)** enabled,
and an approved test user. Capture the private state first.

Resolve tenant/client metadata and read the secret without placing it in shell
history:

```powershell
$tenantId = az account show --query tenantId -o tsv
$clientId = '<approved-entra-client-id>'
$clientSecret = Read-Host 'Entra client secret' -AsSecureString
$allowedUserIds = @($operatorPrincipalId)
```

After a separate approval for public exposure:

```powershell
.\scripts\Deploy-Infrastructure.ps1 `
  -SubscriptionId $subscriptionId `
  -ResourceGroupName $resourceGroup `
  -DeploymentName $deploymentName `
  -Location $location `
  -ContainerImage $currentImage `
  -AdoptExistingResources `
  -EnableExternalIngress `
  -EntraTenantId $tenantId `
  -EntraClientId $clientId `
  -EntraClientSecret $clientSecret `
  -EntraAllowedUserObjectIds $allowedUserIds `
  -LocalOperatorPrincipalId $operatorPrincipalId `
  -RegistryName $acrName `
  -LogAnalyticsWorkspaceName $logName `
  -StorageAccountName $storageName `
  -StorageFileShareName $fileShare `
  -ContainerAppsEnvironmentName $environmentName `
  -FoundryAccountName $foundryName `
  -FoundryProjectName $foundryProject `
  -ModelDeploymentName $modelDeployment `
  -SpeechAccountName $speechName `
  -WebContainerAppName $webName `
  -RenderContainerAppJobName $jobName `
  -Tags $tagArguments
```

The script converts the `SecureString` only in memory, stores it in a uniquely
named process environment variable, and invokes Azure CLI with a temporary
non-secret `.bicepparam` beside `infra/main.bicep` that contains
`readEnvironmentVariable(...)`. The parameter file is compiled before Azure
mutation. The script never places the value in command arguments, logs, output,
or a file; both the environment variable and temporary file are removed in
`finally`.

The flow deploys auth while ingress is private, verifies redirect-to-Entra
enforcement, then enables external ingress. Verify an anonymous request redirects
to Entra and an authenticated browser reaches `/api/health`. If the enable step
or any subsequent script verification fails, the script disables external
ingress by restoring internal-only ingress and verifies `external=false` before
reporting the original failure. Never disable auth while external ingress is
enabled.

## 10. Evidence, rollback, and cleanup

Record:

```text
Commit:
Subscription / tenant:
Resource group:
What-if file and reviewer approval:
Pre/post snapshots:
Local validation:
Demo health:
Foundry generation:
Speech render:
Container revision and image:
Azure Files mount/share:
Job execution IDs:
Lease recovery / claim isolation:
Stale download result:
Entra anonymous redirect:
Entra authenticated health:
Rollback result:
Known deviations:
```

Automated rollback in this repository is limited to restoring a known immutable
web/job image and ensuring ingress is private. The JSON snapshots are evidence;
the current script cannot restore every prior identity, tag, SKU, network,
secret-reference, or workload setting from them. If what-if shows such changes,
require a resource-specific restoration plan before mutation.

Do not delete the resource group, identities, shares, files, role assignments,
app registration, or images as part of this test. Remove only exact temporary
files created under `$evidenceRoot` after the evidence has been retained
according to policy:

```powershell
# Only after reviewing the resolved path:
$evidenceRoot
Remove-Item -LiteralPath $evidenceRoot -Recurse
```

Known limitations:

- File-backed metadata supports one web replica, not concurrent writers.
- Existing resource adoption converges declared settings; adopting web/job
  replaces their user-assigned identity set.
- Reused resources must be same-region, compatible, and dedicated.
- Private networking for ACR, storage, Foundry, and Speech is not implemented.
- Azure Files environment storage uses an account key internally; it is not an
  output.
- Private cloud render invocation/fault injection is partly manual.
- Entra secret rotation and tenant policy remain operator responsibilities.
- `Start-Local.ps1` reports the npm wrapper PID. Cleanup stops only that exact
  PID and verifies the listener is gone; a surviving child listener is a test
  blocker until the launcher owns and returns the actual server process.
- Local checks and Bicep compilation do not prove live Azure behavior.

## Agent kickoff prompt

```text
Work in Wwwsylvia/auto-present at origin/localhost-azure from an unsandboxed
session. Follow docs/azure-integration-testing.md exactly. Start with local
validation and read-only inventory in subscription
edd0c578-a7c3-4a61-9536-63273eb9bc9b, resource group
rg-idea2impact-806d03f5. Re-discover all resource names and do not treat the
documented inventory as defaults. Run a complete private-ingress Bicep what-if
with explicit existing names and immutable image, save non-secret evidence
outside the repo, then STOP and request human approval. Make no Azure mutation
before approval, enable no external ingress during adoption testing, print no
secret, delete no Azure resource, and stop only process IDs returned by the
launcher. After approval, execute the private adoption, Azure-backed localhost,
private cloud render, and separately gated Entra phases; report actual evidence
and limitations without claiming unverified behavior.
```
