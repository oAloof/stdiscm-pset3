import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { validateFilePath, streamVideoWithRangeSupport } from "../utils/streaming-utils";
import { VideoRegistry } from "../core/video-registry";
import { Logger } from "../utils/logger";

import { UPLOAD_DIR, PREVIEW_DIR, THUMBNAIL_DIR, COMPRESSED_DIR } from "../config";

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

      const ext = path.extname(filename);
      const previewFilename = filename.replace(ext, `_preview${ext}`);
      const previewPath = path.join(PREVIEW_DIR, previewFilename);
      const thumbnailFilename = filename.replace(ext, `_thumbnail.jpg`);
      const thumbnailPath = path.join(THUMBNAIL_DIR, thumbnailFilename);
      const compressedFilename = filename.replace(ext, `_compressed${ext}`);
      const compressedPath = path.join(COMPRESSED_DIR, compressedFilename);
      const hasCompressed = fs.existsSync(compressedPath);
      const compressedSize = hasCompressed ? fs.statSync(compressedPath).size : 0;

      return {
        id,
        originalFilename: filename,
        uploadTime: stats.mtime.toISOString(),
        fileSize: stats.size,
        compressedSize,
        hasPreview: fs.existsSync(previewPath),
        hasCompressed,
        videoUrl: `/videos/${filename}`,
        previewUrl: `/videos/${filename}/preview`,
        thumbnailUrl: `/videos/${filename}/thumbnail`,
        compressedUrl: `/videos/${filename}/compressed`
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
    // Construct preview filename from original filename
    const originalFilename = req.params.filename;
    const ext = path.extname(originalFilename);
    const previewFilename = originalFilename.replace(ext, `_preview${ext}`);

    const previewPath = validateFilePath(previewFilename, PREVIEW_DIR);

    if (!previewPath) {
      return res.status(404).send("Preview not found");
    }

    streamVideoWithRangeSupport(previewPath, previewFilename, req, res);
  }

  static streamThumbnail(req: Request, res: Response) {
    // Construct thumbnail filename from original filename
    const originalFilename = req.params.filename;
    const ext = path.extname(originalFilename);
    const thumbnailFilename = originalFilename.replace(ext, `_thumbnail.jpg`);

    const thumbnailPath = validateFilePath(thumbnailFilename, THUMBNAIL_DIR);

    if (!thumbnailPath) {
      return res.status(404).send("Thumbnail not found");
    }

    // Serve static image with absolute path
    res.sendFile(path.resolve(thumbnailPath));
  }

  static streamCompressed(req: Request, res: Response) {
    // Construct compressed filename from original filename
    const originalFilename = req.params.filename;
    const ext = path.extname(originalFilename);
    const compressedFilename = originalFilename.replace(ext, `_compressed${ext}`);

    const compressedPath = validateFilePath(compressedFilename, COMPRESSED_DIR);

    if (!compressedPath) {
      return res.status(404).send("Compressed video not found");
    }

    streamVideoWithRangeSupport(compressedPath, compressedFilename, req, res);
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
      const ext = path.extname(video.originalFilename);
      const previewPath = path.join(PREVIEW_DIR, video.originalFilename.replace(ext, `_preview${ext}`));
      const thumbnailPath = path.join(THUMBNAIL_DIR, video.originalFilename.replace(ext, `_thumbnail.jpg`));
      const compressedPath = path.join(COMPRESSED_DIR, video.originalFilename.replace(ext, `_compressed${ext}`));

      // Delete the video file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Deleted video: ${video.originalFilename}`);
      }

      // Delete the preview if it exists
      if (fs.existsSync(previewPath)) {
        fs.unlinkSync(previewPath);
        logger.info(`Deleted preview: ${previewPath}`);
      }

      // Delete the thumbnail if it exists
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
        logger.info(`Deleted thumbnail: ${thumbnailPath}`);
      }

      // Delete the compressed video if it exists
      if (fs.existsSync(compressedPath)) {
        fs.unlinkSync(compressedPath);
        logger.info(`Deleted compressed video: ${compressedPath}`);
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
