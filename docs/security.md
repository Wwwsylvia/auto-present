# Security

## Trust boundaries

- Local mode is unauthenticated but loopback-only by bind address and API
  Host/Origin checks. LAN exposure is not a supported default.
- Azure external ingress is opt-in and cannot be parameterized without complete
  Entra configuration in the same Bicep deployment.
- Foundry, Speech, ACR, and Job operations use scoped managed identities in
  Azure. Local Azure-backed mode uses the operator's `DefaultAzureCredential`.
- GitHub evidence and model output are untrusted. Evidence is bounded; generated
  presentations and patches are schema, evidence-reference, and duration
  validated.
- Secrets are secure parameters or Container Apps secrets, never source files or
  deployment outputs.
- Reuse is explicit. Compatibility checks prevent accidental adoption of a
  different region or Cognitive Services kind; operators must also confirm the
  template's public-network and shared-key settings are acceptable.

## Threats and controls

DNS rebinding and cross-site requests are limited by loopback Host/Origin
validation. Stale render workers are limited by claim tokens and expiring
leases. Upload replacement commits metadata before deleting the prior file, so
cleanup failure cannot leave project metadata pointing to a deleted asset.
Render identifiers are UUID-validated and output URLs do not expose filesystem
paths.

## Remaining limitations

The JSON/file store is not safe for multiple writers. Azure Files uses a storage
account key in the Container Apps environment storage resource because that
resource interface requires it; the key is not output or checked in. Entra app
secret rotation is an operator responsibility. Private networking for Foundry,
Speech, ACR, and storage is not yet configured. Live tenant policy, Entra login,
role propagation, and Azure network behavior require deployment validation.
