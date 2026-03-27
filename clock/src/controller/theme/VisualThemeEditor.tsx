import { useState, useCallback, useRef, useEffect } from "react";
import type { ThemeConfig } from "../../types";
import { storageHelpers } from "../../firebase";
import { toHex } from "./themeUtils";

import "./VisualThemeEditor.css";

interface VisualThemeEditorProps {
  effective: ThemeConfig;
  onFieldChange: (field: keyof ThemeConfig, value: string) => void;
  onFieldsChange: (changes: Partial<ThemeConfig>) => void;
  listenPrefix: string;
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
    left: (t) => t.injuryTimeLeft,
    top: (t) => t.injuryTimeTop,
    width: () => "10%",
    height: () => "8%",
    bg: () => "transparent",
    color: (t) => t.injuryTimeColor,
    border: () => "1px dashed rgba(255,255,255,0.3)",
    dragFields: { top: "injuryTimeTop", left: "injuryTimeLeft" },
    colorFields: {
      bg: "injuryTimeColor",
      text: "injuryTimeColor",
    },
    displayText: "+3",
  },
  {
    id: "ad",
    label: "Auglýsing",
    left: (t) => t.adLeft,
    top: (t) => t.adTop,
    width: (t) => t.adWidth,
    height: (t) => t.adHeight,
    bg: () => "rgba(255,255,255,0.08)",
    color: () => "#aaa",
    border: () => "1px dashed rgba(255,255,255,0.3)",
    dragFields: { top: "adTop", left: "adLeft" },
    colorFields: { bg: "adTop", text: "adTop" },
    displayText: "AD",
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

const isTransparent = (value: string): boolean =>
  value.toLowerCase().trim() === "transparent";

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
      {fields.map(({ label, field, value }) => {
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
  // Local drag overrides — kept in state so the element re-renders smoothly
  // without waiting for a Firebase round-trip.
  const [dragOverride, setDragOverride] = useState<{
    top: string;
    left: string;
  } | null>(null);

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

      let newLeft = dragOverride?.left ?? themeLeft;
      if (def.dragFields.left) {
        const newLeftPx = startPos.current.left + dx;
        const newLeftPct = Math.max(
          0,
          Math.min(100, (newLeftPx / rect.width) * 100),
        );
        newLeft = `${newLeftPct.toFixed(1)}%`;
      }

      // Only update local state — no Firebase write during drag
      setDragOverride({ top: newTop, left: newLeft });
    },
    [canvasRef, def.dragFields.left, dragOverride?.left, themeLeft],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;

      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);

      if (dx < 4 && dy < 4) {
        // Hardly moved → treat as a click → open color picker
        setDragOverride(null);

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
      } else if (dragOverride) {
        // Actually dragged → commit all position changes atomically
        const changes: Partial<ThemeConfig> = {
          [def.dragFields.top]: dragOverride.top,
        };
        if (def.dragFields.left) {
          changes[def.dragFields.left] = dragOverride.left;
        }
        onFieldsChange(changes);
        setDragOverride(null);
      }
    },
    [def, theme, canvasRef, onColorClick, onFieldsChange, dragOverride],
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

// ---- Main visual editor ----

const VisualThemeEditor = ({
  effective,
  onFieldChange,
  onFieldsChange,
  listenPrefix,
}: VisualThemeEditorProps) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
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

  // Background click → open file picker
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only trigger on direct canvas clicks (not on elements or popover)
      if (e.target === e.currentTarget && listenPrefix) {
        fileInputRef.current?.click();
      }
    },
    [listenPrefix],
  );

  // Handle file selection → upload to Firebase Storage
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !listenPrefix) return;

      // Reset input so re-selecting the same file triggers onChange
      e.target.value = "";

      setUploading(true);
      const ext = file.name.split(".").pop() ?? "png";
      const filename = `bg-${Date.now()}.${ext}`;
      const path = `${listenPrefix}/backgrounds/${filename}`;
      storageHelpers
        .uploadBytes(path, file, {
          cacheControl: "public, max-age=604800",
          contentType: file.type,
        })
        .then(() => storageHelpers.getDownloadURL(path))
        .then((url) => {
          onFieldChange("backgroundImage", url);
        })
        .catch((err) => {
          console.error("Background upload failed:", err);
        })
        .finally(() => {
          setUploading(false);
        });
    },
    [listenPrefix, onFieldChange],
  );

  // Clear background image
  const handleClearBackground = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFieldChange("backgroundImage", "");
    },
    [onFieldChange],
  );

  const hasBackground = Boolean(effective.backgroundImage);

  return (
    <div className="visual-theme-editor">
      <p className="visual-instructions">
        Dragðu hluti til að færa. Smelltu á hlut til að breyta litum. Smelltu á
        bakgrunn til að hlaða upp mynd.
      </p>
      <div className="visual-canvas-wrapper">
        <div
          ref={canvasRef}
          className="visual-canvas"
          onClick={handleCanvasClick}
          style={
            hasBackground
              ? {
                  backgroundImage: `url(${effective.backgroundImage})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          {uploading && (
            <div className="visual-upload-indicator">Hleð upp…</div>
          )}
          {hasBackground && (
            <button
              className="visual-clear-bg-btn"
              onClick={handleClearBackground}
              title="Fjarlægja bakgrunnsmynd"
              type="button"
            >
              ✕
            </button>
          )}
          {ELEMENTS.map((def) => (
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
              onFieldChange={onFieldChange}
              onClose={closePopover}
            />
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
    </div>
  );
};

export default VisualThemeEditor;
