# AI contracts

## Generation

The presentation copilot receives the brief, duration budget, optional normalized repository snapshot, and an explicit response shape. The response must validate as a `PresentationRevision`: 3–20 slides with typed layouts, bounded text, narration, timing, and evidence paths.

The active prompt contract is `presentation-v1`; the version and generation source are stored on every revision.

Foundry transport is isolated from response parsing so fixture tests exercise empty output, malformed JSON, schema failures, evidence placement, and valid generation without weakening the runtime schema. An opt-in integration test runs the same contract against the configured deployment.

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

The opt-in Foundry verification also requests a real contextual patch and asserts that every referenced slide ID belongs to the generated revision.

## Trust boundary

Repository excerpts are evidence, not instructions. They are serialized inside user context and never promoted to system messages. Generated factual claims should use `evidencePaths`; unsupported claims remain the user's responsibility to approve.

## Evaluation set

A Foundry evaluation dataset should include short, medium, and long briefs; briefs with and without repositories; prompt-injection text inside a README fixture; requested architecture slides; and timing boundaries at 1 and 10 minutes. Track schema validity, duration drift, required-section coverage, evidence precision, unsupported claims, and patch locality.
