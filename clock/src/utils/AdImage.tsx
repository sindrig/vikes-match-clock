import React, { useState, useEffect, useRef } from "react";
import { storageHelpers, StorageReference } from "../firebase";
import { useLocalState } from "../contexts/LocalStateContext";

function useInterval(callback: () => void, delay: number): void {
  const savedCallback = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    function tick(): void {
      savedCallback.current?.();
    }
    const id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay]);
}

interface AdImageProps {
  imageType: string;
  time?: number;
  blankBetweenImages?: boolean;
  postAdImg?: string | null;
}

const AdImage: React.FC<AdImageProps> = ({
  imageType,
  time = 5,
  blankBetweenImages = false,
  postAdImg = null,
}) => {
  const { listenPrefix } = useLocalState();
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
      setBlank(false);
    }
    const nextImg = Number(img) + 1;
    return setImg(nextImg === assets.length ? 0 : nextImg);
  }, time * 1000);

  useEffect(() => {
    void storageHelpers
      .listAll(`${String(listenPrefix)}/${String(imageType)}`)
      .then((res) =>
        Promise.all(
          res.items.map((itemRef: StorageReference) =>
            storageHelpers.getDownloadURL(itemRef.fullPath),
          ),
        ).then(setAssets),
      );
  }, [imageType, listenPrefix]);

  if (isBlank || assets.length === 0) {
    return null;
  }
  const src = isPost && postAdImg ? postAdImg : assets[img];
  return <img src={src} className="ad" alt="Ad" />;
};

export default connector(AdImage);
