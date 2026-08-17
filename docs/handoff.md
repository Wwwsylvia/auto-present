# Idea2Impact handoff

## Current state

The MVP implements a complete local workflow:

1. Create a project from an idea, audience, tone, duration, and optional public GitHub URL; generation begins immediately.
2. Generate a deck-intelligence v2 presentation using Foundry strategy, draft, and critic-refinement passes when configured, or deterministic demo content otherwise, with visible progress feedback.
3. Review and directly edit slides and narration using immutable revisions, then approve the entire deck with one clear action.
4. Request validated contextual revisions from Foundry.
5. Move through the Brief, Review deck, and Produce video stages.
6. Optionally upload one demo clip only after approving a deck with a semantic demo slide; it renders at that slide.
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
- Local FFmpeg preview render and MP4 download (not Foundry or Speech acceptance)

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
   - Exercise strategy, draft, critic-refinement, and contextual revision calls against the selected deployed model.
   - Confirm contracts, bounded retries, exact duration normalization, evidence citations, narration rules, and deterministic quality checks.
   - Test prompt-injection text in repository evidence to confirm the untrusted-data boundary.
   - Generate a narrated two-minute video and check voice quality, sentence caption timing, final duration, and layout-specific transitions.
   - Validate the deployment, shared storage, managed identities, Entra policy, and Container Apps Job behavior in the target tenant.

2. **Run the self-presentation acceptance test**
   - Have Idea2Impact create its own two-minute hackathon pitch.
   - Require problem, use cases, solution, architecture, and visible Foundry usage.
   - Confirm the generated deck recommends and contains a semantic demo slide before uploading a short clip; export the final MP4.
   - Record defects found during this run as the demo-polish backlog.

3. **Improve production reliability**
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
- Public GitHub analysis is intentionally bounded: evidence discovery ranks eligible files from the default-branch head's exact-SHA tree and reads only selected excerpts at that SHA.
- Private repositories, accounts, sharing, PPTX, collaboration, billing, and automatic browser recording are out of scope.
- Live Azure integration remains tenant-specific and cannot be proven by repository-only checks.
- Existing `presentation-v1` saved projects are intentionally incompatible. Their records are preserved but ignored; regenerate or remove them. No migration exists.
- Real Foundry and Azure AI Speech acceptance have not yet been run for deck-intelligence v2.
- `npm audit --omit=dev` currently reports advisories through the installed Next.js/PostCSS dependency chain. The suggested automatic fix downgrades Next.js to an incompatible old version; reassess when a patched compatible release is available.

## Recommended next-session prompt

> Deploy the Idea2Impact MVP to the target Azure tenant, verify real Microsoft Foundry
> generation and contextual revisions, verify Azure Speech narration and
> sentence caption timing, and complete the two-minute Idea2Impact
> self-presentation acceptance test. Preserve the typed revision contracts,
> original product scope, and documented non-goals.
