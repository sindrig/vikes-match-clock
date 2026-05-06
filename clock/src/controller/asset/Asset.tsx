import React, { useEffect, useMemo, useState } from "react";
import YouTube from "react-youtube";

import MOTM from "./MOTM";
import PlayerCard from "./PlayerCard";
import Substitution from "./Substitution";

import assetTypes from "./AssetTypes";

import "./Asset.css";
import VideoPlayer from "./VideoPlayer";
import { useController, useView } from "../../contexts/FirebaseStateContext";
import { useAuth } from "../../contexts/LocalStateContext";
import { useClubLogo } from "../../hooks/useClubLogo";
import { isVideoUrl } from "../../utils/matchUtils";
import { CurrentAsset } from "../../types";

const PRELOAD_TIMEOUT_MS = 5000;

function usePreloadedMedia(urls: string[]): boolean {
  const key = useMemo(() => JSON.stringify([...urls].sort()), [urls]);
  const [readyKey, setReadyKey] = useState<string | undefined>(
    urls.length === 0 ? key : undefined,
  );

  useEffect(() => {
    if (urls.length === 0) {
      return;
    }
    let cancelled = false;
    let loaded = 0;
    const total = urls.length;
    const elements: Array<HTMLImageElement | HTMLVideoElement> = [];

    const markReady = () => {
      if (!cancelled) setReadyKey(key);
    };

    const check = () => {
      loaded += 1;
      if (loaded >= total) markReady();
    };

    const timeout = window.setTimeout(markReady, PRELOAD_TIMEOUT_MS);

    for (const url of urls) {
      if (isVideoUrl(url)) {
        const video = document.createElement("video");
        video.preload = "auto";
        video.oncanplaythrough = check;
        video.onloadeddata = check;
        video.onerror = check;
        video.src = url;
        elements.push(video);
      } else {
        const img = new Image();
        img.onload = check;
        img.onerror = check;
        img.src = url;
        elements.push(img);
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      for (const el of elements) {
        el.onload = null;
        el.onerror = null;
        if (el instanceof HTMLVideoElement) {
          el.oncanplaythrough = null;
          el.onloadeddata = null;
          el.removeAttribute("src");
          el.load();
        } else {
          el.src = "";
        }
      }
    };
  }, [key, urls]);

  if (urls.length === 0) return true;
  return key === readyKey;
}

function getAssetMediaUrls(
  asset:
    | { type: string; key: string; url?: string; background?: string }
    | undefined,
): string[] {
  if (!asset) return [];
  const urls: string[] = [];
  if (asset.background) urls.push(asset.background);
  switch (asset.type) {
    case assetTypes.IMAGE:
      urls.push(asset.url || asset.key);
      break;
    case assetTypes.PLAYER:
      urls.push(asset.key);
      break;
    case assetTypes.VIDEO:
      urls.push(asset.url || asset.key);
      break;
  }
  return urls;
}

export function useDeferredAsset(
  incoming: CurrentAsset | null,
): CurrentAsset | null {
  const urls = useMemo(
    () => getAssetMediaUrls(incoming?.asset),
    [incoming?.asset],
  );
  const ready = usePreloadedMedia(urls);
  const [lastReady, setLastReady] = useState<CurrentAsset | null>(null);

  const next = !incoming ? null : ready ? incoming : lastReady;

  if (ready && incoming && lastReady !== incoming) {
    setLastReady(incoming);
  }
  if (!incoming && lastReady !== null) {
    setLastReady(null);
  }

  return next;
}

interface Overlay {
  text: string;
  blink?: boolean;
  effect?: string;
}

interface AssetObject {
  type: string;
  key: string;
  url?: string;
  background?: string;
  teamName?: string;
  overlay?: Overlay | null;
  subIn?: AssetObject;
  subOut?: AssetObject;
  originalAssetType?: string;
  name?: string;
  number?: number | string;
  role?: string;
}

interface OwnProps {
  asset: AssetObject;
  thumbnail?: boolean;
  time?: number | null;
}

type AssetProps = OwnProps;

const AssetComponent = (props: AssetProps) => {
  const { asset, thumbnail, time } = props;
  const { removeAssetAfterTimeout } = useController();
  const {
    view: { vp },
  } = useView();
  const auth = useAuth();
  const teamLogoUrl = useClubLogo(asset?.teamName || "");

  useEffect(() => {
    if (auth.isEmpty) {
      return;
    }
    const typesWithoutManualRemove = [assetTypes.URL, assetTypes.VIDEO];
    const typeNeedsManualRemove =
      asset && !typesWithoutManualRemove.includes(asset.type);

    if (time && !thumbnail && typeNeedsManualRemove) {
      const timeout = setTimeout(removeAssetAfterTimeout, time * 1000);
      return () => clearTimeout(timeout);
    }
  }, [time, thumbnail, removeAssetAfterTimeout, asset, auth.isEmpty]);

  const getPlayerAsset = ({
    asset: playerAsset,
    widthMultiplier,
    includeBackground,
  }: {
    asset: AssetObject;
    widthMultiplier?: number;
    includeBackground?: boolean;
  }): React.JSX.Element | null => {
    if (playerAsset.type === assetTypes.PLAYER) {
      return (
        <PlayerCard
          asset={playerAsset}
          thumbnail={thumbnail}
          className="player-card-image"
          key={playerAsset.key}
          overlay={playerAsset.overlay || { text: "" }}
          includeBackground={includeBackground}
        >
          {includeBackground !== false && playerAsset.background ? (
            <img src={playerAsset.background} alt={playerAsset.background} />
          ) : null}
          <img src={playerAsset.key} alt={playerAsset.key} />
        </PlayerCard>
      );
    }
    if (playerAsset.type === assetTypes.NO_IMAGE_PLAYER) {
      const { teamName } = playerAsset;
      return (
        <PlayerCard
          asset={playerAsset}
          thumbnail={thumbnail}
          className="player-card-no-image"
          widthMultiplier={widthMultiplier}
          key={playerAsset.key}
          overlay={playerAsset.overlay || { text: "" }}
          includeBackground={includeBackground}
        >
          {includeBackground !== false && playerAsset.background ? (
            <img src={playerAsset.background} alt={playerAsset.background} />
          ) : null}
          {teamName && teamLogoUrl ? (
            <img src={teamLogoUrl} alt={teamName} />
          ) : null}
        </PlayerCard>
      );
    }
    console.error(`you should not get here: ${JSON.stringify(playerAsset)}`);
    return null;
  };

  const renderUrl = (): React.JSX.Element | null => {
    // TODO can only handle youtube
    let url: URL;
    try {
      url = new window.URL(asset.key);
    } catch {
      console.error("Unknown url ", asset.key);
      return null;
    }
    const isYouTube = url.host.indexOf("youtube");
    const params = url.search.replace("?", "").split("&");
    const videoId = params
      .map((p) => p.split("="))
      .filter((kv) => kv[0] === "v")
      .map((kv) => kv[1])[0];
    if (isYouTube >= 0) {
      if (videoId) {
        if (thumbnail) {
          return (
            <a href={`https://www.youtube.com/watch?v=${videoId}`}>
              Youtube:
              {videoId}
            </a>
          );
        }
        const opts: Record<string, unknown> = {
          height: "50",
          width: "100",
          playerVars: {
            autoplay: 1,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            disablekb: 1,
            showinfo: 0,
            controls: 0,
          },
        };
        if (vp?.style) {
          opts.height = vp.style.height;
          opts.width = vp.style.width;
        }
        return (
          <div style={{ backgroundColor: "#000000" }}>
            <YouTube
              videoId={videoId}
              opts={opts}
              onEnd={removeAssetAfterTimeout}
            />
          </div>
        );
      }
    }
    console.log("Do not know how to render ", url);
    return null;
  };

  const renderSub = (): React.JSX.Element | null => {
    const { subIn, subOut } = asset;
    if (!subIn || !subOut) {
      console.log("No subin or subout", asset);
      return null;
    }
    return (
      <Substitution thumbnail={thumbnail}>
        {[subIn, subOut].map((subAsset) =>
          getPlayerAsset({
            asset: subAsset,
            widthMultiplier: 0.7,
            includeBackground: false,
          }),
        )}
      </Substitution>
    );
  };

  if (!asset) {
    return null;
  }

  switch (asset.type) {
    case assetTypes.IMAGE:
      return (
        <img
          src={asset.url || asset.key}
          alt={asset.key}
          key={asset.key}
          style={{ height: "100%", width: "100%" }}
        />
      );
    case assetTypes.VIDEO:
      return (
        <VideoPlayer
          asset={asset}
          onEnded={removeAssetAfterTimeout}
          thumbnail={thumbnail}
        />
      );

    case assetTypes.URL:
      return renderUrl();

    case assetTypes.PLAYER:
    case assetTypes.NO_IMAGE_PLAYER: {
      if (asset.background) {
        const playerCard = getPlayerAsset({
          asset,
          widthMultiplier: 1,
          includeBackground: false,
        });
        return (
          <>
            {isVideoUrl(asset.background) ? (
              <video
                src={asset.background}
                autoPlay
                loop
                muted
                playsInline
                style={{ height: "100%", width: "100%", objectFit: "cover" }}
              />
            ) : (
              <img
                src={asset.background}
                alt="background"
                style={{ height: "100%", width: "100%" }}
              />
            )}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            >
              {playerCard}
            </div>
          </>
        );
      }
      return getPlayerAsset({ asset, widthMultiplier: 1 });
    }
    case assetTypes.MOTM:
      return (
        <MOTM>
          {getPlayerAsset({
            asset: { ...asset, type: asset.originalAssetType || asset.type },
            widthMultiplier: 1,
          })}
        </MOTM>
      );

    case assetTypes.SUB:
      return renderSub();

    default:
      console.error("No type for item ", asset);
      return null;
  }
};

export default AssetComponent;
