import { describe, it, expect } from "vitest";
import { isTransparent, buildPresetList } from "./ThemeEditor";
import { THEME_PRESETS, DEFAULT_THEME } from "../../constants";
import type { CustomPreset, ThemeConfig } from "../../types";

describe("ThemeEditor helpers", () => {
  // ---- isTransparent ----
  describe("isTransparent", () => {
    it('returns true for "transparent"', () => {
      expect(isTransparent("transparent")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(isTransparent("TRANSPARENT")).toBe(true);
      expect(isTransparent("Transparent")).toBe(true);
    });

    it("trims whitespace", () => {
      expect(isTransparent("  transparent  ")).toBe(true);
    });

    it("returns false for hex colors", () => {
      expect(isTransparent("#000000")).toBe(false);
      expect(isTransparent("#ffffff")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isTransparent("")).toBe(false);
    });

    it("returns false for other strings", () => {
      expect(isTransparent("red")).toBe(false);
      expect(isTransparent("rgba(0,0,0,0)")).toBe(false);
    });
  });

  // ---- buildPresetList ----
  describe("buildPresetList", () => {
    it("returns only built-in presets when no custom presets", () => {
      const list = buildPresetList();
      const builtInNames = Object.keys(THEME_PRESETS);

      expect(list).toHaveLength(builtInNames.length);
      for (const entry of list) {
        expect(entry.isBuiltIn).toBe(true);
        expect(builtInNames).toContain(entry.name);
      }
    });

    it("returns only built-in presets for undefined customPresets", () => {
      const list = buildPresetList(undefined);
      expect(list.every((e) => e.isBuiltIn)).toBe(true);
    });

    it("returns only built-in presets for empty customPresets", () => {
      const list = buildPresetList({});
      expect(list).toHaveLength(Object.keys(THEME_PRESETS).length);
      expect(list.every((e) => e.isBuiltIn)).toBe(true);
    });

    it("appends custom presets after built-in", () => {
      const customTheme: ThemeConfig = {
        ...DEFAULT_THEME,
        scoreBoxBg: "#custom",
      };
      const customPresets: Record<string, CustomPreset> = {
        "cp-1": { name: "My Theme", theme: customTheme },
      };

      const list = buildPresetList(customPresets);
      const builtInCount = Object.keys(THEME_PRESETS).length;

      expect(list).toHaveLength(builtInCount + 1);

      // Last entry should be the custom preset
      const last = list[list.length - 1]!;
      expect(last.id).toBe("cp-1");
      expect(last.name).toBe("My Theme");
      expect(last.isBuiltIn).toBe(false);
      expect(last.theme).toEqual(customTheme);
    });

    it("includes multiple custom presets", () => {
      const customPresets: Record<string, CustomPreset> = {
        a: { name: "Alpha", theme: DEFAULT_THEME },
        b: { name: "Beta", theme: DEFAULT_THEME },
      };

      const list = buildPresetList(customPresets);
      const customEntries = list.filter((e) => !e.isBuiltIn);
      expect(customEntries).toHaveLength(2);
      expect(customEntries.map((e) => e.name).sort()).toEqual([
        "Alpha",
        "Beta",
      ]);
    });

    it("built-in entries use the preset name as both id and name", () => {
      const list = buildPresetList();
      for (const entry of list) {
        expect(entry.id).toBe(entry.name);
      }
    });

    it("custom entries use the Firebase key as id and preset.name as name", () => {
      const customPresets: Record<string, CustomPreset> = {
        "firebase-key-123": { name: "Display Name", theme: DEFAULT_THEME },
      };
      const list = buildPresetList(customPresets);
      const custom = list.find((e) => !e.isBuiltIn)!;
      expect(custom.id).toBe("firebase-key-123");
      expect(custom.name).toBe("Display Name");
    });
  });
});
