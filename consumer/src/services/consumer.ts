import { VideoQueue, VideoJob } from '../core/queue';

import { Logger } from '../utils/logger';
import { DeadLetterQueue } from '../core/dead-letter-queue';
import { VideoRegistry } from '../core/video-registry';
import { FileHandler } from './file-handler';
import { generatePreview, getPreviewFilename, validateVideoFile, getThumbnailFilename, generateThumbnail, compressVideo, getCompressedFilename } from "../utils/video-processor";
import path from "path";
import { UPLOAD_DIR, PREVIEW_DIR, THUMBNAIL_DIR, COMPRESSED_DIR, COMPRESSION_ENABLED } from '../config';

// DLQ Configuration
const MAX_RETRIES = parseInt(process.env.DLQ_MAX_RETRIES || '3', 10);
const INITIAL_DELAY_MS = parseInt(process.env.DLQ_INITIAL_DELAY_MS || '1000', 10);

// Shared instances
const dlq = DeadLetterQueue.getInstance();
const registry = VideoRegistry.getInstance();

// Track active consumer promises for graceful shutdown
const activeConsumers: Promise<void>[] = [];

/**
 * Create and start a pool of consumer workers.
 */
export function createConsumerPool(numConsumers: number, queue: VideoQueue): void {
  const mainLogger = new Logger('ConsumerPool');
  mainLogger.info(`Starting ${numConsumers} consumer workers...`);

  for (let i = 0; i < numConsumers; i++) {
    const consumerPromise = startConsumerThread(i, queue, UPLOAD_DIR);
    activeConsumers.push(consumerPromise);
  }

  mainLogger.info(`All ${numConsumers} consumer workers started`);
}

/**
 * Start a single consumer worker thread
 */
async function startConsumerThread(
  threadId: number,
  queue: VideoQueue,
  uploadDir: string
): Promise<void> {
  const logger = new Logger(`Consumer-${threadId}`);
  const fileHandler = new FileHandler(uploadDir);

  logger.info('Started');

  while (!queue.isShutdown()) {
    const job = await queue.dequeueAsync();
    if (job === null) {
      logger.info('Received shutdown signal');
      break;
    }

    try {
      await processJobWithRetry(job, fileHandler, logger);
    } catch (error) {
      logger.error(`Job ${job.filename} moved to DLQ`);
    }
  }

  logger.info('Stopped');
}

/**
 * Process a job with retry logic and exponential backoff.
 */
export async function processJobWithRetry(
  job: VideoJob,
  fileHandler: FileHandler,
  logger: Logger
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Processing ${job.filename} (Producer ${job.producerId}) - Attempt ${attempt}/${MAX_RETRIES}`);

      // Simulate failure for testing DLQ
      if (job.filename.includes('fail_me')) {
        throw new Error("Simulated failure for testing DLQ");
      }

      const result = await fileHandler.saveVideo(job.data, job.id, job.filename);

      if (!result.success) {
        throw new Error(result.error || "Unknown error during file save");
      }

      if (job.md5Hash) registry.updatePath(job.md5Hash, result.filepath);
      logger.info(`Saved video: ${result.savedFilename}`);

      if (validateVideoFile(result.filepath)) {
        try {
          const previewFilename = path.basename(getPreviewFilename(result.filepath));
          const previewPath = path.join(PREVIEW_DIR, previewFilename);
          await generatePreview(result.filepath, previewPath);
          logger.info(`Preview created: ${previewPath}`);

          // Update registry
          if (job.md5Hash) {
            registry.updatePreview(job.md5Hash, previewPath);
          }
        } catch (err) {
          logger.error(`Preview generation failed for ${result.filepath}: ${err}`);
        }

        // Generate thumbnail
        try {
          const thumbnailFilename = path.basename(getThumbnailFilename(result.filepath));
          const thumbnailPath = path.join(THUMBNAIL_DIR, thumbnailFilename);
          await generateThumbnail(result.filepath, thumbnailPath);
          logger.info(`Thumbnail created: ${thumbnailPath}`);

          // Update registry
          if (job.md5Hash) {
            registry.updateThumbnail(job.md5Hash, thumbnailPath);
          }
        } catch (err) {
          logger.error(`Thumbnail generation failed for ${result.filepath}: ${err}`);
        }

        // Compress video
        if (COMPRESSION_ENABLED) {
          try {
            const compressedFilename = path.basename(getCompressedFilename(result.filepath));
            const compressedPath = path.join(COMPRESSED_DIR, compressedFilename);

            // Ensure directory exists
            const fs = require('fs');
            if (!fs.existsSync(COMPRESSED_DIR)) {
              fs.mkdirSync(COMPRESSED_DIR, { recursive: true });
            }

            logger.info(`Starting compression for ${job.filename}...`);

            // Retry loop for compression (3 attempts)
            let compressionSuccess = false;
            for (let i = 1; i <= 3; i++) {
              const compressionResult = await compressVideo(result.filepath, compressedPath, {
                codec: process.env.COMPRESSION_CODEC || 'libx264',
                crf: parseInt(process.env.COMPRESSION_CRF || '23', 10),
                preset: process.env.COMPRESSION_PRESET || 'medium',
                audioBitrate: process.env.COMPRESSION_AUDIO_BITRATE || '128k'
              });

              if (compressionResult.success) {
                logger.info(`Compression success: ${compressedPath}`);
                if (job.md5Hash) {
                  registry.updateCompression(job.md5Hash, compressedPath, {
                    originalSize: compressionResult.originalSize,
                    compressedSize: compressionResult.compressedSize,
                    reductionPercent: compressionResult.reductionPercent,
                    durationMs: compressionResult.durationMs
                  });
                }
                compressionSuccess = true;
                break;
              } else {
                logger.warn(`Compression attempt ${i}/3 failed: ${compressionResult.error}`);
                if (i < 3) await new Promise(r => setTimeout(r, 1000 * i)); // Backoff
              }
            }

            if (!compressionSuccess) {
              logger.error(`Failed to compress ${job.filename} after 3 attempts. Keeping original.`);
            }

          } catch (err) {
            logger.error(`Compression process error for ${result.filepath}: ${err}`);
          }
        }
      }

      return; // Job processed successfully

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`Attempt ${attempt} failed for ${job.filename}: ${errorMessage}`);
        logger.warn(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error(`All ${MAX_RETRIES} attempts failed for ${job.filename}`);
        dlq.addToQueue(job, errorMessage, MAX_RETRIES);
        throw error;
      }
    }
  }
}

/**
 * Gracefully shutdown all consumer workers.
 */
export async function shutdownConsumers(queue: VideoQueue): Promise<void> {
  const logger = new Logger('ConsumerPool');
  logger.info('Initiating shutdown...');
  queue.shutdown();
  logger.info(`Waiting for ${activeConsumers.length} workers to complete...`);
  await Promise.all(activeConsumers);
  logger.info('All consumer workers stopped');
}
