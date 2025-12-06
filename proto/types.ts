/**
 * Shared TypeScript types for gRPC communication
 * These types correspond to the protobuf definitions in video_upload.proto
 */

export interface VideoMetadata {
  filename: string;
  producerId: number;
  md5Hash?: string;  // camelCase version of md5_hash
}

export interface VideoChunk {
  chunk_number: number;
  is_last: boolean;
  metadata?: VideoMetadata;  // Only present in first chunk
  data?: Buffer;              // Present in data chunks
}

export interface UploadResponse {
  success: boolean;
  message: string;
  video_id: string;
  queue_full: boolean;
}

export interface QueueStatusRequest {
  // Empty for now
}

export interface QueueStatusResponse {
  current_size: number;
  max_size: number;
  is_full: boolean;
  utilization: number;
}
