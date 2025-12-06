import { Request, Response } from "express";
import { VideoRegistry } from "../core/video-registry";
import { Logger } from "../utils/logger";

const logger = new Logger('RegistryController');

export class RegistryController {
  static getRegistryStatus(req: Request, res: Response) {
    try {
      const registry = VideoRegistry.getInstance();
      const entries = registry.getAll();

      res.json({
        size: registry.getSize(),
        entries: entries.map(({ hash, entry }) => ({
          hash: hash.substring(0, 8) + '...',  // Truncate for readability
          fullHash: hash,
          filename: entry.filename,
          path: entry.path,
          producerId: entry.producerId,
          uploadedAt: entry.uploadedAt
        }))
      });
    } catch (err) {
      logger.error("Failed to get registry status:", err);
      res.status(500).json({ error: "Failed to get registry status" });
    }
  }

  static cleanupRegistry(req: Request, res: Response) {
    try {
      const registry = VideoRegistry.getInstance();
      const removedCount = registry.validateAndCleanup();

      res.json({
        message: `Cleanup complete`,
        removedEntries: removedCount,
        remainingEntries: registry.getSize()
      });
    } catch (err) {
      logger.error("Failed to cleanup registry:", err);
      res.status(500).json({ error: "Failed to cleanup registry" });
    }
  }

  static clearRegistry(req: Request, res: Response) {
    try {
      const registry = VideoRegistry.getInstance();
      const previousSize = registry.getSize();
      registry.clear();

      res.json({
        message: "Registry cleared",
        clearedEntries: previousSize
      });
    } catch (err) {
      logger.error("Failed to clear registry:", err);
      res.status(500).json({ error: "Failed to clear registry" });
    }
  }
}
