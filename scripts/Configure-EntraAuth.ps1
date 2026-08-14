[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$SubscriptionId,

    [Parameter(Mandatory)]
    [string]$ResourceGroupName,

    [string]$ContainerAppName,

    [string]$ApplicationDisplayName = 'Idea2Impact',

    [string]$DeploymentName = 'idea2impact-infra',

    [ValidateRange(1, 24)]
    [int]$SecretLifetimeMonths = 12,

    [switch]$AllowAnonymous
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

Invoke-Az account set --subscription $SubscriptionId --only-show-errors

if ([string]::IsNullOrWhiteSpace($ContainerAppName)) {
    $ContainerAppName = (& az deployment group show `
        --name $DeploymentName `
        --resource-group $ResourceGroupName `
        --subscription $SubscriptionId `
        --query properties.outputs.webContainerAppName.value `
        --output tsv `
        --only-show-errors)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ContainerAppName)) {
        throw "Could not resolve the web app from deployment '$DeploymentName'."
    }
}

$hostName = (& az containerapp show `
    --name $ContainerAppName `
    --resource-group $ResourceGroupName `
    --subscription $SubscriptionId `
    --query properties.configuration.ingress.fqdn `
    --output tsv `
    --only-show-errors)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($hostName)) {
    throw 'Unable to resolve the Container App host name.'
}
$redirectUri = "https://$hostName/.auth/login/aad/callback"

$matchingAppsJson = (& az ad app list `
    --display-name $ApplicationDisplayName `
    --query "[?displayName == '$ApplicationDisplayName'].{appId:appId,id:id}" `
    --output json `
    --only-show-errors)
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to query Microsoft Entra applications.'
}
$matchingApps = @($matchingAppsJson | ConvertFrom-Json)
if ($matchingApps.Count -gt 1) {
    throw "More than one Entra application is named '$ApplicationDisplayName'. Use a unique display name."
}

if ($matchingApps.Count -eq 0) {
    $appJson = (& az ad app create `
        --display-name $ApplicationDisplayName `
        --sign-in-audience AzureADMyOrg `
        --web-redirect-uris $redirectUri `
        --enable-id-token-issuance true `
        --output json `
        --only-show-errors)
    if ($LASTEXITCODE -ne 0) {
        throw 'Microsoft Entra application creation failed.'
    }
    $app = $appJson | ConvertFrom-Json
    $clientId = $app.appId
    $objectId = $app.id
}
else {
    $clientId = $matchingApps[0].appId
    $objectId = $matchingApps[0].id
    Invoke-Az ad app update `
        --id $objectId `
        --web-redirect-uris $redirectUri `
        --enable-id-token-issuance true `
        --only-show-errors `
        --output none
}

$servicePrincipalId = (& az ad sp show `
    --id $clientId `
    --query id `
    --output tsv `
    --only-show-errors 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($servicePrincipalId)) {
    $servicePrincipalId = (& az ad sp create `
        --id $clientId `
        --query id `
        --output tsv `
        --only-show-errors)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($servicePrincipalId)) {
        throw 'Unable to create the Microsoft Entra service principal.'
    }
}

$tenantId = (& az account show --query tenantId --output tsv --only-show-errors)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($tenantId)) {
    throw 'Unable to resolve the Microsoft Entra tenant.'
}

$credentialDisplayName = 'idea2impact-containerapps-auth'
$endDate = (Get-Date).ToUniversalTime().AddMonths($SecretLifetimeMonths).ToString('yyyy-MM-ddTHH:mm:ssZ')
$credentialJson = (& az ad app credential reset `
    --id $objectId `
    --append `
    --display-name $credentialDisplayName `
    --end-date $endDate `
    --output json `
    --only-show-errors)
if ($LASTEXITCODE -ne 0) {
    throw 'Microsoft Entra application credential creation failed.'
}
$credential = $credentialJson | ConvertFrom-Json
$clientSecret = $credential.password
if ([string]::IsNullOrWhiteSpace($clientSecret)) {
    throw 'Microsoft Entra did not return a new application credential.'
}
$credentialsJson = (& az ad app credential list `
    --id $objectId `
    --query "[?displayName == '$credentialDisplayName'].{keyId:keyId,startDateTime:startDateTime}" `
    --output json `
    --only-show-errors)
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to identify the newly created Microsoft Entra credential.'
}
$credentials = @($credentialsJson | ConvertFrom-Json)
$currentCredential = $credentials | Sort-Object startDateTime -Descending | Select-Object -First 1
if ($null -eq $currentCredential -or [string]::IsNullOrWhiteSpace($currentCredential.keyId)) {
    throw 'Unable to identify the newly created Microsoft Entra credential.'
}

try {
    Invoke-Az containerapp auth microsoft update `
        --name $ContainerAppName `
        --resource-group $ResourceGroupName `
        --subscription $SubscriptionId `
        --client-id $clientId `
        --client-secret $clientSecret `
        --issuer "https://login.microsoftonline.com/$tenantId/v2.0" `
        --yes `
        --only-show-errors `
        --output none

    $unauthenticatedAction = if ($AllowAnonymous) { 'AllowAnonymous' } else { 'RedirectToLoginPage' }
    Invoke-Az containerapp auth update `
        --name $ContainerAppName `
        --resource-group $ResourceGroupName `
        --subscription $SubscriptionId `
        --enabled true `
        --redirect-provider AzureActiveDirectory `
        --unauthenticated-client-action $unauthenticatedAction `
        --token-store true `
        --yes `
        --only-show-errors `
        --output none

    foreach ($oldCredential in $credentials) {
        if ($oldCredential.keyId -ne $currentCredential.keyId) {
            Invoke-Az ad app credential delete `
                --id $objectId `
                --key-id $oldCredential.keyId `
                --only-show-errors `
                --output none
        }
    }
}
finally {
    $clientSecret = $null
    $credential = $null
    $credentialJson = $null
}

[pscustomobject]@{
    ApplicationDisplayName = $ApplicationDisplayName
    ApplicationClientId    = $clientId
    TenantId               = $tenantId
    ContainerAppName       = $ContainerAppName
    Host                   = $hostName
    RedirectUri            = $redirectUri
    AuthenticationRequired = -not $AllowAnonymous
}
