import React, { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { QueueState, Asset } from "../../../types";
import QueueColumn from "./QueueColumn";
import QueueItem from "./QueueItem";
import { makeDragId, parseDragId, typedCollisionDetection } from "./dndUtils";
import "./QueueBoard.css";

interface QueueBoardProps {
  queues: Record<string, QueueState>;
  activeQueueId: string | null;
  playing: boolean;
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
  onReorderQueues: (newQueueOrderIds: string[]) => void;
  onReorderItems: (queueId: string, newItems: Asset[]) => void;
  onCreateQueue: () => void;
}

interface SortableColumnProps {
  queue: QueueState;
  activeQueueId: string | null;
  playing: boolean;
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
}

const SortableColumn = ({ queue, ...props }: SortableColumnProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: makeDragId("column", queue.id),
    data: { type: "column" },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style} className="sortable-column-wrapper">
      <QueueColumn
        queue={queue}
        sortableAttributes={attributes}
        sortableListeners={listeners}
        isPlaying={props.playing && props.activeQueueId === queue.id}
        onRenameQueue={props.onRenameQueue}
        onPlayQueue={props.onPlayQueue}
        onStopPlaying={props.onStopPlaying}
        onUpdateSettings={props.onUpdateSettings}
        onDeleteQueue={props.onDeleteQueue}
        onShowItemNow={props.onShowItemNow}
        onDeleteAsset={props.onDeleteAsset}
      />
    </div>
  );
};

const QueueBoard: React.FC<QueueBoardProps> = ({
  queues,
  activeQueueId,
  playing,
  onRenameQueue,
  onPlayQueue,
  onStopPlaying,
  onUpdateSettings,
  onDeleteQueue,
  onShowItemNow,
  onDeleteAsset,
  onReorderQueues,
  onReorderItems,
  onCreateQueue,
}) => {
  const [activeDragId, setActiveDragId] = useState<UniqueIdentifier | null>(
    null,
  );
  const [activeDragType, setActiveDragType] = useState<
    "column" | "item" | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortedQueues = useMemo(() => {
    return Object.values(queues).sort((a, b) => a.order - b.order);
  }, [queues]);

  const columnIds = useMemo(() => {
    return sortedQueues.map((q) => makeDragId("column", q.id));
  }, [sortedQueues]);

  const activeParsed = useMemo(() => {
    return activeDragId ? parseDragId(activeDragId.toString()) : null;
  }, [activeDragId]);

  const activeQueue = activeParsed ? queues[activeParsed.queueId] : null;
  const activeItem = activeParsed?.assetKey
    ? (activeQueue?.items?.find((item) => item.key === activeParsed.assetKey) ??
      null)
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const id = active.id.toString();
    const parsed = parseDragId(id);

    setActiveDragId(active.id);

    if (!parsed) {
      return;
    }

    if (parsed.type === "column") {
      setActiveDragType("column");
    } else {
      setActiveDragType("item");
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setActiveDragType(null);

    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();
    const activeParsed = parseDragId(activeId);
    const overParsed = parseDragId(overId);

    if (!activeParsed || !overParsed) {
      return;
    }

    if (activeId === overId) return;

    if (activeParsed.type === "column" && overParsed.type === "column") {
      const oldIndex = sortedQueues.findIndex(
        (q) => q.id === activeParsed.queueId,
      );
      const newIndex = sortedQueues.findIndex(
        (q) => q.id === overParsed.queueId,
      );

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(sortedQueues, oldIndex, newIndex).map(
          (q) => q.id,
        );
        onReorderQueues(newOrder);
      }
      return;
    }

    if (activeParsed.type === "item") {
      let sourceQueueId: string | null = null;
      let destQueueId: string | null = null;
      let sourceItemIndex = -1;
      let destItemIndex = -1;

      sourceQueueId = activeParsed.queueId;
      const sourceQueue = queues[sourceQueueId];
      sourceItemIndex =
        sourceQueue?.items?.findIndex((i) => i.key === activeParsed.assetKey) ??
        -1;

      if (overParsed.type === "column") {
        destQueueId = overParsed.queueId;
        const destQueue = queues[destQueueId];
        if (!destQueue) return;
        destItemIndex = destQueue.items ? destQueue.items.length : 0;
      } else {
        destQueueId = overParsed.queueId;
        const destQueue = queues[destQueueId];
        if (!destQueue) return;
        destItemIndex =
          destQueue.items.findIndex((i) => i.key === overParsed.assetKey) ?? -1;
      }

      if (sourceQueueId && destQueueId && sourceQueueId === destQueueId) {
        const queue = queues[sourceQueueId];
        if (!queue) return;
        const oldIndex = sourceItemIndex;
        const newIndex = destItemIndex;

        if (oldIndex !== -1 && newIndex !== -1) {
          const newItems = arrayMove(queue.items || [], oldIndex, newIndex);
          onReorderItems(sourceQueueId, newItems);
        }
      }
    }
  };

  if (Object.keys(queues).length === 0) {
    return <div className="queue-board-empty">Engin biðröð</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={typedCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="queue-board">
        <SortableContext
          items={columnIds}
          strategy={horizontalListSortingStrategy}
        >
          {sortedQueues.map((queue) => (
            <SortableColumn
              key={queue.id}
              queue={queue}
              activeQueueId={activeQueueId}
              playing={playing}
              onRenameQueue={onRenameQueue}
              onPlayQueue={onPlayQueue}
              onStopPlaying={onStopPlaying}
              onUpdateSettings={onUpdateSettings}
              onDeleteQueue={onDeleteQueue}
              onShowItemNow={onShowItemNow}
              onDeleteAsset={onDeleteAsset}
            />
          ))}
        </SortableContext>
        <button
          type="button"
          className="queue-board-add-btn"
          onClick={onCreateQueue}
          title="Ný biðröð"
        >
          +
        </button>
      </div>

      <DragOverlay
        dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({}) }}
      >
        {activeDragId && activeParsed ? (
          activeDragType === "column" && activeQueue ? (
            <div className="sortable-column-wrapper" style={{ opacity: 0.8 }}>
              <QueueColumn
                queue={activeQueue}
                isPlaying={playing && activeQueueId === activeQueue.id}
                onRenameQueue={() => {
                  // noop - drag overlay
                }}
                onPlayQueue={() => {
                  // noop - drag overlay
                }}
                onStopPlaying={() => {
                  // noop - drag overlay
                }}
                onUpdateSettings={() => {
                  // noop - drag overlay
                }}
                onDeleteQueue={() => {
                  // noop - drag overlay
                }}
                onShowItemNow={() => {
                  // noop - drag overlay
                }}
                onDeleteAsset={() => {
                  // noop - drag overlay
                }}
              />
            </div>
          ) : activeItem ? (
            <div className="queue-item-drag-overlay">
              <QueueItem
                asset={activeItem}
                queueId={activeParsed.queueId}
                onShowNow={() => {
                  // noop - drag overlay
                }}
                onDelete={() => {
                  // noop - drag overlay
                }}
              />
            </div>
          ) : null
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default QueueBoard;
