import { useRef, useEffect } from "react";
import type { VideoAsset } from "../../types";

interface VideoPlayerProps {
  asset: Pick<VideoAsset, "url" | "key" | "loop">;
  playbackSpeed?: number;
  onEnded?: () => void;
  thumbnail?: boolean;
}

const VideoPlayer = ({
  asset: { url, key, loop = false },
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
        loop={thumbnail || loop}
        muted={thumbnail || loop}
        playsInline
        preload={thumbnail ? "metadata" : "auto"}
        onEnded={thumbnail || loop ? undefined : onEnded}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
};

export default VideoPlayer;
