import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { VideoQueue } from "./queue";
import { DeadLetterQueue } from "./dead-letter-queue";
import { VideoRegistry } from "./video-registry";
import { Logger } from "./logger";
import { validateFilePath, streamVideoWithRangeSupport } from "./streaming-utils";

dotenv.config();

const logger = new Logger('API-Server');

// Directories
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploaded-videos";
const PREVIEW_DIR = "./previews";

const WEB_PORT = Number(process.env.WEB_PORT) || 3000;

// Ensure required dirs exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });

const app = express();
app.use(cors());

// Serve built web GUI
app.use(express.static(path.join(__dirname, "../../web-gui/dist")));
app.use(express.json());

/** Utility: scan uploaded videos and extract metadata */
function buildVideoList() {
  const allowedExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm"];

  const files = fs.readdirSync(UPLOAD_DIR)
    .filter(f => allowedExtensions.includes(path.extname(f).toLowerCase()));

  return files.map(filename => {
    const filePath = path.join(UPLOAD_DIR, filename);
    const stats = fs.statSync(filePath);

    // Use filename hash as unique ID
    const id = Buffer.from(filename).toString("base64").replace(/=/g, "");

    const previewPath = path.join(PREVIEW_DIR, filename);

    return {
      id,
      originalFilename: filename,
      uploadTime: stats.mtime.toISOString(),
      fileSize: stats.size,
      hasPreview: fs.existsSync(previewPath),
      videoUrl: `/videos/${filename}`,
      previewUrl: `/videos/${filename}/preview`
    };
  });
}
/**
 * GET /api/videos
 * List all uploaded videos
 */
app.get("/api/videos", (req, res) => {
  try {
    const videos = buildVideoList();
    res.json({ videos });
  } catch (err) {
    res.status(500).json({ error: "Failed to list videos" });
  }
});

/**
 * GET /api/videos/:id
 * Get video metadata by ID
 */
app.get("/api/videos/:id", (req, res) => {
  const id = req.params.id;
  const videos = buildVideoList();

  const video = videos.find(v => v.id === id);
  if (!video) return res.status(404).json({ error: "Video not found" });

  res.json(video);
});

/**
 * GET /videos/:filename
 * Stream full video file with Range request support
 */
app.get("/videos/:filename", (req, res) => {
  const filePath = validateFilePath(req.params.filename, UPLOAD_DIR);

  if (!filePath) {
    return res.status(404).send("Video not found");
  }

  streamVideoWithRangeSupport(filePath, req.params.filename, req, res);
});

/**
 * GET /videos/:filename/preview
 * Stream preview clip with Range request support
 */
app.get("/videos/:filename/preview", (req, res) => {
  const previewPath = validateFilePath(req.params.filename, PREVIEW_DIR);

  if (!previewPath) {
    return res.status(404).send("Preview not found");
  }

  streamVideoWithRangeSupport(previewPath, req.params.filename, req, res);
});

/**
 * GET /api/queue/status
 * Get current queue status
 */
app.get("/api/queue/status", (req, res) => {
  try {
    const queue = VideoQueue.getInstance();

    res.json({
      currentSize: queue.getSize(),
      maxSize: queue.getMaxSize(),
      isFull: queue.isFull(),
      utilization: queue.getUtilization()
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get queue status" });
  }
});

/**
 * GET /api/dlq/status
 * Get Dead Letter Queue status and failed jobs
 */
app.get("/api/dlq/status", (req, res) => {
  try {
    const dlq = DeadLetterQueue.getInstance();
    const failedJobs = dlq.getAll();

    res.json({
      size: dlq.getSize(),
      jobs: failedJobs.map(failed => ({
        jobId: failed.job.id,
        filename: failed.job.filename,
        producerId: failed.job.producerId,
        error: failed.error,
        failedAt: failed.failedAt,
        attempts: failed.attempts
      }))
    });

  } catch (err) {
    logger.error("Failed to get DLQ status:", err);
    res.status(500).json({ error: "Failed to get DLQ status" });
  }
});

/**
 * GET /api/registry/status
 * Get hash registry status and entries
 */
app.get("/api/registry/status", (req, res) => {
  try {
    const registry = VideoRegistry.getInstance();
    const entries = registry.getAll();

    res.json({
      size: registry.getSize(),
      entries: entries.map(({ hash, entry }) => ({
        hash: hash.substring(0, 8) + '...',  // Truncate for readability
        fullHash: hash,
        filename: entry.filename,
        path: entry.path,
        producerId: entry.producerId,
        uploadedAt: entry.uploadedAt
      }))
    });
  } catch (err) {
    logger.error("Failed to get registry status:", err);
    res.status(500).json({ error: "Failed to get registry status" });
  }
});

/**
 * POST /api/registry/cleanup
 * Remove entries for files that no longer exist on disk
 */
app.post("/api/registry/cleanup", (req, res) => {
  try {
    const registry = VideoRegistry.getInstance();
    const removedCount = registry.validateAndCleanup();

    res.json({
      message: `Cleanup complete`,
      removedEntries: removedCount,
      remainingEntries: registry.getSize()
    });
  } catch (err) {
    logger.error("Failed to cleanup registry:", err);
    res.status(500).json({ error: "Failed to cleanup registry" });
  }
});

/**
 * DELETE /api/registry/clear
 * Clear all entries from the registry
 */
app.delete("/api/registry/clear", (req, res) => {
  try {
    const registry = VideoRegistry.getInstance();
    const previousSize = registry.getSize();
    registry.clear();

    res.json({
      message: "Registry cleared",
      clearedEntries: previousSize
    });
  } catch (err) {
    logger.error("Failed to clear registry:", err);
    res.status(500).json({ error: "Failed to clear registry" });
  }
});

/**
 * GET /api/health
 * Health check endpoint for load balancers and monitoring
 */
app.get("/api/health", (req, res) => {
  try {
    const queue = VideoQueue.getInstance();
    const dlq = DeadLetterQueue.getInstance();
    const registry = VideoRegistry.getInstance();

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        queue: {
          size: queue.getSize(),
          maxSize: queue.getMaxSize(),
          healthy: !queue.isFull()
        },
        dlq: {
          size: dlq.getSize(),
          healthy: true
        },
        registry: {
          size: registry.getSize(),
          healthy: true
        }
      }
    });
  } catch (err) {
    logger.error("Health check failed:", err);
    res.status(500).json({ status: "unhealthy", error: "Health check failed" });
  }
});

/**
 * DELETE /api/videos/:id
 * Delete a video by ID
 */
app.delete("/api/videos/:id", (req, res) => {
  try {
    const id = req.params.id;
    const videos = buildVideoList();
    const video = videos.find(v => v.id === id);

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    const filePath = path.join(UPLOAD_DIR, video.originalFilename);
    const previewPath = path.join(PREVIEW_DIR, video.originalFilename);

    // Delete the video file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Deleted video: ${video.originalFilename}`);
    }

    // Delete the preview if it exists
    if (fs.existsSync(previewPath)) {
      fs.unlinkSync(previewPath);
      logger.info(`Deleted preview: ${video.originalFilename}`);
    }

    // Clean up registry entry if it exists
    const registry = VideoRegistry.getInstance();
    registry.validateAndCleanup();

    res.json({
      message: "Video deleted successfully",
      filename: video.originalFilename
    });
  } catch (err) {
    logger.error("Failed to delete video:", err);
    res.status(500).json({ error: "Failed to delete video" });
  }
});

/**
 * POST /api/dlq/retry/:jobId
 * Retry a failed job from the Dead Letter Queue
 */
app.post("/api/dlq/retry/:jobId", (req, res) => {
  try {
    const jobId = req.params.jobId;
    const dlq = DeadLetterQueue.getInstance();
    const queue = VideoQueue.getInstance();

    const failedJobs = dlq.getAll();
    const failedJob = failedJobs.find(f => f.job.id === jobId);

    if (!failedJob) {
      return res.status(404).json({ error: "Job not found in DLQ" });
    }

    // Check if queue has space
    if (queue.isFull()) {
      return res.status(503).json({ error: "Queue is full, cannot retry job" });
    }

    // Re-enqueue the job
    const jobAdded = queue.enqueue({
      filename: failedJob.job.filename,
      data: failedJob.job.data,
      producerId: failedJob.job.producerId,
      md5Hash: failedJob.job.md5Hash
    });

    if (!jobAdded) {
      return res.status(503).json({ error: "Failed to re-enqueue job" });
    }

    // Remove from DLQ
    dlq.removeById(jobId);

    logger.info(`Retried job ${jobId} from DLQ`);

    res.json({
      message: "Job re-queued successfully",
      jobId: jobId,
      filename: failedJob.job.filename
    });
  } catch (err) {
    logger.error("Failed to retry job:", err);
    res.status(500).json({ error: "Failed to retry job" });
  }
});

/**
 * DELETE /api/dlq/:jobId
 * Remove a specific job from the Dead Letter Queue
 */
app.delete("/api/dlq/:jobId", (req, res) => {
  try {
    const jobId = req.params.jobId;
    const dlq = DeadLetterQueue.getInstance();

    const removed = dlq.removeById(jobId);

    if (!removed) {
      return res.status(404).json({ error: "Job not found in DLQ" });
    }

    res.json({
      message: "Job removed from DLQ",
      jobId: jobId
    });
  } catch (err) {
    logger.error("Failed to remove job from DLQ:", err);
    res.status(500).json({ error: "Failed to remove job from DLQ" });
  }
});

/**
 * DELETE /api/dlq/clear
 * Clear all jobs from the Dead Letter Queue
 */
app.delete("/api/dlq/clear", (req, res) => {
  try {
    const dlq = DeadLetterQueue.getInstance();
    const previousSize = dlq.getSize();
    dlq.clear();

    res.json({
      message: "DLQ cleared",
      clearedJobs: previousSize
    });
  } catch (err) {
    logger.error("Failed to clear DLQ:", err);
    res.status(500).json({ error: "Failed to clear DLQ" });
  }
});

/** Export starter function */
export function startApiServer() {
  app.listen(WEB_PORT, () => {
    console.log(`REST API running at http://localhost:${WEB_PORT}`);
  });
}