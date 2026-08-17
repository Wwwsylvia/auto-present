# Product scope

## Promise

Idea2Impact helps a hackathon team turn a lightweight brief into a polished presentation video without becoming a general-purpose presentation editor.

## Workflow

1. **Brief:** provide an idea and optional public GitHub URL. Submission immediately generates an evidence-aware deck and narration.
2. **Review deck:** review slides and narration together, edit fields directly or request a contextual AI revision, then approve the entire active revision.
3. **Produce video:** optionally add a demo clip immediately before the closing slide, render a preview, then render and download a narrated final MP4.

## Acceptance criteria

- A user can begin with only an idea of at least 20 characters.
- Duration is visible and constrained to 1–10 minutes.
- Generated content is persisted as a typed immutable revision.
- Editing a slide creates a new revision and invalidates completed renders.
- AI revisions cannot reference unknown slides or write unvalidated fields.
- Public repository evidence retains its source path and commit SHA.
- Final rendering cannot silently omit narration.
- The product can generate its own two-minute pitch with an architecture slide, voiceover, captions, and downloadable MP4.

## Non-goals

Accounts, multi-tenancy, private repositories, PPTX round trips, automatic browser recording, unrestricted slide design, collaboration, and billing are deferred.
