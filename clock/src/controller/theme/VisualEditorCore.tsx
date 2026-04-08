import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import type { ThemeConfig } from "../../types";
import {
  toHex,
  parseStroke,
  composeStroke,
  parseFontSize,
  composeFontSize,
} from "./themeUtils";
import { FONT_OPTIONS } from "./ThemeEditor";

import "./VisualThemeEditor.css";

// ---- Element definitions ----

/** Which ThemeConfig fields an element maps to */
export interface ElementDef {
  id: string;
  label: string;
  /** Left position: fixed % or from ThemeConfig */
  left: string | ((t: ThemeConfig) => string);
  top: (t: ThemeConfig) => string;
  width: (t: ThemeConfig) => string;
  height: (t: ThemeConfig) => string;
  bg: (t: ThemeConfig) => string;
  color: (t: ThemeConfig) => string;
  border: (t: ThemeConfig) => string;
  /** Fields to update when dragging (top, left) */
  dragFields: {
    top: keyof ThemeConfig;
    left?: keyof ThemeConfig;
  };
  /** The primary colour field to edit on click */
  colorFields: {
    bg: keyof ThemeConfig;
    text: keyof ThemeConfig;
    border?: keyof ThemeConfig;
  };
  /** Optional text-stroke field (e.g. scoreBoxStroke, clockStroke) */
  strokeField?: keyof ThemeConfig;
  /** Optional font-size field (e.g. scoreBoxFontSize, injuryTimeFontSize) */
  fontSizeField?: keyof ThemeConfig;
  /** Optional font-family field (e.g. clockFontFamily, scoreBoxFontFamily) */
  fontFamilyField?: keyof ThemeConfig;
  /** Display text inside the element */
  displayText: string;
}

// ---- Color picker popover ----

export interface ColorPopoverProps {
  x: number;
  y: number;
  /** Field references — values are looked up from `theme` at render time */
  fields: { label: string; field: keyof ThemeConfig }[];
  strokeField?: keyof ThemeConfig;
  fontSizeField?: keyof ThemeConfig;
  fontFamilyField?: keyof ThemeConfig;
  theme: ThemeConfig;
  onFieldChange: (field: keyof ThemeConfig, value: string) => void;
  onClose: () => void;
}

export const isTransparent = (value: string): boolean =>
  value.toLowerCase().trim() === "transparent";

export const ColorPopover = ({
  x,
  y,
  fields,
  strokeField,
  fontSizeField,
  fontFamilyField,
  theme,
  onFieldChange,
  onClose,
}: ColorPopoverProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Clamp popover position so it stays within the canvas.
  // useLayoutEffect fires before paint, so the popover never visually appears
  // outside bounds.  We mutate style directly to avoid a re-render loop.
  useLayoutEffect(() => {
    const el = ref.current;
    const canvas = el?.parentElement;
    if (!el || !canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const popRect = el.getBoundingClientRect();
    const margin = 4;
    let left = x;
    let top = y;
    if (left + popRect.width > canvasRect.width - margin) {
      left = Math.max(margin, canvasRect.width - popRect.width - margin);
    }
    if (top + popRect.height > canvasRect.height - margin) {
      top = Math.max(margin, canvasRect.height - popRect.height - margin);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });

  const strokeParts = strokeField ? parseStroke(theme[strokeField]) : null;
  const fontParts = fontSizeField ? parseFontSize(theme[fontSizeField]) : null;

  return (
    <div ref={ref} className="visual-color-popover" style={{ left: x, top: y }}>
      {fields.map(({ label, field }) => {
        const value = theme[field];
        const transparent = isTransparent(value);
        return (
          <div key={field} className="visual-color-popover-row">
            <span className="visual-color-popover-label">{label}</span>
            {transparent ? (
              <span
                className="visual-transparent-indicator"
                title="Transparent"
              />
            ) : (
              <input
                type="color"
                className="visual-color-swatch"
                value={toHex(value)}
                onChange={(e) => onFieldChange(field, e.target.value)}
              />
            )}
            <div
              className="visual-transparent-toggle"
              title="Gegnsætt"
              role="checkbox"
              aria-checked={transparent}
              tabIndex={0}
              onClick={() =>
                onFieldChange(field, transparent ? "#000000" : "transparent")
              }
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  onFieldChange(field, transparent ? "#000000" : "transparent");
                }
              }}
            >
              <span
                className={`visual-transparent-toggle-label${transparent ? " checked" : ""}`}
              >
                ∅
              </span>
            </div>
          </div>
        );
      })}
      {strokeField && strokeParts && (
        <div className="visual-color-popover-row visual-stroke-row">
          <span className="visual-color-popover-label">Útlína</span>
          <input
            type="range"
            className="visual-stroke-slider"
            min={0}
            max={5}
            step={0.5}
            value={strokeParts.width}
            onChange={(e) => {
              const w = parseFloat(e.target.value);
              onFieldChange(strokeField, composeStroke(w, strokeParts.color));
            }}
          />
          <span className="visual-stroke-value">{strokeParts.width}px</span>
          {strokeParts.width > 0 && (
            <input
              type="color"
              className="visual-color-swatch"
              value={toHex(strokeParts.color)}
              onChange={(e) =>
                onFieldChange(
                  strokeField,
                  composeStroke(strokeParts.width, e.target.value),
                )
              }
            />
          )}
        </div>
      )}
      {fontSizeField && fontParts && (
        <div className="visual-color-popover-row visual-font-size-row">
          <span className="visual-color-popover-label">Stærð</span>
          <input
            type="range"
            className="visual-font-size-slider"
            min={fontParts.unit === "px" ? 10 : 0.5}
            max={fontParts.unit === "px" ? 120 : 6}
            step={fontParts.unit === "px" ? 1 : 0.1}
            value={fontParts.size}
            onChange={(e) => {
              const s = parseFloat(e.target.value);
              onFieldChange(fontSizeField, composeFontSize(s, fontParts.unit));
            }}
          />
          <input
            type="number"
            className="visual-font-size-input"
            min={fontParts.unit === "px" ? 8 : 0.1}
            max={fontParts.unit === "px" ? 200 : 10}
            step={fontParts.unit === "px" ? 1 : 0.1}
            value={fontParts.size}
            onChange={(e) => {
              const s = parseFloat(e.target.value);
              if (!Number.isNaN(s) && s > 0) {
                onFieldChange(
                  fontSizeField,
                  composeFontSize(s, fontParts.unit),
                );
              }
            }}
          />
          <span className="visual-font-size-unit">{fontParts.unit}</span>
        </div>
      )}
      {fontFamilyField && (
        <div className="visual-color-popover-row visual-font-family-row">
          <span className="visual-color-popover-label">Letur</span>
          <select
            className="visual-font-select"
            value={theme[fontFamilyField]}
            onChange={(e) => onFieldChange(fontFamilyField, e.target.value)}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font}>
                {font.replace(/"/g, "")}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

// ---- Draggable element ----

/** Callback signature for the color-click handler */
export type OnColorClickFn = (
  elementId: string,
  fields: ColorPopoverProps["fields"],
  clickX: number,
  clickY: number,
  strokeField?: keyof ThemeConfig,
  fontSizeField?: keyof ThemeConfig,
  fontFamilyField?: keyof ThemeConfig,
) => void;

interface DraggableElementProps {
  def: ElementDef;
  theme: ThemeConfig;
  onFieldsChange: (changes: Partial<ThemeConfig>) => void;
  onColorClick: OnColorClickFn;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  /** Build the popover fields list from the element def on click.
   *  If omitted, uses the default scoreboard-style builder (bg + text + border). */
  buildPopoverFields?: (def: ElementDef) => ColorPopoverProps["fields"];
}

const defaultBuildPopoverFields = (
  def: ElementDef,
): ColorPopoverProps["fields"] => {
  const popoverFields: ColorPopoverProps["fields"] = [];
  const { colorFields } = def;
  popoverFields.push({
    label: "Bakgrunnur",
    field: colorFields.bg,
  });
  if (colorFields.text !== colorFields.bg) {
    popoverFields.push({
      label: "Texti",
      field: colorFields.text,
    });
  }
  if (colorFields.border) {
    popoverFields.push({
      label: "Rammi",
      field: colorFields.border,
    });
  }
  return popoverFields;
};

export const DraggableElement = ({
  def,
  theme,
  onFieldsChange,
  onColorClick,
  canvasRef,
  buildPopoverFields = defaultBuildPopoverFields,
}: DraggableElementProps) => {
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0, top: 0, left: 0 });
  // Local drag overrides — kept in state so the element re-renders smoothly
  // without waiting for a Firebase round-trip.
  const [dragOverride, setDragOverride] = useState<{
    top: string;
    left: string;
  } | null>(null);
  // Mirror drag left in a ref so handlePointerMove can read it without
  // being recreated on every frame.
  const dragLeftRef = useRef<string | null>(null);

  const themeLeft = typeof def.left === "string" ? def.left : def.left(theme);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const canvas = canvasRef.current;
      if (!canvas) return;

      dragging.current = true;
      const rect = canvas.getBoundingClientRect();
      const currentTop = def.top(theme);
      const currentLeft =
        typeof def.left === "string" ? def.left : def.left(theme);
      startPos.current = {
        x: e.clientX,
        y: e.clientY,
        top: (parseFloat(currentTop) / 100) * rect.height,
        left: (parseFloat(currentLeft) / 100) * rect.width,
      };
      dragLeftRef.current = currentLeft;
      setDragOverride({ top: currentTop, left: currentLeft });

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
    },
    [canvasRef, def, theme],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const dy = e.clientY - startPos.current.y;
      const dx = e.clientX - startPos.current.x;

      const newTopPx = startPos.current.top + dy;
      const newTopPct = Math.max(
        0,
        Math.min(100, (newTopPx / rect.height) * 100),
      );
      const newTop = `${newTopPct.toFixed(1)}%`;

      let newLeft = dragLeftRef.current ?? themeLeft;
      if (def.dragFields.left) {
        const newLeftPx = startPos.current.left + dx;
        const newLeftPct = Math.max(
          0,
          Math.min(100, (newLeftPx / rect.width) * 100),
        );
        newLeft = `${newLeftPct.toFixed(1)}%`;
      }

      // Only update local state — no Firebase write during drag
      dragLeftRef.current = newLeft;
      setDragOverride({ top: newTop, left: newLeft });
    },
    [canvasRef, def.dragFields.left, themeLeft],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;

      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);

      if (dx < 4 && dy < 4) {
        // Hardly moved -> treat as a click -> open color picker
        dragLeftRef.current = null;
        setDragOverride(null);

        const popoverFields = buildPopoverFields(def);

        const canvas = canvasRef.current;
        if (canvas) {
          const canvasRect = canvas.getBoundingClientRect();
          onColorClick(
            def.id,
            popoverFields,
            e.clientX - canvasRect.left,
            e.clientY - canvasRect.top,
            def.strokeField,
            def.fontSizeField,
            def.fontFamilyField,
          );
        }
      } else if (dragOverride) {
        // Actually dragged -> commit all position changes atomically
        const changes: Partial<ThemeConfig> = {
          [def.dragFields.top]: dragOverride.top,
        };
        if (def.dragFields.left) {
          changes[def.dragFields.left] = dragOverride.left;
        }
        onFieldsChange(changes);
        dragLeftRef.current = null;
        setDragOverride(null);
      }
    },
    [
      def,
      canvasRef,
      onColorClick,
      onFieldsChange,
      dragOverride,
      buildPopoverFields,
    ],
  );

  // Use local drag position when dragging, otherwise use theme values
  const displayTop = dragOverride?.top ?? def.top(theme);
  const displayLeft = dragOverride?.left ?? themeLeft;

  return (
    <div
      className={`visual-element${dragOverride ? " dragging" : ""}`}
      data-element-id={def.id}
      style={{
        left: displayLeft,
        top: displayTop,
        width: def.width(theme),
        height: def.height(theme),
        backgroundColor: def.bg(theme),
        color: def.color(theme),
        border: def.border(theme),
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title={`${def.label} — draga til að færa, smella til að breyta lit`}
    >
      <span className="visual-element-text">{def.displayText}</span>
      <span className="visual-element-label">{def.label}</span>
    </div>
  );
};

// ---- Popover state type ----

export interface PopoverState {
  elementId: string;
  fields: ColorPopoverProps["fields"];
  strokeField?: keyof ThemeConfig;
  fontSizeField?: keyof ThemeConfig;
  fontFamilyField?: keyof ThemeConfig;
  x: number;
  y: number;
}
