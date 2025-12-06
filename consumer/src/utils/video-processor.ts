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

      ffmpeg.stderr.on("data", () => { }); // ignore output to avoid buffer overflow

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

/**
 * Build thumbnail filename
 */
export function getThumbnailFilename(originalPath: string): string {
  const ext = path.extname(originalPath);
  const base = originalPath.replace(ext, "");
  return `${base}_thumbnail.jpg`;
}

/**
 * Generate a static thumbnail image (frame at 0s)
 */
export async function generateThumbnail(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ffmpeg = spawn(FFMPEG_PATH, [
        "-y",             // overwrite
        "-i", videoPath,  // input
        "-ss", "00:00:00", // seek to start
        "-vframes", "1",  // single frame
        "-q:v", "2",      // quality (2-31, lower is better)
        outputPath,
      ]);

      ffmpeg.on("error", (err) => {
        console.error("[FFMPEG THUMBNAIL ERROR]", err);
        resolve();
      });

      ffmpeg.stderr.on("data", () => { }); // ignore

      ffmpeg.on("close", (code) => {
        if (code !== 0) {
          console.error(`[FFMPEG EXIT CODE ${code}] Failed to generate thumbnail`);
        } else {
          console.log("Thumbnail generated:", outputPath);
        }
        resolve();
      });
    } catch (err) {
      console.error("[THUMBNAIL GENERATION FAILED]", err);
      resolve();
    }
  });
}

/**
 * Compression options for FFmpeg
 */
export interface CompressionOptions {
  codec: string;
  crf: number;
  preset: string;
  audioBitrate: string;
}

/**
 * Result of compression operation
 */
export interface CompressionResult {
  success: boolean;
  outputPath: string;
  originalSize: number;
  compressedSize: number;
  reductionPercent: number;
  durationMs: number;
  error?: string;
}

/**
 * Build compressed filename
 */
export function getCompressedFilename(originalPath: string): string {
  const ext = path.extname(originalPath);
  const base = originalPath.replace(ext, "");
  return `${base}_compressed${ext}`; // Use same container format
}

/**
 * Compress video using FFmpeg
 */
export async function compressVideo(
  inputPath: string,
  outputPath: string,
  options: CompressionOptions
): Promise<CompressionResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    try {
      // Get original file size
      const originalStats = fs.statSync(inputPath);
      const originalSize = originalStats.size;

      const ffmpeg = spawn(FFMPEG_PATH, [
        "-y",
        "-i", inputPath,
        "-c:v", options.codec,
        "-crf", options.crf.toString(),
        "-preset", options.preset,
        "-c:a", "aac",
        "-b:a", options.audioBitrate,
        outputPath
      ]);

      ffmpeg.on("error", (err) => {
        console.error("[FFMPEG COMPRESSION ERROR]", err);
        resolve({
          success: false,
          outputPath: "",
          originalSize,
          compressedSize: 0,
          reductionPercent: 0,
          durationMs: Date.now() - startTime,
          error: err.message
        });
      });

      // Capture stderr for debugging if needed, but don't fill buffer
      ffmpeg.stderr.on("data", () => { });

      ffmpeg.on("close", (code) => {
        const durationMs = Date.now() - startTime;

        if (code !== 0) {
          console.error(`[FFMPEG COMPRESSION FAILED] Exit code ${code}`);
          resolve({
            success: false,
            outputPath: "",
            originalSize,
            compressedSize: 0,
            reductionPercent: 0,
            durationMs,
            error: `FFmpeg exit code ${code}`
          });
        } else {
          // Calculate stats
          const compressedStats = fs.statSync(outputPath);
          const compressedSize = compressedStats.size;
          const reductionPercent = ((originalSize - compressedSize) / originalSize) * 100;

          console.log(`Video compressed in ${durationMs}ms. Size: ${originalSize} -> ${compressedSize} (${reductionPercent.toFixed(1)}% reduction)`);

          resolve({
            success: true,
            outputPath,
            originalSize,
            compressedSize,
            reductionPercent,
            durationMs
          });
        }
      });

    } catch (err) {
      console.error("[COMPRESSION START FAILED]", err);
      resolve({
        success: false,
        outputPath: "",
        originalSize: 0,
        compressedSize: 0,
        reductionPercent: 0,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
}
