import React, { useState, useEffect } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { DraggableAttributes } from "@dnd-kit/core";
import {
  MdDragIndicator,
  MdAutorenew,
  MdLoop,
  MdSettings,
  MdPlayArrow,
  MdPause,
} from "react-icons/md";
import { QueueState, Asset } from "../../../types";
import QueueItem from "./QueueItem";
import "./QueueColumn.css";

// Extract listener type from useSortable return type for type safety
type SortableListeners = ReturnType<typeof useSortable>["listeners"];

interface QueueColumnProps {
  queue: QueueState;
  isPlaying: boolean;
  onRenameQueue: (queueId: string, newName: string) => void;
  onPlayQueue: (queueId: string) => void;
  onStopPlaying: () => void;
  onOpenSettings: (queueId: string) => void;
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
  onOpenSettings,
  onShowItemNow,
  onDeleteAsset,
  sortableListeners,
  sortableAttributes,
  style,
}) => {
  const [nameInput, setNameInput] = useState(queue.name);

  // Sync local state with prop changes (e.g. from Firebase)
  useEffect(() => {
    setNameInput(queue.name);
  }, [queue.name]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNameInput(e.target.value);
  };

  const handleNameBlur = () => {
    if (nameInput.trim() !== queue.name) {
      onRenameQueue(queue.id, nameInput.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent drag start if clicked on play button
    if (isPlaying) {
      onStopPlaying();
    } else {
      onPlayQueue(queue.id);
    }
  };

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenSettings(queue.id);
  };

  const items = queue.items || [];
  const itemIds = items.map((item) => item.key);

  return (
    <div
      className={`queue-column ${isPlaying ? "queue-column--playing" : ""}`}
      style={style}
      // Apply draggable attributes to the container so it can be identified
      // but listeners are only on the handle
      {...sortableAttributes}
    >
      <div className="queue-column-header">
        <div
          className="queue-column-drag-handle"
          {...sortableListeners}
          tabIndex={0}
          role="button"
          aria-label="Drag column"
        >
          <MdDragIndicator size={20} />
        </div>

        <div className="queue-column-title-container">
          <input
            className="queue-column-name-input"
            value={nameInput}
            onChange={handleNameChange}
            onBlur={handleNameBlur}
            onKeyDown={handleKeyDown}
            aria-label={`Rename queue ${queue.name}`}
          />
        </div>

        <div className="queue-column-status">
          {queue.autoPlay && <MdAutorenew title="Auto-play on" />}
          {queue.cycle && <MdLoop title="Loop on" />}
        </div>

        <div className="queue-column-actions">
          <button
            type="button"
            className="queue-column-action-btn"
            onClick={handleSettingsClick}
            aria-label="Queue Settings"
          >
            <MdSettings />
          </button>
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
