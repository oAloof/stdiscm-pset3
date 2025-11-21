import type { Video } from '../types';

interface VideoCardProps {
  video: Video;
}

/**
 * VideoCard Component
 * TODO: Display video thumbnail, metadata, and handle click/hover events
 */
function VideoCard({ video }: VideoCardProps) {
  // TODO: Implement video card UI

  return (
    <div>
      <p>{video.filename}</p>
    </div>
  );
}

export default VideoCard;
