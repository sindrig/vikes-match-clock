import React, { useCallback } from "react";
import update from "immutability-helper";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import PropTypes from "prop-types";

import Asset from "./Asset";
import RemovableAsset from "./RemovableAsset";
import RemoveAssetDropzone from "./RemoveAssetDropzone";
import { assetPropType } from "../../propTypes";
import controllerActions from "../../actions/controller";

const AssetQueue = ({
  removeAsset,
  selectedAssets,
  setSelectedAssets,
  includeRemove,
}) => {
  const moveAsset = useCallback(
    (dragIndex, hoverIndex) => {
      const newAssets = update(selectedAssets, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, selectedAssets[dragIndex]],
        ],
      });
      setSelectedAssets(newAssets);
    },
    [setSelectedAssets, selectedAssets],
  );
  const renderRemovableAsset = useCallback(
    (asset, index) => {
      return (
        <RemovableAsset
          asset={asset}
          remove={removeAsset}
          key={asset.key}
          moveAsset={moveAsset}
          index={index}
        >
          <Asset asset={asset} thumbnail />
        </RemovableAsset>
      );
    },
    [moveAsset, removeAsset],
  );
  if (!selectedAssets || selectedAssets.length === 0) {
    return null;
  }
  return (
    <div>
      <div className="removable-asset-container">
        {(selectedAssets || []).map((asset, i) =>
          renderRemovableAsset(asset, i),
        )}
      </div>
      {includeRemove && (
        <div className="remove-asset-dropzone">
          <RemoveAssetDropzone />
        </div>
      )}
    </div>
  );
};

AssetQueue.propTypes = {
  selectedAssets: PropTypes.arrayOf(assetPropType).isRequired,
  setSelectedAssets: PropTypes.func.isRequired,
  removeAsset: PropTypes.func.isRequired,
  includeRemove: PropTypes.bool,
};

const stateToProps = ({ controller: { selectedAssets } }) => ({
  selectedAssets,
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      setSelectedAssets: controllerActions.setSelectedAssets,
      removeAsset: controllerActions.removeAsset,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(AssetQueue);
