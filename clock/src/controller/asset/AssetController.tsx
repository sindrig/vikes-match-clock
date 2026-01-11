import React from "react";
import { bindActionCreators, Dispatch } from "redux";
import { connect, ConnectedProps } from "react-redux";

import AssetQueue from "./AssetQueue";
import { addVideosFromPlaylist } from "./YoutubePlaylist";
import { ASSET_VIEWS } from "../../reducers/controller";
import TeamAssetController from "./team/TeamAssetController";
import UrlController from "./UrlController";
import assetTypes from "./AssetTypes";
import Button from "rsuite/Button";
import InputNumber from "rsuite/InputNumber";
import Checkbox from "rsuite/Checkbox";
import controllerActions from "../../actions/controller";
import { RootState, Asset } from "../../types";
import { parseYoutubePlaylistId, isYoutubeUrl } from "../../utils/urlUtils";

import "./AssetController.css";
import MatchesOnPitch from "./team/MatchesOnPitch";
import GlobalShortcut from "../../GlobalShortcut";

const mapStateToProps = ({
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
}: RootState) => ({
  assetView,
  match,
  selectedAssets,
  autoPlay,
  cycle,
  playing,
  imageSeconds,
  currentAsset: currentAsset || null,
});

const mapDispatchToProps = (dispatch: Dispatch) =>
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

const connector = connect(mapStateToProps, mapDispatchToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;
type AssetControllerProps = PropsFromRedux;

const AssetController = ({
  addAssets,
  assetView,
  autoPlay,
  cycle,
  imageSeconds,
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
}: AssetControllerProps) => {
  const addMultipleAssets = (
    assetList: Promise<Asset | null>[],
    options: { showNow?: boolean } = { showNow: false },
  ) => {
    void Promise.all(assetList).then((resolvedAssets: unknown[]) => {
      const validAssets = resolvedAssets.filter(
        (a): a is Asset => a !== null && typeof a === "object",
      );
      if (options.showNow && validAssets.length === 1 && validAssets[0]) {
        renderAsset(validAssets[0]);
      } else {
        addAssets(validAssets);
      }
    });
  };

  const onImageSecondsChange = (value: string | number | null) => {
    if (value !== null) {
      setImageSeconds(Math.max(parseInt(String(value), 10), 1));
    }
  };

  const addAssetKey = (asset: Asset) => {
    if (asset.type === assetTypes.URL && isYoutubeUrl(asset.key)) {
      const listId = parseYoutubePlaylistId(asset.key);
      if (listId) {
        return addVideosFromPlaylist(listId, addAssetKey);
      }
    }
    return addMultipleAssets([Promise.resolve(asset)]);
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
              onTrigger={() => renderAsset(null)}
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
          <UrlController addAsset={addAssetKey} />
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
          previousView={() =>
            setTimeout(() => selectAssetView(ASSET_VIEWS.assets), 500)
          }
        />
      )}
    </div>
  );
};
export default connector(AssetController);
