[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 3000,

    [string]$DataDirectory,

    [switch]$AzureBacked,

    [switch]$DemoMode,

    [string]$SubscriptionId,

    [string]$ResourceGroupName,

    [string]$DeploymentName = 'idea2impact-infra',

    [string]$FoundryProjectEndpoint,

    [string]$FoundryModelDeployment,

    [string]$SpeechEndpoint,

    [string]$SpeechRegion,

    [string]$SpeechVoice = 'en-US-AvaMultilingualNeural',

    [switch]$Production,

    [switch]$Build,

    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($AzureBacked -and $DemoMode) {
    throw 'Choose either -AzureBacked or -DemoMode.'
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$url = "http://127.0.0.1:$Port"
$healthUrl = "$url/api/health"

foreach ($command in @('node', 'npm', 'ffmpeg', 'ffprobe')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command '$command' was not found on PATH."
    }
}

if ([string]::IsNullOrWhiteSpace($DataDirectory)) {
    $DataDirectory = Join-Path $repositoryRoot '.data'
}
elseif (-not [System.IO.Path]::IsPathRooted($DataDirectory)) {
    $DataDirectory = Join-Path $repositoryRoot $DataDirectory
}
$DataDirectory = [System.IO.Path]::GetFullPath($DataDirectory)
[System.IO.Directory]::CreateDirectory($DataDirectory) | Out-Null

if ($AzureBacked) {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw 'Azure CLI is required for Azure-backed mode.'
    }
    & az account show --output none --only-show-errors
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI is not authenticated. Run 'az login'."
    }

    $hasExplicitServiceConfiguration =
        -not [string]::IsNullOrWhiteSpace($FoundryProjectEndpoint) -and
        -not [string]::IsNullOrWhiteSpace($FoundryModelDeployment) -and
        -not [string]::IsNullOrWhiteSpace($SpeechEndpoint) -and
        -not [string]::IsNullOrWhiteSpace($SpeechRegion)

    if (-not $hasExplicitServiceConfiguration) {
        if ([string]::IsNullOrWhiteSpace($SubscriptionId) -or
            [string]::IsNullOrWhiteSpace($ResourceGroupName)) {
            throw 'Azure-backed mode requires complete service parameters or -SubscriptionId and -ResourceGroupName to resolve deployment outputs.'
        }
        $outputsJson = (& az deployment group show `
            --name $DeploymentName `
            --resource-group $ResourceGroupName `
            --subscription $SubscriptionId `
            --query properties.outputs `
            --output json `
            --only-show-errors)
        if ($LASTEXITCODE -ne 0) {
            throw "Could not read outputs from deployment '$DeploymentName'."
        }
        $outputs = $outputsJson | ConvertFrom-Json
        $FoundryProjectEndpoint = $outputs.foundryProjectEndpoint.value
        $FoundryModelDeployment = $outputs.modelDeploymentName.value
        $SpeechEndpoint = $outputs.speechEndpoint.value
        $SpeechRegion = $outputs.speechRegion.value
    }

    $env:FOUNDRY_PROJECT_ENDPOINT = $FoundryProjectEndpoint
    $env:FOUNDRY_MODEL_DEPLOYMENT = $FoundryModelDeployment
    $env:AZURE_SPEECH_ENDPOINT = $SpeechEndpoint
    $env:AZURE_SPEECH_REGION = $SpeechRegion
    $env:AZURE_SPEECH_USE_MANAGED_IDENTITY = 'true'
    $env:AZURE_SPEECH_VOICE = $SpeechVoice
}
else {
    foreach ($name in @(
        'FOUNDRY_PROJECT_ENDPOINT',
        'FOUNDRY_MODEL_DEPLOYMENT',
        'AZURE_SPEECH_ENDPOINT',
        'AZURE_SPEECH_REGION',
        'AZURE_SPEECH_KEY',
        'AZURE_SPEECH_USE_MANAGED_IDENTITY'
    )) {
        Set-Item "Env:$name" -Value ''
    }
}

$env:APP_HOSTING_MODE = 'local'
$env:IDEA2IMPACT_DATA_DIR = $DataDirectory
$env:RENDER_EXECUTION_MODE = 'local'
$env:PORT = $Port.ToString()

$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
    $unsafeListeners = @($listeners | Where-Object {
        try {
            -not [System.Net.IPAddress]::IsLoopback(
                [System.Net.IPAddress]::Parse($_.LocalAddress)
            )
        }
        catch {
            $true
        }
    })
    if ($unsafeListeners.Count -gt 0) {
        $addresses = ($unsafeListeners.LocalAddress | Sort-Object -Unique) -join ', '
        throw "Port $Port has a non-loopback listener ($addresses). Stop it before launching the unauthenticated local app."
    }
    if ($Build) {
        throw "Port $Port is in use. Stop the existing process before rebuilding."
    }
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
    if ($health.status -eq 'ok') {
        Write-Host "Idea2Impact is already running at $url"
        if (-not $NoBrowser) { Start-Process $url }
        return
    }
    $processIds = ($listeners.OwningProcess | Sort-Object -Unique) -join ', '
    throw "Port $Port is already used by process $processIds."
}

$useProductionServer = $Production -or $Build
if ($Build) {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'The production build failed.' }
}
elseif ($Production -and -not (Test-Path -LiteralPath (Join-Path $repositoryRoot '.next\BUILD_ID'))) {
    throw "No production build was found. Run with -Build first."
}

$npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if ([string]::IsNullOrWhiteSpace($npmCommand)) {
    $npmCommand = (Get-Command npm).Source
}
$npmScript = $useProductionServer ? 'start:local' : 'dev:local'
$process = Start-Process `
    -FilePath $npmCommand `
    -ArgumentList @('run', $npmScript, '--', '--port', $Port) `
    -WorkingDirectory $repositoryRoot `
    -PassThru

$deadline = (Get-Date).AddSeconds(60)
do {
    Start-Sleep -Milliseconds 500
    if ($process.HasExited) {
        throw "Idea2Impact exited during startup with code $($process.ExitCode)."
    }
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
    }
    catch {
        $health = $null
    }
}
while ($null -eq $health -and (Get-Date) -lt $deadline)

if ($null -eq $health -or $health.status -ne 'ok') {
    throw "Idea2Impact did not become healthy within 60 seconds. Process ID: $($process.Id)."
}

Write-Host "Idea2Impact is running at $url"
Write-Host "Process ID: $($process.Id)"
Write-Host "Data directory: $DataDirectory"
Write-Host "Mode: $($AzureBacked ? 'Azure-backed localhost' : 'local demo')"
Write-Host "Server: $($useProductionServer ? 'production-local' : 'development-local')"

if (-not $NoBrowser) {
    Start-Process $url
}
