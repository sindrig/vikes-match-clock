import { useRef } from "react";
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
      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }
      // Determine rectangle on screen
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      // Get vertical middle
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      // Determine mouse position
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) {
        return;
      }
      // Get pixels to the top
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }
      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }
      // Time to actually perform the action
      moveAsset(dragIndex, hoverIndex);
      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
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
  drag(drop(ref));
  const style = {
    cursor: "move",
  };
  return (
    <div
      className="removable-asset"
      ref={ref}
      style={{ ...style, opacity }}
      data-handler-id={handlerId}
    >
      {children}
    </div>
  );
};

export default RemovableAsset;
