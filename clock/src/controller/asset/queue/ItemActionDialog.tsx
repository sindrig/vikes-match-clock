import React from "react";
import { Modal, Button } from "rsuite";
import { Asset as AssetType } from "../../../types";
import Asset from "../Asset";

interface ItemActionDialogProps {
  open: boolean;
  onClose: () => void;
  asset: AssetType | null;
  queueId: string;
  onShowNow: (asset: AssetType) => void;
  onDelete: (queueId: string, assetKey: string) => void;
}

const ItemActionDialog: React.FC<ItemActionDialogProps> = ({
  open,
  onClose,
  asset,
  queueId,
  onShowNow,
  onDelete,
}) => {
  if (!asset) return null;

  const handleShowNow = () => {
    onShowNow(asset);
    onClose();
  };

  const handleDelete = () => {
    onDelete(queueId, asset.key);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="xs">
      <Modal.Header>
        <Modal.Title>Aðgerð</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "1rem",
          }}
        >
          <Asset asset={asset} thumbnail={true} />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={handleShowNow} appearance="primary">
          Sýna
        </Button>
        <Button onClick={handleDelete} appearance="subtle" color="red">
          Eyða
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ItemActionDialog;
