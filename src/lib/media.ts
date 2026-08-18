import { spawn } from "node:child_process";
import { z } from "zod";
import { PublicError } from "@/lib/http";

const probeSchema = z.object({
  format: z.object({
    duration: z.string().transform(Number),
    format_name: z.string(),
  }),
  streams: z.array(
    z.object({
      codec_type: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  ),
});

export type MediaProbe = {
  durationSeconds: number;
  formatNames: string[];
  width: number;
  height: number;
};

export function probeMedia(file: string): Promise<MediaProbe> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name:stream=codec_type,width,height",
        "-of",
        "json",
        file,
      ],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      reject(
        new PublicError(
          "FFprobe is required to validate demo videos.",
          503,
          error.message,
        ),
      );
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new PublicError(
            "The demo video is not decodable.",
            400,
            stderr || "ffprobe failed",
          ),
        );
        return;
      }
      try {
        const parsed = probeSchema.parse(JSON.parse(stdout));
        const video = parsed.streams.find((stream) => stream.codec_type === "video");
        if (
          !video ||
          !Number.isFinite(parsed.format.duration) ||
          parsed.format.duration <= 0
        ) {
          throw new Error("Missing a valid video stream or duration");
        }
        resolve({
          durationSeconds: parsed.format.duration,
          formatNames: parsed.format.format_name.split(","),
          width: video.width ?? 0,
          height: video.height ?? 0,
        });
      } catch (error) {
        reject(
          new PublicError(
            "The demo video is missing valid media metadata.",
            400,
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    });
  });
}

export function validateDemoProbe(probe: MediaProbe): void {
  const supported = new Set(["mov", "mp4", "m4a", "3gp", "3g2", "mj2", "matroska", "webm"]);
  if (!probe.formatNames.some((name) => supported.has(name))) {
    throw new PublicError("Use an MP4, WebM, or QuickTime video.", 400);
  }
  if (probe.durationSeconds > 180) {
    throw new PublicError("Demo videos must be three minutes or shorter.", 400);
  }
  if (
    probe.width <= 0 ||
    probe.height <= 0 ||
    probe.width > 3840 ||
    probe.height > 2160
  ) {
    throw new PublicError("Demo videos must be no larger than 3840×2160.", 400);
  }
}
