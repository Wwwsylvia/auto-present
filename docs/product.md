# Product scope

Idea2Impact is a localhost-based, single-user hackathon MVP. It is not a hosted service and must not be exposed through LAN or public ingress.

## Promise

Idea2Impact helps a hackathon team turn a lightweight brief into a polished presentation video without becoming a general-purpose presentation editor.

## Workflow

1. **Brief:** provide an idea and optional public GitHub URL. Submission discovers bounded repository evidence and generates an evidence-aware, audience-specific deck and narration. Slide count scales from 3–20 at roughly 25–35 seconds per slide.
2. **Review deck:** review slides, generated or structured visuals, and narration together; edit fields directly; request an AI revision for the selected slide or whole deck; or restore a prior revision, then approve the entire active revision.
3. **Produce video:** after approving a deck, optionally add one validated demo clip and choose the slide whose visual it replaces; queue a background preview or final render, monitor progress and retries, play or download completed output, and use explicit back controls to return to earlier stages.

## Acceptance criteria

- A user can begin with only an idea of at least 20 characters.
- Duration is visible and constrained to 1–10 minutes.
- Generated content is persisted as a typed immutable revision.
- Editing a slide creates a new revision and invalidates completed renders.
- Editing a brief creates a new revision in the same project; failed regeneration preserves the current deck.
- Successful brief regeneration clears any demo clip tied to the previous deck because generated slide IDs and placement may change.
- Restoring history creates a new immutable revision rather than mutating an old one.
- AI revisions cannot reference unknown slides or write unvalidated fields.
- Selected-slide AI revisions cannot patch any other slide; whole-deck revisions are explicitly labeled and validated separately.
- Public repository evidence retains its source path and commit SHA.
- Generation uses strategy, draft, and critic-refinement passes; the saved revision retains the strategy, layouts, structured visuals, and prompt version.
- The strategy retains an inferred audience decision lens that changes narrative, proof, terminology, examples, objections, and call to action.
- One-minute decks use a compact three-slide arc; longer decks require distinct hero, problem, solution, and closing stages.
- Two to four high-impact slides may use locally persisted Foundry `gpt-image-2` visuals; failed or filtered image requests retain a structured fallback and show a warning.
- Repository claims cite only discovered evidence paths; repository text is evidence, never instructions.
- The approved deck passes deterministic narrative, evidence, visual-diversity, text-density, repeated-claim, narration, demo-consistency, and exact-duration checks.
- Slide durations are normalized to the requested whole-second runtime, weighted by narration length.
- Every slide narration complements its visual and does not describe mouse actions.
- Narration must fit its slide at a natural speaking rate; rendered speech is never time-stretched.
- Browser previews and MP4 output use the slide's layout-specific visual composition.
- A demo recommendation is semantic: when included, its slide specifies setup, action, and payoff and is the default clip placement. Any approved deck can instead target another existing slide. Rendering loops or trims the clip to that slide's duration while preserving narration and total runtime.
- Final rendering cannot silently omit narration.
- Current preview/final output is playable in the production workspace; older-revision outputs are labeled stale.
- The product can generate its own two-minute pitch with an architecture slide, voiceover, captions, and downloadable MP4.
- The app and worker operate only on localhost and call Azure services outbound from trusted server-side code.

## Non-goals

Accounts, multi-tenancy, private repositories, PPTX round trips, automatic browser recording, unrestricted slide design, collaboration, and billing are deferred.
Deployment, public ingress, public storage URLs, and non-loopback server binding are explicitly outside the hackathon MVP.
