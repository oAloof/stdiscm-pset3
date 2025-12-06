import { Request, Response } from "express";
import { DeadLetterQueue } from "../core/dead-letter-queue";
import { VideoQueue } from "../core/queue";
import { Logger } from "../utils/logger";

const logger = new Logger('DLQController');

export class DLQController {
  static getDlqStatus(req: Request, res: Response) {
    try {
      const dlq = DeadLetterQueue.getInstance();
      const failedJobs = dlq.getAll();

      res.json({
        size: dlq.getSize(),
        jobs: failedJobs.map(failed => ({
          jobId: failed.job.id,
          filename: failed.job.filename,
          producerId: failed.job.producerId,
          error: failed.error,
          failedAt: failed.failedAt,
          attempts: failed.attempts
        }))
      });

    } catch (err) {
      logger.error("Failed to get DLQ status:", err);
      res.status(500).json({ error: "Failed to get DLQ status" });
    }
  }

  static retryJob(req: Request, res: Response) {
    try {
      const jobId = req.params.jobId;
      const dlq = DeadLetterQueue.getInstance();
      const queue = VideoQueue.getInstance();

      const failedJobs = dlq.getAll();
      const failedJob = failedJobs.find(f => f.job.id === jobId);

      if (!failedJob) {
        return res.status(404).json({ error: "Job not found in DLQ" });
      }

      // Check if queue has space
      if (queue.isFull()) {
        return res.status(503).json({ error: "Queue is full, cannot retry job" });
      }

      // Re-enqueue the job
      const jobAdded = queue.enqueue({
        filename: failedJob.job.filename,
        data: failedJob.job.data,
        producerId: failedJob.job.producerId,
        md5Hash: failedJob.job.md5Hash
      });

      if (!jobAdded) {
        return res.status(503).json({ error: "Failed to re-enqueue job" });
      }

      // Remove from DLQ
      dlq.removeById(jobId);

      logger.info(`Retried job ${jobId} from DLQ`);

      res.json({
        message: "Job re-queued successfully",
        jobId: jobId,
        filename: failedJob.job.filename
      });
    } catch (err) {
      logger.error("Failed to retry job:", err);
      res.status(500).json({ error: "Failed to retry job" });
    }
  }

  static deleteJob(req: Request, res: Response) {
    try {
      const jobId = req.params.jobId;
      const dlq = DeadLetterQueue.getInstance();

      const removed = dlq.removeById(jobId);

      if (!removed) {
        return res.status(404).json({ error: "Job not found in DLQ" });
      }

      res.json({
        message: "Job removed from DLQ",
        jobId: jobId
      });
    } catch (err) {
      logger.error("Failed to remove job from DLQ:", err);
      res.status(500).json({ error: "Failed to remove job from DLQ" });
    }
  }

  static clearDlq(req: Request, res: Response) {
    try {
      const dlq = DeadLetterQueue.getInstance();
      const previousSize = dlq.getSize();
      dlq.clear();

      res.json({
        message: "DLQ cleared",
        clearedJobs: previousSize
      });
    } catch (err) {
      logger.error("Failed to clear DLQ:", err);
      res.status(500).json({ error: "Failed to clear DLQ" });
    }
  }
}
