# Idea2Impact handoff

## Current state

Idea2Impact is complete as a localhost-first, Azure-backed MVP. The Next.js
application runs locally while Microsoft Foundry provides typed generation and
contextual revisions and Azure AI Speech provides narration with sentence
timing. Final rendering can run locally or from an immutable manifest in the
provisioned Azure Container Apps Job.

The provisioned web Container App has no ingress or FQDN and scales to zero.
Do not expose it publicly unless the user explicitly changes the operating model
and Entra authentication is configured first.

## Verified

- Real GPT-5.4 mini generation and contextual typed revision
- Fixture coverage for valid, empty, malformed, schema-invalid, and unsafe
  Foundry responses
- Immutable revision, expected-version, unknown-slide, and stale-render
  protections
- Managed-identity Azure Speech narration and sentence boundary timing
- Explicit FFmpeg stream mapping, H.264/AAC output, and caption serialization
- Asynchronous render manifests, worker startup, status persistence, UI polling,
  and stale-job protection
- Bicep deployment with disabled-by-default ingress and zero web replicas
- Two-minute self-presentation acceptance at 120.042667 seconds with 16 caption
  cues and an embedded workflow recording
- Public endpoint removal verified in Azure

See the [Azure runbook](azure-runbook.md) for inventory and operations and the
[acceptance report](acceptance.md) for identifiers, probe results, and manual
review.

## Known limitations

- Persistence is JSON/file-backed and intended for a single user.
- Public GitHub repositories only; ingestion is bounded to selected files.
- Container Apps Job status reconciliation needs another unattended cloud-mode
  verification before it is treated as production reliable.
- Captions can overlay footer content because they use fixed bottom placement.
- Private repositories, accounts, collaboration, PPTX, and automatic browser
  recording remain out of scope.
- The Windows-generated npm lock metadata omits some Linux optional packages,
  so the container currently installs npm 11 and uses `npm install`.
- Entra app registration is blocked unless the tenant owner supplies a valid
  internal `serviceManagementReference`; this is unnecessary for localhost.

## Repository state

The feature branch is `agents/azure-deployment-idea2impact`. Earlier verified
checkpoints were pushed through `ede31cb`; the localhost-only acceptance
checkpoint is intentionally local until the user explicitly requests another
push. Generated media and session artifacts must not be committed.

## Recommended next work

1. Reverify Container Apps Job reconciliation if cloud rendering is needed.
2. Add adaptive caption positioning and retention cleanup.
3. Replace file persistence before enabling multiple users or replicas.
