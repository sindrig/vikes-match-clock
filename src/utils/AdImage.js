import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { storage } from "../firebase";

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

const AdImage = ({ imageType, time, blankBetweenImages, postAdImg }) => {
  const [assets, setAssets] = useState([]);
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
    return setImg(nextImg === assets.length ? 0 : nextImg);
  }, time * 1000);

  useEffect(() => {
    const listRef = storage.ref(imageType);
    listRef
      .listAll()
      .then((res) =>
        Promise.all(res.items.map((itemRef) => itemRef.getDownloadURL())).then(
          setAssets
        )
      );
  }, [imageType]);

  if (isBlank || assets.length === 0) {
    return null;
  }
  const src = isPost && postAdImg ? postAdImg : assets[img];
  return <img src={src} className="ad" alt="Ad" />;
};

AdImage.propTypes = {
  imageType: PropTypes.string.isRequired,
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
