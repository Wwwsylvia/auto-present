# Idea2Impact self-presentation acceptance

> Historical evidence from the deployment-v1 environment. It demonstrates the
> media workflow but does not verify the current Bicep template, Entra
> configuration, health probes, or cloud reconciliation. Re-run the Azure
> runbook checks in the target tenant before deployment.

## Result

The localhost-first, Azure-backed acceptance run passed. Idea2Impact generated,
contextually revised, approved, narrated, captioned, and rendered its own
two-minute presentation while the Azure web deployment remained private.

| Evidence | Value |
| --- | --- |
| Project | `335f011b-d785-44a2-a012-a98ac6054c17` |
| Approved revision | `9b48909a-7f21-4dac-8ea2-fff03544208e` |
| Final render job | `68e52b45-0f6b-4f79-9a21-7691181c946d` |
| Repository commit analyzed | `7f34b0a8b58bd0c9b07a5f10cda63583d543f54d` |
| Foundry deployment | `gpt-5-4-mini`, version `2026-03-17` |
| Planned duration | 120 seconds |
| Media duration | 120.042667 seconds |
| Media streams | H.264 video and AAC audio |
| Media size | 3,239,329 bytes |
| Caption cues | 16 sentence-level cues |
| Last caption end | `00:01:59,413` |
| Audio levels | approximately -19.7 dB mean and -2.1 dB peak |

The final artifact is intentionally retained outside Git in session-local data.
Generated media and credentials are not repository artifacts.

## Workflow evidence

- Microsoft Foundry produced the initial schema-valid six-slide deck.
- A contextual Foundry request produced a typed, local revision without
  weakening the immutable Zod contracts.
- The approved revision totals exactly 120 planned seconds and covers the
  problem, users, workflow, typed revision model, architecture, explicit
  Foundry use, and closing impact.
- Public repository evidence was tied to commit
  `7f34b0a8b58bd0c9b07a5f10cda63583d543f54d`. The bounded ingestion sampled
  `README.md` and `package.json`.
- A 0.96-second browser capture was rejected as unsuitable and replaced with a
  verified 11.92-second, 1.34 MB WebM workflow recording.
- Review frames confirm that the uploaded workflow is visible in the rendered
  demo segment.
- Azure Speech produced audible narration and actual sentence boundary timing.
- FFmpeg explicitly mapped synthesized narration, so uploaded clip audio could
  not replace narration.

## Automated checks

- Duration is within the required 115–125 second window.
- ffprobe reports one H.264 video stream and one AAC audio stream.
- Audio is present at useful levels.
- All 16 cues are ordered and bounded by the media duration.
- Captions are materially finer than the six slide boundaries.
- The final cue ends before the media.

## Manual review

Representative frames at 5, 45, 80, 100, and 118 seconds showed the expected
deck, architecture, embedded workflow footage, and closing slide. Captions were
initially too large and covered lower bullets. The final render reduced the
caption font and bottom margin; captions remain readable and no longer obscure
slide bullets. They still overlay the footer or bottom application controls in
some frames, which is a non-blocking demo-polish item.

## Remaining validation

- Deploy the current Bicep template to a test resource group and verify Entra
  redirect/login, role propagation, health probes, Azure Files, and Container
  Apps Job status reconciliation.
- Consider adaptive caption placement when a slide has meaningful content in
  the lower safe area.
- Expand repository evidence beyond the two selected root files when the
  bounded ingestion design is revisited.
