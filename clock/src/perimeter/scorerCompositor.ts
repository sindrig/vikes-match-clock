import type { GoalScorerOverlayCommand } from "../types";

// Fixed style tokens. All measurements scale from the logical screen height,
// mirroring the Resolume band renderer's multipliers so web composition keeps
// the same look without sharing its rasterization.
export const SCORER_BAND_STYLE = {
  fontFamily: '"GT America"',
  fontWeight: 700,
  fillStyle: "#ffffff",
  gapMultiplier: 0.45,
  numberFontMultiplier: 0.55,
  nameFontMultiplier: 0.28,
  // Maximum width of the name area as a multiple of the band height.
  maxNameWidthMultiplier: 3,
  // The name font shrinks to this fraction of its nominal size before the
  // text is truncated with an ellipsis.
  minNameFontFraction: 0.6,
  minFontSize: 1,
} as const;

export function scorerBandFontSpec(size: number): string {
  return `${SCORER_BAND_STYLE.fontWeight} ${size}px ${SCORER_BAND_STYLE.fontFamily}`;
}

export function bandGap(height: number): number {
  return Math.max(1, Math.round(height * SCORER_BAND_STYLE.gapMultiplier));
}

export function bandNumberFontSize(height: number): number {
  return Math.max(
    SCORER_BAND_STYLE.minFontSize,
    Math.round(height * SCORER_BAND_STYLE.numberFontMultiplier),
  );
}

export function bandNameFontSize(height: number): number {
  return Math.max(
    SCORER_BAND_STYLE.minFontSize,
    Math.round(height * SCORER_BAND_STYLE.nameFontMultiplier),
  );
}

// Font specs the band needs, so preparation can await exactly these faces
// through the browser font-loading API before measuring or drawing.
export function scorerBandFonts(height: number): string[] {
  return [
    scorerBandFontSpec(bandNumberFontSize(height)),
    scorerBandFontSpec(bandNameFontSize(height)),
  ];
}

// A deterministic cover crop of the source image into the band height: the
// drawn region is centered, covers the full target height, and keeps the
// widest source slice that matches the band aspect.
export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }
  const aspect = sourceWidth / sourceHeight;
  let cropWidth = aspect * targetHeight;
  let cropHeight = cropWidth / aspect;
  if (cropWidth > sourceWidth) {
    cropWidth = sourceWidth;
    cropHeight = cropWidth / aspect;
  }
  return {
    sx: (sourceWidth - cropWidth) / 2,
    sy: (sourceHeight - cropHeight) / 2,
    sw: cropWidth,
    sh: cropHeight,
  };
}

// The subset of the 2D context the compositor uses, narrowed so tests can
// provide a recording context without DOM rasterization.
export interface BandRenderingContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textBaseline: CanvasTextBaseline;
  measureText(text: string): { width: number };
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  fillText(text: string, x: number, y: number): void;
}

export interface ScorerBandDeps {
  createCanvas: (width: number, height: number) => HTMLCanvasElement;
  loadFonts: (fonts: string[]) => Promise<void>;
}

export const defaultScorerBandDeps: ScorerBandDeps = {
  createCanvas: (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  loadFonts: (fonts) =>
    Promise.all(fonts.map((font) => document.fonts.load(font))).then(
      () => undefined,
    ),
};

export interface BandUnit {
  portraitWidth: number;
  numberText: string;
  numberFontSize: number;
  numberWidth: number;
  nameText: string;
  nameFontSize: number;
  nameWidth: number;
  gap: number;
  unitWidth: number;
}

// One repeating unit: [cropped portrait] [gap] [number] [gap] [name] [gap].
// The name is measured at its nominal size, reduced toward the defined
// minimum size, and only then truncated, so one unit can never overlap the
// next.
export function layoutBandUnit(
  source: { width: number; height: number },
  numberText: string,
  name: string,
  height: number,
  context: BandRenderingContext,
): BandUnit {
  const { sw, sh } = coverCrop(source.width, source.height, height);
  const portraitWidth =
    sh > 0 ? Math.max(1, Math.round((sw / sh) * height)) : 0;
  const gap = bandGap(height);
  const numberFontSize = bandNumberFontSize(height);
  context.font = scorerBandFontSpec(numberFontSize);
  const numberWidth = numberText
    ? Math.ceil(context.measureText(numberText).width)
    : 0;

  const nominalNameFontSize = bandNameFontSize(height);
  const minimumNameFontSize = Math.max(
    SCORER_BAND_STYLE.minFontSize,
    Math.floor(nominalNameFontSize * SCORER_BAND_STYLE.minNameFontFraction),
  );
  const maxNameWidth = height * SCORER_BAND_STYLE.maxNameWidthMultiplier;
  let nameText = name;
  let nameFontSize = nominalNameFontSize;
  if (nameText) {
    // Shrink the font toward the defined minimum first.
    context.font = scorerBandFontSpec(nameFontSize);
    while (
      nameFontSize > minimumNameFontSize &&
      context.measureText(nameText).width > maxNameWidth
    ) {
      nameFontSize -= 1;
      context.font = scorerBandFontSpec(nameFontSize);
    }
    // Then truncate: keep the longest prefix that fits together with an
    // ellipsis. The candidate is always strictly shorter than the previous
    // one, so the loop terminates.
    if (context.measureText(nameText).width > maxNameWidth) {
      for (let keep = nameText.length - 1; keep >= 1; keep -= 1) {
        const candidate = `${nameText.slice(0, keep).trimEnd()}…`;
        if (context.measureText(candidate).width <= maxNameWidth) {
          nameText = candidate;
          break;
        }
        if (keep === 1) nameText = "…";
      }
    }
  }
  const nameWidth = nameText
    ? Math.ceil(context.measureText(nameText).width)
    : 0;

  return {
    portraitWidth,
    numberText,
    numberFontSize,
    numberWidth,
    nameText,
    nameFontSize,
    nameWidth,
    gap,
    unitWidth: Math.max(
      1,
      portraitWidth + gap + numberWidth + gap + nameWidth + gap,
    ),
  };
}

function drawUnit(
  context: BandRenderingContext,
  image: HTMLImageElement,
  crop: { sx: number; sy: number; sw: number; sh: number },
  unit: BandUnit,
  originX: number,
  height: number,
): void {
  if (unit.portraitWidth > 0 && crop.sw > 0 && crop.sh > 0) {
    context.drawImage(
      image,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      originX,
      0,
      unit.portraitWidth,
      height,
    );
  }
  let cursor = originX + unit.portraitWidth + unit.gap;
  context.fillStyle = SCORER_BAND_STYLE.fillStyle;
  context.textBaseline = "middle";
  if (unit.numberWidth > 0) {
    context.font = scorerBandFontSpec(unit.numberFontSize);
    context.fillText(unit.numberText, cursor, height / 2);
    cursor += unit.numberWidth + unit.gap;
  }
  if (unit.nameWidth > 0) {
    context.font = scorerBandFontSpec(unit.nameFontSize);
    context.fillText(unit.nameText, cursor, height / 2);
  }
}

// Composes one static repeat band at the given logical screen's native
// dimensions. Awaits the required fonts, lays out the unit at the band
// height, and repeats it from left to right until the full width is
// covered; the final repetition is clipped when it would exceed the width.
export async function composeScorerBand(
  player: { name: string; number: string },
  source: HTMLImageElement,
  width: number,
  height: number,
  deps: ScorerBandDeps = defaultScorerBandDeps,
): Promise<HTMLCanvasElement> {
  await deps.loadFonts(scorerBandFonts(height));
  const canvas = deps.createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  const crop = coverCrop(source.naturalWidth, source.naturalHeight, height);
  const unit = layoutBandUnit(
    { width: source.naturalWidth, height: source.naturalHeight },
    player.number,
    player.name,
    height,
    context,
  );
  let x = 0;
  while (x < width) {
    const remaining = width - x;
    const clipped = remaining < unit.unitWidth;
    if (clipped) {
      context.save();
      context.beginPath();
      context.rect(x, 0, remaining, height);
      context.clip();
    }
    drawUnit(context, source, crop, unit, x, height);
    if (clipped) {
      context.restore();
    }
    x += unit.unitWidth;
  }
  return canvas;
}

// Composes one static band per configured overlay logical screen, keyed by
// logical screen id. One command preparation produces the complete map
// required for atomic activation.
export async function composeScorerBands(
  command: GoalScorerOverlayCommand,
  source: HTMLImageElement,
  screens: readonly { id: string; width: number; height: number }[],
  deps: ScorerBandDeps = defaultScorerBandDeps,
): Promise<Record<string, HTMLCanvasElement>> {
  const bands: Record<string, HTMLCanvasElement> = {};
  for (const screen of screens) {
    bands[screen.id] = await composeScorerBand(
      command.player,
      source,
      screen.width,
      screen.height,
      deps,
    );
  }
  return bands;
}
