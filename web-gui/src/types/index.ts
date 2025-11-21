/**
 * TypeScript type definitions for the Media Upload Service Web GUI
 */

/**
 * Represents a video file in the system
 */
export interface Video {
  id: string;
  filename: string;
  size: number; // in bytes
  uploadDate: string; // ISO 8601 date string
  duration?: number; // in seconds
  thumbnailUrl?: string;
  videoUrl: string;
}

/**
 * Represents the current status of the upload queue
 */
export interface QueueStatus {
  current: number; // current number of items in queue
  max: number; // maximum queue capacity
  dropped: number; // total number of dropped videos
}

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
