import React, { useEffect, useRef } from "react";
import { Modal, Button } from "rsuite";
import { QueueState, Asset } from "../../../types";
import "./QueuePicker.css";

interface QueuePickerProps {
  queues: Record<string, QueueState>;
  assets: Asset[];
  onAddToQueue: (queueId: string, assets: Asset[]) => void;
  onCreateAndAdd: (queueName: string, assets: Asset[]) => void;
  onClose: () => void;
}

const QueuePicker: React.FC<QueuePickerProps> = ({
  queues,
  assets,
  onAddToQueue,
  onCreateAndAdd,
  onClose,
}) => {
  const queueIds = Object.keys(queues);
  const queueCount = queueIds.length;
  const prevAssetsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (assets.length === 0) return;

    const assetSignature: Record<string, boolean> = {};
    for (const asset of assets) {
      assetSignature[asset.key] = true;
    }

    const prevKeys = Object.keys(prevAssetsRef.current);
    const currKeys = Object.keys(assetSignature);
    if (
      prevKeys.length === currKeys.length &&
      currKeys.every((k) => prevAssetsRef.current[k])
    ) {
      return;
    }
    prevAssetsRef.current = assetSignature;

    if (queueCount === 0) {
      onCreateAndAdd("Biðröð 1", assets);
    } else if (queueCount === 1) {
      onAddToQueue(queueIds[0]!, assets);
    }
  }, [queueCount, queueIds, assets, onAddToQueue, onCreateAndAdd]);

  if (queueCount <= 1) {
    return null;
  }

  const sortedQueues = Object.values(queues).sort((a, b) => a.order - b.order);

  return (
    <Modal open={true} onClose={onClose} size="xs">
      <Modal.Header>
        <Modal.Title>Veldu biðröð</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="queue-picker-list">
          {sortedQueues.map((q) => (
            <Button
              key={q.id}
              appearance="ghost"
              block
              onClick={() => onAddToQueue(q.id, assets)}
            >
              {q.name || q.id}
            </Button>
          ))}
          <Button
            appearance="primary"
            block
            onClick={() => {
              const newName = `Biðröð ${queueCount + 1}`;
              onCreateAndAdd(newName, assets);
            }}
          >
            Ný biðröð
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default QueuePicker;
