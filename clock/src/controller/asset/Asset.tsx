import React, { useEffect } from "react";
import YouTube from "react-youtube";

import MOTM from "./MOTM";
import PlayerCard from "./PlayerCard";
import Substitution from "./Substitution";

import assetTypes from "./AssetTypes";
import clubLogos from "../../images/clubLogos";

import "./Asset.css";
import VideoPlayer from "./VideoPlayer";
import { useController, useView } from "../../contexts/FirebaseStateContext";
import { useAuth, useRemoteSettings } from "../../contexts/LocalStateContext";

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
  const { view: { vp } } = useView();
  const auth = useAuth();
  const { sync } = useRemoteSettings();

  useEffect(() => {
    if (sync && auth.isEmpty) {
      return;
    }
    const typesWithoutManualRemove = [assetTypes.URL, assetTypes.VIDEO];
    const typeNeedsManualRemove =
      asset && !typesWithoutManualRemove.includes(asset.type);

    if (time && !thumbnail && typeNeedsManualRemove) {
      const timeout = setTimeout(removeAssetAfterTimeout, time * 1000);
      return () => clearTimeout(timeout);
    }
  }, [time, thumbnail, removeAssetAfterTimeout, asset, sync, auth.isEmpty]);

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
          {playerAsset.background ? (
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
          {playerAsset.background ? (
            <img src={playerAsset.background} alt={playerAsset.background} />
          ) : null}
          {teamName && teamName in clubLogos ? (
            <img
              src={clubLogos[teamName as keyof typeof clubLogos]}
              alt="teamName"
            />
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
    case assetTypes.NO_IMAGE_PLAYER:
      return getPlayerAsset({ asset, widthMultiplier: 1 });
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
