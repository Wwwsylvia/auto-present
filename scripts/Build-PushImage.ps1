[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$SubscriptionId,

    [Parameter(Mandatory)]
    [string]$ResourceGroupName,

    [string]$RegistryName,

    [string]$WebContainerAppName,

    [string]$RenderJobName,

    [string]$ImageRepository = 'idea2impact',

    [string]$ImageTag = (Get-Date -Format 'yyyyMMddHHmmss'),

    [string]$DeploymentName = 'idea2impact-infra',

    [string]$Dockerfile = 'Dockerfile',

    [switch]$SkipWorkloadUpdate
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$env:PYTHONUTF8 = '1'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

function Invoke-Az {
    param([Parameter(ValueFromRemainingArguments)][string[]]$Arguments)

    & az @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI failed: az $($Arguments[0..([Math]::Min(2, $Arguments.Count - 1))] -join ' ')"
    }
}

Invoke-Az account set --subscription $SubscriptionId --only-show-errors

if ([string]::IsNullOrWhiteSpace($RegistryName) -or
    [string]::IsNullOrWhiteSpace($WebContainerAppName) -or
    [string]::IsNullOrWhiteSpace($RenderJobName)) {
    $outputsJson = (& az deployment group show `
        --name $DeploymentName `
        --resource-group $ResourceGroupName `
        --subscription $SubscriptionId `
        --query properties.outputs `
        --output json `
        --only-show-errors)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read outputs from deployment '$DeploymentName'. Pass resource names explicitly."
    }
    $outputs = $outputsJson | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace($RegistryName)) {
        $RegistryName = $outputs.registryName.value
    }
    if ([string]::IsNullOrWhiteSpace($WebContainerAppName)) {
        $WebContainerAppName = $outputs.webContainerAppName.value
    }
    if ([string]::IsNullOrWhiteSpace($RenderJobName)) {
        $RenderJobName = $outputs.renderJobName.value
    }
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dockerfilePath = Join-Path $repositoryRoot $Dockerfile
if (-not (Test-Path -LiteralPath $dockerfilePath)) {
    throw "Dockerfile not found at $dockerfilePath"
}

$runId = (& az acr build `
        --registry $RegistryName `
        --subscription $SubscriptionId `
        --image "${ImageRepository}:$ImageTag" `
        --file $dockerfilePath `
        $repositoryRoot `
        --no-logs `
        --only-show-errors `
        --query runId `
        --output tsv)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($runId)) {
    throw 'Unable to queue the ACR image build.'
}

$deadline = (Get-Date).AddMinutes(30)
do {
    Start-Sleep -Seconds 15
    $runStatus = (& az acr task show-run `
            --registry $RegistryName `
            --subscription $SubscriptionId `
            --run-id $runId `
            --query status `
            --output tsv `
            --only-show-errors)
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to read ACR build '$runId'."
    }
    if ($runStatus -in @('Failed', 'Canceled', 'Error', 'Timeout')) {
        throw "ACR build '$runId' ended with status '$runStatus'."
    }
}
while ($runStatus -ne 'Succeeded' -and (Get-Date) -lt $deadline)

if ($runStatus -ne 'Succeeded') {
    throw "ACR build '$runId' did not complete within 30 minutes."
}

$loginServer = (& az acr show `
    --name $RegistryName `
    --subscription $SubscriptionId `
    --query loginServer `
    --output tsv `
    --only-show-errors)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($loginServer)) {
    throw 'Unable to resolve the registry login server.'
}
$image = "$loginServer/${ImageRepository}:$ImageTag"

if (-not $SkipWorkloadUpdate) {
    Invoke-Az containerapp update `
        --name $WebContainerAppName `
        --resource-group $ResourceGroupName `
        --subscription $SubscriptionId `
        --image $image `
        --only-show-errors `
        --output none

    Invoke-Az containerapp job update `
        --name $RenderJobName `
        --resource-group $ResourceGroupName `
        --subscription $SubscriptionId `
        --image $image `
        --only-show-errors `
        --output none
}

[pscustomobject]@{
    RegistryName        = $RegistryName
    Image               = $image
    WebContainerAppName = $WebContainerAppName
    RenderJobName       = $RenderJobName
    WorkloadsUpdated    = -not $SkipWorkloadUpdate
}
