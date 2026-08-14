[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 3000,

    [string]$DataDirectory,

    [switch]$DemoMode,

    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$url = "http://localhost:$Port"
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

if (-not $DemoMode) {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw "Azure CLI is required for Azure-backed mode. Install it or pass -DemoMode."
    }

    & az account show --output none --only-show-errors
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI is not authenticated. Run 'az login' or pass -DemoMode."
    }

    $env:FOUNDRY_PROJECT_ENDPOINT = 'https://idea2impact-xtfdg4bmi4v2m-ai.services.ai.azure.com/api/projects/idea2impact-project'
    $env:FOUNDRY_MODEL_DEPLOYMENT = 'gpt-5-4-mini'
    $env:AZURE_SPEECH_REGION = 'eastus2'
    $env:AZURE_SPEECH_ENDPOINT = 'https://idea2impact-xtfdg4bmi4v2m-speech.cognitiveservices.azure.com/'
    $env:AZURE_SPEECH_USE_MANAGED_IDENTITY = 'true'
    $env:AZURE_SPEECH_VOICE = 'en-US-AvaMultilingualNeural'
}

$env:IDEA2IMPACT_DATA_DIR = $DataDirectory
$env:RENDER_EXECUTION_MODE = 'local'
$env:PORT = $Port.ToString()

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($listener) {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
    if ($health.status -eq 'ok') {
        Write-Host "Idea2Impact is already running at $url"
        if (-not $NoBrowser) {
            Start-Process $url
        }
        return
    }
    throw "Port $Port is already used by process $($listener.OwningProcess). Choose another port."
}

$npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if ([string]::IsNullOrWhiteSpace($npmCommand)) {
    $npmCommand = (Get-Command npm).Source
}

$process = Start-Process `
    -FilePath $npmCommand `
    -ArgumentList @('run', 'dev') `
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
Write-Host "Foundry: $($health.services.foundry); Speech: $($health.services.speech); Render mode: $($health.services.renderMode)"

if (-not $NoBrowser) {
    Start-Process $url
}
