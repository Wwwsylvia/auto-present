# Product scope

## Promise

Idea2Impact helps a hackathon team turn a lightweight brief into a polished presentation video without becoming a general-purpose presentation editor.

## Delivery model

Idea2Impact is a single-user localhost application. The website, API routes,
project persistence, and default renderer run on the user's machine. The local
server can call Microsoft Foundry and Azure AI Speech with the user's Azure CLI
identity. Azure does not expose the website; a disabled-ingress web Container
App is retained as infrastructure history. Other Azure resources support
backend AI, storage, container images, and optional render-job execution.

## Workflow

1. **Plan:** provide an idea and optional public GitHub URL, generate an evidence-aware outline, edit it, and approve it.
2. **Create:** review the deck and narration together, edit fields directly or request a contextual AI revision, and approve the active revision.
3. **Produce:** optionally add a demo clip, render a preview, then render and download a narrated final MP4.

## Acceptance criteria

- A user can begin with only an idea of at least 20 characters.
- Duration is visible and constrained to 1–10 minutes.
- Generated content is persisted as a typed immutable revision.
- Editing a slide creates a new revision and invalidates completed renders.
- AI revisions cannot reference unknown slides or write unvalidated fields.
- Public repository evidence retains its source path and commit SHA.
- Final rendering cannot silently omit narration.
- Final captions use sentence-level Azure Speech timing rather than one planned cue per slide.
- The product can generate its own two-minute pitch within 5 seconds of the target, with an architecture slide, voiceover, captions, and downloadable MP4.

## Non-goals

Accounts, multi-tenancy, private repositories, PPTX round trips, automatic browser recording, unrestricted slide design, collaboration, and billing are deferred.
