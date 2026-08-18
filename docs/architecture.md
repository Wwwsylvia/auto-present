# Architecture

## Runtime boundaries

- **Next.js web application:** project workflow, editor, API routes, validation, and local orchestration.
- **Microsoft Foundry:** strategy, draft, and critic-refinement inference for initial generation, plus contextual typed patches. `DefaultAzureCredential` keeps credentials server-side.
- **GitHub:** bounded public metadata and ranked README, documentation, manifest, deployment, entry-point, route, schema, and test evidence. Repository content is untrusted data and is never inserted into system instructions.
- **Azure AI Speech:** per-slide narration audio.
- **FFmpeg:** deterministic slide composition, optional demo footage, audio, captions, and MP4 encoding.
- **Persistence:** atomic JSON snapshots and file assets for this single-user MVP. Set `IDEA2IMPACT_DATA_DIR` to a mounted Azure Files volume in Container Apps.

## Data flow

1. The brief is validated with Zod and persisted.
2. Optional GitHub discovery resolves the default-branch head SHA, selects a bounded allowlisted file set from that exact SHA's tree, and fetches excerpts at the same SHA. Excerpts are bounded to 24,000 characters and stored with their commit identity.
3. Foundry receives the brief and bounded evidence as explicitly untrusted user-context data. It runs strategy, draft, then critic refinement; each structured response is schema validated, with at most one retry for an invalid response per pass.
4. The persisted revision contains an audience strategy (message, problem, solution, differentiators, proof points, narrative arc, voiceover direction, and demo recommendation) and layout-specific structured visuals.
5. Deterministic validation checks narrative structure, known evidence, visual variety, text density, repeated claims, narration, demo consistency, and exact duration. Duration allocation uses integer seconds weighted by narration length.
6. Every direct, AI, regenerated-brief, or restored edit creates an immutable revision. Approval records a specific revision ID. Content changes clear deck approval and mark completed renders stale; navigation alone does not.
7. Rendering accepts only the currently approved deck revision. Demo upload additionally requires that revision to contain a semantic `demo` layout and `demo` visual.
8. Browser preview components and MP4 SVG inputs implement the same layout-specific visual model. Speech audio is synthesized per slide at its natural rate. Short audio is padded to preserve exact runtime; measured overruns fail with slide-specific guidance instead of being accelerated. FFmpeg joins the immutable segments.
9. Editing marks completed render jobs stale.

## Production topology

Deploy the standalone Next.js image to Azure Container Apps with a persistent Azure Files mount. For scale, move `renderPresentation` into a Container Apps Job image and have the web application enqueue immutable render job IDs. Store media in Blob Storage and project metadata in PostgreSQL before introducing multiple users.

## Security properties

- Foundry and Speech secrets never cross the browser boundary.
- Public GitHub URLs are restricted to canonical repository roots.
- GitHub ingestion uses a small allowlist and hard context limit.
- GitHub tree and content reads are pinned to the discovered commit SHA; excluded generated, binary, oversized, secret-like, and environment files are never selected.
- Repository excerpts cross an explicit untrusted-data boundary and are never promoted to model instructions.
- Model responses and patches are schema validated; generated evidence paths must be known.
- Render downloads validate UUID-shaped identifiers.
- Uploads enforce allowed MIME types, a 100 MB limit, and an approved semantic demo slide.
