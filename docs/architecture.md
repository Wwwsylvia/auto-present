# Architecture

## Runtime boundaries

- **Next.js web application:** project workflow, editor, API routes, validation, and local orchestration.
- **Microsoft Foundry:** model inference for initial generation and contextual typed patches. `DefaultAzureCredential` keeps credentials server-side.
- **GitHub:** bounded public metadata and selected manifest/README evidence. Repository content is untrusted data and is never inserted into system instructions.
- **Azure AI Speech:** per-slide narration audio plus sentence boundary timing.
- **FFmpeg worker:** deterministic slide composition, optional demo footage, explicitly mapped narration audio, sentence captions, and MP4 encoding.
- **Persistence:** atomic JSON snapshots and file assets for this single-user MVP. Set `IDEA2IMPACT_DATA_DIR` to a mounted Azure Files volume in Container Apps.
- **Azure Container Apps Job:** manual-trigger worker execution for one immutable render manifest. The web app starts jobs through managed identity and never waits for FFmpeg.

## Data flow

1. The brief is validated with Zod and persisted.
2. Optional GitHub evidence is normalized, bounded to 24,000 characters, and stored with commit identity.
3. Foundry receives the brief and bounded evidence and returns JSON that must satisfy the presentation schema.
4. Every direct or AI edit creates an immutable revision. Approval records a specific revision ID.
5. Rendering accepts only the currently approved deck revision.
6. Rendering writes an immutable manifest and queued status to shared storage, then starts the Container Apps Job.
7. Speech audio and sentence boundaries are generated per slide. FFmpeg maps narration explicitly, pads short segments to the approved duration without truncating speech, burns timed captions, and joins the immutable segments.
8. The worker writes atomic progress/output status. The web app polls and reconciles it without allowing a stale job to become current again.
9. Editing marks completed or active render jobs stale.

## Production topology

The current operating mode runs the Next.js application on localhost and keeps Azure services available only for server-side calls. The provisioned web Container App has ingress disabled and is retained only as an optional deployment target. A manual-trigger Container Apps Job and Azure Files remain available for cloud rendering experiments. If hosted web access is intentionally enabled later, require Microsoft Entra authentication before sharing the endpoint. Store media in Blob Storage and project metadata in PostgreSQL before introducing multiple users or replicas.

## Security properties

- Foundry and Speech secrets never cross the browser boundary.
- External web ingress is disabled by default. If enabled later, Microsoft Entra authentication is required before the endpoint is shared.
- The web identity receives only Foundry inference and render-job read/start permissions.
- Public GitHub URLs are restricted to canonical repository roots.
- GitHub ingestion uses a small allowlist and hard context limit.
- Model responses and patches are schema validated.
- Render downloads validate UUID-shaped identifiers.
- Uploads enforce allowed MIME types and a 100 MB limit.
