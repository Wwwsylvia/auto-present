# Local build and operation

## Operating boundary

Idea2Impact is a single-user, localhost-only application. Both development and built launch modes bind the web server to `127.0.0.1`. API routes require the request URL and `Host` header to use `localhost`, `127.0.0.1`, or `[::1]`, and reject cross-origin/cross-site browser requests. The web process and render worker share a local data directory; neither process exposes storage directly. Microsoft Foundry, Azure AI Speech, and GitHub are contacted only through outbound server-side requests.

Do not deploy this MVP, bind it to a LAN/public interface, place it behind public ingress, access it through a custom hostname (even one resolving to loopback), or publish `IDEA2IMPACT_DATA_DIR`.

## Prerequisites

- Node.js 22 or later
- npm 11 or later
- FFmpeg and FFprobe on `PATH`
- Optional: Azure CLI login for passwordless Foundry or Speech; `.env.local` service configuration as needed

## First-time setup

From the repository root:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run preflight
```

`npm ci` restores the exact locked dependencies. The preflight requires Node.js, FFmpeg, and FFprobe. It reports Azure CLI and service configuration as warnings because deterministic generation and silent previews do not require Azure; Azure CLI is also unnecessary when Speech uses `AZURE_SPEECH_KEY`.

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

Data defaults to `.data` and can be relocated with `IDEA2IMPACT_DATA_DIR`. Active project data persists between launches. Editing or replacing a demo clip revokes in-flight render leases before stale output is removed. Replaced-upload cleanup is best effort so a filesystem cleanup failure cannot roll project metadata back to a file that no longer exists; any warned orphan can be removed when the application is stopped. For complete erasure, stop the application and delete the configured data directory.
