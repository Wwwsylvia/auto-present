# Handoff

The safe default is localhost demo mode on `127.0.0.1`. Azure-backed localhost
resolves Foundry and Speech settings from explicit parameters or deployment
outputs and uses local rendering. Provision the operator's Foundry and Speech
roles with `localOperatorPrincipalId`.

Azure hosting retains separate web/worker identities, shared Azure Files,
health probes, and lockfile-based container builds. External ingress remains off
unless complete Entra parameters are supplied in the same deployment.
Post-deployment auth configuration is intentionally disabled.

Localhost-triggered cloud rendering is explicitly unsupported because local
Windows files are not mounted in the Linux Job. Fully hosted cloud dispatch uses
the shared `/data` mount. File-backed persistence remains single-user and
single-web-replica.

Before release, run every command in README Validation and perform the live
checks in the Azure runbook. Local tests and Bicep compilation do not verify a
tenant deployment, Entra policy, role propagation, or Container Apps behavior.
