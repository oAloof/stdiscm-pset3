import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Import Controllers
import { VideoController } from "./controllers/video.controller";
import { QueueController } from "./controllers/queue.controller";
import { DLQController } from "./controllers/dlq.controller";
import { RegistryController } from "./controllers/registry.controller";
import { HealthController } from "./controllers/health.controller";

dotenv.config();

import { UPLOAD_DIR, PREVIEW_DIR, THUMBNAIL_DIR, WEB_PORT } from "./config";

// Ensure required dirs exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAIL_DIR)) fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });

const app = express();
app.use(cors());

// Serve built web GUI
app.use(express.static(path.join(__dirname, "../../web-gui/dist")));
app.use(express.json());

// Routes - Videos
app.get("/api/videos", VideoController.listVideos);
app.get("/api/videos/:id", VideoController.getVideo);
app.delete("/api/videos/:id", VideoController.deleteVideo);
app.get("/videos/:filename", VideoController.streamVideo);
app.get("/videos/:filename/preview", VideoController.streamPreview);
app.get("/videos/:filename/thumbnail", VideoController.streamThumbnail);

// Routes - Queue Status
app.get("/api/queue/status", QueueController.getQueueStatus);

// Routes - Dead Letter Queue
app.get("/api/dlq/status", DLQController.getDlqStatus);
app.post("/api/dlq/retry/:jobId", DLQController.retryJob);
app.delete("/api/dlq/:jobId", DLQController.deleteJob);
app.delete("/api/dlq/clear", DLQController.clearDlq);

// Routes - Registry
app.get("/api/registry/status", RegistryController.getRegistryStatus);
app.post("/api/registry/cleanup", RegistryController.cleanupRegistry);
app.delete("/api/registry/clear", RegistryController.clearRegistry);

// Routes - Health
app.get("/api/health", HealthController.getHealth);

/** Export starter function */
export function startApiServer() {
  app.listen(WEB_PORT, () => {
    console.log(`REST API running at http://localhost:${WEB_PORT}`);
  });
}