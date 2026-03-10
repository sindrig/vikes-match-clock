import React from "react";
import {
  Whisper,
  Popover,
  Toggle,
  InputNumber,
  Button,
  IconButton,
} from "rsuite";
import GearIcon from "@rsuite/icons/Gear";
import { QueueState } from "../../../types";
import "./QueueSettingsPopover.css";

interface QueueSettingsPopoverProps {
  queue: QueueState;
  onUpdateSettings: (
    queueId: string,
    settings: Partial<Pick<QueueState, "autoPlay" | "imageSeconds" | "cycle">>,
  ) => void;
  onDeleteQueue: (queueId: string) => void;
}

const QueueSettingsPopover: React.FC<QueueSettingsPopoverProps> = ({
  queue,
  onUpdateSettings,
  onDeleteQueue,
}) => {
  const onImageSecondsChange = (value: string | number | null) => {
    if (value !== null) {
      const seconds = typeof value === "string" ? parseInt(value, 10) : value;
      onUpdateSettings(queue.id, { imageSeconds: Math.max(1, seconds) });
    }
  };

  const speaker = (
    <Popover className="queue-settings-popover" title="Stillingar biðraðar">
      <div className="queue-settings-row">
        <label>Autoplay</label>
        <Toggle
          checked={queue.autoPlay}
          onChange={(checked) =>
            onUpdateSettings(queue.id, { autoPlay: checked })
          }
        />
      </div>

      {queue.autoPlay && (
        <div className="queue-settings-row">
          <label>Tími</label>
          <InputNumber
            min={1}
            max={600}
            defaultValue={3}
            value={queue.imageSeconds}
            onChange={onImageSecondsChange}
            postfix="sek"
            style={{ width: 110 }}
          />
        </div>
      )}

      <div className="queue-settings-row">
        <label>Loop</label>
        <Toggle
          checked={queue.cycle}
          onChange={(checked) => onUpdateSettings(queue.id, { cycle: checked })}
        />
      </div>

      <div style={{ marginTop: 15 }}>
        <Button
          block
          color="red"
          appearance="primary"
          onClick={() => {
            if (window.confirm("Ertu alveg viss?")) {
              onDeleteQueue(queue.id);
            }
          }}
        >
          Eyða biðröð
        </Button>
      </div>
    </Popover>
  );

  return (
    <Whisper trigger="click" placement="bottomEnd" speaker={speaker}>
      <IconButton icon={<GearIcon />} appearance="subtle" size="sm" />
    </Whisper>
  );
};

export default QueueSettingsPopover;
