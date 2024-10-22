import React, { useRef, useEffect } from "react";
import PropTypes from "prop-types";

import { assetPropType } from "../../propTypes";

const VideoPlayer = ({
  asset: { url, key },
  thumbnail,
  playbackSpeed = 1,
  onEnded,
}) => {
  const videoRef = useRef(null);

  if (playbackSpeed !== 1) {
    useEffect(() => {
      if (videoRef.current && !thumbnail) {
        videoRef.current.playbackRate = playbackSpeed; // Set the playback rate
      }
    }, [playbackSpeed, url || key]); // Update playback speed when it changes
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
VideoPlayer.propTypes = {
  asset: assetPropType.isRequired,
  playbackSpeed: PropTypes.number.isRequired,
  onEnded: PropTypes.func.isRequired,
  thumbnail: PropTypes.bool,
};

export default VideoPlayer;
