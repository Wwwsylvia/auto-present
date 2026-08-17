# Build and launch

## Local demo

Requires Node.js 22+, npm 11+, FFmpeg, and ffprobe. It does not require Azure.

```powershell
npm ci
.\scripts\Start-Local.ps1
```

The launcher clears inherited Foundry/Speech settings for this process, forces
local rendering, and binds Next.js to `127.0.0.1`. Preview videos are silent;
narrated final videos require Azure Speech.

## Azure-backed localhost

Authenticate with Azure CLI and either supply service settings explicitly or
resolve them from a deployment:

```powershell
az login
.\scripts\Start-Local.ps1 -AzureBacked `
  -SubscriptionId <subscription-id> `
  -ResourceGroupName <resource-group> `
  -DeploymentName idea2impact-infra
```

The operator needs Foundry inference and Speech data-plane roles. No credential
is sent to the browser or written by the launcher. Use `-DataDirectory`,
`-Port`, and `-NoBrowser` as needed.

## Production-local

```powershell
.\scripts\Start-Local.ps1 -Build
.\scripts\Start-Local.ps1 -Production
```

These commands also bind only to `127.0.0.1`. For manual launches use
`npm run dev:local -- --port 3000` or
`npm run start:local -- --port 3000`; do not use the unrestricted `dev` or
`start` scripts for an unauthenticated local deployment.

## Configuration

Explicit environment variables remain supported:

```dotenv
APP_HOSTING_MODE=local
FOUNDRY_PROJECT_ENDPOINT=
FOUNDRY_MODEL_DEPLOYMENT=
AZURE_SPEECH_ENDPOINT=
AZURE_SPEECH_REGION=
AZURE_SPEECH_USE_MANAGED_IDENTITY=true
AZURE_SPEECH_VOICE=en-US-AvaMultilingualNeural
IDEA2IMPACT_DATA_DIR=
RENDER_EXECUTION_MODE=local
```

`APP_HOSTING_MODE=azure` is reserved for the Container App template. Setting
`RENDER_EXECUTION_MODE=container-apps-job` from localhost fails deliberately
because local paths are not shared with the worker.

## Troubleshooting

- **403 on localhost API:** use the exact `http://127.0.0.1:<port>` URL opened
  by the launcher; non-loopback Host/Origin values are rejected.
- **Foundry/Speech unavailable:** verify deployment outputs, `az account show`,
  and the operator role assignments.
- **Final rendering unavailable in demo mode:** use Azure-backed localhost or
  render a silent preview.
- **Production build missing:** run once with `-Build`.
- **Port occupied:** choose another with `-Port`.
- **Existing wildcard/LAN listener:** stop it before launch. The launcher reuses
  a process only when every listener is loopback and its launch protocol, demo
  or Azure-backed mode, development or production mode, data directory, and
  service/render fingerprint exactly match. Manual, older, or mismatched
  processes are left running; choose another port or stop the reported process
  explicitly. `-Build` always requires a free port.
