import React from "react";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import PropTypes from "prop-types";

import FreeTextController from "./FreeTextController";
import AssetQueue from "./AssetQueue";
import { addVideosFromPlaylist } from "./YoutubePlaylist";
import { ASSET_VIEWS } from "../../reducers/controller";
import { matchPropType, assetPropType } from "../../propTypes";
import TeamAssetController from "./team/TeamAssetController";
import UrlController from "./UrlController";
import assetTypes from "./AssetTypes";
import Button from "rsuite/Button";
import InputNumber from "rsuite/InputNumber";
import Checkbox from "rsuite/Checkbox";
import controllerActions from "../../actions/controller";

import "./AssetController.css";
import MatchesOnPitch from "./team/MatchesOnPitch";
import GlobalShortcut from "../../GlobalShortcut";

const AssetController = ({
  addAssets,
  assetView,
  autoPlay,
  cycle,
  imageSeconds,
  match,
  playing,
  renderAsset,
  selectAssetView,
  selectedAssets,
  setImageSeconds,
  setPlaying,
  setSelectedAssets,
  showNextAsset,
  toggleAutoPlay,
  toggleCycle,
  currentAsset,
}) => {
  const addMultipleAssets = (assetList, options = { showNow: false }) => {
    Promise.all(assetList).then((resolvedAssets) => {
      if (options.showNow && resolvedAssets.length === 1) {
        renderAsset({
          asset: resolvedAssets[0],
        });
      } else {
        addAssets(resolvedAssets);
      }
    });
  };

  const playRuv = (key) => {
    return () => {
      renderAsset({
        asset: { key, type: assetTypes.RUV },
      });
    };
  };

  const onImageSecondsChange = (value) => {
    setImageSeconds(Math.max(parseInt(value, 10), 1));
  };

  const addAssetKey = (asset) => {
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
            return addVideosFromPlaylist(listId, addAssetKey);
          }
        } catch (e) {
          console.log(e);
        }
      }
    }
    return addMultipleAssets([asset]);
  };

  const renderAssetController = () => {
    const selectedAssetsList = selectedAssets || [];
    return (
      <div className="withborder">
        {selectedAssetsList.length ? (
          <React.Fragment>
            <GlobalShortcut
              shortcut=" "
              onTrigger={showNextAsset}
              preventDefault
            />
          </React.Fragment>
        ) : currentAsset ? (
          <React.Fragment>
            <GlobalShortcut
              shortcut=" "
              onTrigger={() => renderAsset(0)}
              preventDefault
            />
          </React.Fragment>
        ) : null}
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
                onChange={onImageSecondsChange}
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
          <UrlController addAsset={addAssetKey} />{" "}
          <FreeTextController addAsset={addAssetKey} />
          <Button appearance="default" onClick={playRuv("ruv")}>
            RÚV
          </Button>
          <Button appearance="default" onClick={playRuv("ruv2")}>
            RÚV 2
          </Button>
        </div>
        <div className="upcoming-assets">
          <AssetQueue includeRemove />
        </div>
      </div>
    );
  };
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
      <div className="view-selector">
        {assetView === ASSET_VIEWS.teams && <MatchesOnPitch />}
      </div>
      {assetView === ASSET_VIEWS.assets && renderAssetController()}
      {assetView === ASSET_VIEWS.teams && (
        <TeamAssetController
          addAssets={addMultipleAssets}
          match={match}
          controllerState={null}
          previousView={() =>
            setTimeout(() => selectAssetView(ASSET_VIEWS.assets), 500)
          }
        />
      )}
    </div>
  );
};
AssetController.propTypes = {
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
  addAssets: PropTypes.func.isRequired,
  currentAsset: PropTypes.object,
};

AssetController.defaultProps = {
  imageSeconds: 0,
  autoPlay: false,
  cycle: false,
  playing: false,
};

const stateToProps = ({
  controller: {
    assetView,
    selectedAssets,
    autoPlay,
    cycle,
    imageSeconds,
    playing,
    currentAsset,
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
  currentAsset: currentAsset || null,
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
      addAssets: controllerActions.addAssets,
      showNextAsset: controllerActions.showNextAsset,
      renderAsset: controllerActions.renderAsset,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(AssetController);
