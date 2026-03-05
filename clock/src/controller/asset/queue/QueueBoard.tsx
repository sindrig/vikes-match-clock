import React, { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
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
import "./QueueBoard.css";

interface QueueBoardProps {
  queues: Record<string, QueueState>;
  activeQueueId: string | null;
  playing: boolean;
  onRenameQueue: (queueId: string, newName: string) => void;
  onPlayQueue: (queueId: string) => void;
  onStopPlaying: () => void;
  onOpenSettings: (queueId: string) => void;
  onShowItemNow: (asset: Asset) => void;
  onDeleteAsset: (queueId: string, assetKey: string) => void;
  onReorderQueues: (newQueueOrderIds: string[]) => void;
  onReorderItems: (queueId: string, newItems: Asset[]) => void;
}

interface SortableColumnProps {
  queue: QueueState;
  activeQueueId: string | null;
  playing: boolean;
  onRenameQueue: (queueId: string, newName: string) => void;
  onPlayQueue: (queueId: string) => void;
  onStopPlaying: () => void;
  onOpenSettings: (queueId: string) => void;
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
  } = useSortable({ id: `col-${queue.id}`, data: { type: "column", queue } });

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
        onOpenSettings={props.onOpenSettings}
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
  onOpenSettings,
  onShowItemNow,
  onDeleteAsset,
  onReorderQueues,
  onReorderItems,
}) => {
  const [activeDragId, setActiveDragId] = useState<UniqueIdentifier | null>(
    null,
  );
  const [activeDragType, setActiveDragType] = useState<
    "column" | "item" | null
  >(null);
  const [draggedItem, setDraggedItem] = useState<Asset | null>(null);

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
    return sortedQueues.map((q) => `col-${q.id}`);
  }, [sortedQueues]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const id = active.id.toString();

    setActiveDragId(active.id);

    if (id.startsWith("col-")) {
      setActiveDragType("column");
    } else {
      setActiveDragType("item");
      let foundItem: Asset | null = null;
      for (const queue of Object.values(queues)) {
        const item = queue.items?.find((i) => i.key === id);
        if (item) {
          foundItem = item;
          break;
        }
      }
      setDraggedItem(foundItem);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setActiveDragType(null);
    setDraggedItem(null);

    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    if (activeId === overId) return;

    if (activeId.startsWith("col-") && overId.startsWith("col-")) {
      const oldIndex = sortedQueues.findIndex(
        (q) => `col-${q.id}` === activeId,
      );
      const newIndex = sortedQueues.findIndex((q) => `col-${q.id}` === overId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(sortedQueues, oldIndex, newIndex).map(
          (q) => q.id,
        );
        onReorderQueues(newOrder);
      }
      return;
    }

    if (!activeId.startsWith("col-")) {
      let sourceQueueId: string | null = null;
      let destQueueId: string | null = null;
      let sourceItemIndex = -1;
      let destItemIndex = -1;

      for (const queue of Object.values(queues)) {
        const idx = queue.items?.findIndex((i) => i.key === activeId);
        if (idx !== undefined && idx !== -1) {
          sourceQueueId = queue.id;
          sourceItemIndex = idx;
          break;
        }
      }

      if (overId.startsWith("col-")) {
        destQueueId = overId.replace("col-", "");
        const destQueue = queues[destQueueId];
        if (destQueue) {
          destItemIndex = destQueue.items ? destQueue.items.length : 0;
        }
      } else {
        for (const queue of Object.values(queues)) {
          const idx = queue.items?.findIndex((i) => i.key === overId);
          if (idx !== undefined && idx !== -1) {
            destQueueId = queue.id;
            destItemIndex = idx;
            break;
          }
        }
      }

      if (sourceQueueId && destQueueId && sourceQueueId === destQueueId) {
        const queue = queues[sourceQueueId];
        const oldIndex = sourceItemIndex;
        const newIndex = destItemIndex;

        if (oldIndex !== -1 && newIndex !== -1) {
          const newItems = arrayMove(queue!.items || [], oldIndex, newIndex);
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
      collisionDetection={closestCenter}
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
              onOpenSettings={onOpenSettings}
              onShowItemNow={onShowItemNow}
              onDeleteAsset={onDeleteAsset}
            />
          ))}
        </SortableContext>
      </div>

      <DragOverlay
        dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({}) }}
      >
        {activeDragId ? (
          activeDragType === "column" ? (
            <div className="sortable-column-wrapper" style={{ opacity: 0.8 }}>
              <QueueColumn
                queue={queues[activeDragId.toString().replace("col-", "")]!}
                isPlaying={
                  playing &&
                  activeQueueId === activeDragId.toString().replace("col-", "")
                }
                onRenameQueue={() => {}}
                onPlayQueue={() => {}}
                onStopPlaying={() => {}}
                onOpenSettings={() => {}}
                onShowItemNow={() => {}}
                onDeleteAsset={() => {}}
              />
            </div>
          ) : draggedItem ? (
            <div className="queue-item-drag-overlay">
              <QueueItem
                asset={draggedItem}
                queueId=""
                onShowNow={() => {}}
                onDelete={() => {}}
              />
            </div>
          ) : null
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default QueueBoard;
