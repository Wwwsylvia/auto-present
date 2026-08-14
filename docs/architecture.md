# Architecture

## Runtime boundaries

- **Loopback-only Next.js web application:** project workflow, editor, API routes, validation, and durable job enqueueing. It binds only to `127.0.0.1`.
- **Microsoft Foundry:** model inference for initial generation and contextual typed patches. `DefaultAzureCredential` keeps credentials server-side.
- **GitHub:** bounded public metadata and selected manifest/README evidence. Repository content is untrusted data and is never inserted into system instructions.
- **Azure AI Speech:** outbound, server-side per-slide narration using passwordless Azure CLI identity by default.
- **Local render worker:** a separate process atomically claims durable jobs, synthesizes narration, invokes FFmpeg, and persists progress. Transient failures receive three bounded attempts before manual retry.
- **FFmpeg/FFprobe:** deterministic slide composition, validated optional demo footage, audio, sentence-level captions, MP4 encoding, and media verification.
- **Persistence:** atomic JSON snapshots, durable queue records, and local file assets for this single-user MVP under `IDEA2IMPACT_DATA_DIR`.

## Data flow

1. The brief is validated with Zod and persisted.
2. Optional GitHub evidence is normalized, bounded to 24,000 characters, and stored with commit identity.
3. Foundry receives the brief and bounded evidence and returns JSON that must satisfy the presentation schema.
4. Every direct or AI edit creates an immutable revision. Approval records a specific revision ID.
5. Rendering accepts only the currently approved deck revision.
6. The API persists an immutable render job and returns immediately; the browser polls status.
7. The local worker atomically claims the job. Slide visuals and sentence-level captions are generated deterministically, Speech audio is synthesized per slide, and FFmpeg joins the immutable segments.
8. Editing marks incompatible render jobs stale and removes obsolete output.

## Local topology

Run `npm run dev` to supervise the loopback Next.js process and the separate local worker. They coordinate only through the configured local data directory. Azure Foundry and Speech are outbound inference dependencies; the application does not provision resources, deploy containers, create ingress, expose storage URLs, or listen beyond loopback.

## Security properties

- Foundry and Speech secrets never cross the browser boundary.
- Mutation routes reject non-loopback, cross-origin, and cross-site requests.
- Public GitHub URLs are restricted to canonical repository roots.
- GitHub ingestion uses a small allowlist and hard context limit.
- Model responses and patches are schema validated.
- Render downloads validate UUID-shaped identifiers.
- Uploads enforce allowed MIME types and a 100 MB limit, then require successful FFprobe validation before atomic promotion.
- Errors returned to the browser redact credentials, endpoints, and local paths.
