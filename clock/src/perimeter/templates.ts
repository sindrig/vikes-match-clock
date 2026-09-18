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

export function calibrationLabels(config: PerimeterDisplayConfig): string[] {
  return config.regions.map(
    (region) =>
      `${region.id}: ${region.logicalScreenId} source ${region.source.x},${region.source.y} -> destination ${region.destination.x},${region.destination.y}`,
  );
}
