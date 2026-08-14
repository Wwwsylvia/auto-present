# Architecture

## Runtime boundaries

- **Next.js web application:** project workflow, editor, API routes, validation, and local orchestration.
- **Microsoft Foundry:** model inference for initial generation and contextual typed patches. `DefaultAzureCredential` keeps credentials server-side.
- **GitHub:** bounded public metadata and selected manifest/README evidence. Repository content is untrusted data and is never inserted into system instructions.
- **Azure AI Speech:** per-slide narration audio plus sentence boundary timing.
- **FFmpeg worker:** deterministic slide composition, optional demo footage, explicitly mapped narration audio, sentence captions, and MP4 encoding.
- **Persistence:** atomic JSON snapshots and file assets for this single-user MVP. Set `IDEA2IMPACT_DATA_DIR` to a mounted Azure Files volume in Container Apps.
- **Azure Container Apps Job:** optional manual-trigger worker execution for one immutable render manifest. In cloud mode, the web app starts the job through managed identity and returns without waiting for FFmpeg.

## Data flow

1. The brief is validated with Zod and persisted.
2. Optional GitHub evidence is normalized, bounded to 24,000 characters, and stored with commit identity.
3. Foundry receives the brief and bounded evidence and returns JSON that must satisfy the presentation schema.
4. Every direct or AI edit creates an immutable revision. Approval records a specific revision ID.
5. Rendering accepts only the currently approved deck revision.
6. Rendering writes an immutable manifest and queued status. Local mode executes it in the Next.js server process; cloud mode writes it to shared Azure Files and starts the Container Apps Job.
7. Speech audio and sentence boundaries are generated per slide. FFmpeg maps narration explicitly, pads short segments to the approved duration without truncating speech, burns timed captions, and joins the immutable segments.
8. The local renderer or cloud worker writes atomic progress/output status. The web app polls active cloud jobs and reconciles shared status without allowing a stale job to become current again.
9. Editing marks completed render jobs stale. Queued or running jobs remain tied to their original revision and are not presented as output for the new revision.

## Localhost topology

The product entry point is always the Next.js application on localhost. Azure services are called only from the local server process; the browser never calls Foundry or Speech directly. The provisioned web Container App has ingress disabled, no FQDN, and zero minimum replicas. It is retained as infrastructure history, not as a website. A manual-trigger Container Apps Job and Azure Files remain available for optional cloud rendering experiments. Store media in Blob Storage and project metadata in PostgreSQL before introducing multiple users or replicas.

## Security properties

- Foundry and Speech secrets never cross the browser boundary.
- External web ingress is disabled by default. If enabled later, Microsoft Entra authentication is required before the endpoint is shared.
- The web identity receives ACR pull, Foundry inference, and render-job read/start permissions.
- Public GitHub URLs are restricted to canonical repository roots.
- GitHub ingestion uses a small allowlist and hard context limit.
- Model responses and patches are schema validated.
- Render downloads validate UUID-shaped identifiers.
- Uploads enforce allowed MIME types and a 100 MB limit.
