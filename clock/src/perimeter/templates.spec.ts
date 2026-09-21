import { describe, expect, it } from "vitest";
import type { PerimeterDisplayConfig } from "../types";
import {
  applyStackedTemplate,
  applyVikinOutdoorTemplate,
  calibrationLabels,
} from "./templates";
import { validatePerimeterMapping } from "./perimeterMapping";

const vikinScreens: PerimeterDisplayConfig["logicalScreens"] = {
  "screen-48": {
    id: "screen-48",
    name: "48 skjáir",
    width: 4608,
    height: 192,
  },
  "screen-40": {
    id: "screen-40",
    name: "40 skjáir",
    width: 3840,
    height: 192,
  },
};

const baseConfig: PerimeterDisplayConfig = {
  version: 1,
  revision: "draft",
  renderer: "web",
  framebuffer: { width: 8448, height: 192, background: "black" },
  logicalScreens: vikinScreens,
  compatibilityKeys: {
    base: { "1": "screen-48", "3": "screen-40" },
    overlay: { "2": "screen-48", "4": "screen-40" },
  },
  regions: [],
  playback: { cueDurationMs: 20_000, videoPolicy: "fit-to-cue" },
};

describe("applyVikinOutdoorTemplate", () => {
  it("produces the verified 3840x1080 Vikin-outdoor layout", () => {
    const result = applyVikinOutdoorTemplate(baseConfig);

    expect(result.framebuffer).toEqual({
      width: 3840,
      height: 1080,
      background: "black",
    });
    expect(result.regions).toHaveLength(3);
    expect(result.regions.map((region) => region.id)).toEqual([
      "screen-40-full",
      "screen-48-left-half",
      "screen-48-right-half",
    ]);

    const left = result.regions[1];
    expect(left?.destination).toEqual({
      x: -2,
      y: 192,
      width: 2308,
      height: 192,
    });
    expect(left?.transform.allowScaling).toBe(true);
    expect(left?.transform.allowClipping).toBe(true);

    const right = result.regions[2];
    expect(right?.source).toEqual({ x: 2304, y: 0, width: 2304, height: 192 });
    expect(right?.destination).toEqual({
      x: 0,
      y: 384,
      width: 2304,
      height: 192,
    });
  });

  it("produces a mapping that passes strict validation", () => {
    const result = applyVikinOutdoorTemplate(baseConfig);
    expect(validatePerimeterMapping(result).valid).toBe(true);
  });

  it("covers every screen-48 source pixel exactly once", () => {
    const result = applyVikinOutdoorTemplate(baseConfig);
    const labels = calibrationLabels(result);
    expect(labels.some((label) => label.includes("screen-48 source 0,0"))).toBe(
      true,
    );
  });

  it("leaves configs without the captured screens unchanged", () => {
    const other: PerimeterDisplayConfig = {
      ...baseConfig,
      logicalScreens: {
        screen: { id: "screen", name: "Screen", width: 8, height: 4 },
      },
    };
    expect(applyVikinOutdoorTemplate(other)).toBe(other);
  });
});

// Mirrors the published staging document at locations/virkid/perimeterDisplay.
const virkidScreens: PerimeterDisplayConfig["logicalScreens"] = {
  "screen-3648": {
    id: "screen-3648",
    name: "3648x192",
    width: 3648,
    height: 192,
  },
  "screen-3264": {
    id: "screen-3264",
    name: "3264x192",
    width: 3264,
    height: 192,
  },
};

const virkidConfig: PerimeterDisplayConfig = {
  ...baseConfig,
  framebuffer: { width: 3648, height: 192, background: "black" },
  logicalScreens: virkidScreens,
  compatibilityKeys: {
    base: { "1": "screen-3648", "3": "screen-3264" },
    overlay: {},
  },
};

describe("applyStackedTemplate", () => {
  it("reproduces the published Virkið staging layout", () => {
    const result = applyStackedTemplate(virkidConfig);

    expect(result.framebuffer).toEqual({
      width: 3648,
      height: 384,
      background: "black",
    });
    expect(result.regions).toHaveLength(2);

    const first = result.regions[0];
    expect(first?.id).toBe("screen-3648-output");
    expect(first?.logicalScreenId).toBe("screen-3648");
    expect(first?.source).toEqual({ x: 0, y: 0, width: 3648, height: 192 });
    expect(first?.destination).toEqual({
      x: 0,
      y: 0,
      width: 3648,
      height: 192,
    });
    expect(first?.transform.zIndex).toBe(0);

    const second = result.regions[1];
    expect(second?.id).toBe("screen-3264-output");
    expect(second?.logicalScreenId).toBe("screen-3264");
    expect(second?.source).toEqual({ x: 0, y: 0, width: 3264, height: 192 });
    expect(second?.destination).toEqual({
      x: 0,
      y: 192,
      width: 3264,
      height: 192,
    });
    expect(second?.transform.zIndex).toBe(1);
  });

  it("produces a mapping that passes strict validation", () => {
    expect(
      validatePerimeterMapping(applyStackedTemplate(virkidConfig)).valid,
    ).toBe(true);
  });

  it("leaves configs without logical screens unchanged", () => {
    const other: PerimeterDisplayConfig = {
      ...virkidConfig,
      logicalScreens: {},
    };
    expect(applyStackedTemplate(other)).toBe(other);
  });
});
