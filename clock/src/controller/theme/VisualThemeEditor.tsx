import { useState, useCallback, useRef, useEffect } from "react";
import type { ThemeConfig } from "../../types";
import { toHex } from "./themeUtils";

import "./VisualThemeEditor.css";

interface VisualThemeEditorProps {
  effective: ThemeConfig;
  onFieldChange: (field: keyof ThemeConfig, value: string) => void;
}

// ---- Element definitions ----

/** Which ThemeConfig fields an element maps to */
interface ElementDef {
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
  /** Display text inside the element */
  displayText: string;
}

const ELEMENTS: ElementDef[] = [
  {
    id: "home-logo",
    label: "Merki (heima)",
    left: "4%",
    top: (t) => t.logoTop,
    width: (t) => t.logoWidth,
    height: (t) => t.logoHeight,
    bg: () => "rgba(255,255,255,0.1)",
    color: () => "#aaa",
    border: () => "1px dashed rgba(255,255,255,0.3)",
    dragFields: { top: "logoTop" },
    colorFields: { bg: "scoreBoxBg", text: "scoreBoxColor" },
    displayText: "LOGO",
  },
  {
    id: "away-logo",
    label: "Merki (úti)",
    left: "71%",
    top: (t) => t.logoTop,
    width: (t) => t.logoWidth,
    height: (t) => t.logoHeight,
    bg: () => "rgba(255,255,255,0.1)",
    color: () => "#aaa",
    border: () => "1px dashed rgba(255,255,255,0.3)",
    dragFields: { top: "logoTop" },
    colorFields: { bg: "scoreBoxBg", text: "scoreBoxColor" },
    displayText: "LOGO",
  },
  {
    id: "clock",
    label: "Klukka",
    left: (t) => t.clockLeft,
    top: (t) => t.clockTop,
    width: (t) => t.clockWidth,
    height: (t) => t.clockHeight,
    bg: (t) => t.clockBg,
    color: (t) => t.clockColor,
    border: (t) => t.clockBorder,
    dragFields: { top: "clockTop", left: "clockLeft" },
    colorFields: {
      bg: "clockBg",
      text: "clockColor",
      border: "clockBorder",
    },
    displayText: "45:00",
  },
  {
    id: "home-score",
    label: "Stig (heima)",
    left: "4%",
    top: (t) => t.scoreTop,
    width: (t) => t.scoreWidth,
    height: (t) => t.scoreHeight,
    bg: (t) => t.scoreBoxBg,
    color: (t) => t.scoreBoxColor,
    border: (t) => t.scoreBoxBorder,
    dragFields: { top: "scoreTop" },
    colorFields: {
      bg: "scoreBoxBg",
      text: "scoreBoxColor",
      border: "scoreBoxBorder",
    },
    displayText: "2",
  },
  {
    id: "away-score",
    label: "Stig (úti)",
    left: "71%",
    top: (t) => t.scoreTop,
    width: (t) => t.scoreWidth,
    height: (t) => t.scoreHeight,
    bg: (t) => t.scoreBoxBg,
    color: (t) => t.scoreBoxColor,
    border: (t) => t.scoreBoxBorder,
    dragFields: { top: "scoreTop" },
    colorFields: {
      bg: "scoreBoxBg",
      text: "scoreBoxColor",
      border: "scoreBoxBorder",
    },
    displayText: "1",
  },
  {
    id: "injury-time",
    label: "Uppbótatími",
    left: "45%",
    top: () => "18%",
    width: () => "10%",
    height: () => "8%",
    bg: () => "transparent",
    color: (t) => t.injuryTimeColor,
    border: () => "1px dashed rgba(255,255,255,0.3)",
    dragFields: { top: "scoreTop" },
    colorFields: {
      bg: "injuryTimeColor",
      text: "injuryTimeColor",
    },
    displayText: "+3",
  },
];

// ---- Color picker popover ----

interface ColorPopoverProps {
  x: number;
  y: number;
  fields: { label: string; field: keyof ThemeConfig; value: string }[];
  onFieldChange: (field: keyof ThemeConfig, value: string) => void;
  onClose: () => void;
}

const ColorPopover = ({
  x,
  y,
  fields,
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

  return (
    <div ref={ref} className="visual-color-popover" style={{ left: x, top: y }}>
      {fields.map(({ label, field, value }) => (
        <div key={field} className="visual-color-popover-row">
          <span className="visual-color-popover-label">{label}</span>
          <input
            type="color"
            className="visual-color-swatch"
            value={toHex(value)}
            onChange={(e) => onFieldChange(field, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
};

// ---- Draggable element ----

interface DraggableElementProps {
  def: ElementDef;
  theme: ThemeConfig;
  onFieldChange: (field: keyof ThemeConfig, value: string) => void;
  onColorClick: (
    elementId: string,
    fields: ColorPopoverProps["fields"],
    clickX: number,
    clickY: number,
  ) => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

const DraggableElement = ({
  def,
  theme,
  onFieldChange,
  onColorClick,
  canvasRef,
}: DraggableElementProps) => {
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0, top: 0, left: 0 });

  const left = typeof def.left === "string" ? def.left : def.left(theme);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const canvas = canvasRef.current;
      if (!canvas) return;

      dragging.current = true;
      const rect = canvas.getBoundingClientRect();
      startPos.current = {
        x: e.clientX,
        y: e.clientY,
        top: (parseFloat(def.top(theme)) / 100) * rect.height,
        left: (parseFloat(left) / 100) * rect.width,
      };

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
    },
    [canvasRef, def, theme, left],
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
      onFieldChange(def.dragFields.top, `${newTopPct.toFixed(1)}%`);

      if (def.dragFields.left) {
        const newLeftPx = startPos.current.left + dx;
        const newLeftPct = Math.max(
          0,
          Math.min(100, (newLeftPx / rect.width) * 100),
        );
        onFieldChange(def.dragFields.left, `${newLeftPct.toFixed(1)}%`);
      }
    },
    [canvasRef, def.dragFields, onFieldChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;

      // If hardly moved, treat as a click → open color picker
      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);
      if (dx < 4 && dy < 4) {
        const popoverFields: ColorPopoverProps["fields"] = [];
        const { colorFields } = def;
        popoverFields.push({
          label: "Bakgrunnur",
          field: colorFields.bg,
          value: theme[colorFields.bg],
        });
        if (colorFields.text !== colorFields.bg) {
          popoverFields.push({
            label: "Texti",
            field: colorFields.text,
            value: theme[colorFields.text],
          });
        }
        if (colorFields.border) {
          popoverFields.push({
            label: "Rammi",
            field: colorFields.border,
            value: theme[colorFields.border],
          });
        }

        // Position relative to the canvas parent (the modal body)
        const canvas = canvasRef.current;
        if (canvas) {
          const canvasRect = canvas.getBoundingClientRect();
          onColorClick(
            def.id,
            popoverFields,
            e.clientX - canvasRect.left,
            e.clientY - canvasRect.top,
          );
        }
      }
    },
    [def, theme, canvasRef, onColorClick],
  );

  return (
    <div
      className="visual-element"
      data-element-id={def.id}
      style={{
        left,
        top: def.top(theme),
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

// ---- Main visual editor ----

const VisualThemeEditor = ({
  effective,
  onFieldChange,
}: VisualThemeEditorProps) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [popover, setPopover] = useState<{
    elementId: string;
    fields: ColorPopoverProps["fields"];
    x: number;
    y: number;
  } | null>(null);

  const handleColorClick = useCallback(
    (
      elementId: string,
      fields: ColorPopoverProps["fields"],
      x: number,
      y: number,
    ) => {
      setPopover({ elementId, fields, x, y });
    },
    [],
  );

  const closePopover = useCallback(() => setPopover(null), []);

  return (
    <div className="visual-theme-editor">
      <p className="visual-instructions">
        Dragðu hluti til að færa. Smelltu á hlut til að breyta litum.
      </p>
      <div className="visual-canvas-wrapper">
        <div ref={canvasRef} className="visual-canvas">
          {ELEMENTS.map((def) => (
            <DraggableElement
              key={def.id}
              def={def}
              theme={effective}
              onFieldChange={onFieldChange}
              onColorClick={handleColorClick}
              canvasRef={canvasRef}
            />
          ))}
          {popover && (
            <ColorPopover
              x={popover.x}
              y={popover.y}
              fields={popover.fields}
              onFieldChange={onFieldChange}
              onClose={closePopover}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default VisualThemeEditor;
