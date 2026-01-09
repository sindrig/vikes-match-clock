import React, { useState, useEffect, useRef } from "react";
import { storage } from "../firebase";
import { connect, ConnectedProps } from "react-redux";
import { RootState } from "../types";

function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef<(() => void) | undefined>(undefined);

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    function tick(): void {
      savedCallback.current?.();
    }
    if (delay !== null) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
    return undefined;
  }, [delay]);
}

interface OwnProps {
  imageType: string;
  time?: number;
  blankBetweenImages?: boolean;
  postAdImg?: string | null;
}

const stateToProps = ({ remote: { listenPrefix } }: RootState) => ({
  listenPrefix,
});

const connector = connect(stateToProps);

type AdImageProps = ConnectedProps<typeof connector> & OwnProps;

const AdImage: React.FC<AdImageProps> = ({
  imageType,
  time = 5,
  blankBetweenImages = false,
  postAdImg = null,
  listenPrefix,
}) => {
  const [assets, setAssets] = useState<string[]>([]);
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
    const nextImg = Number(img) + 1;
    return setImg(nextImg === assets.length ? 0 : nextImg);
  }, time * 1000);

  useEffect(() => {
    const listRef = storage.ref(`${String(listenPrefix)}/${String(imageType)}`);
    void listRef
      .listAll()
      .then((res) =>
        Promise.all(res.items.map((itemRef) => itemRef.getDownloadURL())).then(
          setAssets,
        ),
      );
  }, [imageType, listenPrefix]);

  if (isBlank || assets.length === 0) {
    return null;
  }
  const src = isPost && postAdImg ? postAdImg : assets[img];
  return <img src={src} className="ad" alt="Ad" />;
};

export default connector(AdImage);
