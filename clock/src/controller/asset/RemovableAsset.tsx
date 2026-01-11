import { useRef, useCallback } from "react";
import { useDrag, useDrop } from "react-dnd";
import { Asset } from "../../types";

import "./RemovableAsset.css";

const assetItemType = "asset";

interface DragItem {
  asset: Asset;
  index: number;
}

interface RemovableAssetProps {
  children: React.ReactNode;
  asset: Asset;
  index: number;
  moveAsset: (dragIndex: number, hoverIndex: number) => void;
  remove?: (asset: Asset) => void;
}

const RemovableAsset = ({
  children,
  asset,
  index,
  moveAsset,
}: RemovableAssetProps): React.JSX.Element => {
  const ref = useRef<HTMLDivElement>(null);
  const [{ handlerId }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: string | symbol | null }
  >({
    accept: assetItemType,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) {
        return;
      }
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) {
        return;
      }
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }
      moveAsset(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });
  const [{ isDragging }, drag] = useDrag<
    DragItem,
    void,
    { isDragging: boolean }
  >({
    type: assetItemType,
    item: (): DragItem => {
      return { asset, index };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });
  const opacity = isDragging ? 0.5 : 1;

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      drag(drop(node));
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [drag, drop],
  );

  const style = {
    cursor: "move",
  };
  return (
    <div
      className="removable-asset"
      ref={setRef}
      style={{ ...style, opacity }}
      data-handler-id={handlerId}
    >
      {children}
    </div>
  );
};

export default RemovableAsset;
