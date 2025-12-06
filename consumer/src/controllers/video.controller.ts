import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { validateFilePath, streamVideoWithRangeSupport } from "../utils/streaming-utils";
import { VideoRegistry } from "../core/video-registry";
import { Logger } from "../utils/logger";

import { UPLOAD_DIR, PREVIEW_DIR } from "../config";

const logger = new Logger('VideoController');

export class VideoController {

  /** Utility: scan uploaded videos and extract metadata */
  private static buildVideoList() {
    const allowedExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm"];

    if (!fs.existsSync(UPLOAD_DIR)) return [];

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

  static listVideos(req: Request, res: Response) {
    try {
      const videos = VideoController.buildVideoList();
      res.json({ videos });
    } catch (err) {
      logger.error("Failed to list videos:", err);
      res.status(500).json({ error: "Failed to list videos" });
    }
  }

  static getVideo(req: Request, res: Response) {
    const id = req.params.id;
    const videos = VideoController.buildVideoList();

    const video = videos.find(v => v.id === id);
    if (!video) return res.status(404).json({ error: "Video not found" });

    res.json(video);
  }

  static streamVideo(req: Request, res: Response) {
    const filePath = validateFilePath(req.params.filename, UPLOAD_DIR);

    if (!filePath) {
      return res.status(404).send("Video not found");
    }

    streamVideoWithRangeSupport(filePath, req.params.filename, req, res);
  }

  static streamPreview(req: Request, res: Response) {
    const previewPath = validateFilePath(req.params.filename, PREVIEW_DIR);

    if (!previewPath) {
      return res.status(404).send("Preview not found");
    }

    streamVideoWithRangeSupport(previewPath, req.params.filename, req, res);
  }

  static deleteVideo(req: Request, res: Response) {
    try {
      const id = req.params.id;
      const videos = VideoController.buildVideoList();
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
  }
}
