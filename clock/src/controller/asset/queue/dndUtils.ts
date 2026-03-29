import {
  closestCenter,
  CollisionDetection,
  DroppableContainer,
} from "@dnd-kit/core";

export type DragType = "column" | "item";

export interface ParsedDragId {
  type: DragType;
  queueId: string;
  assetKey?: string;
}

export const makeDragId = (
  type: DragType,
  queueId: string,
  assetKey?: string,
): string => {
  if (type === "column") {
    return `col:${queueId}`;
  }

  return `item:${queueId}:${assetKey ?? ""}`;
};

export const parseDragId = (id: string): ParsedDragId | null => {
  const segments = id.split(":");

  if (segments.length < 2) {
    return null;
  }

  const [typeSegment, queueId, assetKey] = segments;

  if (!queueId) {
    return null;
  }

  if (typeSegment === "col" && segments.length === 2) {
    return { type: "column", queueId };
  }

  if (typeSegment === "item" && segments.length === 3 && assetKey) {
    return { type: "item", queueId, assetKey };
  }

  return null;
};

// Restrict collision targets to the same drag type (col↔col, item↔item)
// so nested SortableContexts don't interfere with each other.
export const typedCollisionDetection: CollisionDetection = (args) => {
  const activeId = args.active.id.toString();
  const activePrefix = activeId.startsWith("col:") ? "col:" : "item:";

  const filteredContainers = args.droppableContainers.filter(
    (container: DroppableContainer) =>
      container.id.toString().startsWith(activePrefix),
  );

  return closestCenter({
    ...args,
    droppableContainers: filteredContainers,
  });
};
