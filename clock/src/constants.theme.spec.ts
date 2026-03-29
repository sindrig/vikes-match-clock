import { describe, it, expect } from "vitest";
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  BUILT_IN_PRESET_NAMES,
} from "./constants";

describe("theme constants", () => {
  describe("BUILT_IN_PRESET_NAMES ↔ THEME_PRESETS consistency", () => {
    it("every BUILT_IN_PRESET_NAMES entry exists in THEME_PRESETS", () => {
      for (const name of BUILT_IN_PRESET_NAMES) {
        expect(THEME_PRESETS).toHaveProperty(name);
      }
    });

    it("every THEME_PRESETS key exists in BUILT_IN_PRESET_NAMES", () => {
      for (const name of Object.keys(THEME_PRESETS)) {
        expect(BUILT_IN_PRESET_NAMES.has(name)).toBe(true);
      }
    });

    it("has at least one built-in preset", () => {
      expect(BUILT_IN_PRESET_NAMES.size).toBeGreaterThan(0);
    });

    it('includes "Default" preset', () => {
      expect(BUILT_IN_PRESET_NAMES.has("Default")).toBe(true);
      expect(THEME_PRESETS["Default"]).toEqual(DEFAULT_THEME);
    });
  });

  describe("DEFAULT_THEME completeness", () => {
    const defaultKeys = Object.keys(DEFAULT_THEME);

    it("has all ThemeConfig keys as non-empty strings", () => {
      for (const key of defaultKeys) {
        const value = (DEFAULT_THEME as unknown as Record<string, string>)[key];
        expect(typeof value).toBe("string");
        // backgroundImage is intentionally empty
        if (key !== "backgroundImage") {
          expect(value.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("every preset has all ThemeConfig keys", () => {
    const defaultKeys = Object.keys(DEFAULT_THEME).sort();

    for (const [presetName, presetTheme] of Object.entries(THEME_PRESETS)) {
      it(`"${presetName}" has exactly the same keys as DEFAULT_THEME`, () => {
        expect(Object.keys(presetTheme).sort()).toEqual(defaultKeys);
      });

      it(`"${presetName}" has only string values`, () => {
        for (const [, value] of Object.entries(
          presetTheme as unknown as Record<string, unknown>,
        )) {
          expect(typeof value).toBe("string");
        }
      });
    }
  });
});
