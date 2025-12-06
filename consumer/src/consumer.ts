import { VideoQueue, VideoJob } from './queue';
import { Logger } from './logger';
import { DeadLetterQueue } from './dead-letter-queue';
import { VideoRegistry } from './video-registry';
import { FileHandler } from './file-handler';

// DLQ Configuration (loaded once)
const MAX_RETRIES = parseInt(process.env.DLQ_MAX_RETRIES || '3', 10);
const INITIAL_DELAY_MS = parseInt(process.env.DLQ_INITIAL_DELAY_MS || '1000', 10);

// Shared instances
const dlq = DeadLetterQueue.getInstance();
const registry = VideoRegistry.getInstance();

// Track active consumer promises for graceful shutdown
const activeConsumers: Promise<void>[] = [];

/**
 * Create and start a pool of consumer workers.
 * Each worker is an independent async loop that processes jobs from the queue.
 * 
 * @param numConsumers - Number of concurrent consumer workers to spawn
 * @param queue - The shared video queue to consume from
 */
export function createConsumerPool(numConsumers: number, queue: VideoQueue): void {
  const mainLogger = new Logger('ConsumerPool');
  const uploadDir = process.env.UPLOAD_DIR || './uploaded-videos';

  mainLogger.info(`Starting ${numConsumers} consumer workers...`);

  for (let i = 0; i < numConsumers; i++) {
    const consumerPromise = startConsumerThread(i, queue, uploadDir);
    activeConsumers.push(consumerPromise);
  }

  mainLogger.info(`All ${numConsumers} consumer workers started`);
}

/**
 * Start a single consumer worker thread
 * 
 * @param threadId - Unique identifier for this worker
 * @param queue - The shared video queue
 * @param uploadDir - Directory to save videos to
 */
async function startConsumerThread(
  threadId: number,
  queue: VideoQueue,
  uploadDir: string
): Promise<void> {
  const logger = new Logger(`Consumer-${threadId}`);
  const fileHandler = new FileHandler(uploadDir);

  logger.info('Started');

  // Main consumer loop
  while (!queue.isShutdown()) {
    // Wait for a job (blocks until available or shutdown)
    const job = await queue.dequeueAsync();

    // Null means shutdown was triggered
    if (job === null) {
      logger.info('Received shutdown signal');
      break;
    }

    // Process the job
    try {
      await processJobWithRetry(job, fileHandler, logger);
    } catch (error) {
      // Job failed after all retries, already moved to DLQ
      logger.error(`Job ${job.filename} moved to DLQ`);
    }
  }

  logger.info('Stopped');
}

/**
 * Process a job with retry logic and exponential backoff.
 * 
 * @param job - The video job to process
 * @param fileHandler - File handler for saving videos
 * @param logger - Logger instance for this consumer thread
 */
async function processJobWithRetry(
  job: VideoJob,
  fileHandler: FileHandler,
  logger: Logger
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Processing ${job.filename} (Producer ${job.producerId}) - Attempt ${attempt}/${MAX_RETRIES}`);

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
        logger.warn(`Attempt ${attempt} failed for ${job.filename}: ${errorMessage}`);
        logger.warn(`Retrying in ${delay}ms...`);

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

/**
 * Gracefully shutdown all consumer workers.
 * Signals the queue to stop, then waits for all workers to complete their current jobs.
 * 
 * @param queue - The video queue to shutdown
 */
export async function shutdownConsumers(queue: VideoQueue): Promise<void> {
  const logger = new Logger('ConsumerPool');

  logger.info('Initiating shutdown...');

  // Signal the queue to stop - this will unblock all waiting consumers
  queue.shutdown();

  // Wait for all consumers to finish their current work
  logger.info(`Waiting for ${activeConsumers.length} workers to complete...`);
  await Promise.all(activeConsumers);

  logger.info('All consumer workers stopped');
}
