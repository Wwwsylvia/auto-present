# Architecture

## Runtime boundaries

- **Next.js web application:** project workflow, editor, API routes, validation, and local orchestration.
- **Microsoft Foundry:** model inference for initial generation and contextual typed patches. `DefaultAzureCredential` keeps credentials server-side.
- **GitHub:** bounded public metadata and selected manifest/README evidence. Repository content is untrusted data and is never inserted into system instructions.
- **Azure AI Speech:** per-slide narration audio and sentence timing.
- **FFmpeg:** deterministic slide composition, optional demo footage, audio, captions, and MP4 encoding.
- **Persistence:** atomic JSON snapshots and file assets for this single-user MVP. Set `IDEA2IMPACT_DATA_DIR` to the shared Azure Files mount in Container Apps.

## Data flow

1. The brief is validated with Zod and persisted.
2. Optional GitHub evidence is normalized, bounded to 24,000 characters, and stored with commit identity.
3. Foundry receives the brief and bounded evidence and returns JSON that must satisfy the presentation schema.
4. Every direct or AI edit creates an immutable revision. Approval records a specific revision ID.
5. Rendering accepts only the currently approved deck revision.
6. Slide visuals and caption files are generated deterministically. Speech audio and sentence timing are synthesized per slide, and FFmpeg joins the immutable segments.
7. Editing marks completed render jobs stale and prevents their output from being downloaded.

## Local topology

The local browser calls a loopback-only Next.js server. That server owns
validation, file-backed project state, Foundry calls, Speech calls, and local
FFmpeg rendering. Local API requests require a loopback URL, Host, and Origin;
there is intentionally no local user login.

## Azure topology

Azure hosting retains separate web and render Job workloads with separate
managed identities. Both mount one Azure Files share at `/data`, so project
snapshots, portable `/api/renders/<id>` identifiers, uploads, manifests,
statuses, and outputs remain coherent inside Linux containers. File-backed
persistence is single-writer and therefore limited to one web replica.

External ingress is disabled by default. When enabled, Container Apps built-in
Entra authentication is provisioned declaratively and required for every
request. The application switches to `APP_HOSTING_MODE=azure`, where the
platform auth boundary replaces loopback Host/Origin enforcement.

## Render lifecycle

Rendering writes an immutable manifest and claim status. Workers hold a
15-minute renewable lease. Each claim renders into a token-specific staging
directory; only the current claim can atomically promote its directory to the
canonical output. Stale or superseded claims clean only their own staging data.
The web reconciler durably redispatches expired render or dispatch leases, while
Container Apps automatic replica retry is disabled to avoid immediate duplicate
claims and retry storms.
Revision commits mark prior jobs stale, and cleanup after the project commit is
best effort so cleanup failure cannot roll back a valid user edit. Downloads
also require a current `complete` status, so stale URLs are not served.

Local-to-cloud dispatch is disabled because a Windows data path cannot be read
by the Linux Job. Fully cloud-hosted dispatch uses only the shared `/data`
topology. Moving to multiple web replicas requires transactional metadata
storage and a durable queue rather than JSON snapshots.

Resource names are parameterized. Supplying names from the target resource group
adopts and converges compatible dedicated resources; omitting them creates
deterministic names. Adoption is limited to same-region, same-type resources
whose security configuration is compatible with the template.

## Production evolution

The original production direction remains unchanged: before introducing
multiple users, move media to Blob Storage, project metadata to a transactional
database such as PostgreSQL, and render dispatch to a durable queue. Add
per-project ownership and authorization rather than relying on a shared
single-user file store.

## Security properties

- Foundry and Speech credentials never cross the browser boundary.
- Public GitHub URLs are restricted to canonical repository roots.
- GitHub ingestion uses a small allowlist and hard context limit.
- Model responses and patches are schema validated.
- Render downloads validate UUID-shaped identifiers and current job status.
- Uploads enforce allowed MIME types and a 100 MB limit.
- Local API traffic is restricted to loopback Host and Origin values.
- Hosted ingress is disabled by default and must not be enabled without Entra authentication and an explicit allowed-user or allowed-group policy.
