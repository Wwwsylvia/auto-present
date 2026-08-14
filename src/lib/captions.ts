export type SpeechBoundary = {
  text: string;
  textOffset: number;
  audioOffsetSeconds: number;
  durationSeconds: number;
};

export type CaptionCue = {
  text: string;
  startSeconds: number;
  endSeconds: number;
};

export function sentenceCaptionCues(
  narration: string,
  boundaries: SpeechBoundary[],
  audioDurationSeconds: number,
): CaptionCue[] {
  if (boundaries.length === 0) {
    throw new Error("Azure Speech returned no sentence boundaries");
  }

  return boundaries.map((boundary, index) => {
    const next = boundaries[index + 1];
    const text =
      narration.slice(boundary.textOffset, boundary.textOffset + boundary.text.length).trim() ||
      boundary.text.trim();
    const naturalEnd = boundary.audioOffsetSeconds + boundary.durationSeconds;
    const endSeconds = Math.min(
      audioDurationSeconds,
      Math.max(boundary.audioOffsetSeconds + 0.05, next?.audioOffsetSeconds ?? naturalEnd),
    );
    if (!text || endSeconds <= boundary.audioOffsetSeconds) {
      throw new Error("Azure Speech returned an invalid sentence boundary");
    }
    return {
      text,
      startSeconds: boundary.audioOffsetSeconds,
      endSeconds,
    };
  });
}

export function srtTimestamp(seconds: number): string {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function cuesToSrt(cues: CaptionCue[]): string {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${srtTimestamp(cue.startSeconds)} --> ${srtTimestamp(cue.endSeconds)}\n${cue.text}\n`,
    )
    .join("\n");
}
