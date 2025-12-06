import { useEffect, useRef } from "react";
import type { Video } from "../types";

interface VideoPlayerProps {
  video: Video;
  isOpen: boolean;
  onClose: () => void;
}

export default function VideoPlayer({ video, isOpen, onClose }: VideoPlayerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);


  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }

    // Close on ESC
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

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onClick={handleClickOutside}
    >
      <div className="modal-box relative max-w-4xl w-full p-11">

        <button
          className="btn btn-sm btn-circle absolute right-3 top-3 focus:outline-none focus:ring-0"
          onClick={onClose}
        >
          ✕
        </button>


        <video
          ref={videoRef}
          controls
          autoPlay
          className="w-full rounded"
          src={video.videoUrl}
        >
          <source src={video.videoUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>


        <div className="mt-4 text-sm">
          <p><span className="font-bold">Filename:</span> {video.originalFilename}</p>
          <p><span className="font-bold">Size:</span> {(video.fileSize / (1024*1024)).toFixed(2)} MB</p>
          <p><span className="font-bold">Uploaded:</span> {new Date(video.uploadTime).toLocaleString()}</p>
        </div>
      </div>
    </dialog>
  );
}
