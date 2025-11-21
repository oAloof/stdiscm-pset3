interface VideoPlayerProps {
  videoUrl: string;
  onClose: () => void;
}

/**
 * VideoPlayer Component
 * TODO: Implement modal video player with controls
 */
function VideoPlayer({ videoUrl: _videoUrl, onClose }: VideoPlayerProps) {
  // TODO: Implement video player modal

  return (
    <div>
      <button onClick={onClose}>Close</button>
      <p>Video Player - TODO</p>
    </div>
  );
}

export default VideoPlayer;
