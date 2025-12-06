import * as fs from 'fs';
import { Logger } from './logger';

const logger = new Logger('VideoRegistry');

/**
 * Entry for a registered video in the hash registry
 */
export interface VideoEntry {
  filename: string;
  uploadedAt: Date;
  path: string;
  producerId: number;
}

/**
 * Singleton registry for tracking uploaded video hashes.
 * Used to detect and prevent duplicate video uploads.
 * Optionally persists to a JSON file.
 */
export class VideoRegistry {
  private static instance: VideoRegistry;
  private registry: Map<string, VideoEntry> = new Map();
  private registryFilePath: string;
  private persistEnabled: boolean;

  private constructor(registryFilePath?: string) {
    this.registryFilePath = registryFilePath || process.env.REGISTRY_FILE || './video-registry.json';
    this.persistEnabled = process.env.REGISTRY_PERSIST !== 'false';

    if (this.persistEnabled) {
      this.loadFromFile();
    }
  }

  public static getInstance(registryFilePath?: string): VideoRegistry {
    if (!VideoRegistry.instance) {
      VideoRegistry.instance = new VideoRegistry(registryFilePath);
    }
    return VideoRegistry.instance;
  }

  /**
   * Check if a video with this hash already exists in the registry.
   * Also validates that the file still exists on disk.
   * If the file was manually deleted, removes it from registry.
   */
  public isDuplicate(hash: string): boolean {
    const entry = this.registry.get(hash);

    if (!entry) {
      return false;
    }

    // Check if the file still exists on disk
    if (entry.path && entry.path !== 'pending') {
      if (!fs.existsSync(entry.path)) {
        logger.info(`File ${entry.path} no longer exists, removing from registry`);
        this.registry.delete(hash);
        this.saveToFile();
        return false;
      }
    }

    return true;
  }

  /**
   * Get the entry for a given hash
   */
  public getEntry(hash: string): VideoEntry | undefined {
    return this.registry.get(hash);
  }

  /**
   * Register a new video hash
   */
  public register(hash: string, filename: string, path: string, producerId: number): void {
    const entry: VideoEntry = {
      filename,
      uploadedAt: new Date(),
      path,
      producerId
    };

    this.registry.set(hash, entry);
    logger.info(`Registered video: ${filename} (hash: ${hash.substring(0, 8)}...)`);

    this.saveToFile();
  }

  /**
   * Update the path for an existing registry entry (called after file is saved)
   */
  public updatePath(hash: string, path: string): void {
    const entry = this.registry.get(hash);
    if (entry) {
      entry.path = path;
      this.registry.set(hash, entry);
      logger.debug(`Updated path for hash ${hash.substring(0, 8)}... to ${path}`);
      this.saveToFile();
    }
  }

  /**
   * Remove an entry from the registry
   */
  public remove(hash: string): boolean {
    const deleted = this.registry.delete(hash);
    if (deleted) {
      logger.info(`Removed hash ${hash.substring(0, 8)}... from registry`);
      this.saveToFile();
    }
    return deleted;
  }

  /**
   * Get the current size of the registry
   */
  public getSize(): number {
    return this.registry.size;
  }

  /**
   * Get all entries (for debugging/API)
   */
  public getAll(): { hash: string; entry: VideoEntry }[] {
    const results: { hash: string; entry: VideoEntry }[] = [];
    this.registry.forEach((entry, hash) => {
      results.push({ hash, entry });
    });
    return results;
  }

  /**
   * Clear all entries from the registry
   */
  public clear(): void {
    const count = this.registry.size;
    this.registry.clear();
    logger.info(`Cleared ${count} entries from registry`);
    this.saveToFile();
  }

  /**
   * Validate all entries - remove any where the file no longer exists
   */
  public validateAndCleanup(): number {
    let removedCount = 0;
    const hashesToRemove: string[] = [];

    this.registry.forEach((entry, hash) => {
      if (entry.path && entry.path !== 'pending' && !fs.existsSync(entry.path)) {
        hashesToRemove.push(hash);
      }
    });

    for (const hash of hashesToRemove) {
      this.registry.delete(hash);
      removedCount++;
    }

    if (removedCount > 0) {
      logger.info(`Cleanup removed ${removedCount} stale entries from registry`);
      this.saveToFile();
    }

    return removedCount;
  }

  /**
   * Load registry from JSON file
   */
  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.registryFilePath)) {
        const data = fs.readFileSync(this.registryFilePath, 'utf8');
        const parsed = JSON.parse(data);

        // Convert to Map
        this.registry = new Map();
        for (const [hash, entry] of Object.entries(parsed)) {
          // Convert date string back to Date object
          const videoEntry = entry as VideoEntry;
          videoEntry.uploadedAt = new Date(videoEntry.uploadedAt);
          this.registry.set(hash, videoEntry);
        }

        logger.info(`Loaded ${this.registry.size} entries from registry file`);

        // Validate entries on load
        this.validateAndCleanup();
      }
    } catch (error) {
      logger.warn(`Failed to load registry file: ${error}`);
    }
  }

  /**
   * Save registry to JSON file
   */
  private saveToFile(): void {
    if (!this.persistEnabled) {
      return;
    }

    try {
      // Convert Map to plain object for JSON serialization
      const obj: Record<string, VideoEntry> = {};
      this.registry.forEach((entry, hash) => {
        obj[hash] = entry;
      });

      fs.writeFileSync(this.registryFilePath, JSON.stringify(obj, null, 2));
    } catch (error) {
      logger.error(`Failed to save registry file: ${error}`);
    }
  }
}
