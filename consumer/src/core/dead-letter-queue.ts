import { VideoJob } from './queue';
import { Logger } from "../utils/logger";

const logger = new Logger('DLQ');

export interface FailedJob {
  job: VideoJob;
  error: string;
  failedAt: Date;
  attempts: number;
}

/**
 * Dead Letter Queue for jobs that failed after multiple retry attempts.
 */
export class DeadLetterQueue {
  private static instance: DeadLetterQueue;
  private dlq: FailedJob[] = [];

  private constructor() { }

  public static getInstance(): DeadLetterQueue {
    if (!DeadLetterQueue.instance) {
      DeadLetterQueue.instance = new DeadLetterQueue();
    }
    return DeadLetterQueue.instance;
  }

  /**
   * Add a failed job to the DLQ
   */
  addToQueue(job: VideoJob, error: string, attempts: number): void {
    const failedJob: FailedJob = {
      job,
      error,
      failedAt: new Date(),
      attempts
    };

    this.dlq.push(failedJob);
    logger.error(`[Producer ${job.producerId}] Job moved to DLQ: ${job.filename}`);
    logger.error(`[Producer ${job.producerId}] Failure reason: ${error}`);
    logger.error(`[Producer ${job.producerId}] Total attempts: ${attempts}`);
  }

  /**
   * Get all failed jobs from the DLQ
   */
  getAll(): FailedJob[] {
    return [...this.dlq]; // Return a copy
  }

  /**
   * Get the current size of the DLQ
   */
  getSize(): number {
    return this.dlq.length;
  }

  /**
   * Remove a specific job from the DLQ by job ID
   */
  removeById(jobId: string): boolean {
    const index = this.dlq.findIndex(failed => failed.job.id === jobId);
    if (index !== -1) {
      this.dlq.splice(index, 1);
      logger.info(`Removed job ${jobId} from DLQ`);
      return true;
    }
    return false;
  }

  /**
   * Clear all jobs from the DLQ
   */
  clear(): void {
    const count = this.dlq.length;
    this.dlq = [];
    logger.info(`Cleared ${count} jobs from DLQ`);
  }
}
