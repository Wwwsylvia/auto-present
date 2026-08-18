# Architecture

Idea2Impact is intentionally a **localhost-only, single-machine system**. “Production build” in this repository means an optimized local Next.js build started with `npm start`; it does not mean a hosted deployment.

## Runtime boundaries

- **Loopback-only Next.js web application:** project workflow, editor, API routes, validation, and durable job enqueueing. It binds only to `127.0.0.1`.
- **Microsoft Foundry:** model inference for initial generation and contextual typed patches. `DefaultAzureCredential` keeps credentials server-side.
- **GitHub:** bounded public metadata and selected manifest/README evidence. Repository content is untrusted data and is never inserted into system instructions.
- **Azure AI Speech:** outbound, server-side per-slide narration using passwordless Azure CLI identity by default.
- **Local render worker:** a separate process atomically claims durable jobs with a unique lease token, synthesizes narration, invokes FFmpeg, and persists progress. Every heartbeat and terminal transition must present the current token. Transient failures receive three bounded attempts before manual retry.
- **FFmpeg/FFprobe:** deterministic slide composition, validated optional demo footage, audio, sentence-level captions, MP4 encoding, and media verification.
- **Persistence:** atomic JSON snapshots, durable queue records, and local file assets for this single-user MVP under `IDEA2IMPACT_DATA_DIR`.

## Data flow

1. The brief is validated with Zod and persisted.
2. Optional GitHub discovery resolves the default-branch head SHA, selects a bounded allowlisted file set from that exact SHA's tree, and fetches excerpts at the same SHA. Excerpts are bounded to 24,000 characters and stored with their commit identity.
3. Foundry receives the brief and bounded evidence as explicitly untrusted user-context data. It runs strategy, draft, then critic refinement; each structured response is schema validated, with at most one retry for an invalid response per pass.
4. The persisted revision contains an audience strategy (message, problem, solution, differentiators, proof points, narrative arc, voiceover direction, and demo recommendation) and layout-specific structured visuals.
5. Deterministic validation checks narrative structure, known evidence, visual variety, text density, repeated claims, narration, demo consistency, and exact duration. Duration allocation uses integer seconds weighted by narration length.
6. Every direct, AI, regenerated-brief, or restored edit creates an immutable revision. Approval records a specific revision ID. Content changes clear deck approval and mark completed renders stale; navigation alone does not.
7. Rendering accepts only the currently approved deck revision. Demo upload additionally requires that revision to contain a semantic `demo` layout and `demo` visual.
8. The API persists a render job in a deferred, non-claimable state while atomically updating project metadata, then activates it only after that metadata is durable.
9. The local worker atomically claims the job. Browser previews and MP4 SVG inputs implement the same layout-specific visual model. Speech audio is synthesized per slide at its natural rate; short audio is padded and measured overruns fail with slide-specific guidance. FFmpeg joins the immutable segments.
10. Editing, restoring, regenerating, or replacing a render-affecting asset revokes incompatible claims, marks jobs stale, and removes obsolete output.

## Local topology

Run `npm run dev` for development, or run `npm run build` followed by `npm start` for an optimized local build. Both launch modes supervise the loopback Next.js process and the separate local worker. They coordinate only through the configured local data directory. Azure Foundry and Speech are outbound inference dependencies; the application does not provision resources, deploy containers, create ingress, expose storage URLs, or listen beyond loopback.

## Security properties

- Foundry and Speech secrets never cross the browser boundary.
- All data-bearing API routes reject non-loopback request URLs and `Host` headers. Browser mutations and reads also reject non-loopback origins and cross-site requests, preventing DNS-rebinding access to local project data.
- Public GitHub URLs are restricted to canonical repository roots.
- GitHub ingestion uses a small allowlist and hard context limit.
- Model responses and patches are schema validated.
- Render downloads validate UUID-shaped identifiers.
- Uploads enforce allowed MIME types and a 100 MB limit, then require successful FFprobe validation before atomic promotion.
- Errors returned to the browser redact credentials, endpoints, and local paths.
