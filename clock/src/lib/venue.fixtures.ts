import type { PerimeterDisplayConfig } from "../types";

// Small mapping for venue metadata/consumer tests. Physical geometry remains
// covered by perimeter/fixtures.spec.ts and perimeterMapping.spec.ts.
export const minimalPerimeterDisplay: PerimeterDisplayConfig = {
  version: 1,
  revision: "venue-mapping",
  renderer: "web",
  framebuffer: { width: 2, height: 1, background: "black" },
  logicalScreens: {
    strip: { id: "strip", name: "Strip", width: 2, height: 1 },
  },
  compatibilityKeys: { base: { "1": "strip" }, overlay: { "2": "strip" } },
  regions: [
    {
      id: "region",
      logicalScreenId: "strip",
      source: { x: 0, y: 0, width: 2, height: 1 },
      destination: { x: 0, y: 0, width: 2, height: 1 },
      transform: {
        rotation: 0,
        flipX: false,
        flipY: false,
        allowScaling: false,
        allowClipping: false,
        allowSourceOverlap: false,
        allowDestinationOverlap: false,
        zIndex: 0,
      },
    },
  ],
  playback: { cueDurationMs: 20_000, videoPolicy: "fit-to-cue" },
};
