import type { CSSProperties } from "react";
import type { ViewPort } from "../types";

// Preserve screen/style metadata at ingestion and editing, but only give CSS
// scalar values to React. Structured metadata is not a DOM style value.
export function viewportStyle(vp: ViewPort): CSSProperties {
  return {
    ...Object.fromEntries(
      Object.entries(vp.style).filter(
        ([, value]) =>
          typeof value === "string" ||
          (typeof value === "number" && Number.isFinite(value)),
      ),
    ),
    width: vp.style.width,
    height: vp.style.height,
  };
}
