import type { PerimeterDisplayConfig } from "../types";

const identityTransform = (zIndex: number) => ({
  rotation: 0 as const,
  flipX: false,
  flipY: false,
  allowScaling: false,
  allowClipping: false,
  allowSourceOverlap: false,
  allowDestinationOverlap: false,
  zIndex,
});

export const capturedVikinConfiguration: PerimeterDisplayConfig = {
  version: 1,
  revision: "vikin-capture-1",
  renderer: "resolume",
  framebuffer: { width: 8448, height: 192, background: "black" },
  logicalScreens: {
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
  },
  compatibilityKeys: {
    base: { "1": "screen-48", "3": "screen-40" },
    overlay: { "2": "screen-48", "4": "screen-40" },
  },
  regions: [
    {
      id: "screen-48-output",
      logicalScreenId: "screen-48",
      source: { x: 0, y: 0, width: 4608, height: 192 },
      destination: { x: 0, y: 0, width: 4608, height: 192 },
      transform: identityTransform(0),
    },
    {
      id: "screen-40-output",
      logicalScreenId: "screen-40",
      source: { x: 0, y: 0, width: 3840, height: 192 },
      destination: { x: 4608, y: 0, width: 3840, height: 192 },
      transform: identityTransform(1),
    },
  ],
  playback: { cueDurationMs: 20_000, videoPolicy: "fit-to-cue" },
};

export const secondStadiumWebConfiguration: PerimeterDisplayConfig = {
  version: 1,
  revision: "second-stadium-web-example-1",
  renderer: "web",
  framebuffer: { width: 3840, height: 108, background: "black" },
  logicalScreens: {
    "screen-west": {
      id: "screen-west",
      name: "West strip",
      width: 1920,
      height: 108,
    },
    "screen-east": {
      id: "screen-east",
      name: "East strip",
      width: 1920,
      height: 108,
    },
  },
  compatibilityKeys: {
    base: { "1": "screen-west", "3": "screen-east" },
    overlay: { "2": "screen-west", "4": "screen-east" },
  },
  regions: [
    {
      id: "screen-west-output",
      logicalScreenId: "screen-west",
      source: { x: 0, y: 0, width: 1920, height: 108 },
      destination: { x: 0, y: 0, width: 1920, height: 108 },
      transform: identityTransform(0),
    },
    {
      id: "screen-east-output",
      logicalScreenId: "screen-east",
      source: { x: 0, y: 0, width: 1920, height: 108 },
      destination: { x: 1920, y: 0, width: 1920, height: 108 },
      transform: identityTransform(1),
    },
  ],
  playback: { cueDurationMs: 20_000, videoPolicy: "fit-to-cue" },
};
