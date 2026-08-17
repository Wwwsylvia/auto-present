# Product scope

## Promise

Idea2Impact helps a hackathon team turn a lightweight brief into a polished presentation video without becoming a general-purpose presentation editor.

## Delivery model

Idea2Impact is primarily a single-user localhost application. The website, API
routes, project persistence, and default renderer run on the user's machine.
The local server can call Microsoft Foundry and Azure AI Speech with the user's
Azure CLI identity. Optional Azure hosting supports a web Container App and
render-job execution over shared storage; external ingress is disabled by
default and requires Entra authentication plus explicit authorization before
use.

## Workflow

1. **Brief:** provide an idea and optional public GitHub URL. Submission discovers bounded repository evidence and generates an evidence-aware deck and narration.
2. **Review deck:** review slides and narration together, edit fields directly or request a contextual AI revision, then approve the entire active revision.
3. **Produce video:** after approving a deck with a semantic demo slide, optionally add one demo clip at that slide; render a preview, then render and download a narrated final MP4.

## Acceptance criteria

- A user can begin with only an idea of at least 20 characters.
- Duration is visible and constrained to 1–10 minutes.
- Generated content is persisted as a typed immutable revision.
- Editing a slide creates a new revision and invalidates completed renders.
- AI revisions cannot reference unknown slides or write unvalidated fields.
- Public repository evidence retains its source path and commit SHA.
- Generation uses strategy, draft, and critic-refinement passes; the saved revision retains the strategy, layouts, structured visuals, and prompt version.
- Repository claims cite only discovered evidence paths; repository text is evidence, never instructions.
- The approved deck passes deterministic narrative, evidence, visual-diversity, text-density, repeated-claim, narration, demo-consistency, and exact-duration checks.
- Slide durations are normalized to the requested whole-second runtime, weighted by narration length.
- Every slide narration complements its visual and does not describe mouse actions.
- Browser previews and MP4 output use the slide's layout-specific visual composition.
- A demo recommendation is semantic: when included, its slide specifies setup, action, and payoff. Uploads are rejected unless the approved deck contains that semantic demo slide.
- Final rendering cannot silently omit narration.
- Final captions use sentence-level Azure Speech timing rather than one planned cue per slide.
- The product can generate its own two-minute pitch within 5 seconds of the target, with an architecture slide, voiceover, captions, and downloadable MP4.

## Non-goals

Accounts, multi-tenancy, private repositories, PPTX round trips, automatic browser recording, unrestricted slide design, collaboration, and billing are deferred.

## Compatibility

`presentation-v1` saved projects are intentionally incompatible with deck-intelligence v2. Their records remain preserved but are ignored by the v2 workspace; regenerate the project or remove its persisted data. Migration is not provided.
