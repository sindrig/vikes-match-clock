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
  const videoSrc = url || key;

  useEffect(() => {
    if (playbackSpeed !== 1 && videoRef.current && !thumbnail) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, videoSrc, thumbnail]);

  return (
    <div style={{ height: "100%", width: "100%", backgroundColor: "black" }}>
      <video
        ref={videoRef}
        src={videoSrc}
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
