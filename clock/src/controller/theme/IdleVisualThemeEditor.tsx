import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import type { ThemeConfig } from "../../types";
import { toHex, parseFontSize, composeFontSize } from "./themeUtils";

import "./VisualThemeEditor.css";

interface IdleVisualThemeEditorProps {
  effective: ThemeConfig;
  onFieldChange: (field: keyof ThemeConfig, value: string) => void;
  onFieldsChange: (changes: Partial<ThemeConfig>) => void;
}

// ---- Element definitions ----

interface ElementDef {
  id: string;
  label: string;
  left: string | ((t: ThemeConfig) => string);
  top: (t: ThemeConfig) => string;
  width: (t: ThemeConfig) => string;
  height: (t: ThemeConfig) => string;
  bg: (t: ThemeConfig) => string;
  color: (t: ThemeConfig) => string;
  border: (t: ThemeConfig) => string;
  dragFields: {
    top: keyof ThemeConfig;
    left?: keyof ThemeConfig;
  };
  colorFields: {
    bg: keyof ThemeConfig;
    text: keyof ThemeConfig;
  };
  fontSizeField?: keyof ThemeConfig;
  displayText: string;
}

const IDLE_ELEMENTS: ElementDef[] = [
  {
    id: "idle-logo",
    label: "Merki",
    left: (t) => t.idleLogoLeft,
    top: (t) => t.idleLogoTop,
    width: (t) => t.idleLogoWidth,
    height: (t) => (t.idleLogoHeight === "auto" ? "40%" : t.idleLogoHeight),
    bg: () => "rgba(255,255,255,0.1)",
    color: () => "#aaa",
    border: () => "1px dashed rgba(255,255,255,0.3)",
    dragFields: { top: "idleLogoTop", left: "idleLogoLeft" },
    colorFields: { bg: "idleTextColor", text: "idleTextColor" },
    displayText: "LOGO",
  },
  {
    id: "idle-clock",
    label: "Klukka",
    left: (t) => t.idleClockLeft,
    top: (t) => t.idleClockTop,
    width: () => "50%",
    height: () => "12%",
    bg: () => "transparent",
    color: (t) => t.idleTextColor,
    border: () => "1px dashed rgba(255,255,255,0.3)",
    dragFields: { top: "idleClockTop", left: "idleClockLeft" },
    colorFields: { bg: "idleTextColor", text: "idleTextColor" },
    fontSizeField: "idleTextFontSize",
    displayText: "12:00",
  },
  {
    id: "idle-temp",
    label: "Hiti",
    left: (t) => t.idleTempLeft,
    top: (t) => t.idleTempTop,
    width: () => "50%",
    height: () => "12%",
    bg: () => "transparent",
    color: (t) => t.idleTextColor,
    border: () => "1px dashed rgba(255,255,255,0.3)",
    dragFields: { top: "idleTempTop", left: "idleTempLeft" },
    colorFields: { bg: "idleTextColor", text: "idleTextColor" },
    fontSizeField: "idleTextFontSize",
    displayText: "17°",
  },
  {
    id: "idle-ad",
    label: "Auglýsing",
    left: (t) => t.idleAdLeft,
    top: (t) => t.idleAdTop,
    width: (t) => t.idleAdWidth,
    height: (t) => t.idleAdHeight,
    bg: () => "rgba(255,255,255,0.08)",
    color: () => "#aaa",
    border: () => "1px dashed rgba(255,255,255,0.3)",
    dragFields: { top: "idleAdTop", left: "idleAdLeft" },
    colorFields: { bg: "idleTextColor", text: "idleTextColor" },
    displayText: "AD",
  },
];

// ---- Color picker popover ----

interface ColorPopoverProps {
  x: number;
  y: number;
  fields: { label: string; field: keyof ThemeConfig }[];
  fontSizeField?: keyof ThemeConfig;
  theme: ThemeConfig;
  onFieldChange: (field: keyof ThemeConfig, value: string) => void;
  onClose: () => void;
}

const isTransparent = (value: string): boolean =>
  value.toLowerCase().trim() === "transparent";

const ColorPopover = ({
  x,
  y,
  fields,
  fontSizeField,
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
      {fontSizeField && fontParts && (
        <div className="visual-color-popover-row visual-font-size-row">
          <span className="visual-color-popover-label">Stærð</span>
          <input
            type="range"
            className="visual-font-size-slider"
            min={10}
            max={120}
            step={1}
            value={fontParts.size}
            onChange={(e) => {
              const s = parseFloat(e.target.value);
              onFieldChange(fontSizeField, composeFontSize(s, fontParts.unit));
            }}
          />
          <input
            type="number"
            className="visual-font-size-input"
            min={8}
            max={200}
            step={1}
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
    </div>
  );
};

// ---- Draggable element ----

interface DraggableElementProps {
  def: ElementDef;
  theme: ThemeConfig;
  onFieldsChange: (changes: Partial<ThemeConfig>) => void;
  onColorClick: (
    elementId: string,
    fields: ColorPopoverProps["fields"],
    clickX: number,
    clickY: number,
    fontSizeField?: keyof ThemeConfig,
  ) => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

const DraggableElement = ({
  def,
  theme,
  onFieldsChange,
  onColorClick,
  canvasRef,
}: DraggableElementProps) => {
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0, top: 0, left: 0 });
  const [dragOverride, setDragOverride] = useState<{
    top: string;
    left: string;
  } | null>(null);
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
        dragLeftRef.current = null;
        setDragOverride(null);

        const popoverFields: ColorPopoverProps["fields"] = [];
        const { colorFields } = def;
        popoverFields.push({
          label: "Litur",
          field: colorFields.text,
        });

        const canvas = canvasRef.current;
        if (canvas) {
          const canvasRect = canvas.getBoundingClientRect();
          onColorClick(
            def.id,
            popoverFields,
            e.clientX - canvasRect.left,
            e.clientY - canvasRect.top,
            def.fontSizeField,
          );
        }
      } else if (dragOverride) {
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
    [def, canvasRef, onColorClick, onFieldsChange, dragOverride],
  );

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

// ---- Main idle visual editor ----

const IdleVisualThemeEditor = ({
  effective,
  onFieldChange,
  onFieldsChange,
}: IdleVisualThemeEditorProps) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [popover, setPopover] = useState<{
    elementId: string;
    fields: ColorPopoverProps["fields"];
    fontSizeField?: keyof ThemeConfig;
    x: number;
    y: number;
  } | null>(null);

  const handleColorClick = useCallback(
    (
      elementId: string,
      fields: ColorPopoverProps["fields"],
      x: number,
      y: number,
      fontSizeField?: keyof ThemeConfig,
    ) => {
      setPopover({ elementId, fields, x, y, fontSizeField });
    },
    [],
  );

  const closePopover = useCallback(() => setPopover(null), []);

  return (
    <div className="visual-theme-editor">
      <p className="visual-instructions">
        Dragðu hluti til að færa. Smelltu á hlut til að breyta litum og stærð.
      </p>
      <div className="visual-canvas-wrapper">
        <div ref={canvasRef} className="visual-canvas">
          {IDLE_ELEMENTS.map((def) => (
            <DraggableElement
              key={def.id}
              def={def}
              theme={effective}
              onFieldsChange={onFieldsChange}
              onColorClick={handleColorClick}
              canvasRef={canvasRef}
            />
          ))}
          {popover && (
            <ColorPopover
              x={popover.x}
              y={popover.y}
              fields={popover.fields}
              fontSizeField={popover.fontSizeField}
              theme={effective}
              onFieldChange={onFieldChange}
              onClose={closePopover}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default IdleVisualThemeEditor;
