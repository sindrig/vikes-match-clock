import type {
  GoalScorerOverlayCommand,
  ScorerCelebrationStyle,
} from "../types";
import {
  type BandRenderingContext,
  type BandUnitMotion,
  SCORER_BAND_STYLE,
  type BandUnit,
  type ScorerBandDeps,
  defaultScorerBandDeps,
  drawBandUnit,
  layoutBandUnit,
  scorerBandFonts,
} from "./scorerCompositor";

// The default presentation used whenever the venue has not chosen a style.
export const DEFAULT_SCORER_CELEBRATION_STYLE: ScorerCelebrationStyle =
  "ribbon";

// Shared entrance timeline (milliseconds after the scorer texture becomes
// visible). Every style shares the same impact flash and general pacing so
// switching styles keeps the match-day rhythm predictable.
export const SCORER_PRESENTATION_TIMELINE = {
  // Full-width impact flash that fades out.
  flashMs: 140,
  // The red wipe edge crosses the screen width within this window.
  wipeMs: 450,
  // Foreground units reveal inside [revealStartMs, revealStartMs + revealMs].
  revealStartMs: 180,
  revealMs: 620,
  // Period of the ambient pulses and sweeps.
  pulsePeriodMs: 4000,
} as const;

// Fixed palette. The red mirrors the club accent used elsewhere on the
// scoreboard; the background stays near black so white text keeps contrast.
export const SCORER_PRESENTATION_COLORS = {
  backgroundTop: "#0b0b10",
  backgroundBottom: "#1c0409",
  accent: "#c8102e",
  accentDeep: "#5c0a18",
  accentGlow: "#e8465c",
  white: "#ffffff",
} as const;

const TAU = Math.PI * 2;

export interface ScorerPresentation {
  readonly canvas: HTMLCanvasElement;
  // Draws the frame elapsedMs after the presentation first became visible.
  // Deterministic: the same elapsed time always produces the same frame.
  draw(elapsedMs: number): void;
}

// The subset of the 2D context the presentations use, narrowed so tests can
// provide a recording context without DOM rasterization.
export interface PresentationRenderingContext extends BandRenderingContext {
  globalAlpha: number;
  globalCompositeOperation: string;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  closePath(): void;
  fill(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): CanvasGradient;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): CanvasGradient;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function easeOutCubic(value: number): number {
  const inverted = 1 - clamp01(value);
  return 1 - inverted * inverted * inverted;
}

function channel(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// Linear blend of two #rrggbb colors, for deterministic background breathing.
function mixColor(first: string, second: string, amount: number): string {
  const a = channel(first);
  const b = channel(second);
  const mixed = a.map((component, index) =>
    Math.round(component + (b[index]! - component) * clamp01(amount)),
  );
  return `rgb(${mixed[0]},${mixed[1]},${mixed[2]})`;
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channel(hex);
  return `rgba(${r},${g},${b},${Math.round(clamp01(alpha) * 100) / 100})`;
}

interface PresentationLayout {
  width: number;
  height: number;
  unit: BandUnit;
  source: { width: number; height: number };
  image: HTMLImageElement;
}

// Deterministic wrap for a travelling element: returns its x position while
// it moves right-to-left and re-enters from the right edge.
function travellingX(
  elapsedMs: number,
  speedPxPerMs: number,
  loopWidth: number,
  phase: number,
): number {
  return (
    loopWidth -
    (((elapsedMs * speedPxPerMs) / loopWidth + phase) % 1) * loopWidth
  );
}

// A slanted streak polygon: top edge at `x`, sheared left by the band height
// so the streak reads as speed rather than a static rectangle.
function drawStreakShape(
  context: PresentationRenderingContext,
  x: number,
  bandWidth: number,
  height: number,
  fill: string,
): void {
  const shear = height;
  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x + bandWidth, 0);
  context.lineTo(x + bandWidth - shear, height);
  context.lineTo(x - shear, height);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function drawDiagonalStreaks(
  context: PresentationRenderingContext,
  layout: PresentationLayout,
  elapsedMs: number,
  streaks: { speedPxPerMs: number; bandWidth: number; alpha: number }[],
): void {
  const loopWidth = layout.width + layout.height * 3;
  for (const streak of streaks) {
    const x = travellingX(elapsedMs, streak.speedPxPerMs, loopWidth, 0);
    drawStreakShape(
      context,
      x,
      streak.bandWidth,
      layout.height,
      withAlpha(SCORER_PRESENTATION_COLORS.accent, streak.alpha),
    );
  }
}

function drawBaseBackground(
  context: PresentationRenderingContext,
  layout: PresentationLayout,
  elapsedMs: number,
  breathStrength: number,
): void {
  const breath =
    0.5 +
    0.5 *
      Math.sin((elapsedMs / SCORER_PRESENTATION_TIMELINE.pulsePeriodMs) * TAU);
  const gradient = context.createLinearGradient(0, 0, 0, layout.height);
  gradient.addColorStop(
    0,
    mixColor(
      SCORER_PRESENTATION_COLORS.backgroundTop,
      SCORER_PRESENTATION_COLORS.accentDeep,
      breath * breathStrength,
    ),
  );
  gradient.addColorStop(1, SCORER_PRESENTATION_COLORS.backgroundBottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, layout.width, layout.height);
}

// A soft vertical glow band used both for the entrance wipe edge and the
// ambient sweeps travelling behind the scorer units.
function drawGlowBand(
  context: PresentationRenderingContext,
  layout: PresentationLayout,
  centerX: number,
  halfWidth: number,
  peakAlpha: number,
): void {
  const left = centerX - halfWidth;
  const gradient = context.createLinearGradient(
    left,
    0,
    centerX + halfWidth,
    0,
  );
  gradient.addColorStop(0, withAlpha(SCORER_PRESENTATION_COLORS.accentGlow, 0));
  gradient.addColorStop(
    0.5,
    withAlpha(SCORER_PRESENTATION_COLORS.accentGlow, peakAlpha),
  );
  gradient.addColorStop(1, withAlpha(SCORER_PRESENTATION_COLORS.accentGlow, 0));
  context.globalCompositeOperation = "lighter";
  context.fillStyle = gradient;
  context.fillRect(left, 0, halfWidth * 2, layout.height);
  context.globalCompositeOperation = "source-over";
}

function drawPortraitGlow(
  context: PresentationRenderingContext,
  centerX: number,
  centerY: number,
  radius: number,
  alpha: number,
): void {
  const gradient = context.createRadialGradient(
    centerX,
    centerY,
    radius * 0.1,
    centerX,
    centerY,
    radius,
  );
  gradient.addColorStop(
    0,
    withAlpha(SCORER_PRESENTATION_COLORS.accentGlow, alpha),
  );
  gradient.addColorStop(1, withAlpha(SCORER_PRESENTATION_COLORS.accentGlow, 0));
  context.globalCompositeOperation = "lighter";
  context.fillStyle = gradient;
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  context.globalCompositeOperation = "source-over";
}

// Foreground reveal geometry: the units wipe in left-to-right once the
// reveal window starts, ending fully visible at the end of the window.
function revealFraction(elapsedMs: number): number {
  const { revealStartMs, revealMs } = SCORER_PRESENTATION_TIMELINE;
  return easeOutCubic((elapsedMs - revealStartMs) / revealMs);
}

function drawRevealedUnits(
  context: PresentationRenderingContext,
  layout: PresentationLayout,
  elapsedMs: number,
  originOffset: number,
  motionAt: (index: number) => BandUnitMotion,
): void {
  const { width, height, unit } = layout;
  const reveal = revealFraction(elapsedMs);
  context.save();
  if (reveal < 1) {
    context.beginPath();
    context.rect(0, 0, Math.max(0, reveal * width), height);
    context.clip();
  }
  const firstIndex = Math.floor(Math.max(0, -originOffset) / unit.unitWidth);
  const startIndex = originOffset <= 0 ? firstIndex : 0;
  let index = startIndex;
  for (let x = originOffset + index * unit.unitWidth; x < width; index += 1) {
    drawBandUnit(
      context,
      layout.image,
      layout.source,
      unit,
      x,
      height,
      motionAt(index),
    );
    x += unit.unitWidth;
  }
  context.restore();
}

// The recommended style: deep red kinetic ribbon. Diagonal streaks race
// right-to-left, a red wipe edge announces the band, an ambient glow sweeps
// behind the units every pulse period, and the white impact flash fades
// into the reveal.
function drawRibbon(
  context: PresentationRenderingContext,
  layout: PresentationLayout,
  elapsedMs: number,
): void {
  drawBaseBackground(context, layout, elapsedMs, 0.22);
  drawDiagonalStreaks(context, layout, elapsedMs, [
    { speedPxPerMs: 2.1, bandWidth: layout.height * 0.5, alpha: 0.16 },
    { speedPxPerMs: 1.3, bandWidth: layout.height * 0.9, alpha: 0.22 },
    { speedPxPerMs: 0.7, bandWidth: layout.height * 1.6, alpha: 0.12 },
  ]);

  const { wipeMs } = SCORER_PRESENTATION_TIMELINE;
  const wipe = easeOutCubic(elapsedMs / wipeMs);
  if (wipe < 1) {
    drawGlowBand(
      context,
      layout,
      wipe * layout.width,
      layout.height * 0.6,
      0.5 * (1 - wipe),
    );
  }

  const sweepPhase =
    (elapsedMs / SCORER_PRESENTATION_TIMELINE.pulsePeriodMs) % 1;
  const sweepX =
    sweepPhase * (layout.width + layout.height * 3) - layout.height * 1.5;
  drawGlowBand(
    context,
    layout,
    sweepX,
    layout.height * 1.1,
    0.3 * Math.sin(Math.PI * sweepPhase),
  );

  drawRevealedUnits(context, layout, elapsedMs, 0, () => ({}));

  if (elapsedMs < SCORER_PRESENTATION_TIMELINE.flashMs) {
    const progress = 1 - elapsedMs / SCORER_PRESENTATION_TIMELINE.flashMs;
    context.fillStyle = withAlpha(
      SCORER_PRESENTATION_COLORS.white,
      0.85 * progress * progress,
    );
    context.fillRect(0, 0, layout.width, layout.height);
  }
}

// Style 1: giant low-contrast MARK lettering scrolls right-to-left behind
// the static scorer band while thin speed lines race the other way.
function drawTunnel(
  context: PresentationRenderingContext,
  layout: PresentationLayout,
  elapsedMs: number,
  markUnitWidth: number,
): void {
  drawBaseBackground(context, layout, elapsedMs, 0.12);
  const fontSize = Math.round(layout.height * 0.85);
  const scroll = (elapsedMs * 0.055) % markUnitWidth;
  context.fillStyle = withAlpha(SCORER_PRESENTATION_COLORS.accent, 0.3);
  context.font = `700 ${fontSize}px ${SCORER_BAND_STYLE.fontFamily}`;
  context.textBaseline = "middle";
  for (let x = -scroll; x < layout.width; x += markUnitWidth) {
    context.fillText("MARK", x, layout.height / 2);
  }
  drawDiagonalStreaks(context, layout, elapsedMs, [
    { speedPxPerMs: 3.1, bandWidth: 2, alpha: 0.2 },
    { speedPxPerMs: 2.2, bandWidth: 2, alpha: 0.14 },
    { speedPxPerMs: 1.4, bandWidth: 3, alpha: 0.1 },
  ]);
  drawRevealedUnits(context, layout, elapsedMs, 0, () => ({}));
  if (elapsedMs < SCORER_PRESENTATION_TIMELINE.flashMs) {
    const progress = 1 - elapsedMs / SCORER_PRESENTATION_TIMELINE.flashMs;
    context.fillStyle = withAlpha(
      SCORER_PRESENTATION_COLORS.white,
      0.85 * progress * progress,
    );
    context.fillRect(0, 0, layout.width, layout.height);
  }
}

// Style 2: red energy radiating from every portrait with a bright pulse
// travelling along the band, while the whole background breathes.
function drawWave(
  context: PresentationRenderingContext,
  layout: PresentationLayout,
  elapsedMs: number,
): void {
  drawBaseBackground(context, layout, elapsedMs, 0.4);

  const centerY = layout.height / 2;
  const radiusBase = layout.height * 0.9;
  const count = Math.ceil(layout.width / layout.unit.unitWidth);
  for (let index = 0; index < count; index += 1) {
    const phase = index * 0.9;
    const radius =
      radiusBase * (1 + 0.3 * Math.sin((elapsedMs / 3000) * TAU + phase));
    drawPortraitGlow(
      context,
      index * layout.unit.unitWidth + layout.unit.portraitWidth / 2,
      centerY,
      radius,
      0.4,
    );
  }

  const lineHeight = Math.max(2, Math.round(layout.height * 0.03));
  context.fillStyle = withAlpha(SCORER_PRESENTATION_COLORS.accent, 0.2);
  context.fillRect(0, centerY - lineHeight / 2, layout.width, lineHeight);
  const pulseX = (elapsedMs * 0.28) % layout.width;
  drawPortraitGlow(context, pulseX, centerY, layout.height * 0.55, 0.8);

  drawRevealedUnits(context, layout, elapsedMs, 0, () => ({}));
  if (elapsedMs < SCORER_PRESENTATION_TIMELINE.flashMs) {
    const progress = 1 - elapsedMs / SCORER_PRESENTATION_TIMELINE.flashMs;
    context.fillStyle = withAlpha(
      SCORER_PRESENTATION_COLORS.white,
      0.85 * progress * progress,
    );
    context.fillRect(0, 0, layout.width, layout.height);
  }
}

// Style 3: the repeated scorer units themselves drift slowly right-to-left
// so the whole procession visibly moves around the perimeter.
function drawProcession(
  context: PresentationRenderingContext,
  layout: PresentationLayout,
  elapsedMs: number,
): void {
  drawBaseBackground(context, layout, elapsedMs, 0.18);
  drawDiagonalStreaks(context, layout, elapsedMs, [
    { speedPxPerMs: 0.55, bandWidth: layout.height * 1.2, alpha: 0.12 },
  ]);

  const speedPxPerMs = layout.height * 0.00012;
  const offset = -((elapsedMs * speedPxPerMs) % layout.unit.unitWidth);
  const entrance = easeOutCubic(elapsedMs / 600);
  drawRevealedUnits(context, layout, elapsedMs, offset, () => ({
    alpha: entrance,
  }));

  if (elapsedMs < SCORER_PRESENTATION_TIMELINE.flashMs) {
    const progress = 1 - elapsedMs / SCORER_PRESENTATION_TIMELINE.flashMs;
    context.fillStyle = withAlpha(
      SCORER_PRESENTATION_COLORS.white,
      0.85 * progress * progress,
    );
    context.fillRect(0, 0, layout.width, layout.height);
  }
}

// Style 5: the portrait pops with a scale-down entrance and a pulsing glow
// while the number and name slide in slightly later.
function drawCutout(
  context: PresentationRenderingContext,
  layout: PresentationLayout,
  elapsedMs: number,
): void {
  drawBaseBackground(context, layout, elapsedMs, 0.25);

  const centerY = layout.height / 2;
  const count = Math.ceil(layout.width / layout.unit.unitWidth);
  const glowAlpha =
    0.22 +
    0.16 *
      Math.sin((elapsedMs / SCORER_PRESENTATION_TIMELINE.pulsePeriodMs) * TAU);
  for (let index = 0; index < count; index += 1) {
    drawPortraitGlow(
      context,
      index * layout.unit.unitWidth + layout.unit.portraitWidth / 2,
      centerY,
      layout.height * 1.1,
      glowAlpha,
    );
  }

  const entrance = easeOutCubic(clamp01(elapsedMs / 650));
  const portraitScale = 1.35 - 0.35 * entrance;
  const textProgress = easeOutCubic((elapsedMs - 150) / 500);
  const textOffset = (1 - textProgress) * layout.height * 0.35;
  const textAlpha = clamp01((elapsedMs - 250) / 450);
  drawRevealedUnits(context, layout, elapsedMs, 0, () => ({
    portraitScale,
    textOffsetX: textOffset,
    textAlpha,
  }));

  if (elapsedMs < SCORER_PRESENTATION_TIMELINE.flashMs) {
    const progress = 1 - elapsedMs / SCORER_PRESENTATION_TIMELINE.flashMs;
    context.fillStyle = withAlpha(
      SCORER_PRESENTATION_COLORS.white,
      0.85 * progress * progress,
    );
    context.fillRect(0, 0, layout.width, layout.height);
  }
}

// Creates one animated presentation for a logical screen: a canvas that can
// redraw the scorer band at any elapsed time for the requested style.
export async function createScorerPresentation(
  style: ScorerCelebrationStyle,
  player: { name: string; number: string },
  source: HTMLImageElement,
  width: number,
  height: number,
  deps: ScorerBandDeps = defaultScorerBandDeps,
): Promise<ScorerPresentation> {
  await deps.loadFonts(scorerBandFonts(height));
  const canvas = deps.createCanvas(width, height);
  const context = canvas.getContext(
    "2d",
  ) as PresentationRenderingContext | null;
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  const sourceSize = {
    width: source.naturalWidth,
    height: source.naturalHeight,
  };
  const layout: PresentationLayout = {
    width,
    height,
    unit: layoutBandUnit(
      sourceSize,
      player.number,
      player.name,
      height,
      context,
    ),
    source: sourceSize,
    image: source,
  };

  const markFontSize = Math.round(height * 0.85);
  context.font = `700 ${markFontSize}px ${SCORER_BAND_STYLE.fontFamily}`;
  const markUnitWidth =
    Math.ceil(context.measureText("MARK").width) + Math.round(height * 0.35);

  const draw = (elapsedMs: number): void => {
    context.clearRect(0, 0, width, height);
    switch (style) {
      case "tunnel":
        drawTunnel(context, layout, Math.max(0, elapsedMs), markUnitWidth);
        break;
      case "wave":
        drawWave(context, layout, Math.max(0, elapsedMs));
        break;
      case "procession":
        drawProcession(context, layout, Math.max(0, elapsedMs));
        break;
      case "cutout":
        drawCutout(context, layout, Math.max(0, elapsedMs));
        break;
      case "ribbon":
      default:
        drawRibbon(context, layout, Math.max(0, elapsedMs));
        break;
    }
  };
  return { canvas, draw };
}

// Creates one presentation per configured overlay logical screen, keyed by
// logical screen id. One command preparation produces the complete map
// required for atomic activation.
export async function createScorerPresentations(
  style: ScorerCelebrationStyle,
  command: GoalScorerOverlayCommand,
  source: HTMLImageElement,
  screens: readonly { id: string; width: number; height: number }[],
  deps: ScorerBandDeps = defaultScorerBandDeps,
): Promise<Record<string, ScorerPresentation>> {
  const presentations: Record<string, ScorerPresentation> = {};
  for (const screen of screens) {
    presentations[screen.id] = await createScorerPresentation(
      style,
      command.player,
      source,
      screen.width,
      screen.height,
      deps,
    );
  }
  return presentations;
}
