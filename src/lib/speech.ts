import { DefaultAzureCredential } from "@azure/identity";
import { promises as fs } from "node:fs";
import { PublicError } from "@/lib/http";

const speechScope = "https://cognitiveservices.azure.com/.default";
export type SpeechCue = {
  text: string;
  startSeconds: number;
  endSeconds: number;
};

type Boundary = {
  text: string;
  startSeconds: number;
  durationSeconds: number;
};

export function sentenceCues(
  text: string,
  durationSeconds: number,
  boundaries: Boundary[],
): SpeechCue[] {
  const usable = boundaries
    .filter(
      (boundary) =>
        boundary.text.trim() &&
        Number.isFinite(boundary.startSeconds) &&
        boundary.startSeconds >= 0 &&
        boundary.startSeconds < durationSeconds,
    )
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (usable.length) {
    return usable.map((boundary, index) => {
      const nextStart = usable[index + 1]?.startSeconds ?? durationSeconds;
      const metadataEnd = boundary.startSeconds + boundary.durationSeconds;
      return {
        text: boundary.text.trim(),
        startSeconds: boundary.startSeconds,
        endSeconds: Math.min(
          durationSeconds,
          Math.max(boundary.startSeconds + 0.05, metadataEnd, nextStart),
        ),
      };
    });
  }

  const sentences =
    text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ??
    [text.trim()];
  const totalCharacters = Math.max(
    1,
    sentences.reduce((total, sentence) => total + sentence.length, 0),
  );
  let elapsed = 0;
  return sentences.map((sentence, index) => {
    const startSeconds = elapsed;
    elapsed =
      index === sentences.length - 1
        ? durationSeconds
        : Math.min(
            durationSeconds,
            elapsed + (durationSeconds * sentence.length) / totalCharacters,
          );
    return { text: sentence, startSeconds, endSeconds: elapsed };
  });
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function speechHeaders(): Promise<Record<string, string>> {
  const region = process.env.AZURE_SPEECH_REGION;
  if (!region) {
    throw new PublicError("Configure AZURE_SPEECH_REGION for narration.", 503);
  }

  if (process.env.AZURE_SPEECH_USE_AZURE_CREDENTIAL !== "false") {
    const resourceId = process.env.AZURE_SPEECH_RESOURCE_ID;
    if (!resourceId && !process.env.AZURE_SPEECH_KEY) {
      throw new PublicError(
        "Configure AZURE_SPEECH_RESOURCE_ID for passwordless narration.",
        503,
      );
    }
    try {
      const accessToken = await new DefaultAzureCredential().getToken(speechScope);
      if (accessToken?.token && resourceId) {
        const speechToken = `aad#${resourceId}#${accessToken.token}`;
        return { Authorization: "Bearer " + speechToken };
      }
    } catch (error) {
      if (!process.env.AZURE_SPEECH_KEY) {
        throw new PublicError(
          "Azure Speech authentication failed. Run az login and verify the Speech User role.",
          503,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  if (process.env.AZURE_SPEECH_KEY) {
    return { "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY };
  }
  throw new PublicError(
    "Azure Speech authentication is not configured. Run az login or provide the fallback key.",
    503,
  );
}

export async function synthesizeSpeech(
  text: string,
  outputFile: string,
): Promise<Boundary[]> {
  const region = process.env.AZURE_SPEECH_REGION;
  if (!region) {
    throw new PublicError("Configure AZURE_SPEECH_REGION for narration.", 503);
  }
  const endpoint = `https://${region}.tts.speech.microsoft.com/`;
  const voice = process.env.AZURE_SPEECH_VOICE ?? "en-US-AvaMultilingualNeural";
  const response = await fetch(
    new URL("cognitiveservices/v1", endpoint.endsWith("/") ? endpoint : `${endpoint}/`),
    {
      method: "POST",
      headers: {
        ...(await speechHeaders()),
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "User-Agent": "Idea2Impact-local",
      },
      body: `<speak version="1.0" xml:lang="en-US"><voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`,
    },
  );
  if (!response.ok) {
    throw new PublicError(
      "Azure Speech could not synthesize narration. Verify Speech User access and try again.",
      502,
      `Speech synthesis returned HTTP ${response.status}`,
    );
  }
  await fs.writeFile(outputFile, Buffer.from(await response.arrayBuffer()));
  return [];
}
