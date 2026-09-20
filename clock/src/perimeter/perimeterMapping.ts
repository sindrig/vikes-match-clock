import type {
  PerimeterDisplayConfig,
  PerimeterLogicalScreen,
  PerimeterRect,
  PerimeterRegion,
} from "../types";

export interface MappingValidationError {
  code:
    | "invalid-geometry"
    | "invalid-playback"
    | "source-out-of-bounds"
    | "source-gap"
    | "source-overlap"
    | "destination-out-of-bounds"
    | "scaling-not-allowed"
    | "unsupported-rotation"
    | "destination-overlap"
    | "unknown-screen";
  message: string;
  regionIds?: string[];
  screenId?: string;
}

export interface MappingValidationResult {
  valid: boolean;
  errors: MappingValidationError[];
}

const rotations = new Set([0, 90, 180, 270]);

function isInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value);
}

function isRect(rect: PerimeterRect): boolean {
  return (
    isInteger(rect.x) &&
    isInteger(rect.y) &&
    isInteger(rect.width) &&
    isInteger(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function intersects(a: PerimeterRect, b: PerimeterRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function expectedDestinationSize(region: PerimeterRegion): {
  width: number;
  height: number;
} {
  if (region.transform.rotation === 90 || region.transform.rotation === 270) {
    return { width: region.source.height, height: region.source.width };
  }
  return { width: region.source.width, height: region.source.height };
}

function pixelKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function sourceCoverageErrors(
  screen: PerimeterLogicalScreen,
  regions: PerimeterRegion[],
): MappingValidationError[] {
  const coverage = new Map<string, PerimeterRegion[]>();
  for (const region of regions) {
    for (
      let y = region.source.y;
      y < region.source.y + region.source.height;
      y += 1
    ) {
      for (
        let x = region.source.x;
        x < region.source.x + region.source.width;
        x += 1
      ) {
        const key = pixelKey(x, y);
        const existing = coverage.get(key) ?? [];
        existing.push(region);
        coverage.set(key, existing);
      }
    }
  }

  const errors: MappingValidationError[] = [];
  let gapCount = 0;
  let firstGap: string | undefined;

  for (let y = 0; y < screen.height; y += 1) {
    for (let x = 0; x < screen.width; x += 1) {
      const covered = coverage.get(pixelKey(x, y)) ?? [];
      if (covered.length === 0) {
        gapCount += 1;
        firstGap ??= pixelKey(x, y);
      }
      if (
        covered.length > 1 &&
        !covered.every((region) => region.transform.allowSourceOverlap)
      ) {
        errors.push({
          code: "source-overlap",
          message: `Source regions overlap on ${screen.id} at ${pixelKey(x, y)}.`,
          regionIds: covered.map((region) => region.id),
          screenId: screen.id,
        });
        return errors;
      }
    }
  }

  if (gapCount > 0) {
    errors.push({
      code: "source-gap",
      message: `Source coverage for ${screen.id} has ${gapCount} uncovered pixels (first at ${firstGap}).`,
      screenId: screen.id,
    });
  }
  return errors;
}

export function validatePerimeterMapping(
  config: PerimeterDisplayConfig,
): MappingValidationResult {
  const errors: MappingValidationError[] = [];
  const screens = config.logicalScreens;

  if (
    !isInteger(config.framebuffer.width) ||
    !isInteger(config.framebuffer.height) ||
    config.framebuffer.width <= 0 ||
    config.framebuffer.height <= 0
  ) {
    errors.push({
      code: "invalid-geometry",
      message: "Framebuffer dimensions must be positive integers.",
    });
  }

  if (!isInteger(config.playback.cueDurationMs) || config.playback.cueDurationMs <= 0) {
    errors.push({
      code: "invalid-playback",
      message: "Cue duration must be a positive number of milliseconds.",
    });
  }

  for (const region of config.regions) {
    const screen = screens[region.logicalScreenId];
    if (!screen) {
      errors.push({
        code: "unknown-screen",
        message: `Region ${region.id} references unknown screen ${region.logicalScreenId}.`,
        regionIds: [region.id],
      });
      continue;
    }
    if (
      !isRect(region.source) ||
      !isRect(region.destination) ||
      !isInteger(region.transform.zIndex)
    ) {
      errors.push({
        code: "invalid-geometry",
        message: `Region ${region.id} contains non-integer or non-positive geometry.`,
        regionIds: [region.id],
      });
      continue;
    }
    if (!rotations.has(region.transform.rotation)) {
      errors.push({
        code: "unsupported-rotation",
        message: `Region ${region.id} uses unsupported rotation.`,
        regionIds: [region.id],
      });
    }
    if (
      region.source.x < 0 ||
      region.source.y < 0 ||
      region.source.x + region.source.width > screen.width ||
      region.source.y + region.source.height > screen.height
    ) {
      errors.push({
        code: "source-out-of-bounds",
        message: `Region ${region.id} exceeds native screen ${screen.id}.`,
        regionIds: [region.id],
        screenId: screen.id,
      });
    }
    const { width, height } = expectedDestinationSize(region);
    if (
      !region.transform.allowScaling &&
      (region.destination.width !== width ||
        region.destination.height !== height)
    ) {
      errors.push({
        code: "scaling-not-allowed",
        message: `Region ${region.id} changes source dimensions without scaling permission.`,
        regionIds: [region.id],
      });
    }
    if (
      !region.transform.allowClipping &&
      (region.destination.x < 0 ||
        region.destination.y < 0 ||
        region.destination.x + region.destination.width >
          config.framebuffer.width ||
        region.destination.y + region.destination.height >
          config.framebuffer.height)
    ) {
      errors.push({
        code: "destination-out-of-bounds",
        message: `Region ${region.id} exceeds the framebuffer without clipping permission.`,
        regionIds: [region.id],
      });
    }
  }

  for (const screen of Object.values(screens)) {
    errors.push(
      ...sourceCoverageErrors(
        screen,
        config.regions.filter((region) => region.logicalScreenId === screen.id),
      ),
    );
  }

  for (let index = 0; index < config.regions.length; index += 1) {
    const first = config.regions[index];
    if (!first) continue;
    for (
      let otherIndex = index + 1;
      otherIndex < config.regions.length;
      otherIndex += 1
    ) {
      const second = config.regions[otherIndex];
      if (!second || !intersects(first.destination, second.destination))
        continue;
      if (
        !first.transform.allowDestinationOverlap ||
        !second.transform.allowDestinationOverlap ||
        first.transform.zIndex === second.transform.zIndex
      ) {
        errors.push({
          code: "destination-overlap",
          message: `Destination regions ${first.id} and ${second.id} overlap without ordering.`,
          regionIds: [first.id, second.id],
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export const validateMapping = validatePerimeterMapping;
