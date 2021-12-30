import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";

import * as assets from "../assets";

function useInterval(callback, delay) {
  const savedCallback = useRef();

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
    return () => {};
  }, [delay]);
}

const AdImage = ({ size, time, blankBetweenImages, postAdImg }) => {
  const adRegex = new RegExp(`ads\\/${size}\\/(.*)\\.*`);
  const adAssets = [
    ...new Set(
      Object.keys(assets)
        .map((k) => k.match(adRegex))
        .filter((m) => m)
        .map((m) => m[1])
    ),
  ];
  const [img, setImg] = useState(0);
  const [isBlank, setBlank] = useState(blankBetweenImages);
  const [isPost, setPost] = useState(!postAdImg);
  useInterval(() => {
    if (blankBetweenImages) {
      if (!isBlank) {
        if (!isPost) {
          return setPost(true);
        } else {
          setPost(false);
        }
        return setBlank(true);
      }
      if (isBlank) {
        setBlank(false);
      }
    }
    const nextImg = img + 1;
    return setImg(nextImg === adAssets.length ? 0 : nextImg);
  }, time * 1000);
  if (isBlank) {
    return null;
  }
  const src = isPost ? postAdImg : assets[`ads/${size}/${adAssets[img]}`];
  return <img src={src} className="ad" alt="Ad" />;
};

AdImage.propTypes = {
  size: PropTypes.string.isRequired,
  time: PropTypes.number,
  blankBetweenImages: PropTypes.bool,
  postAdImg: PropTypes.string,
};

AdImage.defaultProps = {
  time: 5,
  blankBetweenImages: false,
  postAdImg: null,
};

export default AdImage;
