export interface VideoChunk {
  filename: string;
  data: Buffer;
  chunk_number: number;
  is_last: boolean;
  producer_id: number;
  md5_hash?: string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  video_id: string;
  queue_full: boolean;
}

export interface QueueStatusRequest { }

export interface QueueStatusResponse {
  current_size: number;
  max_size: number;
  is_full: boolean;
  utilization: number;
}
