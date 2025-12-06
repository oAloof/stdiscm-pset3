import { useEffect, useState } from "react";
import { fetchVideos, startVideoPolling } from "../api/client";
import type { Video } from "../types";
import VideoCard from "./VideoCard";

function VideoGrid() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const [autoRefresh, setAutoRefresh] = useState(true);

  async function loadVideos() {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchVideos();
      setVideos(result);
      console.log("Vids:", result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVideos();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    setVideos([]);
    setLoading(true);
    setError(null);
  
    const stop = startVideoPolling(
      5000,
      (v) => {
        setVideos(v);
        setLoading(false); 
        setError(null);
      },
      (err) => {
        setVideos([]);
        setLoading(false); 
        setError(err); 
      }
    );
  
    setLoading(true);
  
    return () => stop();
  }, [autoRefresh]);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Uploaded Videos</h2>

        <div className="flex items-center gap-3">

          {!autoRefresh && (
            <button
              onClick={loadVideos}
              className="btn btn-primary px-3 py-1"
            >
              Refresh
            </button>
          )}

          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              className="checkbox focus:outline-none focus:ring-0"
              checked={!autoRefresh}          
              onChange={(e) => setAutoRefresh(!e.target.checked)}
            />
            Manual Refresh
          </label>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <p className="text-red-600 text-center py-4">Error: {error}</p>
      )}

      {/* Empty */}
      {!loading && !error && videos.length === 0 && (
        <p className="text-gray-600 text-center py-4">No videos uploaded yet.</p>
      )}

      <div
        className="
          grid gap-5
          grid-cols-1
          sm:grid-cols-2
          lg:grid-cols-3
          xl:grid-cols-4
        "
      >
       {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          onDelete={(id) => setVideos((prev) => prev.filter(v => v.id !== id))}
        />
      ))}
      </div>
    </div>
  );
}

export default VideoGrid;
