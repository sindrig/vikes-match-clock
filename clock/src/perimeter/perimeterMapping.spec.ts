import { describe, expect, it } from "vitest";
import type { PerimeterDisplayConfig, PerimeterRegion } from "../types";
import { validatePerimeterMapping } from "./perimeterMapping";

const transform = (overrides: Partial<PerimeterRegion["transform"]> = {}) => ({
  rotation: 0 as const,
  flipX: false,
  flipY: false,
  allowScaling: false,
  allowClipping: false,
  allowSourceOverlap: false,
  allowDestinationOverlap: false,
  zIndex: 0,
  ...overrides,
});

const baseConfig = (regions: PerimeterRegion[]): PerimeterDisplayConfig => ({
  version: 1,
  revision: "revision-1",
  renderer: "web",
  framebuffer: { width: 8, height: 4, background: "black" },
  logicalScreens: {
    screen: { id: "screen", name: "Screen", width: 8, height: 4 },
  },
  compatibilityKeys: { base: { "1": "screen" }, overlay: {} },
  regions,
  playback: { cueDurationMs: 20_000, videoPolicy: "fit-to-cue" },
});

describe("validatePerimeterMapping", () => {
  it("accepts an identity mapping", () => {
    const result = validatePerimeterMapping(
      baseConfig([
        {
          id: "identity",
          logicalScreenId: "screen",
          source: { x: 0, y: 0, width: 8, height: 4 },
          destination: { x: 0, y: 0, width: 8, height: 4 },
          transform: transform(),
        },
      ]),
    );

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("accepts a horizontal split with exact source coverage", () => {
    const result = validatePerimeterMapping(
      baseConfig([
        {
          id: "left",
          logicalScreenId: "screen",
          source: { x: 0, y: 0, width: 4, height: 4 },
          destination: { x: 0, y: 0, width: 4, height: 4 },
          transform: transform(),
        },
        {
          id: "right",
          logicalScreenId: "screen",
          source: { x: 4, y: 0, width: 4, height: 4 },
          destination: { x: 4, y: 0, width: 4, height: 4 },
          transform: transform({ zIndex: 1 }),
        },
      ]),
    );

    expect(result.valid).toBe(true);
  });

  it.each([
    [
      "fractional geometry",
      { source: { x: 0.5, y: 0, width: 8, height: 4 } },
      "invalid-geometry",
    ],
    [
      "source bounds",
      { source: { x: 7, y: 0, width: 2, height: 4 } },
      "source-out-of-bounds",
    ],
    [
      "destination bounds",
      { destination: { x: 7, y: 0, width: 2, height: 4 } },
      "destination-out-of-bounds",
    ],
    [
      "scaling",
      { destination: { x: 0, y: 0, width: 4, height: 4 } },
      "scaling-not-allowed",
    ],
  ])("rejects %s", (_label, override, code) => {
    const region: PerimeterRegion = {
      id: "region",
      logicalScreenId: "screen",
      source: { x: 0, y: 0, width: 8, height: 4 },
      destination: { x: 0, y: 0, width: 8, height: 4 },
      transform: transform(),
      ...override,
    };
    const result = validatePerimeterMapping(baseConfig([region]));
    expect(result.errors.some((error) => error.code === code)).toBe(true);
  });

  it("rejects gaps, duplicate source pixels, and ambiguous destination overlap", () => {
    const gap = validatePerimeterMapping(
      baseConfig([
        {
          id: "gap",
          logicalScreenId: "screen",
          source: { x: 0, y: 0, width: 7, height: 4 },
          destination: { x: 0, y: 0, width: 7, height: 4 },
          transform: transform(),
        },
      ]),
    );
    expect(gap.errors.some((error) => error.code === "source-gap")).toBe(true);

    const overlap = validatePerimeterMapping(
      baseConfig([
        {
          id: "first",
          logicalScreenId: "screen",
          source: { x: 0, y: 0, width: 8, height: 4 },
          destination: { x: 0, y: 0, width: 4, height: 4 },
          transform: transform({ allowScaling: true }),
        },
        {
          id: "second",
          logicalScreenId: "screen",
          source: { x: 0, y: 0, width: 8, height: 4 },
          destination: { x: 2, y: 0, width: 4, height: 4 },
          transform: transform({ allowScaling: true }),
        },
      ]),
    );
    expect(
      overlap.errors.some((error) => error.code === "source-overlap"),
    ).toBe(true);
    expect(
      overlap.errors.some((error) => error.code === "destination-overlap"),
    ).toBe(true);
  });

  it("accepts explicit clipping, scaling, and ordered overlap", () => {
    const result = validatePerimeterMapping(
      baseConfig([
        {
          id: "first",
          logicalScreenId: "screen",
          source: { x: 0, y: 0, width: 8, height: 4 },
          destination: { x: -2, y: 0, width: 8, height: 4 },
          transform: transform({
            allowScaling: true,
            allowClipping: true,
            allowDestinationOverlap: true,
            zIndex: 1,
          }),
        },
      ]),
    );

    expect(result.valid).toBe(true);
  });
});
