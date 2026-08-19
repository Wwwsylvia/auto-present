# AI contracts

## Generation

The presentation copilot receives the brief, duration budget, exact duration-derived slide count, inferred audience decision lens, optional normalized repository snapshot, and an explicit response shape. The response must validate as a `PresentationRevision`: 3–20 slides with typed layouts, bounded text, narration, timing, evidence paths, and optional image intent.

The active prompt contract is `deck-intelligence-v3`; the version and generation source are stored on every revision.

Image intents include a prompt, alt text, caption, and complete structured fallback. Two to four high-impact image intents are materialized through a separately configured Microsoft Foundry `gpt-image-2` deployment. Base64 output is normalized and persisted locally. A filtered or failed request keeps the structured fallback and adds a user-visible revision warning.

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

Unknown slide IDs, empty patches, invalid fields, and out-of-range values fail explicitly. Applying a patch creates a new immutable revision and invalidates approved output.

Every revision request also carries `scope: "slide" | "deck"`. Slide scope requires `selectedSlideId`, sends focused slide context, and rejects a patch touching any other ID. Deck scope may patch multiple existing slides while preserving the validated arc, exact duration, and image constraints.

## Trust boundary

Repository excerpts are untrusted evidence, not instructions. They are bounded, explicitly delimited inside user context, and never promoted to system messages. Generated evidence paths must refer to supplied excerpts; unknown paths fail validation. Configured Foundry calls fail explicitly rather than silently falling back to demo content.

## Evaluation set

A Foundry evaluation dataset should include short, medium, and long briefs; briefs with and without repositories; prompt-injection text inside a README fixture; requested architecture slides; and timing boundaries at 1 and 10 minutes. Track schema validity, duration drift, required-section coverage, evidence precision, unsupported claims, patch locality, malformed output, service failures, and repository prompt-injection resistance.
