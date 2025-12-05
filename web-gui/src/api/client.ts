// web-gui/src/api/client.ts

import type { Video } from '../types';

const API_BASE = '/api';
const VIDEO_BASE = '/videos';

// ---------- Types ----------
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface FetchState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

// ---------- Helper: Retry fetch with backoff ----------
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  backoffMs = 500
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)));
          continue;
        }
      }

      return res;
    } catch (err) {
      // Retry only for network-related failures
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Failed after retries');
}

// ---------- Base API fetch wrapper ----------
async function fetchApi<T>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetchWithRetry(`${API_BASE}${endpoint}`);

    if (!res.ok) {
      return {
        success: false,
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }

    const json = await res.json();

    return {
      success: true,
      data: json,
    };

  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown network error',
    };
  }
}

// ---------- Required: fetchVideos() ----------
export async function fetchVideos(): Promise<Video[]> {
  const result = await fetchApi<{ videos: Video[] }>('/videos');

  if (!result.success || !result.data) {
    throw new Error(result.error ?? 'Failed to fetch videos');
  }

  // Return the typed list of videos
  return result.data.videos;
}

// ---------- URL helpers ----------
export function getVideoUrl(filename: string): string {
  return `${VIDEO_BASE}/${filename}`;
}

export function getPreviewUrl(filename: string): string {
  return `${VIDEO_BASE}/${filename}/preview`;
}

// ---------- Optional: Polling helper ----------
export function startVideoPolling(
  intervalMs: number,
  onUpdate: (videos: Video[]) => void,
  onError?: (err: string) => void
) {
  let timer: ReturnType<typeof setInterval>;

  async function poll() {
    try {
      const videos = await fetchVideos();
      onUpdate(videos);
    } catch (err) {
      if (onError) {
        onError(err instanceof Error ? err.message : 'Unknown poll error');
      }
    }
  }

  timer = setInterval(poll, intervalMs);
  poll(); // immediate first call

  return () => clearInterval(timer);
}

// ---------- Loading state helper for React ----------
export async function withLoadingState<T>(
  loader: () => Promise<T>,
  setState: (s: FetchState<T>) => void
) {
  setState({ loading: true, error: null, data: null });

  try {
    const data = await loader();
    setState({ loading: false, error: null, data });
  } catch (err) {
    setState({
      loading: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      data: null,
    });
  }
}
