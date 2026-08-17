# Security

## Trust boundaries

- Local mode is unauthenticated but loopback-only by bind address and
  proxy/API Host and Origin checks covering HTML, RSC, and API requests. LAN
  exposure is not a supported default.
- Azure external ingress is opt-in and cannot be parameterized without complete
  Entra configuration and at least one allowed user or group in the same Bicep
  deployment.
- Foundry, Speech, ACR, and Job operations use scoped managed identities in
  Azure. Local Azure-backed mode uses the operator's `DefaultAzureCredential`.
- GitHub evidence and model output are untrusted. Evidence is bounded; generated
  presentations and patches are schema, evidence-reference, and duration
  validated.
- Secrets are secure parameters or Container Apps secrets, never source files or
  deployment outputs.
- Entra deployment keeps the `SecureString` out of Azure CLI arguments. A
  uniquely named process environment variable is consumed by a temporary
  non-secret `.bicepparam` compiled before Azure mutation, and both are cleared
  in `finally`.
- Reuse is explicit. Compatibility checks prevent accidental adoption of a
  different region or Cognitive Services kind; operators must also confirm the
  template's public-network and shared-key settings are acceptable.

## Threats and controls

DNS rebinding and cross-site requests are limited by loopback Host/Origin
validation. The loopback aliases `localhost`, `127.0.0.1`, and `[::1]` are
equivalent only when their protocol and effective port match; non-loopback
names, protocol or port mismatches, and malformed headers are rejected.
Stale render workers are limited by claim tokens, expiring leases, and three
dispatch attempts. Registration reuses an active job for the same revision and
kind. Each immutable render manifest owns a snapshot of its uploaded inputs, so
replacing the project upload cannot break an active worker. Render identifiers
are UUID-validated and output URLs do not expose filesystem paths.

## Remaining limitations

The JSON/file store is not safe for multiple writers. Azure Files uses a storage
account key in the Container Apps environment storage resource because that
resource interface requires it; the key is not output or checked in. Entra app
secret rotation is an operator responsibility. Private networking for Foundry,
Speech, ACR, and storage is not yet configured. Live tenant policy, Entra login,
role propagation, and Azure network behavior require deployment validation.
