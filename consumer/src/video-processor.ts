import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// Load FFmpeg path from environment or default to system PATH
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";

// Preview duration (seconds)
const PREVIEW_DURATION = parseInt(process.env.PREVIEW_DURATION || "10", 10);

// Supported video formats
const SUPPORTED_FORMATS = ["mp4", "avi", "mov", "mkv"];

/**
 * Validate if file is a supported video format
 */
export function validateVideoFile(videoPath: string): boolean {
  const ext = path.extname(videoPath).toLowerCase().replace(".", "");
  return SUPPORTED_FORMATS.includes(ext);
}

/**
 * Build preview filename
 */
export function getPreviewFilename(originalPath: string): string {
  const ext = path.extname(originalPath);
  const base = originalPath.replace(ext, "");
  return `${base}_preview${ext}`;
}

/**
 * Generate a preview video (first N seconds) using only FFmpeg
 */
export async function generatePreview(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ffmpeg = spawn(FFMPEG_PATH, [
        "-y",             // overwrite
        "-i", videoPath,  // input
        "-t", PREVIEW_DURATION.toString(), // first N seconds
        "-c", "copy",     // copy codec for speed
        outputPath,
      ]);

      ffmpeg.on("error", (err) => {
        console.error("[FFMPEG SPAWN ERROR]", err);
        resolve(); // never block consumer
      });

      ffmpeg.stderr.on("data", () => {}); // ignore output to avoid buffer overflow

      ffmpeg.on("close", (code) => {
        if (code !== 0) {
          console.error(`[FFMPEG EXIT CODE ${code}] Failed to generate preview`);
        } else {
          console.log("Preview generated:", outputPath);
        }
        resolve(); // always resolve
      });
    } catch (err) {
      console.error("[PREVIEW GENERATION FAILED]", err);
      resolve(); // prevent blocking upload
    }
  });
}
