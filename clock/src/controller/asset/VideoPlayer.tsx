import { useRef, useEffect } from "react";

interface VideoAsset {
  url?: string;
  key: string;
}

interface VideoPlayerProps {
  asset: VideoAsset;
  playbackSpeed?: number;
  onEnded?: () => void;
  thumbnail?: boolean;
}

const VideoPlayer = ({
  asset: { url, key },
  thumbnail = false,
  playbackSpeed = 1,
  onEnded,
}: VideoPlayerProps): React.JSX.Element => {
  const videoRef = useRef<HTMLVideoElement>(null);

  if (playbackSpeed !== 1) {
    useEffect(() => {
      if (videoRef.current && !thumbnail) {
        videoRef.current.playbackRate = playbackSpeed; // Set the playback rate
      }
    }, [playbackSpeed, url || key, thumbnail]); // Update playback speed when it changes
  }
  return (
    <div style={{ height: "100%", width: "100%", backgroundColor: "black" }}>
      <video
        ref={videoRef}
        src={url || key}
        autoPlay={!thumbnail}
        loop={thumbnail}
        muted={thumbnail}
        onEnded={onEnded}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
};

export default VideoPlayer;
