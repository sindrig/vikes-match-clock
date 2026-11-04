import React, { useEffect, useMemo, useRef, useState } from "react";

import { useLocalState } from "../contexts/LocalStateContext";
import { storageHelpers } from "../firebase";

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
  const scope = useMemo(
    () => ({ listenPrefix, imageType }),
    [listenPrefix, imageType],
  );
  const [loaded, setLoaded] = useState<{ scope: object; assets: string[] }>({
    scope,
    assets: [],
  });
  const assets = loaded.scope === scope ? loaded.assets : [];
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
    let active = true;
    void storageHelpers
      .listAll(`${scope.listenPrefix}/${scope.imageType}`)
      .then(async (res) => {
        if (!active) return;
        const urls = await Promise.all(
          res.items.map((itemRef) =>
            storageHelpers.getDownloadURL(itemRef.fullPath),
          ),
        );
        if (!active) return;
        setLoaded({ scope, assets: urls });
        setImg(0);
      })
      .catch(() => {
        // Ads are optional; denied listings and failed URLs leave an empty slot.
        if (active) setLoaded({ scope, assets: [] });
      });
    return () => {
      active = false;
    };
  }, [scope]);

  if (isBlank || assets.length === 0) {
    return null;
  }
  const src = isPost && postAdImg ? postAdImg : assets[img];
  return <img src={src} className="ad" alt="Ad" />;
};

export default AdImage;
