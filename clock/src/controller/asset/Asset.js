import React, { Component } from "react";
import { bindActionCreators } from "redux";
import PropTypes from "prop-types";
import YouTube from "react-youtube";
import { connect } from "react-redux";

import { assetPropType, viewPortPropType } from "../../propTypes";
import MOTM from "./MOTM";
import PlayerCard from "./PlayerCard";
import Substitution from "./Substitution";

import assetTypes from "./AssetTypes";
import clubLogos from "../../images/clubLogos";
import Ruv from "./Ruv";
import controllerActions from "../../actions/controller";

import "./Asset.css";
import VideoPlayer from "./VideoPlayer";

class Asset extends Component {
  static propTypes = {
    asset: assetPropType.isRequired,
    removeAssetAfterTimeout: PropTypes.func.isRequired,
    thumbnail: PropTypes.bool,
    time: PropTypes.number,
    vp: viewPortPropType.isRequired,
    sync: PropTypes.bool,
    auth: PropTypes.shape({
      isLoaded: PropTypes.bool,
      isEmpty: PropTypes.bool,
    }).isRequired,
  };

  static defaultProps = {
    thumbnail: false,
    time: null,
    sync: false,
  };

  constructor(props) {
    super(props);
    this.timeout = null;
    this.getPlayerAsset = this.getPlayerAsset.bind(this);
  }

  componentDidMount() {
    this.setTimeoutIfNecessary();
  }

  componentDidUpdate() {
    this.setTimeoutIfNecessary();
  }

  componentWillUnmount() {
    clearTimeout(this.timeout);
  }

  setTimeoutIfNecessary() {
    const { time, thumbnail, removeAssetAfterTimeout, asset, sync, auth } =
      this.props;
    clearTimeout(this.timeout);
    if (sync && auth.isEmpty) {
      return;
    }
    const typesWithoutManualRemove = [assetTypes.URL, assetTypes.VIDEO];
    const typeNeedsManualRemove = !typesWithoutManualRemove.includes(
      asset.type,
    );

    if (time && !thumbnail && typeNeedsManualRemove) {
      this.timeout = setTimeout(removeAssetAfterTimeout, time * 1000);
    }
  }

  getPlayerAsset({ asset, widthMultiplier, includeBackground }) {
    const { thumbnail } = this.props;
    if (asset.type === assetTypes.PLAYER) {
      return (
        <PlayerCard
          asset={asset}
          thumbnail={thumbnail}
          className="player-card-image"
          key={asset.key}
          overlay={asset.overlay}
          includeBackground={includeBackground}
        >
          {asset.background ? (
            <img src={asset.background} alt={asset.background} />
          ) : null}
          <img src={asset.key} alt={asset.key} />
        </PlayerCard>
      );
    }
    if (asset.type === assetTypes.NO_IMAGE_PLAYER) {
      const { teamName } = asset;
      return (
        <PlayerCard
          asset={asset}
          thumbnail={thumbnail}
          className="player-card-no-image"
          widthMultiplier={widthMultiplier}
          key={asset.key}
          overlay={asset.overlay}
          includeBackground={includeBackground}
        >
          {asset.background ? (
            <img src={asset.background} alt={asset.background} />
          ) : null}
          {clubLogos[teamName] ? (
            <img src={clubLogos[teamName]} alt="teamName" />
          ) : null}
        </PlayerCard>
      );
    }
    console.error(`you should not get here: ${JSON.stringify(asset)}`);
    return null;
  }

  renderRuv() {
    const {
      asset: { key },
      thumbnail,
    } = this.props;
    return <Ruv thumbnail={thumbnail} channel={key} />;
  }

  renderUrl() {
    const { asset, thumbnail, removeAssetAfterTimeout, vp } = this.props;
    // TODO can only handle youtube
    let url;
    try {
      url = new window.URL(asset.key);
    } catch (e) {
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
        const opts = {
          height: "50",
          width: "100",
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            disablekb: 1,
          },
        };
        opts.playerVars.showinfo = 0;
        opts.playerVars.autoplay = 1;
        opts.playerVars.controls = 0;
        opts.height = vp.style.height;
        opts.width = vp.style.width;
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
  }

  renderFreeText() {
    const { asset, thumbnail } = this.props;

    return (
      <div className={`free-text-container ${thumbnail ? "thumbnail" : ""}`}>
        {asset.key}
      </div>
    );
  }

  renderSub() {
    const { asset, thumbnail } = this.props;
    const { subIn, subOut } = asset;
    if (!subIn || !subOut) {
      console.log("No subin or subout", asset);
      return null;
    }
    return (
      <Substitution thumbnail={thumbnail}>
        {[subIn, subOut].map((subAsset) =>
          this.getPlayerAsset({
            asset: subAsset,
            widthMultiplier: 0.7,
            includeBackground: false,
          }),
        )}
      </Substitution>
    );
  }

  render() {
    const { asset, thumbnail, removeAssetAfterTimeout } = this.props;
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
        return this.renderUrl();

      case assetTypes.RUV:
        return this.renderRuv();

      case assetTypes.PLAYER:
      case assetTypes.NO_IMAGE_PLAYER:
        return this.getPlayerAsset({ asset, widthMultiplier: 1 });
      case assetTypes.MOTM:
        return (
          <MOTM>
            {this.getPlayerAsset({
              asset: { ...asset, type: asset.originalAssetType },
              widthMultiplier: 1,
            })}
          </MOTM>
        );

      case assetTypes.SUB:
        return this.renderSub();

      case assetTypes.FREE_TEXT:
        return this.renderFreeText();

      default:
        console.error("No type for item ", asset);
        return null;
    }
  }
}

const stateToProps = ({
  view: { vp },
  remote: { sync },
  firebase: { auth },
}) => ({ vp, sync, auth });
const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      removeAssetAfterTimeout: controllerActions.removeAssetAfterTimeout,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(Asset);
