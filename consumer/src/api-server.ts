// consumer/src/api-server.ts
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { VideoQueue } from "./queue";
import { DeadLetterQueue } from "./dead-letter-queue";

dotenv.config();

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
 * Stream full video file
 */
app.get("/videos/:filename", (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Video not found");
  }

  res.writeHead(200, { "Content-Type": "video/mp4" });
  fs.createReadStream(filePath).pipe(res);
});

/**
 * GET /videos/:filename/preview
 * Stream preview clip
 */
app.get("/videos/:filename/preview", (req, res) => {
  const previewPath = path.join(PREVIEW_DIR, req.params.filename);

  if (!fs.existsSync(previewPath)) {
    return res.status(404).send("Preview not found");
  }

  res.writeHead(200, { "Content-Type": "video/mp4" });
  fs.createReadStream(previewPath).pipe(res);
});

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
    console.error("Failed to get DLQ status:", err);
    res.status(500).json({ error: "Failed to get DLQ status" });
  }
});

/** Export starter function */
export function startApiServer() {
  app.listen(WEB_PORT, () => {
    console.log(`REST API running at http://localhost:${WEB_PORT}`);
  });
}