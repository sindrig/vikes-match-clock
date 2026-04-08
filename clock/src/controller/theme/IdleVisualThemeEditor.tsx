import { useState, useCallback, useRef } from "react";
import type { ThemeConfig } from "../../types";
import type {
  ElementDef,
  PopoverState,
  ColorPopoverProps,
  OnColorClickFn,
} from "./VisualEditorCore";
import { ColorPopover, DraggableElement } from "./VisualEditorCore";

import "./VisualThemeEditor.css";

interface IdleVisualThemeEditorProps {
  effective: ThemeConfig;
  onFieldChange: (field: keyof ThemeConfig, value: string) => void;
  onFieldsChange: (changes: Partial<ThemeConfig>) => void;
}

// ---- Element definitions ----

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

const buildIdlePopoverFields = (
  def: ElementDef,
): ColorPopoverProps["fields"] => [
  { label: "Litur", field: def.colorFields.text },
];

// ---- Main idle visual editor ----

const IdleVisualThemeEditor = ({
  effective,
  onFieldChange,
  onFieldsChange,
}: IdleVisualThemeEditorProps) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const handleColorClick = useCallback<OnColorClickFn>(
    (elementId, fields, x, y, _strokeField, fontSizeField) => {
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
              buildPopoverFields={buildIdlePopoverFields}
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
