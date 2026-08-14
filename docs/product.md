# Product scope

Idea2Impact is a localhost-based, single-user hackathon MVP. It is not a hosted service and must not be exposed through LAN or public ingress.

## Promise

Idea2Impact helps a hackathon team turn a lightweight brief into a polished presentation video without becoming a general-purpose presentation editor.

## Workflow

1. **Plan:** provide an idea and optional public GitHub URL, generate an evidence-aware outline, edit it, and approve it.
2. **Create:** review the deck and narration together, edit fields directly or request a contextual AI revision, and approve the active revision.
3. **Produce:** optionally add a validated demo clip, queue a background preview or final render, monitor progress/retries, then download the narrated MP4.

## Acceptance criteria

- A user can begin with only an idea of at least 20 characters.
- Duration is visible and constrained to 1–10 minutes.
- Generated content is persisted as a typed immutable revision.
- Editing a slide creates a new revision and invalidates completed renders.
- AI revisions cannot reference unknown slides or write unvalidated fields.
- Public repository evidence retains its source path and commit SHA.
- Final rendering cannot silently omit narration.
- The product can generate its own two-minute pitch with an architecture slide, voiceover, captions, and downloadable MP4.
- The app and worker operate only on localhost and call Azure services outbound from trusted server-side code.

## Non-goals

Accounts, multi-tenancy, private repositories, PPTX round trips, automatic browser recording, unrestricted slide design, collaboration, and billing are deferred.
Deployment, public ingress, public storage URLs, and non-loopback server binding are explicitly outside the hackathon MVP.
