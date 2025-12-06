import { v4 as uuidv4 } from 'uuid';

export interface VideoJob {
  id: string;
  filename: string;
  data: Buffer;
  producerId: number;
  timestamp: number;
  md5Hash?: string;
}

export class VideoQueue {
  private static instance: VideoQueue;
  private queue: VideoJob[] = [];
  private maxSize: number;
  private waiters: Array<(job: VideoJob | null) => void> = [];
  private isShuttingDown: boolean = false;

  private constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  public static getInstance(maxSize: number = 10): VideoQueue {
    if (!VideoQueue.instance) {
      VideoQueue.instance = new VideoQueue(maxSize);
    }
    return VideoQueue.instance;
  }

  /**
   * Add a job to the queue
   * @returns true if added, false if queue is full
   */
  enqueue(job: Omit<VideoJob, 'id' | 'timestamp'>): boolean {
    if (this.isFull()) {
      return false;
    }

    const fullJob: VideoJob = {
      ...job,
      id: uuidv4(),
      timestamp: Date.now()
    };

    this.queue.push(fullJob);

    // Wake up a waiting consumer if any
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) {
        const job = this.queue.shift() || null;
        waiter(job);
      }
    }

    return true;
  }

  /**
   * Remove and return the next job from the queue (non-blocking)
   */
  dequeue(): VideoJob | null {
    if (this.isEmpty()) {
      return null;
    }
    return this.queue.shift() || null;
  }

  /**
   * Async dequeue that waits for an item if queue is empty.
   * Returns null if shutdown is triggered while waiting.
   */
  async dequeueAsync(): Promise<VideoJob | null> {
    // If queue has items, return immediately
    if (!this.isEmpty()) {
      return this.queue.shift() || null;
    }

    // If shutting down, return null immediately
    if (this.isShuttingDown) {
      return null;
    }

    // Wait for an item to be enqueued or shutdown
    return new Promise<VideoJob | null>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Signal shutdown - unblocks all waiting consumers
   */
  shutdown(): void {
    this.isShuttingDown = true;
    // Wake up all waiting consumers with null
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(null);
      }
    }
  }

  /**
   * Check if queue is in shutdown state
   */
  isShutdown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get current number of items in queue
   */
  getSize(): number {
    return this.queue.length;
  }

  /**
   * Get maximum queue capacity
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Check if queue is full
   */
  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Calculate queue utilization (0.0 to 1.0)
   */
  getUtilization(): number {
    if (this.maxSize === 0) return 1.0;
    return this.queue.length / this.maxSize;
  }
}