import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from './logger';

const logger = new Logger('FileHandler');

/**
 * Result returned after saving a video file
 */
export interface SaveResult {
  success: boolean;
  videoId: string;          // Full UUID
  filepath: string;         // Absolute path to saved file
  savedFilename: string;    // Actual filename on disk
  error?: string;
}

/**
 * Thread-safe file handler for video uploads.
 * Implements atomic write operations using temp file + rename pattern.
 */
export class FileHandler {
  private uploadDir: string;

  constructor(uploadDir: string) {
    this.uploadDir = uploadDir;
    this.ensureUploadDirectory();
  }

  /**
   * Save video data to disk using atomic write operation.
   * Uses temp file + rename pattern to prevent partial writes.
   * 
   * @param videoData - Buffer containing video data
   * @param videoId - Full UUID for this video (from VideoJob.id)
   * @param originalFilename - Original filename from upload
   * @returns SaveResult with success status and file details
   */
  async saveVideo(
    videoData: Buffer,
    videoId: string,
    originalFilename: string
  ): Promise<SaveResult> {
    try {
      // Generate unique filename with 8-char UUID prefix
      const savedFilename = this.generateUniqueFilename(videoId, originalFilename);
      const finalPath = path.join(this.uploadDir, savedFilename);
      const tempPath = `${finalPath}.tmp`;

      logger.debug(`Saving video to temp file: ${tempPath}`);

      // Step 1: Write to temporary file
      await fs.promises.writeFile(tempPath, videoData);

      // Step 2: Validate written file
      const isValid = await this.validateFile(tempPath, videoData.length);
      if (!isValid) {
        // Clean up temp file
        await fs.promises.unlink(tempPath).catch(() => { });
        throw new Error('File validation failed after write');
      }

      // Step 3: Atomic rename (POSIX atomic operation)
      await fs.promises.rename(tempPath, finalPath);

      logger.debug(`Atomically renamed to: ${finalPath}`);

      return {
        success: true,
        videoId,
        filepath: finalPath,
        savedFilename
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save video: ${errorMessage}`);

      return {
        success: false,
        videoId,
        filepath: '',
        savedFilename: '',
        error: errorMessage
      };
    }
  }

  /**
   * Generate unique filename using 8-char UUID prefix + timestamp + original name.
   * Format: {uuid-prefix}_{timestamp}_{originalName}
   * Example: a1b2c3d4_1699900000_myvideo.mp4
   * 
   * @param videoId - Full UUID from VideoJob
   * @param originalName - Original filename
   * @returns Generated filename
   */
  generateUniqueFilename(videoId: string, originalName: string): string {
    // Extract first 8 characters of UUID
    const shortId = videoId.substring(0, 8);

    // Generate timestamp (milliseconds since epoch)
    const timestamp = Date.now();

    // Sanitize original filename (remove unsafe characters)
    const sanitized = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');

    return `${shortId}_${timestamp}_${sanitized}`;
  }

  /**
   * Ensure upload directory exists, create if missing.
   */
  ensureUploadDirectory(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      logger.info(`Created upload directory: ${this.uploadDir}`);
    }
  }

  /**
   * Get video file path by short ID (first 8 chars of UUID).
   * Scans upload directory for matching files.
   * 
   * @param shortId - First 8 characters of UUID
   * @returns Absolute path if found, null otherwise
   */
  getVideoPath(shortId: string): string | null {
    try {
      const files = fs.readdirSync(this.uploadDir);

      // Find file that starts with the short ID
      const matchingFile = files.find(file => file.startsWith(shortId + '_'));

      if (matchingFile) {
        return path.join(this.uploadDir, matchingFile);
      }

      return null;
    } catch (error) {
      logger.error(`Error searching for video ${shortId}:`, error);
      return null;
    }
  }

  /**
   * Validate file integrity after writing.
   * Checks file size and optionally verifies hash.
   * 
   * @param filepath - Path to file to validate
   * @param expectedSize - Expected file size in bytes
   * @param expectedHash - Optional MD5 hash to verify
   * @returns true if valid, false otherwise
   */
  async validateFile(
    filepath: string,
    expectedSize: number,
    expectedHash?: string
  ): Promise<boolean> {
    try {
      // Check if file exists
      if (!fs.existsSync(filepath)) {
        logger.warn(`Validation failed: File does not exist: ${filepath}`);
        return false;
      }

      // Verify file size
      const stats = await fs.promises.stat(filepath);
      if (stats.size !== expectedSize) {
        logger.warn(`Validation failed: Size mismatch. Expected ${expectedSize}, got ${stats.size}`);
        return false;
      }

      // Optionally verify hash
      if (expectedHash) {
        const fileData = await fs.promises.readFile(filepath);
        const calculatedHash = crypto.createHash('md5').update(fileData).digest('hex');

        if (calculatedHash !== expectedHash) {
          logger.warn(`Validation failed: Hash mismatch. Expected ${expectedHash}, got ${calculatedHash}`);
          return false;
        }

        logger.debug(`Hash verification passed for ${filepath}`);
      }

      return true;

    } catch (error) {
      logger.error(`Error validating file ${filepath}:`, error);
      return false;
    }
  }
}
