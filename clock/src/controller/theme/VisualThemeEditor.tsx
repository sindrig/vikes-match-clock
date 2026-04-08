import { useState, useCallback, useRef } from "react";
import type { ThemeConfig } from "../../types";
import { storageHelpers } from "../../firebase";
import type {
  ElementDef,
  PopoverState,
  OnColorClickFn,
} from "./VisualEditorCore";
import { ColorPopover, DraggableElement } from "./VisualEditorCore";

import "./VisualThemeEditor.css";

interface VisualThemeEditorProps {
  effective: ThemeConfig;
  onFieldChange: (field: keyof ThemeConfig, value: string) => void;
  onFieldsChange: (changes: Partial<ThemeConfig>) => void;
  listenPrefix: string;
}

// ---- Element definitions ----

const ELEMENTS: ElementDef[] = [
  {
    id: "home-logo",
    label: "Merki (heima)",
    left: "4%",
    top: (t) => t.logoTop,
    width: (t) =>
      `${parseFloat(t.logoWidth) * (parseFloat(t.homeLogoScale) / 100)}%`,
    height: (t) =>
      `${parseFloat(t.logoHeight) * (parseFloat(t.homeLogoScale) / 100)}%`,
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
    width: (t) =>
      `${parseFloat(t.logoWidth) * (parseFloat(t.awayLogoScale) / 100)}%`,
    height: (t) =>
      `${parseFloat(t.logoHeight) * (parseFloat(t.awayLogoScale) / 100)}%`,
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
    strokeField: "clockStroke",
    fontSizeField: "clockFontSizeMax",
    fontFamilyField: "clockFontFamily",
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
    strokeField: "scoreBoxStroke",
    fontSizeField: "scoreBoxFontSize",
    fontFamilyField: "scoreBoxFontFamily",
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
    strokeField: "scoreBoxStroke",
    fontSizeField: "scoreBoxFontSize",
    fontFamilyField: "scoreBoxFontFamily",
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
    strokeField: "injuryTimeStroke",
    fontSizeField: "injuryTimeFontSize",
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

/** Sanitize a URL for use inside CSS url() by escaping breakout characters */
export const sanitizeCssUrl = (url: string): string =>
  url.replace(/[()'"\\]/g, (ch) => `\\${ch}`);

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
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const handleColorClick = useCallback<OnColorClickFn>(
    (elementId, fields, x, y, strokeField, fontSizeField, fontFamilyField) => {
      setPopover({
        elementId,
        fields,
        x,
        y,
        strokeField,
        fontSizeField,
        fontFamilyField,
      });
    },
    [],
  );

  const closePopover = useCallback(() => setPopover(null), []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && listenPrefix) {
        fileInputRef.current?.click();
      }
    },
    [listenPrefix],
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !listenPrefix) return;

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
                  backgroundImage: `url(${sanitizeCssUrl(effective.backgroundImage)})`,
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
              strokeField={popover.strokeField}
              fontSizeField={popover.fontSizeField}
              fontFamilyField={popover.fontFamilyField}
              theme={effective}
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
