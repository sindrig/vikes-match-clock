import { useState, useCallback, useMemo } from "react";
import {
  Button,
  ButtonGroup,
  Input,
  InputGroup,
  Panel,
  Divider,
  Modal,
  IconButton,
  Badge,
  Nav,
} from "rsuite";
import TrashIcon from "@rsuite/icons/Trash";
import ReloadIcon from "@rsuite/icons/Reload";
import PlusIcon from "@rsuite/icons/Plus";
import { useView } from "../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../contexts/LocalStateContext";
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  BUILT_IN_PRESET_NAMES,
} from "../../constants";
import { resolveTheme } from "../../hooks/useThemeCssVars";
import type { ThemeConfig, CustomPreset } from "../../types";
import { toHex, parseStroke, composeStroke } from "./themeUtils";
import VisualThemeEditor from "./VisualThemeEditor";

import "./ThemeEditor.css";

interface ColorFieldProps {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}

const isTransparent = (value: string): boolean =>
  value.toLowerCase().trim() === "transparent";

const ColorField = ({
  label,
  value,
  defaultValue,
  onChange,
}: ColorFieldProps) => {
  const transparent = isTransparent(value);
  return (
    <div className="theme-field">
      <label className="theme-field-label">{label}</label>
      <div className="theme-field-input">
        {transparent ? (
          <span className="theme-transparent-indicator" title="Transparent" />
        ) : (
          <input
            type="color"
            className="theme-color-picker"
            value={toHex(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        <Input
          size="xs"
          value={value}
          onChange={(val) => onChange(val)}
          placeholder={defaultValue}
        />
        <div
          className="theme-transparent-toggle"
          title="Gegnsætt"
          role="checkbox"
          aria-checked={transparent}
          tabIndex={0}
          onClick={() => onChange(transparent ? defaultValue : "transparent")}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              onChange(transparent ? defaultValue : "transparent");
            }
          }}
        >
          <span
            className={`theme-transparent-toggle-label${transparent ? " checked" : ""}`}
          >
            ∅
          </span>
        </div>
      </div>
    </div>
  );
};

interface TextFieldProps {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}

const TextField = ({
  label,
  value,
  defaultValue,
  onChange,
}: TextFieldProps) => (
  <div className="theme-field">
    <label className="theme-field-label">{label}</label>
    <Input
      size="xs"
      value={value}
      onChange={(val) => onChange(val)}
      placeholder={defaultValue}
    />
  </div>
);

interface PercentFieldProps {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}

const PercentField = ({
  label,
  value,
  defaultValue,
  onChange,
}: PercentFieldProps) => (
  <div className="theme-field">
    <label className="theme-field-label">{label}</label>
    <InputGroup size="xs" className="theme-percent-input">
      <Input
        value={parseFloat(value).toString()}
        onChange={(val) => {
          const num = parseFloat(val);
          if (!Number.isNaN(num)) {
            onChange(`${num}%`);
          }
        }}
        placeholder={defaultValue}
      />
      <InputGroup.Addon>%</InputGroup.Addon>
    </InputGroup>
  </div>
);

const FONT_OPTIONS = [
  '"Anton", sans-serif',
  '"Oswald", sans-serif',
  '"Bebas Neue", sans-serif',
  '"Orbitron", sans-serif',
  '"Russo One", sans-serif',
  "sans-serif",
  '"Roboto", sans-serif',
  "monospace",
  '"Arial Black", sans-serif',
];

interface FontFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const FontField = ({ label, value, onChange }: FontFieldProps) => (
  <div className="theme-field">
    <label className="theme-field-label">{label}</label>
    <select
      className="theme-font-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {FONT_OPTIONS.map((font) => (
        <option key={font} value={font}>
          {font.replace(/"/g, "")}
        </option>
      ))}
      {!FONT_OPTIONS.includes(value) && (
        <option value={value}>{value.replace(/"/g, "")}</option>
      )}
    </select>
  </div>
);

interface StrokeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const StrokeField = ({ label, value, onChange }: StrokeFieldProps) => {
  const parts = parseStroke(value);
  return (
    <div className="theme-field theme-stroke-field">
      <label className="theme-field-label">{label}</label>
      <div className="theme-stroke-controls">
        <input
          type="range"
          className="theme-stroke-slider"
          min={0}
          max={5}
          step={0.5}
          value={parts.width}
          onChange={(e) => {
            const w = parseFloat(e.target.value);
            onChange(composeStroke(w, parts.color));
          }}
        />
        <span className="theme-stroke-value">{parts.width}px</span>
        {parts.width > 0 && (
          <input
            type="color"
            className="theme-color-picker"
            value={toHex(parts.color)}
            onChange={(e) =>
              onChange(composeStroke(parts.width, e.target.value))
            }
          />
        )}
      </div>
    </div>
  );
};

// ---- Preset list item types ----

interface PresetEntry {
  /** Unique key: built-in name or custom preset ID */
  id: string;
  /** Display name */
  name: string;
  /** The theme config */
  theme: ThemeConfig;
  /** Whether this is a built-in preset */
  isBuiltIn: boolean;
  /** For custom presets that are copies of built-in ones */
  basedOn?: string;
}

/**
 * Build a unified list of presets: built-in first, then custom.
 * If a custom preset is basedOn a built-in, the built-in still shows
 * but the custom copy is listed separately.
 */
function buildPresetList(
  customPresets?: Record<string, CustomPreset>,
): PresetEntry[] {
  const entries: PresetEntry[] = [];

  // Built-in presets
  for (const [name, theme] of Object.entries(THEME_PRESETS)) {
    entries.push({ id: name, name, theme, isBuiltIn: true });
  }

  // Custom presets
  if (customPresets) {
    for (const [id, preset] of Object.entries(customPresets)) {
      entries.push({
        id,
        name: preset.name,
        theme: preset.theme,
        isBuiltIn: false,
        basedOn: preset.basedOn,
      });
    }
  }

  return entries;
}

/**
 * Find the custom preset ID that is a modified copy of a given built-in preset.
 */
function findCopyOfBuiltIn(
  builtInName: string,
  customPresets?: Record<string, CustomPreset>,
): string | undefined {
  if (!customPresets) return undefined;
  for (const [id, preset] of Object.entries(customPresets)) {
    if (preset.basedOn === builtInName) return id;
  }
  return undefined;
}

// ---- Theme property editor panels ----

interface ThemeEditorPanelsProps {
  effective: ThemeConfig;
  onFieldChange: (field: keyof ThemeConfig, value: string) => void;
}

const ThemeEditorPanels = ({
  effective,
  onFieldChange,
}: ThemeEditorPanelsProps) => (
  <div className="theme-editor-panels">
    <Panel header="Stigabox" collapsible defaultExpanded bordered>
      <ColorField
        label="Bakgrunnur"
        value={effective.scoreBoxBg}
        defaultValue={DEFAULT_THEME.scoreBoxBg}
        onChange={(v) => onFieldChange("scoreBoxBg", v)}
      />
      <ColorField
        label="Litur"
        value={effective.scoreBoxColor}
        defaultValue={DEFAULT_THEME.scoreBoxColor}
        onChange={(v) => onFieldChange("scoreBoxColor", v)}
      />
      <TextField
        label="Rammi"
        value={effective.scoreBoxBorder}
        defaultValue={DEFAULT_THEME.scoreBoxBorder}
        onChange={(v) => onFieldChange("scoreBoxBorder", v)}
      />
      <TextField
        label="Leturstærð"
        value={effective.scoreBoxFontSize}
        defaultValue={DEFAULT_THEME.scoreBoxFontSize}
        onChange={(v) => onFieldChange("scoreBoxFontSize", v)}
      />
      <FontField
        label="Letur"
        value={effective.scoreBoxFontFamily}
        onChange={(v) => onFieldChange("scoreBoxFontFamily", v)}
      />
      <StrokeField
        label="Leturútlína"
        value={effective.scoreBoxStroke}
        onChange={(v) => onFieldChange("scoreBoxStroke", v)}
      />
      <Divider className="theme-divider" />
      <PercentField
        label="Ofan"
        value={effective.scoreTop}
        defaultValue={DEFAULT_THEME.scoreTop}
        onChange={(v) => onFieldChange("scoreTop", v)}
      />
      <PercentField
        label="Hæð"
        value={effective.scoreHeight}
        defaultValue={DEFAULT_THEME.scoreHeight}
        onChange={(v) => onFieldChange("scoreHeight", v)}
      />
      <PercentField
        label="Breidd"
        value={effective.scoreWidth}
        defaultValue={DEFAULT_THEME.scoreWidth}
        onChange={(v) => onFieldChange("scoreWidth", v)}
      />
    </Panel>

    <Panel header="Klukka" collapsible defaultExpanded bordered>
      <ColorField
        label="Bakgrunnur"
        value={effective.clockBg}
        defaultValue={DEFAULT_THEME.clockBg}
        onChange={(v) => onFieldChange("clockBg", v)}
      />
      <ColorField
        label="Litur"
        value={effective.clockColor}
        defaultValue={DEFAULT_THEME.clockColor}
        onChange={(v) => onFieldChange("clockColor", v)}
      />
      <TextField
        label="Rammi"
        value={effective.clockBorder}
        defaultValue={DEFAULT_THEME.clockBorder}
        onChange={(v) => onFieldChange("clockBorder", v)}
      />
      <FontField
        label="Letur"
        value={effective.clockFontFamily}
        onChange={(v) => onFieldChange("clockFontFamily", v)}
      />
      <StrokeField
        label="Leturútlína"
        value={effective.clockStroke}
        onChange={(v) => onFieldChange("clockStroke", v)}
      />
      <TextField
        label="Leturstærð (min)"
        value={effective.clockFontSizeMin}
        defaultValue={DEFAULT_THEME.clockFontSizeMin}
        onChange={(v) => onFieldChange("clockFontSizeMin", v)}
      />
      <TextField
        label="Leturstærð (max)"
        value={effective.clockFontSizeMax}
        defaultValue={DEFAULT_THEME.clockFontSizeMax}
        onChange={(v) => onFieldChange("clockFontSizeMax", v)}
      />
      <Divider className="theme-divider" />
      <PercentField
        label="Ofan"
        value={effective.clockTop}
        defaultValue={DEFAULT_THEME.clockTop}
        onChange={(v) => onFieldChange("clockTop", v)}
      />
      <PercentField
        label="Vinstri"
        value={effective.clockLeft}
        defaultValue={DEFAULT_THEME.clockLeft}
        onChange={(v) => onFieldChange("clockLeft", v)}
      />
      <PercentField
        label="Breidd"
        value={effective.clockWidth}
        defaultValue={DEFAULT_THEME.clockWidth}
        onChange={(v) => onFieldChange("clockWidth", v)}
      />
      <PercentField
        label="Hæð"
        value={effective.clockHeight}
        defaultValue={DEFAULT_THEME.clockHeight}
        onChange={(v) => onFieldChange("clockHeight", v)}
      />
    </Panel>

    <Panel header="Merki" collapsible bordered>
      <PercentField
        label="Ofan"
        value={effective.logoTop}
        defaultValue={DEFAULT_THEME.logoTop}
        onChange={(v) => onFieldChange("logoTop", v)}
      />
      <PercentField
        label="Hæð"
        value={effective.logoHeight}
        defaultValue={DEFAULT_THEME.logoHeight}
        onChange={(v) => onFieldChange("logoHeight", v)}
      />
      <PercentField
        label="Breidd"
        value={effective.logoWidth}
        defaultValue={DEFAULT_THEME.logoWidth}
        onChange={(v) => onFieldChange("logoWidth", v)}
      />
    </Panel>

    <Panel header="Uppbótatími" collapsible bordered>
      <ColorField
        label="Litur"
        value={effective.injuryTimeColor}
        defaultValue={DEFAULT_THEME.injuryTimeColor}
        onChange={(v) => onFieldChange("injuryTimeColor", v)}
      />
      <TextField
        label="Leturstærð"
        value={effective.injuryTimeFontSize}
        defaultValue={DEFAULT_THEME.injuryTimeFontSize}
        onChange={(v) => onFieldChange("injuryTimeFontSize", v)}
      />
      <StrokeField
        label="Leturútlína"
        value={effective.injuryTimeStroke}
        onChange={(v) => onFieldChange("injuryTimeStroke", v)}
      />
      <Divider className="theme-divider" />
      <PercentField
        label="Ofan"
        value={effective.injuryTimeTop}
        defaultValue={DEFAULT_THEME.injuryTimeTop}
        onChange={(v) => onFieldChange("injuryTimeTop", v)}
      />
      <PercentField
        label="Vinstri"
        value={effective.injuryTimeLeft}
        defaultValue={DEFAULT_THEME.injuryTimeLeft}
        onChange={(v) => onFieldChange("injuryTimeLeft", v)}
      />
    </Panel>

    <Panel header="Liðsheiti" collapsible bordered>
      <ColorField
        label="Litur"
        value={effective.teamNameColor}
        defaultValue={DEFAULT_THEME.teamNameColor}
        onChange={(v) => onFieldChange("teamNameColor", v)}
      />
      <FontField
        label="Letur"
        value={effective.teamNameFontFamily}
        onChange={(v) => onFieldChange("teamNameFontFamily", v)}
      />
    </Panel>

    <Panel header="Rauð spjöld / Vítaspyrna / Leikhlé" collapsible bordered>
      <ColorField
        label="Rautt spjald"
        value={effective.redCardColor}
        defaultValue={DEFAULT_THEME.redCardColor}
        onChange={(v) => onFieldChange("redCardColor", v)}
      />
      <ColorField
        label="Vítabox bakgr."
        value={effective.penaltyBg}
        defaultValue={DEFAULT_THEME.penaltyBg}
        onChange={(v) => onFieldChange("penaltyBg", v)}
      />
      <ColorField
        label="Vítabox litur"
        value={effective.penaltyColor}
        defaultValue={DEFAULT_THEME.penaltyColor}
        onChange={(v) => onFieldChange("penaltyColor", v)}
      />
      <TextField
        label="Vítabox rammi"
        value={effective.penaltyBorder}
        defaultValue={DEFAULT_THEME.penaltyBorder}
        onChange={(v) => onFieldChange("penaltyBorder", v)}
      />
      <ColorField
        label="Leikhlé litur"
        value={effective.timeoutColor}
        defaultValue={DEFAULT_THEME.timeoutColor}
        onChange={(v) => onFieldChange("timeoutColor", v)}
      />
    </Panel>

    <Panel header="Idle skjár" collapsible bordered>
      <ColorField
        label="Texta litur"
        value={effective.idleTextColor}
        defaultValue={DEFAULT_THEME.idleTextColor}
        onChange={(v) => onFieldChange("idleTextColor", v)}
      />
      <TextField
        label="Texta stærð"
        value={effective.idleTextFontSize}
        defaultValue={DEFAULT_THEME.idleTextFontSize}
        onChange={(v) => onFieldChange("idleTextFontSize", v)}
      />
      <PercentField
        label="Merki ofan"
        value={effective.idleLogoTop}
        defaultValue={DEFAULT_THEME.idleLogoTop}
        onChange={(v) => onFieldChange("idleLogoTop", v)}
      />
      <PercentField
        label="Merki vinstri"
        value={effective.idleLogoLeft}
        defaultValue={DEFAULT_THEME.idleLogoLeft}
        onChange={(v) => onFieldChange("idleLogoLeft", v)}
      />
      <PercentField
        label="Merki breidd"
        value={effective.idleLogoWidth}
        defaultValue={DEFAULT_THEME.idleLogoWidth}
        onChange={(v) => onFieldChange("idleLogoWidth", v)}
      />
      <PercentField
        label="Texti ofan"
        value={effective.idleTextTop}
        defaultValue={DEFAULT_THEME.idleTextTop}
        onChange={(v) => onFieldChange("idleTextTop", v)}
      />
    </Panel>

    <Panel header="Auglýsing" collapsible bordered>
      <PercentField
        label="Ofan"
        value={effective.adTop}
        defaultValue={DEFAULT_THEME.adTop}
        onChange={(v) => onFieldChange("adTop", v)}
      />
      <PercentField
        label="Vinstri"
        value={effective.adLeft}
        defaultValue={DEFAULT_THEME.adLeft}
        onChange={(v) => onFieldChange("adLeft", v)}
      />
      <PercentField
        label="Breidd"
        value={effective.adWidth}
        defaultValue={DEFAULT_THEME.adWidth}
        onChange={(v) => onFieldChange("adWidth", v)}
      />
      <PercentField
        label="Hæð"
        value={effective.adHeight}
        defaultValue={DEFAULT_THEME.adHeight}
        onChange={(v) => onFieldChange("adHeight", v)}
      />
    </Panel>

    <Panel header="Bakgrunnsmynd" collapsible bordered>
      <div className="theme-field">
        <label className="theme-field-label">Slóð</label>
        <Input
          size="xs"
          value={effective.backgroundImage}
          onChange={(val) => onFieldChange("backgroundImage", val)}
          placeholder="Engin mynd"
        />
      </div>
      {effective.backgroundImage && (
        <Button
          size="xs"
          color="red"
          appearance="ghost"
          onClick={() => onFieldChange("backgroundImage", "")}
          style={{ marginTop: 4 }}
        >
          Fjarlægja mynd
        </Button>
      )}
    </Panel>
  </div>
);

// ---- Main component ----

interface ThemeEditorModalProps {
  open: boolean;
  onClose: () => void;
}

const ThemeEditorModal = ({ open, onClose }: ThemeEditorModalProps) => {
  const {
    view: { theme, themePreset, customPresets },
    setTheme,
    setThemePreset,
    saveCustomPreset,
    deleteCustomPreset,
  } = useView();
  const { listenPrefix } = useRemoteSettings();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editorTab, setEditorTab] = useState<"visual" | "advanced">("visual");

  const activePresetId = themePreset ?? "Default";
  const presetList = useMemo(
    () => buildPresetList(customPresets),
    [customPresets],
  );

  const effective = useMemo(
    () => resolveTheme(themePreset, theme, customPresets),
    [themePreset, theme, customPresets],
  );

  // Select a preset (built-in or custom)
  const selectPreset = useCallback(
    (entry: PresetEntry) => {
      setThemePreset(entry.id);
      setTheme(undefined);
    },
    [setTheme, setThemePreset],
  );

  // Apply one or more field changes atomically.
  // Using Partial<ThemeConfig> ensures multiple drag fields (top + left)
  // are batched into a single Firebase write, avoiding stale-closure issues
  // when onFieldChange is called twice synchronously.
  const handleFieldsChange = useCallback(
    (changes: Partial<ThemeConfig>) => {
      if (BUILT_IN_PRESET_NAMES.has(activePresetId)) {
        // Check if a copy already exists
        const existingCopyId = findCopyOfBuiltIn(activePresetId, customPresets);
        const builtInTheme = THEME_PRESETS[activePresetId] ?? DEFAULT_THEME;
        const newTheme = {
          ...builtInTheme,
          ...(theme ?? {}),
          ...changes,
        };
        const copyName = `${activePresetId} (breytt)`;

        if (existingCopyId) {
          // Update existing copy
          saveCustomPreset(existingCopyId, {
            name: copyName,
            theme: newTheme,
            basedOn: activePresetId,
          });
          setThemePreset(existingCopyId);
          setTheme(undefined);
        } else {
          // Create new copy
          const newId = `custom-${crypto.randomUUID()}`;
          saveCustomPreset(newId, {
            name: copyName,
            theme: newTheme,
            basedOn: activePresetId,
          });
          setThemePreset(newId);
          setTheme(undefined);
        }
      } else {
        // Editing a custom preset directly
        const customPreset = customPresets?.[activePresetId];
        if (customPreset) {
          const newTheme = { ...customPreset.theme, ...changes };
          saveCustomPreset(activePresetId, {
            ...customPreset,
            theme: newTheme,
          });
        } else {
          // Fallback: use theme overrides
          const currentTheme = theme ?? {};
          setTheme({ ...DEFAULT_THEME, ...currentTheme, ...changes });
        }
      }
    },
    [
      activePresetId,
      customPresets,
      theme,
      setTheme,
      setThemePreset,
      saveCustomPreset,
    ],
  );

  // Single-field convenience wrapper
  const handleFieldChange = useCallback(
    (field: keyof ThemeConfig, value: string) => {
      handleFieldsChange({ [field]: value });
    },
    [handleFieldsChange],
  );

  // Revert a modified copy back to its built-in original
  const revertToBuiltIn = useCallback(
    (copyId: string, builtInName: string) => {
      deleteCustomPreset(copyId);
      setThemePreset(builtInName);
      setTheme(undefined);
    },
    [deleteCustomPreset, setThemePreset, setTheme],
  );

  // Create a new blank custom preset
  const createNewPreset = useCallback(() => {
    const newId = `custom-${crypto.randomUUID()}`;
    const newPreset: CustomPreset = {
      name: "Nýtt þema",
      theme: { ...DEFAULT_THEME },
    };
    saveCustomPreset(newId, newPreset);
    setThemePreset(newId);
    setTheme(undefined);
  }, [saveCustomPreset, setThemePreset, setTheme]);

  // Delete a custom preset
  const handleDeletePreset = useCallback(
    (id: string) => {
      deleteCustomPreset(id);
      // If deleting the active preset, fall back to Default
      if (activePresetId === id) {
        setThemePreset("Default");
        setTheme(undefined);
      }
    },
    [activePresetId, deleteCustomPreset, setThemePreset, setTheme],
  );

  // Start renaming
  const startRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  }, []);

  // Commit rename
  const commitRename = useCallback(() => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const preset = customPresets?.[renamingId];
    if (preset) {
      saveCustomPreset(renamingId, { ...preset, name: renameValue.trim() });
    }
    setRenamingId(null);
  }, [renamingId, renameValue, customPresets, saveCustomPreset]);

  // Map of built-in names to their custom copy IDs (for showing badge)
  const builtInCopyMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (customPresets) {
      for (const [id, preset] of Object.entries(customPresets)) {
        if (preset.basedOn && BUILT_IN_PRESET_NAMES.has(preset.basedOn)) {
          map[preset.basedOn] = id;
        }
      }
    }
    return map;
  }, [customPresets]);

  return (
    <Modal open={open} onClose={onClose} size="md" overflow>
      <Modal.Header>
        <Modal.Title>Klukku þema</Modal.Title>
      </Modal.Header>
      <Modal.Body className="theme-modal-body">
        <div className="theme-preset-section">
          <div className="theme-preset-section-header">
            <span className="theme-section-label">Forstillingar</span>
            <IconButton
              icon={<PlusIcon />}
              size="xs"
              appearance="ghost"
              onClick={createNewPreset}
            >
              Nýtt þema
            </IconButton>
          </div>

          <div className="theme-preset-list">
            {/* Built-in presets */}
            <div className="theme-preset-group">
              <span className="theme-preset-group-label">Innbyggð</span>
              <ButtonGroup size="xs" className="theme-preset-buttons">
                {presetList
                  .filter((e) => e.isBuiltIn)
                  .map((entry) => {
                    const hasCopy = Boolean(builtInCopyMap[entry.id]);
                    const isActive = activePresetId === entry.id;
                    return (
                      <Button
                        key={entry.id}
                        appearance={isActive ? "primary" : "default"}
                        onClick={() => selectPreset(entry)}
                      >
                        {hasCopy ? (
                          <Badge content="*">{entry.name}</Badge>
                        ) : (
                          entry.name
                        )}
                      </Button>
                    );
                  })}
              </ButtonGroup>
            </div>

            {/* Custom presets */}
            {presetList.some((e) => !e.isBuiltIn) && (
              <div className="theme-preset-group">
                <span className="theme-preset-group-label">Sérsniðin</span>
                <div className="theme-custom-preset-list">
                  {presetList
                    .filter((e) => !e.isBuiltIn)
                    .map((entry) => {
                      const isActive = activePresetId === entry.id;
                      return (
                        <div
                          key={entry.id}
                          className={`theme-custom-preset-item ${isActive ? "active" : ""}`}
                        >
                          <Button
                            size="xs"
                            appearance={isActive ? "primary" : "default"}
                            onClick={() => selectPreset(entry)}
                            className="theme-custom-preset-name"
                          >
                            {renamingId === entry.id ? (
                              <Input
                                size="xs"
                                value={renameValue}
                                onChange={(v) => setRenameValue(v)}
                                onBlur={commitRename}
                                onPressEnter={commitRename}
                                autoFocus
                                className="theme-rename-input"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  startRename(entry.id, entry.name);
                                }}
                              >
                                {entry.name}
                              </span>
                            )}
                          </Button>
                          <div className="theme-custom-preset-actions">
                            {entry.basedOn && (
                              <IconButton
                                icon={<ReloadIcon />}
                                size="xs"
                                appearance="subtle"
                                title={`Endurstilla sem ${entry.basedOn}`}
                                onClick={() =>
                                  revertToBuiltIn(entry.id, entry.basedOn!)
                                }
                              />
                            )}
                            <IconButton
                              icon={<TrashIcon />}
                              size="xs"
                              appearance="subtle"
                              color="red"
                              title="Eyða"
                              onClick={() => handleDeletePreset(entry.id)}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>

        <Divider />

        <Nav
          appearance="subtle"
          activeKey={editorTab}
          onSelect={(key) => setEditorTab(key as "visual" | "advanced")}
          className="theme-editor-tabs"
        >
          <Nav.Item eventKey="visual">Sjónrænt</Nav.Item>
          <Nav.Item eventKey="advanced">Ítarlegt</Nav.Item>
        </Nav>

        {editorTab === "visual" ? (
          <VisualThemeEditor
            effective={effective}
            onFieldChange={handleFieldChange}
            onFieldsChange={handleFieldsChange}
            listenPrefix={listenPrefix}
          />
        ) : (
          <ThemeEditorPanels
            effective={effective}
            onFieldChange={handleFieldChange}
          />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onClose} appearance="primary" size="sm">
          Loka
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ThemeEditorModal;
