# Architecture

The local browser calls a loopback-only Next.js server. That server owns
validation, file-backed project state, Foundry calls, Speech calls, and local
FFmpeg rendering. Local API requests require a loopback URL, Host, and Origin;
there is intentionally no local user login.

Azure hosting retains separate web and render Job workloads with separate
managed identities. Both mount one Azure Files share at `/data`, so project
snapshots, portable `/api/renders/<id>` identifiers, uploads, manifests,
statuses, and outputs remain coherent inside Linux containers. File-backed
persistence is single-writer and therefore limited to one web replica.

External ingress is disabled by default. When enabled, Container Apps built-in
Entra authentication is provisioned declaratively and required for every
request. The application switches to `APP_HOSTING_MODE=azure`, where the
platform auth boundary replaces loopback Host/Origin enforcement.

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
