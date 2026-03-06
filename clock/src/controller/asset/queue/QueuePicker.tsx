import React, { useEffect, useRef } from "react";
import { SelectPicker } from "rsuite";
import { QueueState, Asset } from "../../../types";
import "./QueuePicker.css";

interface QueuePickerProps {
  queues: Record<string, QueueState>;
  assets: Asset[];
  onAddToQueue: (queueId: string, assets: Asset[]) => void;
  onCreateAndAdd: (queueName: string, assets: Asset[]) => void;
}

const NEW_QUEUE_VALUE = "__NEW_QUEUE__";

const QueuePicker: React.FC<QueuePickerProps> = ({
  queues,
  assets,
  onAddToQueue,
  onCreateAndAdd,
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

  const data = [
    ...Object.values(queues).map((q) => ({
      label: q.name || q.id,
      value: q.id,
    })),
    {
      label: "Ný biðröð",
      value: NEW_QUEUE_VALUE,
    },
  ];

  const handleSelect = (value: string | null) => {
    if (!value) return;

    if (value === NEW_QUEUE_VALUE) {
      const newName = `Biðröð ${queueCount + 1}`;
      onCreateAndAdd(newName, assets);
    } else {
      onAddToQueue(value, assets);
    }
  };

  return (
    <SelectPicker
      data={data}
      placeholder="Veldu biðröð..."
      onChange={handleSelect}
      style={{ width: 224 }}
      searchable={false}
      cleanable={false}
      renderMenuItem={(label: React.ReactNode, item: { value: string }) => {
        if (item.value === NEW_QUEUE_VALUE) {
          return <div className="new-queue-option">{label}</div>;
        }
        return <div>{label}</div>;
      }}
    />
  );
};

export default QueuePicker;
