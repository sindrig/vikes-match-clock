import React, { useCallback } from "react";
import { useDrop } from "react-dnd";
import TrashIcon from "@rsuite/icons/Trash";
import { Asset } from "../../types";
import { useController } from "../../contexts/FirebaseStateContext";

const assetItemType = "asset";

interface DragItem {
  asset: Asset;
}

const RemoveAssetDropzone = (): React.JSX.Element => {
  const { removeAsset } = useController();
  const [{ handlerId }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: string | symbol | null }
  >({
    accept: assetItemType,
    drop: ({ asset }: DragItem) => {
      console.log(asset);
      removeAsset(asset);
    },
    collect: (monitor) => ({
      handlerId: monitor.getHandlerId(),
    }),
  });

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      drop(node);
    },
    [drop],
  );

  return (
    <div ref={setRef} data-handler-id={handlerId}>
      <TrashIcon style={{ fontSize: "10em" }} />
    </div>
  );
};

export default RemoveAssetDropzone;
