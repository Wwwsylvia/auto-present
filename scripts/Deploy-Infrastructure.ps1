[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$SubscriptionId,

    [ValidatePattern('^[a-z0-9-]{2,12}$')]
    [string]$NamePrefix = 'idea2impact',

    [string]$ResourceGroupName,

    [string]$Location = 'eastus2',

    [string]$ContainerImage,

    [switch]$Bootstrap,

    [switch]$EnableExternalIngress,

    [string]$EntraTenantId,

    [string]$EntraClientId,

    [System.Security.SecureString]$EntraClientSecret,

    [string]$LocalOperatorPrincipalId,

    [ValidateSet('User', 'ServicePrincipal')]
    [string]$LocalOperatorPrincipalType = 'User',

    [string]$FoundryProjectName = 'idea2impact-project',

    [string]$ModelDeploymentName = 'gpt-5-4-mini',

    [string]$ModelName = 'gpt-5.4-mini',

    [string]$ModelVersion = '2026-03-17',

    [switch]$AdoptExistingResources,

    [string]$RegistryName,

    [string]$LogAnalyticsWorkspaceName,

    [string]$StorageAccountName,

    [string]$StorageFileShareName = 'idea2impact-data',

    [string]$ContainerAppsEnvironmentName,

    [string]$FoundryAccountName,

    [string]$SpeechAccountName,

    [string]$WebContainerAppName,

    [string]$RenderContainerAppJobName,

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

function Assert-ResourceNameIntent {
    param(
        [string]$Name,
        [string]$ResourceType,
        [string]$ExpectedKind
    )

    if ([string]::IsNullOrWhiteSpace($Name)) { return }
    $resourceJson = (& az resource show `
        --name $Name `
        --resource-type $ResourceType `
        --resource-group $ResourceGroupName `
        --subscription $resolvedSubscriptionId `
        --query '{location:location,kind:kind}' `
        --output json `
        --only-show-errors)
    $exists = $LASTEXITCODE -eq 0
    if ($exists -and -not $AdoptExistingResources) {
        throw "Resource '$Name' already exists. Pass -AdoptExistingResources to validate and converge it."
    }
    if (-not $exists -and $AdoptExistingResources) {
        throw "Existing resource '$Name' of type '$ResourceType' was not found in '$ResourceGroupName'."
    }
    if (-not $exists) {
        return
    }
    $resource = $resourceJson | ConvertFrom-Json
    if ($resource.location -and $resource.location -ne $Location) {
        throw "Existing resource '$Name' is in '$($resource.location)', not requested location '$Location'."
    }
    if ($ExpectedKind -and $resource.kind -ne $ExpectedKind) {
        throw "Existing resource '$Name' has kind '$($resource.kind)', expected '$ExpectedKind'."
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

if ($Bootstrap -and -not [string]::IsNullOrWhiteSpace($ContainerImage)) {
    throw 'Do not combine -Bootstrap with -ContainerImage.'
}
if ($Bootstrap) {
    $ContainerImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
}
if ([string]::IsNullOrWhiteSpace($ContainerImage)) {
    $existingWebName = $WebContainerAppName
    if ([string]::IsNullOrWhiteSpace($existingWebName)) {
        $previousOutputsJson = (& az deployment group show `
            --name $DeploymentName `
            --resource-group $ResourceGroupName `
            --subscription $resolvedSubscriptionId `
            --query properties.outputs `
            --output json `
            --only-show-errors 2>$null)
        if ($LASTEXITCODE -ne 0) {
            throw 'Pass an immutable -ContainerImage for a new deployment, or use -Bootstrap explicitly.'
        }
        $previousOutputs = $previousOutputsJson | ConvertFrom-Json
        $existingWebName = $previousOutputs.webContainerAppName.value
    }
    $ContainerImage = (& az containerapp show `
        --name $existingWebName `
        --resource-group $ResourceGroupName `
        --subscription $resolvedSubscriptionId `
        --query properties.template.containers[0].image `
        --output tsv `
        --only-show-errors)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ContainerImage)) {
        throw 'Could not preserve the currently deployed image. Pass -ContainerImage explicitly.'
    }
}

Assert-ResourceNameIntent $RegistryName 'Microsoft.ContainerRegistry/registries'
Assert-ResourceNameIntent $LogAnalyticsWorkspaceName 'Microsoft.OperationalInsights/workspaces'
Assert-ResourceNameIntent $StorageAccountName 'Microsoft.Storage/storageAccounts' 'StorageV2'
Assert-ResourceNameIntent $ContainerAppsEnvironmentName 'Microsoft.App/managedEnvironments'
Assert-ResourceNameIntent $FoundryAccountName 'Microsoft.CognitiveServices/accounts' 'AIServices'
Assert-ResourceNameIntent $SpeechAccountName 'Microsoft.CognitiveServices/accounts' 'SpeechServices'
Assert-ResourceNameIntent $WebContainerAppName 'Microsoft.App/containerApps'
Assert-ResourceNameIntent $RenderContainerAppJobName 'Microsoft.App/jobs'

if ($AdoptExistingResources) {
    if (-not [string]::IsNullOrWhiteSpace($StorageAccountName)) {
        & az storage share-rm show `
            --storage-account $StorageAccountName `
            --name $StorageFileShareName `
            --resource-group $ResourceGroupName `
            --subscription $resolvedSubscriptionId `
            --output none `
            --only-show-errors
        if ($LASTEXITCODE -ne 0) {
            throw "Azure Files share '$StorageFileShareName' was not found in '$StorageAccountName'."
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($FoundryAccountName)) {
        & az cognitiveservices account deployment show `
            --name $FoundryAccountName `
            --deployment-name $ModelDeploymentName `
            --resource-group $ResourceGroupName `
            --subscription $resolvedSubscriptionId `
            --output none `
            --only-show-errors
        if ($LASTEXITCODE -ne 0) {
            throw "Model deployment '$ModelDeploymentName' was not found in Foundry account '$FoundryAccountName'."
        }
    }
}

Invoke-Az group create `
    --name $ResourceGroupName `
    --location $Location `
    --subscription $resolvedSubscriptionId `
    --tags @Tags `
    --only-show-errors `
    --output none

Invoke-Az bicep build --file $templateFile --stdout --only-show-errors | Out-Null

if ($EnableExternalIngress -and (
    [string]::IsNullOrWhiteSpace($EntraTenantId) -or
    [string]::IsNullOrWhiteSpace($EntraClientId) -or
    $null -eq $EntraClientSecret)) {
    throw 'External ingress requires -EntraTenantId, -EntraClientId, and -EntraClientSecret in the same deployment.'
}

$deploymentArguments = @(
    'deployment', 'group', 'create',
    '--name', $DeploymentName,
    '--resource-group', $ResourceGroupName,
    '--subscription', $resolvedSubscriptionId,
    '--template-file', $templateFile,
    '--parameters',
    "namePrefix=$NamePrefix",
    "location=$Location",
    "containerImage=$ContainerImage",
    "enableExternalIngress=$($EnableExternalIngress.IsPresent.ToString().ToLowerInvariant())",
    "modelCapacity=$ModelCapacity",
    "foundryProjectName=$FoundryProjectName",
    "modelDeploymentName=$ModelDeploymentName",
    "modelName=$ModelName",
    "modelVersion=$ModelVersion",
    "localOperatorPrincipalId=$LocalOperatorPrincipalId",
    "localOperatorPrincipalType=$LocalOperatorPrincipalType",
    "registryName=$RegistryName",
    "logAnalyticsWorkspaceName=$LogAnalyticsWorkspaceName",
    "storageName=$StorageAccountName",
    "storageFileShareName=$StorageFileShareName",
    "containerAppsEnvironmentName=$ContainerAppsEnvironmentName",
    "foundryAccountName=$FoundryAccountName",
    "speechAccountName=$SpeechAccountName",
    "webContainerAppName=$WebContainerAppName",
    "renderContainerAppJobName=$RenderContainerAppJobName"
)

$secretPointer = [IntPtr]::Zero
try {
    if ($EnableExternalIngress) {
        $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($EntraClientSecret)
        $plainSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
        $deploymentArguments += @(
            "entraTenantId=$EntraTenantId",
            "entraClientId=$EntraClientId",
            "entraClientSecret=$plainSecret"
        )
    }

    $deploymentArguments += @(
        '--query', 'properties.outputs',
        '--output', 'json',
        '--only-show-errors'
    )
    $deploymentJson = (& az @deploymentArguments)
    if ($LASTEXITCODE -ne 0) {
        throw 'Azure resource group deployment failed.'
    }
}
finally {
    $plainSecret = $null
    if ($secretPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    }
}

$outputs = $deploymentJson | ConvertFrom-Json

if ($EnableExternalIngress) {
    $authJson = (& az containerapp auth show `
        --name $outputs.webContainerAppName.value `
        --resource-group $ResourceGroupName `
        --subscription $resolvedSubscriptionId `
        --output json `
        --only-show-errors)
    if ($LASTEXITCODE -ne 0) {
        throw 'Entra authentication could not be verified; external ingress remains disabled.'
    }
    $auth = $authJson | ConvertFrom-Json
    $authConfig = if ($auth.properties) { $auth.properties } else { $auth }
    if ($authConfig.platform.enabled -ne $true -or
        $authConfig.globalValidation.unauthenticatedClientAction -ne 'RedirectToLoginPage' -or
        $authConfig.globalValidation.redirectToProvider -ne 'azureactivedirectory' -or
        $authConfig.identityProviders.azureActiveDirectory.enabled -ne $true -or
        $authConfig.identityProviders.azureActiveDirectory.registration.clientId -ne $EntraClientId) {
        throw 'Entra authentication is not enforcing sign-in; external ingress remains disabled.'
    }
    Invoke-Az containerapp ingress enable `
        --name $outputs.webContainerAppName.value `
        --resource-group $ResourceGroupName `
        --subscription $resolvedSubscriptionId `
        --type external `
        --target-port 3000 `
        --transport auto `
        --only-show-errors `
        --output none
}

$webStateJson = (& az containerapp show `
    --name $outputs.webContainerAppName.value `
    --resource-group $ResourceGroupName `
    --subscription $resolvedSubscriptionId `
    --query '{host:properties.configuration.ingress.fqdn,external:properties.configuration.ingress.external}' `
    --output json `
    --only-show-errors)
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to verify the final Container App ingress state.'
}
$webState = $webStateJson | ConvertFrom-Json
if ($EnableExternalIngress -and $webState.external -ne $true) {
    throw 'External ingress was requested but could not be verified.'
}
if (-not $EnableExternalIngress -and $webState.external -eq $true) {
    throw 'External ingress remained enabled unexpectedly.'
}

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
    FoundryProjectEndpoint = $outputs.foundryProjectEndpoint.value
    ModelDeploymentName  = $outputs.modelDeploymentName.value
    SpeechAccountName    = $outputs.speechAccountName.value
    SpeechEndpoint       = $outputs.speechEndpoint.value
    SpeechRegion         = $outputs.speechRegion.value
    WebContainerAppName  = $outputs.webContainerAppName.value
    WebHost              = $webState.host
    ExternalIngress      = $webState.external
    EntraAuthentication  = $outputs.entraAuthenticationEnabled.value
    RenderJobName        = $outputs.renderJobName.value
}
