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
