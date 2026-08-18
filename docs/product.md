# Product scope

## Promise

Idea2Impact helps a hackathon team turn a lightweight brief into a polished presentation video without becoming a general-purpose presentation editor.

## Workflow

1. **Brief:** provide an idea and optional public GitHub URL. Submission discovers bounded repository evidence and generates an evidence-aware deck and narration. A saved brief can be revised and regenerated as a new project revision.
2. **Review deck:** review slides and narration together, edit fields directly, request a contextual AI revision, or restore a prior revision, then approve the entire active revision.
3. **Produce video:** after approving a deck with a semantic demo slide, optionally add one demo clip at that slide; render and play a preview, then render and download a narrated final MP4. Explicit back controls and completed stage steps return to earlier stages.

## Acceptance criteria

- A user can begin with only an idea of at least 20 characters.
- Duration is visible and constrained to 1–10 minutes.
- Generated content is persisted as a typed immutable revision.
- Editing a slide creates a new revision and invalidates completed renders.
- Editing a brief creates a new revision in the same project; failed regeneration preserves the current deck.
- Restoring history creates a new immutable revision rather than mutating an old one.
- AI revisions cannot reference unknown slides or write unvalidated fields.
- Public repository evidence retains its source path and commit SHA.
- Generation uses strategy, draft, and critic-refinement passes; the saved revision retains the strategy, layouts, structured visuals, and prompt version.
- Repository claims cite only discovered evidence paths; repository text is evidence, never instructions.
- The approved deck passes deterministic narrative, evidence, visual-diversity, text-density, repeated-claim, narration, demo-consistency, and exact-duration checks.
- Slide durations are normalized to the requested whole-second runtime, weighted by narration length.
- Every slide narration complements its visual and does not describe mouse actions.
- Narration must fit its slide at a natural speaking rate; rendered speech is never time-stretched.
- Browser previews and MP4 output use the slide's layout-specific visual composition.
- A demo recommendation is semantic: when included, its slide specifies setup, action, and payoff. Uploads are rejected unless the approved deck contains that semantic demo slide.
- Final rendering cannot silently omit narration.
- Current preview/final output is playable in the production workspace; older-revision outputs are labeled stale.
- The product can generate its own two-minute pitch with an architecture slide, voiceover, captions, and downloadable MP4.

## Non-goals

Accounts, multi-tenancy, private repositories, PPTX round trips, automatic browser recording, unrestricted slide design, collaboration, and billing are deferred.

## Compatibility

`presentation-v1` saved projects are intentionally incompatible with deck-intelligence v2. Their records remain preserved but are ignored by the v2 workspace; regenerate the project or remove its persisted data. Migration is not provided.
