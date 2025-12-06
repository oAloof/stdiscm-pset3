import { Request, Response } from "express";
import { VideoQueue } from "../core/queue";
import { DeadLetterQueue } from "../core/dead-letter-queue";
import { VideoRegistry } from "../core/video-registry";
import { Logger } from "../utils/logger";

const logger = new Logger('HealthController');

export class HealthController {
  static getHealth(req: Request, res: Response) {
    try {
      const queue = VideoQueue.getInstance();
      const dlq = DeadLetterQueue.getInstance();
      const registry = VideoRegistry.getInstance();

      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          queue: {
            size: queue.getSize(),
            maxSize: queue.getMaxSize(),
            healthy: !queue.isFull()
          },
          dlq: {
            size: dlq.getSize(),
            healthy: true
          },
          registry: {
            size: registry.getSize(),
            healthy: true
          }
        }
      });
    } catch (err) {
      logger.error("Health check failed:", err);
      res.status(500).json({ status: "unhealthy", error: "Health check failed" });
    }
  }
}
