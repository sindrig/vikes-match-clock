import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Asset as AssetType } from "../../../types";
import Asset from "../Asset";
import ItemActionDialog from "./ItemActionDialog";

import "./QueueItem.css";

interface QueueItemProps {
  asset: AssetType;
  queueId: string;
  onShowNow: (asset: AssetType) => void;
  onDelete: (queueId: string, assetKey: string) => void;
}

const QueueItem: React.FC<QueueItemProps> = ({
  asset,
  queueId,
  onShowNow,
  onDelete,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: asset.key,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : "grab",
  };

  const handleClick = () => {
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="queue-item"
        onClick={handleClick}
        data-sortable-id={asset.key}
        {...attributes}
        {...listeners}
      >
        <Asset asset={asset} thumbnail={true} />
      </div>
      <ItemActionDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        asset={asset}
        queueId={queueId}
        onShowNow={onShowNow}
        onDelete={onDelete}
      />
    </>
  );
};

export default QueueItem;
