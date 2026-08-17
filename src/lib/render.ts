import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import sharp from "sharp";
import { activeRevision, type Project, type RenderJob, type Slide } from "@/lib/domain";

const outputRoot = process.env.IDEA2IMPACT_DATA_DIR
  ? path.join(path.resolve(process.env.IDEA2IMPACT_DATA_DIR), "renders")
  : path.join(process.cwd(), ".data", "renders");

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(value: string, length: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > length && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function slideSvg(slide: Slide, index: number): string {
  const dark = slide.layout === "hero" || slide.layout === "closing";
  const background = dark ? "#143f31" : "#fffef9";
  const foreground = dark ? "#ffffff" : "#10221b";
  const titleLines = wrapText(slide.title, 28).slice(0, 3);
  const title = titleLines
    .map((line, lineIndex) => `<text x="96" y="${250 + lineIndex * 78}" class="title">${escapeXml(line)}</text>`)
    .join("");
  const bullets = slide.bullets
    .slice(0, 4)
    .map(
      (bullet, bulletIndex) =>
        `<circle cx="108" cy="${485 + bulletIndex * 55}" r="6" fill="#c9ff45"/><text x="132" y="${493 + bulletIndex * 55}" class="bullet">${escapeXml(wrapText(bullet, 62)[0])}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <rect width="1280" height="720" fill="${background}"/>
  <style>
    text { font-family: Arial, sans-serif; fill: ${foreground}; }
    .meta { font-size: 15px; font-weight: 700; letter-spacing: 3px; }
    .kicker { font-size: 18px; font-weight: 700; fill: #75a944; letter-spacing: 2px; }
    .title { font-size: 64px; font-weight: 800; letter-spacing: -2px; }
    .bullet { font-size: 23px; }
  </style>
  <text x="96" y="70" class="meta">IDEA2IMPACT</text>
  <text x="1184" y="70" text-anchor="end" class="meta">${String(index + 1).padStart(2, "0")}</text>
  <text x="96" y="158" class="kicker">${escapeXml(slide.purpose.toUpperCase())}</text>
  ${title}${bullets}
  <rect x="96" y="665" width="1088" height="2" fill="${dark ? "#456658" : "#dce1d8"}"/>
  <text x="96" y="695" class="meta">IDEA → IMPACT</text>
</svg>`;
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed: ${stderr.slice(-2000)}`));
    });
  });
}

function probeDuration(file: string, cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { cwd, windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const duration = Number.parseFloat(stdout.trim());
      if (code === 0 && Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error(`ffprobe failed: ${stderr || stdout}`));
    });
  });
}

function synthesize(text: string, outputFile: string): Promise<void> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return Promise.reject(new Error("Azure Speech is not configured"));
  }
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName =
    process.env.AZURE_SPEECH_VOICE ?? "en-US-AvaMultilingualNeural";
  speechConfig.speechSynthesisOutputFormat =
    SpeechSDK.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
  const audioConfig = SpeechSDK.AudioConfig.fromAudioFileOutput(outputFile);
  const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);
  return new Promise((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) resolve();
        else reject(new Error(result.errorDetails || "Azure Speech synthesis failed"));
      },
      (error) => {
        synthesizer.close();
        reject(new Error(String(error)));
      },
    );
  });
}

function srtTimestamp(seconds: number): string {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export async function renderPresentation(
  project: Project,
  kind: RenderJob["kind"],
  renderId = randomUUID(),
): Promise<{ job: RenderJob; outputPath: string }> {
  const revision = activeRevision(project);
  if (!revision || project.approvedDeckRevisionId !== revision.id) {
    throw new Error("Approve the current deck before rendering");
  }
  const id = renderId;
  const jobDirectory = path.join(outputRoot, id);
  await fs.mkdir(jobDirectory, { recursive: true });
  const hasSpeech = Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
  if (kind === "final" && !hasSpeech) {
    throw new Error("Configure AZURE_SPEECH_KEY and AZURE_SPEECH_REGION for a narrated final video");
  }

  const segmentFiles: string[] = [];
  let elapsed = 0;
  const captions: string[] = [];
  const closingIndex = revision.slides.findIndex((slide) => slide.layout === "closing");
  const demoAsset = project.assets.find((asset) => asset.kind === "demo-video");
  if (demoAsset && closingIndex <= 0) {
    throw new Error("The demo clip needs a closing slide in the approved deck");
  }
  const demoIndex = closingIndex - 1;
  for (const [index, slide] of revision.slides.entries()) {
    const image = `slide-${index}.png`;
    const segment = `segment-${index}.mp4`;
    await sharp(Buffer.from(slideSvg(slide, index))).png().toFile(path.join(jobDirectory, image));
    const duration = slide.durationSeconds;
    let renderedDuration = duration;
    const segmentDemoAsset = index === demoIndex ? demoAsset : undefined;
    const visualInput = segmentDemoAsset
      ? ["-stream_loop", "-1", "-i", segmentDemoAsset.localPath]
      : ["-loop", "1", "-i", image];
    const visualFilter = segmentDemoAsset
      ? "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"
      : "scale=1280:720";
    if (hasSpeech) {
      const audio = `audio-${index}.wav`;
      await synthesize(slide.narration, path.join(jobDirectory, audio));
      renderedDuration = await probeDuration(audio, jobDirectory);
      await run(
        "ffmpeg",
        [
          "-y", ...visualInput, "-i", audio, "-c:v", "libx264",
          "-c:a", "aac", "-b:a", "160k", "-pix_fmt", "yuv420p",
          "-shortest", "-vf", visualFilter, segment,
        ],
        jobDirectory,
      );
    } else {
      await run(
        "ffmpeg",
        [
          "-y", ...visualInput, "-f", "lavfi", "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000", "-t", String(duration),
          "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", "-vf", visualFilter, segment,
        ],
        jobDirectory,
      );
    }
    captions.push(
      `${index + 1}\n${srtTimestamp(elapsed)} --> ${srtTimestamp(elapsed + renderedDuration)}\n${slide.narration}\n`,
    );
    elapsed += renderedDuration;
    segmentFiles.push(segment);
  }

  await fs.writeFile(
    path.join(jobDirectory, "segments.txt"),
    segmentFiles.map((file) => `file '${file}'`).join("\n"),
    "utf8",
  );
  await fs.writeFile(path.join(jobDirectory, "captions.srt"), captions.join("\n"), "utf8");
  await run(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", "segments.txt", "-c", "copy", "joined.mp4"],
    jobDirectory,
  );
  const output = "presentation.mp4";
  await run(
    "ffmpeg",
    [
      "-y", "-i", "joined.mp4", "-vf",
      "subtitles=captions.srt:force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=28'",
      "-c:v", "libx264", "-preset", kind === "preview" ? "veryfast" : "medium",
      "-crf", kind === "preview" ? "27" : "20", "-c:a", "copy", output,
    ],
    jobDirectory,
  );
  return {
    outputPath: path.join(jobDirectory, output),
    job: {
      id,
      revisionId: revision.id,
      kind,
      status: "complete",
      progress: 100,
      outputUrl: `/api/renders/${id}`,
    },
  };
}

export function renderOutputPath(id: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid render ID");
  return path.join(outputRoot, id, "presentation.mp4");
}
