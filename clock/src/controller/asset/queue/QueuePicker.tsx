import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Modal, Button, Divider } from "rsuite";
import { QueueState, Asset } from "../../../types";
import "./QueuePicker.css";

export interface QueuePickerProps {
  draftId: string;
  queues: Record<string, QueueState>;
  assets: Asset[];
  onShowNow: (assets: Asset[]) => void | Promise<void>;
  onAddToQueue: (queueId: string, assets: Asset[]) => void | Promise<void>;
  onCreateAndAdd: (queueName: string, assets: Asset[]) => void | Promise<void>;
  onClose: () => void;
}

const QueuePickerDraft: React.FC<QueuePickerProps> = ({
  queues,
  assets,
  onShowNow,
  onAddToQueue,
  onCreateAndAdd,
  onClose,
}) => {
  const queueIds = Object.keys(queues);
  const queueCount = queueIds.length;
  const prevAssetsRef = useRef<Record<string, boolean>>({});
  const submitting = useRef(false);
  const active = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const submit = useCallback(async (action: () => void | Promise<void>) => {
    if (!active.current || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      if (!active.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Ekki tókst að vista biðröð.",
      );
    } finally {
      submitting.current = false;
      if (active.current) setPending(false);
    }
  }, []);

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
      void submit(() => onCreateAndAdd("Biðröð 1", assets));
    }
  }, [queueCount, assets, onCreateAndAdd, submit]);

  if (queueCount === 0 && !error) {
    return null;
  }

  const sortedQueues = Object.values(queues).sort((a, b) => a.order - b.order);

  return (
    <Modal open={true} onClose={onClose} size="xs">
      <Modal.Header>
        <Modal.Title>Veldu aðgerð</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <p role="alert">{error}</p>}
        <div className="queue-picker-list">
          <Button
            appearance="primary"
            color="green"
            block
            size="lg"
            disabled={pending}
            onClick={() => void submit(() => onShowNow(assets))}
          >
            Sýna
          </Button>
          <Divider className="queue-picker-divider">Biðraðir</Divider>
          {sortedQueues.map((q) => (
            <Button
              key={q.id}
              appearance="ghost"
              block
              disabled={pending}
              onClick={() => void submit(() => onAddToQueue(q.id, assets))}
            >
              {q.name || q.id}
            </Button>
          ))}
          <Button
            appearance="primary"
            block
            loading={pending}
            onClick={() => {
              const newName = `Biðröð ${queueCount + 1}`;
              void submit(() => onCreateAndAdd(newName, assets));
            }}
          >
            Ný biðröð
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
};

// Pending state, feedback and the synchronous click guard belong to one
// selection, even when another draft contains the exact same asset objects.
const QueuePicker: React.FC<QueuePickerProps> = (props) => (
  <QueuePickerDraft key={props.draftId} {...props} />
);

export default QueuePicker;
