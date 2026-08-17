# Idea2Impact handoff

## Current state

The MVP implements a complete local workflow:

1. Create a project from an idea, audience, tone, duration, and optional public GitHub URL.
2. Generate a typed presentation using Microsoft Foundry when configured, or deterministic demo content otherwise.
3. Review and directly edit slides and narration using immutable revisions.
4. Request validated contextual revisions from Foundry.
5. Approve the plan and deck through the Plan, Create, and Produce stages.
6. Optionally upload a demo clip.
7. Render and download a captioned MP4. Local previews can be silent; final output requires Azure AI Speech.

The product is named **Idea2Impact**. The completed MVP was developed on
`agents/idea2impact-mvp`; this changeset adds localhost hardening and optional
Azure deployment without changing the original product scope.

## Deployment added by this changeset

The safe default is localhost demo mode on `127.0.0.1`. Azure-backed localhost
resolves Foundry and Speech settings from explicit parameters or deployment
outputs and uses local rendering. Provision the operator's Foundry and Speech
roles with `localOperatorPrincipalId`.

Azure hosting provides separate web/worker identities, shared Azure Files,
health probes, and lockfile-based container builds. External ingress remains off
unless complete Entra parameters are supplied in the same deployment.
Post-deployment auth configuration is intentionally disabled.

Localhost-triggered cloud rendering is explicitly unsupported because local
Windows files are not mounted in the Linux Job. Fully hosted cloud dispatch uses
the shared `/data` mount. File-backed persistence remains single-user and
single-web-replica.

## Verified

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Browser inspection of the landing page and editor
- End-to-end API flow from project creation through both approvals
- Real FFmpeg preview render and MP4 download

Repository validation does not prove a live tenant deployment, Entra policy,
role propagation, or Container Apps behavior. Run the live checks in the Azure
runbook before release.

## Configuration needed for a cloud-backed demo

Use `scripts/Start-Local.ps1 -AzureBacked` with explicit Azure resource settings
or deployment outputs. Use `az login` locally so `DefaultAzureCredential` can
authenticate to Foundry and Speech. In Azure, use managed identity rather than
storing service credentials.

See `.env.example` and the build-and-launch guide for the complete supported
configuration.

## Remaining work, in priority order

1. **Complete live Azure verification**
   - Exercise initial generation and contextual revisions against the selected deployed model.
   - Generate a narrated two-minute video and check voice quality, sentence caption timing, final duration, and transitions.
   - Validate the deployment, shared storage, managed identities, Entra policy, and Container Apps Job behavior in the target tenant.

2. **Run the self-presentation acceptance test**
   - Have Idea2Impact create its own two-minute hackathon pitch.
   - Require problem, use cases, solution, architecture, and visible Foundry usage.
   - Add a short uploaded demo clip and export the final MP4.
   - Record defects found during this run as the demo-polish backlog.

3. **Improve production reliability**
   - Bound render redispatch attempts and add terminal deadlines.
   - Prevent duplicate active renders for the same revision and kind.
   - Retain or snapshot replaced uploads referenced by active jobs.
   - Add signed Blob Storage URLs when moving away from local files.
   - Add Application Insights tracing and a judge-facing Foundry evaluation view.

4. **Polish the editing experience**
   - Add slide reorder, duplicate, delete, and slide-level regeneration.
   - Add uploaded demo trim and fit controls.
   - Add an embedded preview player rather than download-only output.
   - Improve responsive behavior for narrower screens.

5. **Prepare for multi-user production**
   - Move media to Blob Storage and project metadata to PostgreSQL or equivalent transactional storage.
   - Replace file-backed dispatch with a durable queue.
   - Add project ownership and explicit user/group authorization.

## Known limitations and risks

- Persistence is JSON/file-backed and intended for a single-user demo with one web replica.
- Public GitHub analysis is intentionally limited to selected root files.
- Private repositories, accounts, sharing, PPTX, collaboration, billing, and automatic browser recording are out of scope.
- Local HTML routes still need the same loopback-host protection as API routes.
- Active render dispatch needs bounded retries and idempotency.
- Replacing an upload can invalidate the file referenced by an active render.
- Hosted access must restrict allowed Entra users or groups before external ingress is enabled.
- Live Azure integration remains tenant-specific and cannot be proven by repository-only checks.

## Recommended next-session prompt

> Resolve the documented security and render-lifecycle blockers, deploy the
> Idea2Impact MVP to the target Azure tenant, verify real Microsoft Foundry
> generation and contextual revisions, verify Azure Speech narration and
> sentence caption timing, and complete the two-minute Idea2Impact
> self-presentation acceptance test. Preserve the typed revision contracts,
> original product scope, and documented non-goals.
