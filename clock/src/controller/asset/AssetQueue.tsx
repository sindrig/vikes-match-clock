import { useCallback } from "react";
import update from "immutability-helper";
import { bindActionCreators, Dispatch } from "redux";
import { connect, ConnectedProps } from "react-redux";

import Asset from "./Asset";
import RemovableAsset from "./RemovableAsset";
import RemoveAssetDropzone from "./RemoveAssetDropzone";
import controllerActions from "../../actions/controller";
import { RootState, Asset as AssetType } from "../../types";

interface OwnProps {
  includeRemove?: boolean;
}

const mapStateToProps = ({ controller: { selectedAssets } }: RootState) => ({
  selectedAssets,
});

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      setSelectedAssets: controllerActions.setSelectedAssets,
      removeAsset: controllerActions.removeAsset,
    },
    dispatch,
  );

const connector = connect(mapStateToProps, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;

type Props = PropsFromRedux & OwnProps;

const AssetQueue = ({
  removeAsset,
  selectedAssets,
  setSelectedAssets,
  includeRemove = false,
}: Props): React.JSX.Element | null => {
  const moveAsset = useCallback(
    (dragIndex: number, hoverIndex: number) => {
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

export default connector(AssetQueue);
