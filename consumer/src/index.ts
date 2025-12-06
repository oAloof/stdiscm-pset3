import dotenv from 'dotenv';
import { startGrpcServer, videoQueue } from './grpc-server';
import { startApiServer } from './api-server';
import { Logger } from './logger';
import { DeadLetterQueue } from './dead-letter-queue';
import { VideoJob } from './queue';
import { VideoRegistry } from './video-registry';
import { FileHandler } from './file-handler';

const logger = new Logger('Worker');
const dlq = DeadLetterQueue.getInstance();
const registry = VideoRegistry.getInstance();

// Load environment variables
dotenv.config();

// DLQ Configuration
const MAX_RETRIES = parseInt(process.env.DLQ_MAX_RETRIES || '3', 10);
const INITIAL_DELAY_MS = parseInt(process.env.DLQ_INITIAL_DELAY_MS || '1000', 10);

console.log('='.repeat(50));
console.log('Media Upload Consumer Service');
console.log('='.repeat(50));

// Start gRPC server
startGrpcServer();

// Start Express API server
startApiServer();

/**
 * Process a job with retry logic and exponential backoff
 */
async function processJobWithRetry(job: VideoJob, fileHandler: FileHandler): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Processing job for ${job.filename} (Producer ${job.producerId}) - Attempt ${attempt}/${MAX_RETRIES}`);

      // Use FileHandler for atomic write operation
      const result = await fileHandler.saveVideo(job.data, job.id, job.filename);

      if (!result.success) {
        throw new Error(result.error || 'Unknown error during file save');
      }

      // Update registry with actual file path
      if (job.md5Hash) {
        registry.updatePath(job.md5Hash, result.filepath);
      }

      logger.info(`Saved ${result.savedFilename}`);
      return;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (attempt < MAX_RETRIES) {
        // Exponential backoff delay
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`  Attempt ${attempt} failed for ${job.filename}: ${errorMessage}`);
        logger.warn(`  Retrying in ${delay}ms...`);

        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Max retries exhausted, move to DLQ
        logger.error(`All ${MAX_RETRIES} attempts failed for ${job.filename}`);
        dlq.addToQueue(job, errorMessage, MAX_RETRIES);
        throw error;
      }
    }
  }
}

// Worker loop to process videos
async function processQueue() {
  const uploadDir = process.env.UPLOAD_DIR || './uploaded-videos';

  // Initialize FileHandler for atomic file operations
  const fileHandler = new FileHandler(uploadDir);

  while (true) {
    const job = videoQueue.dequeue();

    if (job) {
      try {
        await processJobWithRetry(job, fileHandler);
      } catch (error) {
        logger.error(`Job ${job.filename} moved to DLQ`);
      }
    } else {
      // Wait before checking again if queue is empty
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Start worker
processQueue().catch(err => logger.error('Worker crashed:', err));

