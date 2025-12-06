import { useRef, useState, useCallback } from "react";
import type { Video } from "../types";
import VideoPlayer from "./VideoPlayer";
import { deleteVideo } from "../api/client";

interface VideoCardProps {
  video: Video;
  onDelete: (id: string) => void;
}

export default function VideoCard({ video, onDelete }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isHovering, setIsHovering] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => {
      setIsHovering(true);
    }, 700);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setIsHovering(false);
    setPreviewLoaded(false);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, []);

  const handlePreviewLoaded = () => {
    setPreviewLoaded(true);

    if (videoRef.current) {
      videoRef.current.play();

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }
      }, 10000);
    }
  };

  const formatSize = (bytes: number) =>
    (bytes / (1024 * 1024)).toFixed(2) + " MB";

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${video.originalFilename}?`)) return;

    try {
      setDeleting(true);
      await deleteVideo(video.id);
      onDelete(video.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete video");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className={`card w-80 bg-base-100 shadow-sm hover:shadow-xl transition cursor-pointer relative ${deleting ? "opacity-50 pointer-events-none" : ""
          }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="relative w-full h-48 bg-base-200 overflow-hidden rounded-t-lg">
          {!isHovering && (
            <img
              src={video.thumbnailUrl}
              alt={video.originalFilename}
              className="w-full h-full object-cover"
            />
          )}

          {isHovering && (
            <video
              ref={videoRef}
              src={video.previewUrl}
              muted
              playsInline
              preload="metadata"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${previewLoaded ? "opacity-100" : "opacity-0"
                }`}
              onLoadedData={handlePreviewLoaded}
            />
          )}

          {isHovering && !previewLoaded && (
            <div className="absolute inset-0 bg-black/30 text-white text-xs flex items-center justify-center">
              Loading preview…
            </div>
          )}
        </div>

        <div className="card-body">
          <h2 className="text-lg font-bold truncate">{video.originalFilename}</h2>

          <ul className="mt-2 flex flex-col gap-1 text-xs">
            <li>
              <span className="font-bold">Size:</span> {formatSize(video.fileSize)}
            </li>
            <li>
              <span className="font-bold">Uploaded:</span>{" "}
              {new Date(video.uploadTime).toLocaleString()}
            </li>
            <li>
              <span className="font-bold">Preview:</span>{" "}
              {video.hasPreview ? "Available" : "None"}
            </li>
          </ul>

          <div className="mt-4 justify-end">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setPlayerOpen(true)}
              disabled={deleting}
            >
              Play Video
            </button>

            <button
              className="btn btn-secondary btn-sm ml-3"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Video"}
            </button>
          </div>
        </div>
      </div>

      {playerOpen && (
        <VideoPlayer
          video={video}
          isOpen={playerOpen}
          onClose={() => setPlayerOpen(false)}
        />
      )}
    </>
  );
}
