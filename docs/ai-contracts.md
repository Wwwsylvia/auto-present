# AI contracts

## Generation

Generation is a three-pass Foundry pipeline:

1. **Strategy:** audience goal, core message, problem, solution, differentiators, evidence-backed proof points, narrative arc, voiceover direction, and a semantic demo recommendation.
2. **Draft:** deck title and summary plus 3–20 typed slides.
3. **Critic refinement:** quality scores and a fully revised final deck.

The presentation copilot receives the brief, duration budget, optional normalized repository snapshot, and explicit response shapes. A persisted `PresentationRevision` includes the strategy; slide purpose, audience takeaway, typed layout, structured visual, narration, timing, and evidence paths. Visuals are statement, cards, flow, comparison, metrics, timeline, or demo; a demo visual contains setup, action, and payoff.

The active prompt contract is `deck-intelligence-v2`; the version and generation source are stored on every revision. Successful generation normally makes three model calls. Each pass has a bounded retry for invalid JSON or contract failure, so failures can add at most one retry per pass.

After critic output, deterministic validation requires hero first, closing last, problem and solution stages, visual variety, concise non-repeated on-screen claims, known evidence, narration, semantic-demo consistency, and exact runtime. Integer slide durations are normalized to the requested duration in proportion to narration word count. Narration must add context beyond visuals and must not describe clicks, taps, hovering, cursors, or other mouse actions.

## Contextual revision

Chat does not overwrite free-form documents. It returns:

```json
{
  "summary": "Concise user-facing description",
  "slideChanges": [
    {
      "slideId": "an existing slide ID",
      "changes": {
        "title": "only when changed",
        "bullets": ["only when changed"],
        "narration": "only when changed",
        "durationSeconds": 20
      }
    }
  ]
}
```

Unknown slide IDs, empty patches, invalid fields, out-of-range values, unknown evidence paths, or invalid deck structure fail explicitly. Rich patches can update strategy-linked content, layouts, visual payloads, and demo setup/action/payoff. Applying a patch creates a new immutable revision and invalidates approved output.

## Trust boundary

Repository excerpts are evidence, not instructions. Discovery resolves an exact commit SHA, ranks a bounded tree selection, and reads selected content at that SHA. Excerpts are serialized as explicitly untrusted user context and never promoted to system messages. Generated factual claims must use known `evidencePaths`; unsupported claims are rejected.

## Evaluation set

A Foundry evaluation dataset should include short, medium, and long briefs; briefs with and without repositories; prompt-injection text inside a README fixture; requested architecture and demo slides; and timing boundaries at 1 and 10 minutes. Track pass-level schema validity and retries, duration exactness, required-section coverage, evidence precision, unsupported claims, narration/action-language violations, visual diversity, demo consistency, and patch locality.
