import type {
  PerimeterDisplayConfig,
  PerimeterRect,
  PerimeterRegion,
} from "../types";

function defaultTransform(zIndex: number) {
  return {
    rotation: 0 as const,
    flipX: false,
    flipY: false,
    allowScaling: false,
    allowClipping: false,
    allowSourceOverlap: false,
    allowDestinationOverlap: false,
    zIndex,
  };
}

export function identityRegion(
  screenId: string,
  destination: PerimeterRect,
  id = `${screenId}-identity`,
): PerimeterRegion | undefined {
  return {
    id,
    logicalScreenId: screenId,
    source: { ...destination, x: 0, y: 0 },
    destination,
    transform: defaultTransform(0),
  };
}

export function applyIdentityTemplate(
  config: PerimeterDisplayConfig,
  screenId: string,
  destination: PerimeterRect,
): PerimeterDisplayConfig {
  const screen = config.logicalScreens[screenId];
  if (!screen) return config;
  const region = identityRegion(screenId, {
    ...destination,
    width: screen.width,
    height: screen.height,
  });
  if (!region) return config;
  return {
    ...config,
    regions: [
      ...config.regions.filter((entry) => entry.logicalScreenId !== screenId),
      region,
    ],
  };
}

export function applyHorizontalSplitTemplate(
  config: PerimeterDisplayConfig,
  screenId: string,
  destinations: PerimeterRect[],
): PerimeterDisplayConfig {
  const screen = config.logicalScreens[screenId];
  if (!screen || destinations.length === 0) return config;
  const totalWidth = destinations.reduce((sum, rect) => sum + rect.width, 0);
  if (totalWidth !== screen.width) return config;

  let sourceX = 0;
  const regions = destinations.map((destination, index) => {
    const region: PerimeterRegion = {
      id: `${screenId}-split-${index + 1}`,
      logicalScreenId: screenId,
      source: {
        x: sourceX,
        y: 0,
        width: destination.width,
        height: screen.height,
      },
      destination: { ...destination, height: screen.height },
      transform: defaultTransform(index),
    };
    sourceX += destination.width;
    return region;
  });

  return {
    ...config,
    regions: [
      ...config.regions.filter((entry) => entry.logicalScreenId !== screenId),
      ...regions,
    ],
  };
}

// The physically verified Víkin úti (vikuti) layout captured from the
// Resolume Advanced Output (see vikin-gateway web-renderer-handoff
// default-venue.json): one 3840x1080 framebuffer with screen-40 as a single
// strip at y=0 and screen-48 split into two stacked halves below it. The
// first half keeps the captured calibration (destination x=-2, width 2308)
// and is the only region permitted to scale or clip.
function vikinOutdoorRegions(
  screens: PerimeterDisplayConfig["logicalScreens"],
): PerimeterRegion[] {
  const screen48 = screens["screen-48"];
  const screen40 = screens["screen-40"];
  if (!screen48 || !screen40) return [];

  return [
    {
      id: "screen-40-full",
      logicalScreenId: "screen-40",
      source: { x: 0, y: 0, width: screen40.width, height: screen40.height },
      destination: {
        x: 0,
        y: 0,
        width: screen40.width,
        height: screen40.height,
      },
      transform: defaultTransform(0),
    },
    {
      id: "screen-48-left-half",
      logicalScreenId: "screen-48",
      source: {
        x: 0,
        y: 0,
        width: Math.floor(screen48.width / 2),
        height: screen48.height,
      },
      destination: { x: -2, y: 192, width: 2308, height: screen48.height },
      transform: {
        ...defaultTransform(0),
        allowScaling: true,
        allowClipping: true,
      },
    },
    {
      id: "screen-48-right-half",
      logicalScreenId: "screen-48",
      source: {
        x: Math.ceil(screen48.width / 2),
        y: 0,
        width: Math.floor(screen48.width / 2),
        height: screen48.height,
      },
      destination: {
        x: 0,
        y: 384,
        width: Math.floor(screen48.width / 2),
        height: screen48.height,
      },
      transform: defaultTransform(0),
    },
  ];
}

// Replaces the draft's regions with the verified Vikin-outdoor physical
// layout when the draft carries the captured screen-48/screen-40 logical
// screens; other configurations are returned unchanged.
export function applyVikinOutdoorTemplate(
  config: PerimeterDisplayConfig,
): PerimeterDisplayConfig {
  const regions = vikinOutdoorRegions(config.logicalScreens);
  if (regions.length === 0) return config;
  return {
    ...config,
    framebuffer: { ...config.framebuffer, width: 3840, height: 1080 },
    regions,
  };
}

// Stacks every logical screen as one full-width strip, widest first. Applied
// to the Virkið logical screens (screen-3648 + screen-3264) this reproduces
// the published staging configuration exactly: a 3648x384 framebuffer with
// screen-3648 at y=0 and screen-3264 at y=192. Configurations without
// logical screens are returned unchanged.
export function applyStackedTemplate(
  config: PerimeterDisplayConfig,
): PerimeterDisplayConfig {
  const screens = Object.values(config.logicalScreens);
  if (screens.length === 0) return config;
  const ordered = [...screens].sort((a, b) => b.width - a.width);
  let y = 0;
  const regions = ordered.map((screen, index) => {
    const region: PerimeterRegion = {
      id: `${screen.id}-output`,
      logicalScreenId: screen.id,
      source: { x: 0, y: 0, width: screen.width, height: screen.height },
      destination: { x: 0, y, width: screen.width, height: screen.height },
      transform: defaultTransform(index),
    };
    y += screen.height;
    return region;
  });
  return {
    ...config,
    framebuffer: {
      ...config.framebuffer,
      width: Math.max(...ordered.map((screen) => screen.width)),
      height: ordered.reduce((sum, screen) => sum + screen.height, 0),
    },
    regions,
  };
}

export function calibrationLabels(config: PerimeterDisplayConfig): string[] {
  return config.regions.map(
    (region) =>
      `${region.id}: ${region.logicalScreenId} source ${region.source.x},${region.source.y} -> destination ${region.destination.x},${region.destination.y}`,
  );
}
