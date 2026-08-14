# Build and launch Idea2Impact

## Operating model

Idea2Impact is a localhost-based product. The Next.js website runs on the
developer's Windows machine and is opened through `http://localhost`. Azure is
used only for server-side Microsoft Foundry generation, Azure AI Speech,
resource storage, container images, and optional render-job execution.

The provisioned web Container App is not the product entry point. It has ingress
disabled, no public or private FQDN, and zero minimum replicas. Building the
application does not publish a website to Azure.

## Prerequisites

- Windows PowerShell 7
- Git
- Node.js 22 or newer
- npm 11 or newer
- FFmpeg and ffprobe available on `PATH`
- Azure CLI for Foundry and Speech mode
- Access to the provisioned Azure subscription and the required Foundry and
  Speech roles

Verify the local tools:

```powershell
node --version
npm --version
ffmpeg -version
ffprobe -version
az version
```

## Install dependencies

```powershell
# Run from the current deployment-v1 checkout
npm install
```

`npm install` is intentional. The repository can be used from Windows while the
container image targets Linux, and npm must resolve platform-specific optional
packages for the current machine.

The `deployment-v1` branch currently has no remote upstream. A fresh clone
cannot select it until that branch is published.

## Fastest Azure-backed launch

Authenticate once, then use the checked-in launcher:

```powershell
az login
az account set --subscription edd0c578-a7c3-4a61-9536-63273eb9bc9b
.\scripts\Start-Local.ps1
```

The launcher:

1. Checks Node.js, npm, FFmpeg, and ffprobe.
2. Verifies the Azure CLI session for Azure-backed mode.
3. Applies the provisioned, non-secret Foundry and Speech endpoints.
4. Uses local file persistence and local rendering by default.
5. Starts Next.js in the background.
6. Waits up to 60 seconds for `/api/health`.
7. Opens `http://localhost:3000`.

Common options:

```powershell
# Use another localhost port
.\scripts\Start-Local.ps1 -Port 3002

# Store projects and renders in a chosen local directory
.\scripts\Start-Local.ps1 -DataDirectory C:\idea2impact-data

# Skip the launcher's provisioned Foundry and Speech settings
.\scripts\Start-Local.ps1 -DemoMode

# Start without opening the default browser
.\scripts\Start-Local.ps1 -NoBrowser
```

`-DemoMode` does not clear Foundry or Speech values already present in the
calling shell or `.env.local`. Remove those values when a fully offline demo is
required.

Only one Next.js development server can use a working tree at a time. If the
launcher reports that Idea2Impact is already running, use the shown URL or stop
that process before rebuilding.

## Build an optimized localhost server

Build and launch production mode in one command:

```powershell
.\scripts\Start-Local.ps1 -Build
```

`-Build` runs `npm run build`, starts `next start`, waits for health, and opens
the localhost URL. The build output remains in `.next` on the local machine.
After a successful build, launch it again without rebuilding:

```powershell
.\scripts\Start-Local.ps1 -Production
```

Stop the currently running Idea2Impact process before rebuilding. The launcher
refuses to build over a live server on the selected port.

## Manual development launch

Copy the environment template and fill in the non-secret service configuration:

```powershell
Copy-Item .env.example .env.local
npm run dev
```

For Azure-backed local operation, set:

```dotenv
FOUNDRY_PROJECT_ENDPOINT=https://idea2impact-xtfdg4bmi4v2m-ai.services.ai.azure.com/api/projects/idea2impact-project
FOUNDRY_MODEL_DEPLOYMENT=gpt-5-4-mini
AZURE_SPEECH_REGION=eastus2
AZURE_SPEECH_ENDPOINT=https://idea2impact-xtfdg4bmi4v2m-speech.cognitiveservices.azure.com/
AZURE_SPEECH_USE_MANAGED_IDENTITY=true
AZURE_SPEECH_VOICE=en-US-AvaMultilingualNeural
IDEA2IMPACT_DATA_DIR=C:\idea2impact-data
RENDER_EXECUTION_MODE=local
```

Do not add credentials to `.env.local`. `DefaultAzureCredential` uses the
current `az login` session.

## Manual production build and launch

```powershell
npm run build
$env:PORT = '3000'
npm run start
```

Next.js loads `.env.local` for the local process. Production mode means an
optimized local Next.js build; it does not mean a publicly hosted deployment.

## Verify the running product

Open `http://localhost:3000` and check the health endpoint:

```powershell
Invoke-RestMethod http://localhost:3000/api/health | ConvertTo-Json -Depth 4
```

Expected Azure-backed response:

```json
{
  "status": "ok",
  "services": {
    "foundry": true,
    "renderMode": "local",
    "speech": true
  }
}
```

Run repository validation separately:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

## Data and generated output

With no override, projects, uploads, manifests, status, and videos are written
under `.data`. Set `-DataDirectory` or `IDEA2IMPACT_DATA_DIR` to preserve a
different local data set. Do not commit generated media or local environment
files.

## Troubleshooting

- **Azure CLI is not authenticated:** run `az login`, select the documented
  subscription, and retry.
- **Foundry or Speech is false in health:** confirm the launcher is not using
  `-DemoMode` and verify the Azure role assignments in the
  [Azure runbook](azure-runbook.md).
- **Port already in use:** pass `-Port 3002` or stop the process identified by
  the launcher.
- **Production build not found:** use `-Build` once before `-Production`.
- **Final rendering is unavailable in demo mode:** Azure Speech is required for
  narrated final MP4 output.
- **FFmpeg is missing:** install FFmpeg and ensure both `ffmpeg` and `ffprobe`
  resolve from the current terminal.
