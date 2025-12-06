import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import { Logger } from './logger';

const logger = new Logger('StreamingUtils');

/**
 * Get MIME type based on file extension
 */
export function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Validate file path to prevent path traversal
 * @returns Validated absolute path or null if invalid
 */
export function validateFilePath(filename: string, baseDir: string): string | null {
  // Check for path traversal characters
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    logger.warn(`Path traversal attempt detected: ${filename}`);
    return null;
  }

  const filePath = path.join(baseDir, filename);

  // Verify file exists
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    // Verify resolved path is within baseDir
    const realPath = fs.realpathSync(filePath);
    const realBaseDir = fs.realpathSync(baseDir);

    if (!realPath.startsWith(realBaseDir)) {
      logger.warn(`Path outside base directory: ${filename}`);
      return null;
    }

    return filePath;
  } catch (error) {
    logger.error(`Error validating path for ${filename}:`, error);
    return null;
  }
}

/**
 * Stream video file with HTTP Range request support
 * Enables seeking and efficient buffering in browser video players
 */
export function streamVideoWithRangeSupport(
  filePath: string,
  filename: string,
  req: express.Request,
  res: express.Response
): void {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const mimeType = getMimeType(filename);

  if (range) {
    // Parse range header (format: "bytes=start-end")
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;

    // Create read stream for requested range
    const stream = fs.createReadStream(filePath, { start, end });

    // Handle stream errors
    stream.on('error', (err) => {
      logger.error(`Stream error for ${filename}:`, err);
      if (!res.headersSent) {
        res.status(500).send('Error streaming video');
      }
    });

    // Send 206 Partial Content response
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
    });

    stream.pipe(res);
  } else {
    // Full file request
    const stream = fs.createReadStream(filePath);

    // Handle stream errors
    stream.on('error', (err) => {
      logger.error(`Stream error for ${filename}:`, err);
      if (!res.headersSent) {
        res.status(500).send('Error streaming video');
      }
    });

    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
    });

    stream.pipe(res);
  }
}
