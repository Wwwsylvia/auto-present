[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$SubscriptionId,

    [ValidatePattern('^[a-z0-9-]{2,12}$')]
    [string]$NamePrefix = 'idea2impact',

    [string]$ResourceGroupName,

    [ValidateSet('eastus2')]
    [string]$Location = 'eastus2',

    [string]$ImageRepository = 'idea2impact',

    [string]$ImageTag = 'latest',

    [string]$ContainerImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest',

    [switch]$EnableExternalIngress,

    [ValidateRange(1, 1000)]
    [int]$ModelCapacity = 10,

    [string]$DeploymentName = 'idea2impact-infra',

    [string[]]$Tags = @('workload=idea2impact', 'managedBy=script')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Az {
    param([Parameter(ValueFromRemainingArguments)][string[]]$Arguments)

    & az @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI failed: az $($Arguments[0..([Math]::Min(2, $Arguments.Count - 1))] -join ' ')"
    }
}

function Get-StableSuffix {
    param([string]$Value)

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        return ([Convert]::ToHexString($sha.ComputeHash($bytes))).Substring(0, 8).ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

$templateFile = Join-Path $PSScriptRoot '..\infra\main.bicep'
if (-not (Test-Path -LiteralPath $templateFile)) {
    throw "Bicep template not found at $templateFile"
}

Invoke-Az account set --subscription $SubscriptionId --only-show-errors
$resolvedSubscriptionId = (& az account show --query id --output tsv --only-show-errors)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($resolvedSubscriptionId)) {
    throw 'Unable to resolve the selected Azure subscription.'
}

if ([string]::IsNullOrWhiteSpace($ResourceGroupName)) {
    $suffix = Get-StableSuffix -Value "$resolvedSubscriptionId|$NamePrefix|$Location"
    $ResourceGroupName = "rg-$NamePrefix-$suffix"
}

Invoke-Az group create `
    --name $ResourceGroupName `
    --location $Location `
    --subscription $resolvedSubscriptionId `
    --tags @Tags `
    --only-show-errors `
    --output none

Invoke-Az bicep build --file $templateFile --stdout --only-show-errors | Out-Null

$deploymentJson = (& az deployment group create `
    --name $DeploymentName `
    --resource-group $ResourceGroupName `
    --subscription $resolvedSubscriptionId `
    --template-file $templateFile `
    --parameters `
        "namePrefix=$NamePrefix" `
        "location=$Location" `
        "imageRepository=$ImageRepository" `
        "imageTag=$ImageTag" `
        "containerImage=$ContainerImage" `
        "enableExternalIngress=$($EnableExternalIngress.IsPresent.ToString().ToLowerInvariant())" `
        "modelCapacity=$ModelCapacity" `
    --query properties.outputs `
    --output json `
    --only-show-errors)
if ($LASTEXITCODE -ne 0) {
    throw 'Azure resource group deployment failed.'
}

$outputs = $deploymentJson | ConvertFrom-Json
[pscustomobject]@{
    SubscriptionId       = $resolvedSubscriptionId
    ResourceGroupName    = $ResourceGroupName
    RegistryName         = $outputs.registryName.value
    RegistryLoginServer  = $outputs.registryLoginServer.value
    EnvironmentName      = $outputs.containerAppsEnvironmentName.value
    StorageAccountName   = $outputs.storageAccountName.value
    FoundryAccountName   = $outputs.foundryAccountName.value
    FoundryProjectName   = $outputs.foundryProjectName.value
    FoundryProjectHost   = ([uri]$outputs.foundryProjectEndpoint.value).Host
    ModelDeploymentName  = $outputs.modelDeploymentName.value
    SpeechAccountName    = $outputs.speechAccountName.value
    WebContainerAppName  = $outputs.webContainerAppName.value
    WebHost              = $outputs.webHost.value
    RenderJobName        = $outputs.renderJobName.value
}
