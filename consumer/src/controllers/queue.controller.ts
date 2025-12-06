import { Request, Response } from "express";
import { VideoQueue } from "../core/queue";

export class QueueController {
  static getQueueStatus(req: Request, res: Response) {
    try {
      const queue = VideoQueue.getInstance();

      res.json({
        currentSize: queue.getSize(),
        maxSize: queue.getMaxSize(),
        isFull: queue.isFull(),
        utilization: queue.getUtilization()
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get queue status" });
    }
  }
}
