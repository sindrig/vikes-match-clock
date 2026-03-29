import React, { useRef, useState } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { DraggableAttributes } from "@dnd-kit/core";
import {
  MdDragIndicator,
  MdFastForward,
  MdLoop,
  MdPlayArrow,
  MdPause,
} from "react-icons/md";
import { QueueState, Asset } from "../../../types";
import QueueItem from "./QueueItem";
import QueueSettingsPopover from "./QueueSettingsPopover";
import { makeDragId } from "./dndUtils";
import "./QueueColumn.css";

type SortableListeners = ReturnType<typeof useSortable>["listeners"];

interface QueueColumnProps {
  queue: QueueState;
  isPlaying: boolean;
  onRenameQueue: (queueId: string, newName: string) => void;
  onPlayQueue: (queueId: string) => void;
  onStopPlaying: () => void;
  onUpdateSettings: (
    queueId: string,
    settings: Partial<Pick<QueueState, "autoPlay" | "imageSeconds" | "cycle">>,
  ) => void;
  onDeleteQueue: (queueId: string) => void;
  onShowItemNow: (asset: Asset) => void;
  onDeleteAsset: (queueId: string, assetKey: string) => void;
  sortableListeners?: SortableListeners;
  sortableAttributes?: DraggableAttributes;
  style?: React.CSSProperties;
}

const QueueColumn: React.FC<QueueColumnProps> = ({
  queue,
  isPlaying,
  onRenameQueue,
  onPlayQueue,
  onStopPlaying,
  onUpdateSettings,
  onDeleteQueue,
  onShowItemNow,
  onDeleteAsset,
  sortableListeners,
  sortableAttributes,
  style,
}) => {
  const [nameInput, setNameInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const editingStartValueRef = useRef("");

  const displayValue = isEditing ? nameInput : queue.name;

  const handleNameFocus = () => {
    editingStartValueRef.current = queue.name;
    setNameInput(queue.name);
    setIsEditing(true);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNameInput(e.target.value);
  };

  const handleNameBlur = () => {
    setIsEditing(false);
    if (nameInput.trim() !== queue.name && nameInput.trim() !== "") {
      onRenameQueue(queue.id, nameInput.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      onStopPlaying();
    } else {
      onPlayQueue(queue.id);
    }
  };

  const items = queue.items || [];
  const itemIds = items.map((item) => makeDragId("item", queue.id, item.key));

  return (
    <div
      className={`queue-column ${isPlaying ? "queue-column--playing" : ""}`}
      style={style}
      {...sortableAttributes}
    >
      <div className="queue-column-header">
        <button
          type="button"
          className="queue-column-drag-handle"
          {...sortableListeners}
          aria-label="Drag column"
        >
          <MdDragIndicator size={20} />
        </button>

        <div className="queue-column-title-container">
          <input
            className="queue-column-name-input"
            value={displayValue}
            onChange={handleNameChange}
            onBlur={handleNameBlur}
            onFocus={handleNameFocus}
            onKeyDown={handleKeyDown}
            aria-label={`Rename queue ${queue.name}`}
          />
        </div>

        <div className="queue-column-status">
          {queue.autoPlay && <MdFastForward title="Auto-play on" />}
          {queue.cycle && <MdLoop title="Loop on" />}
        </div>

        <div className="queue-column-actions">
          <QueueSettingsPopover
            queue={queue}
            onUpdateSettings={onUpdateSettings}
            onDeleteQueue={onDeleteQueue}
          />
          <button
            type="button"
            className={`queue-column-action-btn ${isPlaying ? "stop-btn" : "play-btn"}`}
            onClick={handlePlayToggle}
            aria-label={isPlaying ? "Stop Queue" : "Play Queue"}
            title={isPlaying ? "Stop Queue" : "Play Queue"}
          >
            {isPlaying ? <MdPause /> : <MdPlayArrow />}
          </button>
        </div>
      </div>

      <div className="queue-column-body">
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((asset) => (
            <QueueItem
              key={asset.key}
              asset={asset}
              queueId={queue.id}
              onShowNow={onShowItemNow}
              onDelete={onDeleteAsset}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
};

export default QueueColumn;
