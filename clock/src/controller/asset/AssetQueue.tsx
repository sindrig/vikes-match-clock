import React, { useCallback } from "react";
import update from "immutability-helper";

import Asset from "./Asset";
import RemovableAsset from "./RemovableAsset";
import RemoveAssetDropzone from "./RemoveAssetDropzone";
import { Asset as AssetType } from "../../types";
import { useController } from "../../contexts/FirebaseStateContext";

interface OwnProps {
  includeRemove?: boolean;
}

type Props = OwnProps;

const AssetQueue = ({
  includeRemove = false,
}: Props): React.JSX.Element | null => {
  const {
    controller: { selectedAssets },
    setSelectedAssets,
    removeAsset,
  } = useController();

  const moveAsset = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const draggedAsset = selectedAssets[dragIndex];
      if (!draggedAsset) return;
      const newAssets = update(selectedAssets, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, draggedAsset],
        ] as [[number, number], [number, number, AssetType]],
      });
      setSelectedAssets(newAssets);
    },
    [setSelectedAssets, selectedAssets],
  );
  const renderRemovableAsset = useCallback(
    (asset: AssetType, index: number) => {
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

export default AssetQueue;
