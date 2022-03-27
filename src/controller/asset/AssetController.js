import React, { Component } from "react";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import PropTypes from "prop-types";

import { addVideosFromPlaylist } from "./YoutubePlaylist";
import { ASSET_VIEWS } from "../../reducers/controller";
import { matchPropType, assetPropType } from "../../propTypes";
import Asset, { checkKey } from "./Asset";
import RemovableAsset from "./RemovableAsset";
import TeamAssetController from "./team/TeamAssetController";
import UrlController from "./UrlController";
import assetTypes from "./AssetTypes";
import Button from "rsuite/Button";
import InputNumber from "rsuite/InputNumber";
import Checkbox from "rsuite/Checkbox";
import controllerActions from "../../actions/controller";

import "./AssetController.css";

class AssetController extends Component {
  static propTypes = {
    renderAsset: PropTypes.func.isRequired,
    selectAssetView: PropTypes.func.isRequired,
    match: matchPropType.isRequired,
    assetView: PropTypes.string.isRequired,
    imageSeconds: PropTypes.number,
    selectedAssets: PropTypes.arrayOf(assetPropType).isRequired,
    cycle: PropTypes.bool,
    playing: PropTypes.bool,
    autoPlay: PropTypes.bool,
    toggleCycle: PropTypes.func.isRequired,
    setImageSeconds: PropTypes.func.isRequired,
    toggleAutoPlay: PropTypes.func.isRequired,
    setPlaying: PropTypes.func.isRequired,
    showNextAsset: PropTypes.func.isRequired,
    setSelectedAssets: PropTypes.func.isRequired,
  };

  static defaultProps = {
    imageSeconds: 0,
    autoPlay: false,
    cycle: false,
    playing: false,
  };

  constructor(props) {
    super(props);
    this.state = {
      playing: false,
      error: "",
    };
    this.onImageSecondsChange = this.onImageSecondsChange.bind(this);
    this.addMultipleAssets = this.addMultipleAssets.bind(this);
    this.addAssetKey = this.addAssetKey.bind(this);
    this.removeAsset = this.removeAsset.bind(this);
  }

  onImageSecondsChange(value) {
    const { setImageSeconds } = this.props;
    setImageSeconds(Math.max(parseInt(value, 10), 1));
  }

  addAssetKey(asset) {
    if (asset.type === assetTypes.URL) {
      if (asset.key.indexOf("youtube") > -1) {
        try {
          const url = new URL(asset.key);
          if (url.pathname === "/playlist") {
            const params = url.search.replace("?", "").split("&");
            const listId = params
              .map((p) => p.split("="))
              .filter((kv) => kv[0] === "list")
              .map((kv) => kv[1])[0];
            return addVideosFromPlaylist(listId, this.addAssetKey);
          }
        } catch (e) {
          console.log(e);
        }
      }
    }
    return this.addMultipleAssets([asset]);
  }

  addMultipleAssets(assetList, options = { showNow: false }) {
    const { selectedAssets, renderAsset, setSelectedAssets } = this.props;
    const updatedAssets = [...(selectedAssets || [])];
    const errors = [];
    Promise.all(assetList).then((resolvedAssets) => {
      if (options.showNow && resolvedAssets.length === 1) {
        renderAsset({
          asset: resolvedAssets[0],
        });
      } else {
        resolvedAssets.forEach((asset) => {
          if (checkKey(asset)) {
            if (updatedAssets.map((s) => s.key).indexOf(asset.key) === -1) {
              updatedAssets.push(asset);
            } else {
              errors.push(`Asset ${asset.key} already in asset list.`);
            }
          } else {
            errors.push(`Unknown asset ${asset.key}`);
          }
        });
        setSelectedAssets(updatedAssets);
        if (errors.length) {
          this.setState({ error: errors.join(" - ") });
        } else {
          this.setState({ error: "" });
        }
      }
    });
  }

  playRuv(key) {
    return () => {
      const { renderAsset } = this.props;
      renderAsset({
        asset: { key, type: assetTypes.RUV },
      });
    };
  }

  removeAsset(asset) {
    const { selectedAssets, setSelectedAssets } = this.props;
    const idx = selectedAssets.map((a) => a.key).indexOf(asset.key);
    if (idx > -1) {
      const newAssets = [...selectedAssets];
      newAssets.splice(idx, 1);
      setSelectedAssets(newAssets);
    }
  }

  renderNextAsset() {
    const { selectedAssets } = this.props;
    return (
      <div>
        {(selectedAssets || []).map((asset) => (
          <RemovableAsset
            asset={asset}
            remove={this.removeAsset}
            key={asset.key}
          >
            <Asset asset={asset} thumbnail />
          </RemovableAsset>
        ))}
      </div>
    );
  }

  renderError() {
    const { error } = this.state;
    if (error) {
      return <div>{error}</div>;
    }
    return null;
  }

  renderAssetController() {
    const {
      cycle,
      selectedAssets,
      imageSeconds,
      autoPlay,
      setSelectedAssets,
      toggleCycle,
      toggleAutoPlay,
      playing,
      setPlaying,
      showNextAsset,
    } = this.props;
    const selectedAssetsList = selectedAssets || [];
    return (
      <div className="withborder">
        <div className="controls control-item">
          <span>{selectedAssetsList.length} í biðröð</span>
          {selectedAssetsList.length ? (
            <Button
              color="red"
              size="xs"
              appearance="primary"
              onClick={() =>
                window.confirm("Ertu alveg viss?") && setSelectedAssets([])
              }
            >
              Hreinsa biðröð
            </Button>
          ) : null}
          {playing ? (
            <Button
              color="yellow"
              appearance="primary"
              onClick={() => setPlaying(false)}
            >
              Pause
            </Button>
          ) : null}
          {!playing && selectedAssetsList.length ? (
            <Button color="green" appearance="primary" onClick={showNextAsset}>
              Birta
            </Button>
          ) : null}
          <div>
            <Checkbox onChange={toggleAutoPlay} checked={autoPlay}>
              Autoplay
            </Checkbox>
          </div>
          {autoPlay && (
            <div>
              <InputNumber
                defaultValue={3}
                max={600}
                min={1}
                onChange={this.onImageSecondsChange}
                value={imageSeconds}
                postfix="sek"
              />
            </div>
          )}
          <div>
            <Checkbox onChange={toggleCycle} checked={cycle}>
              Loop
            </Checkbox>
          </div>
          <UrlController addAsset={this.addAssetKey} />
          <Button appearance="default" onClick={this.playRuv("ruv")}>
            RÚV
          </Button>
          <Button appearance="default" onClick={this.playRuv("ruv2")}>
            RÚV 2
          </Button>
          {this.renderError()}
        </div>
        <div className="upcoming-assets">{this.renderNextAsset()}</div>
      </div>
    );
  }

  render() {
    const { match, assetView, selectAssetView } = this.props;
    return (
      <div className="asset-controller">
        <div className="view-selector assettabs stdbuttons">
          <button
            type="button"
            onClick={() => selectAssetView(ASSET_VIEWS.assets)}
          >
            Biðröð
          </button>
          <button
            type="button"
            onClick={() => selectAssetView(ASSET_VIEWS.teams)}
          >
            Lið
          </button>
        </div>
        {assetView === ASSET_VIEWS.assets && this.renderAssetController()}
        {assetView === ASSET_VIEWS.teams && (
          <TeamAssetController
            addAssets={this.addMultipleAssets}
            match={match}
            updateTeams={this.updateTeams}
            // TODO
            controllerState={null}
            previousView={() =>
              setTimeout(() => selectAssetView(ASSET_VIEWS.assets), 500)
            }
          />
        )}
      </div>
    );
  }
}

const stateToProps = ({
  controller: {
    assetView,
    selectedAssets,
    autoPlay,
    cycle,
    imageSeconds,
    playing,
  },
  match,
}) => ({
  assetView,
  match,
  selectedAssets,
  autoPlay,
  cycle,
  playing,
  imageSeconds,
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      selectAssetView: controllerActions.selectAssetView,
      toggleCycle: controllerActions.toggleCycle,
      setImageSeconds: controllerActions.setImageSeconds,
      toggleAutoPlay: controllerActions.toggleAutoPlay,
      setPlaying: controllerActions.setPlaying,
      setSelectedAssets: controllerActions.setSelectedAssets,
      showNextAsset: controllerActions.showNextAsset,
      renderAsset: controllerActions.renderAsset,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(AssetController);
