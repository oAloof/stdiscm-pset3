import fs from "fs";
import path from "path";
import express from "express";
import { startGrpcServer } from './grpc-server';
import { GrpcConsumerClient } from './grpc-consumer-client';
import cors from 'cors';

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploaded-videos";
const PREVIEW_DIR = "./previews";


startGrpcServer();

const app = express();

// Enable CORS
app.use(cors());

// Serve static frontend build
app.use(express.static(path.join(__dirname, 'public')));

const grpcClient = new GrpcConsumerClient('localhost', process.env.GRPC_PORT || 50051);

// List all uploaded videos
app.get("/api/videos", (req, res) => {
  const files = fs.readdirSync(UPLOAD_DIR);

  const videos = files.map(filename => ({
    filename,
    url: `/videos/${filename}`,
    preview_url: `/videos/${filename}/preview`
  }));

  res.json(videos);
});

app.get("/api/videos/:filename", (req, res) => {
  const file = path.join(UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "Video not found" });
  }

  const stats = fs.statSync(file);

  res.json({
    filename: req.params.filename,
    size: stats.size,
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime
  });
});

app.get("/videos/:filename", (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Not found");
  }

  res.writeHead(200, {
    "Content-Type": "video/mp4"
  });

  fs.createReadStream(filePath).pipe(res);
});


app.get("/videos/:filename/preview", (req, res) => {
  const previewPath = path.join(PREVIEW_DIR, req.params.filename);

  if (!fs.existsSync(previewPath)) {
    return res.status(404).send("Preview not found");
  }

  res.writeHead(200, {
    "Content-Type": "video/mp4"
  });

  fs.createReadStream(previewPath).pipe(res);
});



app.get('/api/queue/status', async (req, res) => {
  try {
    await grpcClient.waitForReady(5000);
    const status = await grpcClient.checkQueueStatus();
    res.json(status);
  } catch (err) {
    console.error('Failed to get queue status', err);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});