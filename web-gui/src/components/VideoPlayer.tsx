import { useEffect, useRef, useState } from "react";
import type { Video } from "../types";

interface VideoPlayerProps {
  video: Video;
  isOpen: boolean;
  onClose: () => void;
}

export default function VideoPlayer({ video, isOpen, onClose }: VideoPlayerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Default to original quality
  const [quality, setQuality] = useState<'original' | 'compressed'>('original');

  // Reset quality when video changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      setQuality('original');
    }
  }, [isOpen, video.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);


  useEffect(() => {
    const handleSpace = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.code === "Space") {
        e.preventDefault();
        const vid = videoRef.current;
        if (!vid) return;

        if (vid.paused) vid.play();
        else vid.pause();
      }
    };

    document.addEventListener("keydown", handleSpace);
    return () => document.removeEventListener("keydown", handleSpace);
  }, [isOpen]);


  const handleClickOutside = (e: React.MouseEvent<HTMLDialogElement, MouseEvent>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  const currentSrc = quality === 'compressed' && video.compressedUrl
    ? video.compressedUrl
    : video.videoUrl;

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onClick={handleClickOutside}
    >
      <div className="modal-box relative max-w-4xl w-full p-4 bg-black text-white overflow-visible">

        <button
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 text-white z-10"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="relative pt-[56.25%] w-full bg-black">
          <video
            key={currentSrc} // Force reload on source change
            ref={videoRef}
            controls
            autoPlay
            className="absolute top-0 left-0 w-full h-full"
            src={currentSrc}
          >
            <source src={currentSrc} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-lg">{video.originalFilename}</h3>
              <p className="text-sm text-gray-400 mt-1">
                <span className="font-semibold">Uploaded:</span> {new Date(video.uploadTime).toLocaleString()}
              </p>
            </div>

            {video.hasCompressed && (
              <div className="dropdown dropdown-end dropdown-top">
                <label tabIndex={0} className="btn btn-sm btn-outline gap-2">
                  Quality: {quality === 'original' ? 'Original' : 'Compressed'}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z" />
                  </svg>
                </label>
                <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 text-black z-50">
                  <li><a onClick={() => setQuality('original')} className={quality === 'original' ? 'active' : ''}>Original</a></li>
                  <li><a onClick={() => setQuality('compressed')} className={quality === 'compressed' ? 'active' : ''}>Compressed</a></li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
