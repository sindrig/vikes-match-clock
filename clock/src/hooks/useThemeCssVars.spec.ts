import { describe, it, expect } from "vitest";
import { resolveTheme, lookupPreset, themeToCssVars } from "./useThemeCssVars";
import { DEFAULT_THEME, THEME_PRESETS } from "../constants";
import type { ThemeConfig, CustomPreset } from "../types";

describe("useThemeCssVars", () => {
  // ---- lookupPreset ----
  describe("lookupPreset", () => {
    it("returns DEFAULT_THEME when presetName is undefined", () => {
      expect(lookupPreset(undefined)).toEqual(DEFAULT_THEME);
    });

    it("returns DEFAULT_THEME when presetName is empty string", () => {
      expect(lookupPreset("")).toEqual(DEFAULT_THEME);
    });

    it("returns a built-in preset by name", () => {
      expect(lookupPreset("Vikes Dark")).toEqual(THEME_PRESETS["Vikes Dark"]);
    });

    it("returns DEFAULT_THEME for unknown preset name", () => {
      expect(lookupPreset("Nonexistent")).toEqual(DEFAULT_THEME);
    });

    it("returns custom preset matched by ID", () => {
      const customTheme: ThemeConfig = {
        ...DEFAULT_THEME,
        scoreBoxBg: "#111111",
      };
      const customPresets: Record<string, CustomPreset> = {
        "custom-id-1": { name: "My Custom", theme: customTheme },
      };
      expect(lookupPreset("custom-id-1", customPresets)).toEqual(customTheme);
    });

    it("returns custom preset matched by name", () => {
      const customTheme: ThemeConfig = {
        ...DEFAULT_THEME,
        scoreBoxBg: "#222222",
      };
      const customPresets: Record<string, CustomPreset> = {
        "some-firebase-key": { name: "My Custom", theme: customTheme },
      };
      expect(lookupPreset("My Custom", customPresets)).toEqual(customTheme);
    });

    it("prefers ID match over name match in custom presets", () => {
      const themeById: ThemeConfig = {
        ...DEFAULT_THEME,
        scoreBoxBg: "#aaa",
      };
      const themeByName: ThemeConfig = {
        ...DEFAULT_THEME,
        scoreBoxBg: "#bbb",
      };
      const customPresets: Record<string, CustomPreset> = {
        matchKey: { name: "Other", theme: themeById },
        otherKey: { name: "matchKey", theme: themeByName },
      };
      // "matchKey" matches the ID of the first entry
      expect(lookupPreset("matchKey", customPresets)).toEqual(themeById);
    });

    it("custom presets take priority over built-in with same name", () => {
      const customTheme: ThemeConfig = {
        ...DEFAULT_THEME,
        scoreBoxBg: "#custom",
      };
      const customPresets: Record<string, CustomPreset> = {
        "some-key": { name: "Default", theme: customTheme },
      };
      expect(lookupPreset("Default", customPresets)).toEqual(customTheme);
    });

    it("falls through to built-in if custom presets exist but don't match", () => {
      const customPresets: Record<string, CustomPreset> = {
        "some-key": {
          name: "Unrelated",
          theme: { ...DEFAULT_THEME, scoreBoxBg: "#xxx" },
        },
      };
      expect(lookupPreset("Vikes Dark", customPresets)).toEqual(
        THEME_PRESETS["Vikes Dark"],
      );
    });
  });

  // ---- resolveTheme ----
  describe("resolveTheme", () => {
    it("returns DEFAULT_THEME when called with no arguments", () => {
      expect(resolveTheme()).toEqual(DEFAULT_THEME);
    });

    it("returns the named preset theme", () => {
      expect(resolveTheme("Minimal")).toEqual(THEME_PRESETS["Minimal"]);
    });

    it("merges overrides onto preset", () => {
      const overrides = { scoreBoxBg: "#override" } as ThemeConfig;
      const result = resolveTheme("Default", overrides);
      expect(result.scoreBoxBg).toBe("#override");
      // Other fields come from Default
      expect(result.scoreBoxColor).toBe(DEFAULT_THEME.scoreBoxColor);
    });

    it("merges overrides onto DEFAULT_THEME when no preset", () => {
      const overrides = { clockBg: "#custom-clock" } as ThemeConfig;
      const result = resolveTheme(undefined, overrides);
      expect(result.clockBg).toBe("#custom-clock");
      expect(result.scoreBoxBg).toBe(DEFAULT_THEME.scoreBoxBg);
    });

    it("resolves custom preset with overrides", () => {
      const customTheme: ThemeConfig = {
        ...DEFAULT_THEME,
        scoreBoxBg: "#custom-base",
      };
      const customPresets: Record<string, CustomPreset> = {
        cp1: { name: "Custom", theme: customTheme },
      };
      const overrides = { clockBg: "#over" } as ThemeConfig;
      const result = resolveTheme("cp1", overrides, customPresets);
      expect(result.scoreBoxBg).toBe("#custom-base");
      expect(result.clockBg).toBe("#over");
    });

    it("returns base theme unchanged when overrides is undefined", () => {
      const result = resolveTheme("Default", undefined);
      expect(result).toEqual(DEFAULT_THEME);
    });
  });

  // ---- themeToCssVars ----
  describe("themeToCssVars", () => {
    it("maps scoreBoxBg to --theme-score-bg", () => {
      const vars = themeToCssVars(DEFAULT_THEME);
      expect(vars["--theme-score-bg"]).toBe(DEFAULT_THEME.scoreBoxBg);
    });

    it("maps clockFontSizeMax to --theme-clock-font-size-max", () => {
      const vars = themeToCssVars(DEFAULT_THEME);
      expect(vars["--theme-clock-font-size-max"]).toBe(
        DEFAULT_THEME.clockFontSizeMax,
      );
    });

    it("maps injuryTimeColor to --theme-injury-color", () => {
      const vars = themeToCssVars(DEFAULT_THEME);
      expect(vars["--theme-injury-color"]).toBe(DEFAULT_THEME.injuryTimeColor);
    });

    it("maps all score box properties", () => {
      const vars = themeToCssVars(DEFAULT_THEME);
      expect(vars["--theme-score-color"]).toBe(DEFAULT_THEME.scoreBoxColor);
      expect(vars["--theme-score-border"]).toBe(DEFAULT_THEME.scoreBoxBorder);
      expect(vars["--theme-score-font-size"]).toBe(
        DEFAULT_THEME.scoreBoxFontSize,
      );
      expect(vars["--theme-score-font-family"]).toBe(
        DEFAULT_THEME.scoreBoxFontFamily,
      );
      expect(vars["--theme-score-stroke"]).toBe(DEFAULT_THEME.scoreBoxStroke);
    });

    it("maps all clock properties", () => {
      const vars = themeToCssVars(DEFAULT_THEME);
      expect(vars["--theme-clock-bg"]).toBe(DEFAULT_THEME.clockBg);
      expect(vars["--theme-clock-color"]).toBe(DEFAULT_THEME.clockColor);
      expect(vars["--theme-clock-border"]).toBe(DEFAULT_THEME.clockBorder);
      expect(vars["--theme-clock-font-size-min"]).toBe(
        DEFAULT_THEME.clockFontSizeMin,
      );
      expect(vars["--theme-clock-font-family"]).toBe(
        DEFAULT_THEME.clockFontFamily,
      );
      expect(vars["--theme-clock-stroke"]).toBe(DEFAULT_THEME.clockStroke);
    });

    it("maps position properties", () => {
      const vars = themeToCssVars(DEFAULT_THEME);
      expect(vars["--theme-clock-top"]).toBe(DEFAULT_THEME.clockTop);
      expect(vars["--theme-clock-left"]).toBe(DEFAULT_THEME.clockLeft);
      expect(vars["--theme-score-top"]).toBe(DEFAULT_THEME.scoreTop);
      expect(vars["--theme-logo-top"]).toBe(DEFAULT_THEME.logoTop);
      expect(vars["--theme-ad-top"]).toBe(DEFAULT_THEME.adTop);
    });

    it("maps idle screen properties", () => {
      const vars = themeToCssVars(DEFAULT_THEME);
      expect(vars["--theme-idle-text-color"]).toBe(DEFAULT_THEME.idleTextColor);
      expect(vars["--theme-idle-text-font-size"]).toBe(
        DEFAULT_THEME.idleTextFontSize,
      );
      expect(vars["--theme-idle-logo-top"]).toBe(DEFAULT_THEME.idleLogoTop);
    });

    it("includes --theme-background-image when backgroundImage is set", () => {
      const theme: ThemeConfig = {
        ...DEFAULT_THEME,
        backgroundImage: "https://example.com/bg.jpg",
      };
      const vars = themeToCssVars(theme);
      expect(vars["--theme-background-image"]).toBe(
        "url(https://example.com/bg.jpg)",
      );
    });

    it("omits --theme-background-image when backgroundImage is empty", () => {
      const theme: ThemeConfig = { ...DEFAULT_THEME, backgroundImage: "" };
      const vars = themeToCssVars(theme);
      expect(vars["--theme-background-image"]).toBeUndefined();
    });

    it("omits --theme-background-image in DEFAULT_THEME (empty by default)", () => {
      const vars = themeToCssVars(DEFAULT_THEME);
      expect(vars["--theme-background-image"]).toBeUndefined();
    });
  });
});
