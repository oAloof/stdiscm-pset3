/**
 * API client for communicating with the consumer backend
 */

import type { Video, QueueStatus, ApiResponse } from '../types';

/**
 * Base fetch wrapper with error handling
 */
async function fetchApi<T>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(endpoint);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Fetch list of all uploaded videos
 */
export async function getVideos(): Promise<ApiResponse<Video[]>> {
  return fetchApi<Video[]>('/api/videos');
}

/**
 * Fetch current queue status
 */
export async function getQueueStatus(): Promise<ApiResponse<QueueStatus>> {
  return fetchApi<QueueStatus>('/api/queue/status');
}
