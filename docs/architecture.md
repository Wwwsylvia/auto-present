# Architecture

## Runtime boundaries

- **Next.js web application:** project workflow, editor, API routes, validation, and local orchestration.
- **Microsoft Foundry:** model inference for initial generation and contextual typed patches. `DefaultAzureCredential` keeps credentials server-side.
- **GitHub:** bounded public metadata and selected manifest/README evidence. Repository content is untrusted data and is never inserted into system instructions.
- **Azure AI Speech:** per-slide narration audio.
- **FFmpeg:** deterministic slide composition, optional demo footage, audio, captions, and MP4 encoding.
- **Persistence:** atomic JSON snapshots and file assets for this single-user MVP. Set `IDEA2IMPACT_DATA_DIR` to a mounted Azure Files volume in Container Apps.

## Data flow

1. The brief is validated with Zod and persisted.
2. Optional GitHub evidence is normalized, bounded to 24,000 characters, and stored with commit identity.
3. Foundry receives the brief and bounded evidence and returns JSON that must satisfy the presentation schema.
4. Every direct or AI edit creates an immutable revision. Approval records a specific revision ID.
5. Rendering accepts only the currently approved deck revision.
6. Slide visuals and caption files are generated deterministically. Speech audio is synthesized per slide, and FFmpeg joins the immutable segments.
7. Editing marks completed render jobs stale.

## Production topology

Deploy the standalone Next.js image to Azure Container Apps with a persistent Azure Files mount. For scale, move `renderPresentation` into a Container Apps Job image and have the web application enqueue immutable render job IDs. Store media in Blob Storage and project metadata in PostgreSQL before introducing multiple users.

## Security properties

- Foundry and Speech secrets never cross the browser boundary.
- Public GitHub URLs are restricted to canonical repository roots.
- GitHub ingestion uses a small allowlist and hard context limit.
- Model responses and patches are schema validated.
- Render downloads validate UUID-shaped identifiers.
- Uploads enforce allowed MIME types and a 100 MB limit.
