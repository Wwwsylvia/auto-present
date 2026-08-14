# Local build and operation

## Operating boundary

Idea2Impact is a single-user, localhost-only application. Both development and built launch modes bind the web server to `127.0.0.1`. The web process and render worker share a local data directory; neither process exposes storage directly. Microsoft Foundry, Azure AI Speech, and GitHub are contacted only through outbound server-side requests.

Do not deploy this MVP, bind it to a LAN/public interface, place it behind public ingress, or publish `IDEA2IMPACT_DATA_DIR`.

## Prerequisites

- Node.js 22 or later
- npm 11 or later
- FFmpeg and FFprobe on `PATH`
- Optional: Azure CLI login and `.env.local` configuration for Foundry and Speech

## First-time setup

From the repository root:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run preflight
```

`npm ci` restores the exact locked dependencies. The preflight checks Node.js, FFmpeg, FFprobe, Azure CLI availability, and reports missing optional service configuration without printing credentials.

## Development launch

```powershell
npm run dev
```

Open `http://127.0.0.1:3000`.

This one command supervises the loopback Next.js development server and the durable local render worker. Press `Ctrl+C` to stop both. For independent debugging:

```powershell
# Terminal 1
npm run dev:web

# Terminal 2
npm run worker
```

## Optimized local build and launch

Build:

```powershell
npm run build
```

Launch the completed build:

```powershell
npm start
```

Open `http://127.0.0.1:3000`. `npm start` launches both the optimized loopback web server and the same local worker. It does not deploy or expose the application.

## Validation

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

With real Foundry and Speech configuration available, run the complete two-minute product acceptance:

```powershell
npm run acceptance:self
```

## Local data

Data defaults to `.data` and can be relocated with `IDEA2IMPACT_DATA_DIR`. Active project data persists between launches. Replaced uploads, stale render output, failed partial output, and temporary files are cleaned automatically. For complete erasure, stop the application and delete the configured data directory.
