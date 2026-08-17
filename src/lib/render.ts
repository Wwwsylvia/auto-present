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

function wrapText(value: string, length: number, maximumLines = 3): string[] {
  const words = value
    .trim()
    .split(/\s+/)
    .flatMap((word) => {
      if (word.length <= length) return [word];
      const chunks: string[] = [];
      for (let index = 0; index < word.length; index += length) {
        chunks.push(word.slice(index, index + length));
      }
      return chunks;
    });
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
  if (lines.length <= maximumLines) return lines;
  const visible = lines.slice(0, maximumLines);
  visible[maximumLines - 1] = `${visible[maximumLines - 1].replace(/[.,;:!?-]*$/, "")}…`;
  return visible;
}

type RenderTheme = {
 background: string;
 surface: string;
 foreground: string;
 muted: string;
 accent: string;
 accentSoft: string;
 line: string;
};

const themes: Record<Slide["layout"], RenderTheme> = {
 hero: { background: "#103C35", surface: "#184D44", foreground: "#F7F8F2", muted: "#B7CDC3", accent: "#D8FF5B", accentSoft: "#286258", line: "#3C6F65" },
 problem: { background: "#FFF8F0", surface: "#FFFFFF", foreground: "#28201C", muted: "#7C6C63", accent: "#E85D43", accentSoft: "#FCE1D9", line: "#EBCFC5" },
 solution: { background: "#F5FAEF", surface: "#FFFFFF", foreground: "#183326", muted: "#607467", accent: "#58A568", accentSoft: "#DCEFD8", line: "#C9E0C4" },
 comparison: { background: "#F4F7FC", surface: "#FFFFFF", foreground: "#182640", muted: "#61708B", accent: "#426FDD", accentSoft: "#DCE6FF", line: "#CED9EF" },
 process: { background: "#FFFAEF", surface: "#FFFFFF", foreground: "#332B18", muted: "#786F5D", accent: "#D29432", accentSoft: "#F8E6BF", line: "#E9D8AF" },
 architecture: { background: "#13233A", surface: "#1B3150", foreground: "#F5F8FF", muted: "#B4C2D8", accent: "#67D5FF", accentSoft: "#264A70", line: "#3C5D80" },
 evidence: { background: "#F8F6FF", surface: "#FFFFFF", foreground: "#2E2640", muted: "#756C88", accent: "#8C63D8", accentSoft: "#E9DFFF", line: "#DCCFF2" },
 demo: { background: "#101C2B", surface: "#172C43", foreground: "#F4F8FC", muted: "#B5C6D6", accent: "#4EE0BB", accentSoft: "#1E4A50", line: "#355469" },
 closing: { background: "#103C35", surface: "#184D44", foreground: "#F7F8F2", muted: "#B7CDC3", accent: "#D8FF5B", accentSoft: "#286258", line: "#3C6F65" },
};

function textBlock(
 value: string,
 x: number,
 y: number,
 lineLength: number,
 className: string,
 lineHeight: number,
 anchor?: "start" | "middle" | "end",
 maximumLines = 3,
): string {
 const lines = wrapText(value, lineLength, maximumLines);
 const textAnchor = anchor ? ` text-anchor="${anchor}"` : "";
 return `<text x="${x}" y="${y}" class="${className}"${textAnchor}>${lines
   .map((line, lineIndex) => `<tspan x="${x}" dy="${lineIndex === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
   .join("")}</text>`;
}

function layoutBackdrop(layout: Slide["layout"], theme: RenderTheme): string {
 switch (layout) {
   case "hero":
     return `<path d="M802 0H1280V720H620C823 551 893 290 802 0Z" fill="${theme.surface}"/><circle cx="1080" cy="205" r="178" fill="none" stroke="${theme.accentSoft}" stroke-width="2"/><circle cx="1080" cy="205" r="112" fill="${theme.accentSoft}"/>`;
   case "problem":
     return `<path d="M0 0H1280V122H0Z" fill="${theme.accentSoft}"/><path d="M1120 720H1280V390L1120 530Z" fill="${theme.accentSoft}"/>`;
   case "solution":
     return `<circle cx="1155" cy="120" r="235" fill="${theme.accentSoft}"/><path d="M0 665H1280V720H0Z" fill="${theme.accentSoft}"/>`;
   case "comparison":
     return `<path d="M640 0V720" stroke="${theme.line}" stroke-width="2"/><rect x="80" y="170" width="1120" height="7" rx="3.5" fill="${theme.accent}"/>`;
   case "process":
     return `<path d="M0 0H1280V720H0Z" fill="${theme.background}"/><path d="M0 720L380 390L650 720Z" fill="${theme.accentSoft}"/>`;
   case "architecture":
     return `<path d="M0 0H1280V104H0Z" fill="${theme.surface}"/><path d="M1000 0L1280 0V720H1110Z" fill="${theme.surface}"/>`;
   case "evidence":
     return `<path d="M948 0H1280V720H1010C917 520 916 242 948 0Z" fill="${theme.accentSoft}"/><circle cx="1110" cy="118" r="48" fill="${theme.accent}"/>`;
   case "demo":
     return `<rect x="48" y="48" width="1184" height="624" rx="28" fill="${theme.surface}"/><circle cx="1165" cy="96" r="8" fill="${theme.accent}"/>`;
   case "closing":
     return `<path d="M0 530C248 360 487 734 744 536C936 388 1083 462 1280 360V720H0Z" fill="${theme.surface}"/><circle cx="1120" cy="150" r="196" fill="${theme.accentSoft}"/>`;
 }
}

function renderVisual(slide: Slide, theme: RenderTheme): string {
 const { visual } = slide;
 switch (visual.type) {
   case "statement":
     return `<g data-visual="statement" class="visual-statement">
       <path d="M760 292h32v70h-56v-35c0-49 23-79 69-91v25c-26 7-41 18-45 31Zm126 0h32v70h-56v-35c0-49 23-79 69-91v25c-26 7-41 18-45 31Z" fill="${theme.accent}"/>
       ${textBlock(visual.statement, 80, 332, 47, "statement", 49)}
       <rect x="80" y="544" width="480" height="5" rx="2.5" fill="${theme.accent}"/>
       ${textBlock(slide.audienceTakeaway, 80, 590, 72, "takeaway", 25)}
     </g>`;
   case "cards": {
     const width = 1040 / visual.cards.length;
     return `<g data-visual="cards" class="visual-cards">${visual.cards.map((card, index) => {
       const x = 80 + index * (width + 20);
       return `<g><rect x="${x}" y="278" width="${width}" height="282" rx="18" fill="${theme.surface}" stroke="${theme.line}" stroke-width="2"/>
         <rect x="${x}" y="278" width="${width}" height="10" rx="5" fill="${theme.accent}"/>
         <text x="${x + 28}" y="348" class="card-number">0${index + 1}</text>
         ${textBlock(card.heading, x + 28, 402, 18, "card-heading", 30)}
         ${card.body ? textBlock(card.body, x + 28, 476, 27, "card-body", 23) : ""}</g>`;
     }).join("")}</g>`;
   }
   case "flow": {
     const gap = 1050 / (visual.steps.length - 1);
     return `<g data-visual="flow" class="visual-flow"><path d="M115 442H1165" stroke="${theme.line}" stroke-width="5" stroke-linecap="round"/>
       ${visual.steps.map((step, index) => {
         const x = 115 + index * gap;
         return `<g><circle cx="${x}" cy="442" r="34" fill="${theme.accent}"/><text x="${x}" y="450" text-anchor="middle" class="step-number">${index + 1}</text>
           ${textBlock(step.label, x, 352, 14, "flow-label", 25, "middle")}
           ${step.detail ? textBlock(step.detail, x, 526, 20, "flow-detail", 20, "middle") : ""}</g>`;
       }).join("")}</g>`;
   }
   case "comparison":
     return `<g data-visual="comparison" class="visual-comparison">
       <rect x="80" y="260" width="520" height="56" rx="10" fill="${theme.accentSoft}"/><rect x="620" y="260" width="580" height="56" rx="10" fill="${theme.accent}"/>
       ${textBlock(visual.leftLabel, 108, 296, 30, "comparison-head", 18)}${textBlock(visual.rightLabel, 648, 296, 34, "comparison-head inverse", 18)}
       ${visual.rows.map((row, index) => {
         const y = 345 + index * 58;
         return `<g><rect x="80" y="${y}" width="1120" height="48" rx="8" fill="${index % 2 ? theme.surface : theme.accentSoft}"/>
           ${textBlock(row.label, 104, y + 22, 20, "row-label", 16, "start", 2)}
           ${textBlock(row.left, 332, y + 30, 28, "row-value", 18)}
           ${textBlock(row.right, 760, y + 30, 31, "row-value", 18)}</g>`;
       }).join("")}</g>`;
   case "metrics": {
     const width = 1080 / visual.metrics.length;
     return `<g data-visual="metrics" class="visual-metrics">${visual.metrics.map((metric, index) => {
       const x = 100 + index * width;
       return `<g>${index ? `<path d="M${x - 28} 288V560" stroke="${theme.line}" stroke-width="2"/>` : ""}
         ${textBlock(metric.value, x, 400, 10, "metric-value", 58, "start", 1)}
         ${textBlock(metric.label, x, 452, 20, "metric-label", 25)}
         ${metric.detail ? textBlock(metric.detail, x, 522, 24, "metric-detail", 21) : ""}</g>`;
     }).join("")}</g>`;
   }
   case "timeline": {
     const gap = 1040 / (visual.events.length - 1);
     return `<g data-visual="timeline" class="visual-timeline"><path d="M120 432H1160" stroke="${theme.line}" stroke-width="4"/>
       ${visual.events.map((event, index) => {
         const x = 120 + index * gap;
         const above = index % 2 === 0;
         const titleY = above ? 324 : 524;
         const detailY = above ? 354 : 554;
         return `<g><circle cx="${x}" cy="432" r="15" fill="${theme.accent}"/><text x="${x}" y="438" text-anchor="middle" class="timeline-number">${index + 1}</text>
           ${textBlock(event.label, x, titleY, 15, "timeline-label", 22, "middle")}
           ${event.detail ? textBlock(event.detail, x, detailY, 19, "timeline-detail", 18, "middle") : ""}</g>`;
       }).join("")}</g>`;
   }
   case "demo":
     return `<g data-visual="demo" class="visual-demo">
       <rect x="80" y="260" width="1120" height="320" rx="18" fill="${theme.background}" stroke="${theme.line}" stroke-width="2"/>
       <text x="116" y="306" class="demo-kicker">LIVE DEMO · ONE CLEAR OUTCOME</text>
       ${[
         ["01", "SETUP", visual.setup],
         ["02", "ACTION", visual.action],
         ["03", "PAYOFF", visual.payoff],
       ].map(([number, label, body], index) => {
         const x = 116 + index * 350;
         return `<g><circle cx="${x + 22}" cy="370" r="22" fill="${theme.accent}"/><text x="${x + 22}" y="376" text-anchor="middle" class="demo-number">${number}</text>
           <text x="${x}" y="432" class="demo-label">${label}</text>${textBlock(body, x, 470, 29, "demo-body", 22)}</g>`;
       }).join("")}
     </g>`;
 }
}

function renderBulletRail(bullets: readonly string[]): string {
 if (bullets.length === 0) return "";
 const lines = bullets.flatMap((bullet) => {
   const wrapped = wrapText(bullet, 132, 2);
   return wrapped.map((line, index) => `${index === 0 ? "• " : "  "}${line}`);
 }).slice(0, 8);
 const y = Math.max(555, 654 - lines.length * 14);
 return `<g class="bullet-rail"><text x="80" y="${y - 12}" class="bullet-heading">SUPPORTING DETAIL</text>
   <text x="80" y="${y}" class="bullet">${lines
     .map((line, index) => `<tspan x="80" dy="${index === 0 ? 0 : 14}">${escapeXml(line)}</tspan>`)
     .join("")}</text></g>`;
}

/** Renders the deck's approved content without I/O so preview and video rendering share a composition. */
export function renderSlideSvg(slide: Slide, index: number): string {
 const theme = themes[slide.layout];
 const heroLike = slide.layout === "hero" || slide.layout === "closing";
 const titleX = heroLike ? 80 : 80;
 const titleY = heroLike ? 190 : 165;
 const titleLength = heroLike ? 27 : 37;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" data-layout="${slide.layout}">
   <rect width="1280" height="720" fill="${theme.background}"/>
   ${layoutBackdrop(slide.layout, theme)}
   <style>
     text { font-family: Arial, Helvetica, sans-serif; fill: ${theme.foreground}; }
     .meta { font-size: 13px; font-weight: 700; letter-spacing: 2.6px; fill: ${theme.muted}; }
     .kicker, .demo-kicker { font-size: 14px; font-weight: 800; letter-spacing: 2px; fill: ${theme.accent}; }
     .title { font-size: ${heroLike ? 62 : 48}px; font-weight: 800; letter-spacing: -1.8px; }
     .statement { font-size: 39px; font-weight: 700; letter-spacing: -1px; }
     .takeaway { font-size: 17px; fill: ${theme.muted}; }
     .card-number, .step-number, .timeline-number, .demo-number { font-size: 16px; font-weight: 800; fill: ${theme.background}; }
     .card-heading, .flow-label, .timeline-label { font-size: 22px; font-weight: 800; }
     .card-body, .flow-detail, .timeline-detail, .metric-detail, .demo-body { font-size: 16px; fill: ${theme.muted}; }
     .comparison-head { font-size: 16px; font-weight: 800; letter-spacing: 1px; } .inverse { fill: #FFFFFF; }
     .row-label { font-size: 15px; font-weight: 800; } .row-value { font-size: 15px; fill: ${theme.muted}; }
     .metric-value { font-size: 68px; font-weight: 800; letter-spacing: -2px; fill: ${theme.accent}; }
     .metric-label { font-size: 19px; font-weight: 800; } .demo-label { font-size: 13px; font-weight: 800; letter-spacing: 1.5px; fill: ${theme.accent}; }
     .bullet-heading { font-size: 10px; font-weight: 800; letter-spacing: 1.4px; fill: ${theme.accent}; }
     .bullet { font-size: 12px; fill: ${theme.muted}; }
   </style>
   <text x="80" y="48" class="meta">IDEA2IMPACT / ${escapeXml(slide.layout.toUpperCase())}</text>
   <text x="1200" y="48" text-anchor="end" class="meta">${String(index + 1).padStart(2, "0")}</text>
   ${textBlock(slide.purpose.toUpperCase(), titleX, heroLike ? 105 : 95, 42, "kicker", 18, "start", 2)}
   ${textBlock(slide.title, titleX, titleY, titleLength, "title", heroLike ? 66 : 52, "start", heroLike ? 2 : 3)}
   ${renderVisual(slide, theme)}
   ${renderBulletRail(slide.bullets)}
   <path d="M80 672H1200" stroke="${theme.line}" stroke-width="2"/>
   <text x="80" y="700" class="meta">IDEA → IMPACT</text>
 </svg>`;
}

export function findDemoSlideIndex(slides: readonly Pick<Slide, "layout" | "visual">[]): number | undefined {
 const index = slides.findIndex((slide) => slide.layout === "demo" && slide.visual.type === "demo");
 return index === -1 ? undefined : index;
}

export function resolveDemoFootageIndex(
 slides: readonly Pick<Slide, "layout" | "visual">[],
 hasDemoAsset: boolean,
): number | undefined {
 const demoIndex = findDemoSlideIndex(slides);
 if (hasDemoAsset && demoIndex === undefined) {
   throw new Error("The approved deck has a demo video asset but no semantic demo slide");
 }
 return demoIndex;
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

export function audioTimingFilter(inputSeconds: number, targetSeconds: number): string {
  if (!(inputSeconds > 0) || !(targetSeconds > 0)) {
    throw new Error("Audio timing requires positive input and target durations");
  }
  let ratio = inputSeconds / targetSeconds;
  const filters: string[] = [];
  while (ratio > 2) {
    filters.push("atempo=2");
    ratio /= 2;
  }
  while (ratio < 0.5) {
    filters.push("atempo=0.5");
    ratio /= 0.5;
  }
  if (Math.abs(ratio - 1) > 0.001) filters.push(`atempo=${ratio.toFixed(6)}`);
  filters.push(`apad`, `atrim=duration=${targetSeconds}`);
  return filters.join(",");
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
): Promise<{ job: RenderJob; outputPath: string; footageUsed: boolean }> {
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
  const demoAsset = project.assets.find((asset) => asset.kind === "demo-video");
  const demoIndex = resolveDemoFootageIndex(revision.slides, Boolean(demoAsset));
  for (const [index, slide] of revision.slides.entries()) {
    const image = `slide-${index}.png`;
    const segment = `segment-${index}.mp4`;
    await sharp(Buffer.from(renderSlideSvg(slide, index))).png().toFile(path.join(jobDirectory, image));
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
      const audioDuration = await probeDuration(audio, jobDirectory);
      renderedDuration = duration;
      await run(
        "ffmpeg",
        [
          "-y", ...visualInput, "-i", audio, "-c:v", "libx264",
          "-map", "0:v:0", "-map", "1:a:0",
          "-c:a", "aac", "-b:a", "160k", "-pix_fmt", "yuv420p",
          "-t", String(duration), "-af", audioTimingFilter(audioDuration, duration),
          "-vf", visualFilter, segment,
        ],
        jobDirectory,
      );
    } else {
      await run(
        "ffmpeg",
        [
          "-y", ...visualInput, "-f", "lavfi", "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000", "-t", String(duration),
          "-map", "0:v:0", "-map", "1:a:0",
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
    footageUsed: Boolean(demoAsset && demoIndex !== undefined),
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
