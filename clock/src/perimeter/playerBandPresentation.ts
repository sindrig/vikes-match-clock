import type { PlayerBandStyle, SubstitutionBandStyle } from "../types";
import {
  type BandRenderingContext,
  type BandUnit,
  type ScorerBandDeps,
  drawBandUnit,
  layoutBandUnit,
  scorerBandFonts,
} from "./scorerCompositor";
import {
  SCORER_PRESENTATION_COLORS,
  type ScorerPresentation,
} from "./scorerPresentation";

// The default player band presentation used whenever the venue has not
// chosen a style (or the persisted value did not parse).
export const DEFAULT_PLAYER_BAND_STYLE: PlayerBandStyle = "plain";
// The default substitution band presentation: holds in place after its
// entrance; no drift.
export const DEFAULT_SUBSTITUTION_BAND_STYLE: SubstitutionBandStyle = "static";

// The scorer "procession" reference speed is `height * 0.00012 px/ms`.
// The player band drifts ~1.5x that, the streamer style ~2x. Speeds are
// defined per style; there is no separate knob.
const PROCESSION_SPEED_PX_PER_MS_PER_HEIGHT = 0.00012;

// Fixed palette for both band channels. The near-black field keeps white
// text and photo contrast; substitution identity text reuses the scorer
// accent red (outgoing) and the main-screen substitution green (incoming).
export const BAND_PRESENTATION_COLORS = {
  background: "#0b0b10",
  accent: SCORER_PRESENTATION_COLORS.accent,
  substitutionGreen: "#00a651",
  white: SCORER_PRESENTATION_COLORS.white,
  glow: SCORER_PRESENTATION_COLORS.accentGlow,
} as const;

const TAU = Math.PI * 2;

// Shared entrance pacing for both band channels (milliseconds).
export const BAND_PRESENTATION_TIMELINE = {
  // Alpha fade-in entrance for the player band and the substitution
  // static/relay styles.
  fadeMs: 600,
  // Entrance of the substitution flash style.
  flashMs: 260,
  popMs: 480,
  // Period of the glow pulse behind the player-band portraits.
  pulsePeriodMs: 3000,
} as const;

// The subset of the 2D context both band presentations use, narrowed so
// tests can provide a recording context without DOM rasterization.
export interface BandPresentationRenderingContext
  extends BandRenderingContext {
  globalCompositeOperation: string;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
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

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channel(hex);
  return `rgba(${r},${g},${b},${Math.round(clamp01(alpha) * 100) / 100})`;
}

function drawFlatField(
  context: BandPresentationRenderingContext,
  width: number,
  height: number,
): void {
  context.fillStyle = BAND_PRESENTATION_COLORS.background;
  context.fillRect(0, 0, width, height);
}

// One resolved band side (player band or one substitution side).
export interface BandIdentity {
  name: string;
  number: string;
  teamName?: string;
  // The card's own image reference (download URL); absent when the asset
  // has no image and the team-logo hop must serve directly.
  imageRef?: string;
}

export interface BandUnitLayout {
  identity: BandIdentity;
  source: { width: number; height: number };
  image: HTMLImageElement;
  unit: BandUnit;
}

interface PresentationLayout {
  width: number;
  height: number;
  unitWidth: number;
  units: BandUnitLayout[];
}

interface UnitSlot {
  index: number;
  x: number;
}

function drawUnits(
  context: BandPresentationRenderingContext,
  layout: PresentationLayout,
  slots: UnitSlot[],
  height: number,
  alpha: number,
): void {
  for (const slot of slots) {
    const unit = layout.units[slot.index % layout.units.length];
    if (!unit) continue;
    drawBandUnit(context, unit.image, unit.source, unit.unit, slot.x, height, {
      alpha,
    });
  }
}

// The player band: repeated [portrait | number | name] units on a flat
// near-black field. Every style shares the unit layout; styles differ in
// their dressing (glow pulse, speed lines) and drift speed.
function drawPlayerFrame(
  context: BandPresentationRenderingContext,
  layout: PresentationLayout,
  style: PlayerBandStyle,
  elapsedMs: number,
): void {
  const { width, height } = layout;
  drawFlatField(context, width, height);

  const unitWidth = layout.unitWidth;
  const speed =
    PROCESSION_SPEED_PX_PER_MS_PER_HEIGHT *
    height *
    (style === "streamer" ? 2 : 1.5);
  const offset = -((elapsedMs * speed) % unitWidth);
  const firstIndex = Math.ceil(Math.max(0, -offset - width) / unitWidth);
  const slots: UnitSlot[] = [];
  for (let index = firstIndex; ; index += 1) {
    const x = offset + index * unitWidth;
    if (x >= width) break;
    if (x + unitWidth > 0) slots.push({ index, x });
  }

  if (style === "glow") {
    // Soft radial glow pulse behind every portrait slot center.
    const pulse =
      0.5 +
      0.5 *
        Math.sin((elapsedMs / BAND_PRESENTATION_TIMELINE.pulsePeriodMs) * TAU);
    const alpha = 0.12 + 0.14 * pulse;
    for (const slot of slots) {
      const unit = layout.units[slot.index % layout.units.length];
      if (!unit || unit.unit.portraitWidth <= 0) continue;
      const centerX = slot.x + unit.unit.portraitWidth / 2;
      const radius = height * 0.95;
      const gradient = context.createRadialGradient(
        centerX,
        height / 2,
        radius * 0.1,
        centerX,
        height / 2,
        radius,
      );
      gradient.addColorStop(0, withAlpha(BAND_PRESENTATION_COLORS.glow, alpha));
      gradient.addColorStop(1, withAlpha(BAND_PRESENTATION_COLORS.glow, 0));
      context.globalCompositeOperation = "lighter";
      context.fillStyle = gradient;
      context.fillRect(
        centerX - radius,
        height / 2 - radius,
        radius * 2,
        radius * 2,
      );
      context.globalCompositeOperation = "source-over";
    }
  }

  if (style === "streamer") {
    // Thin horizontal speed lines travelling right-to-left behind the band.
    const lines = 3;
    for (let line = 0; line < lines; line += 1) {
      const y = height * ((line + 0.5) / lines);
      const thickness = Math.max(2, Math.round(height * 0.02));
      const speedLine = height * (0.0004 + line * 0.00015);
      const x =
        width - ((elapsedMs * speedLine) % (width + height * 2)) + height;
      context.fillStyle = withAlpha(BAND_PRESENTATION_COLORS.white, 0.12);
      context.fillRect(x, y, height * 0.9, thickness);
    }
  }

  // Soft alpha fade-in entrance, then steady drift.
  const entrance = easeOutCubic(elapsedMs / BAND_PRESENTATION_TIMELINE.fadeMs);
  context.save();
  drawUnits(context, layout, slots, height, entrance);
  context.restore();
}

// Substitution cluster geometry: [portrait | number | name] per player with
// no directional marks — the outgoing player's number and name render in
// red and the incoming player's in green, matching the scoreboard's
// off-left / on-right layout.
export interface SubstitutionUnit {
  off: BandUnit;
  on: BandUnit;
  offSource: { width: number; height: number };
  onSource: { width: number; height: number };
  offImage: HTMLImageElement;
  onImage: HTMLImageElement;
  gap: number;
  unitWidth: number;
}

// Lays out the settled two-player substitution unit.
export function layoutSubstitutionUnit(
  off: {
    identity: BandIdentity;
    source: { width: number; height: number };
    image: HTMLImageElement;
  },
  on: {
    identity: BandIdentity;
    source: { width: number; height: number };
    image: HTMLImageElement;
  },
  height: number,
  context: BandRenderingContext,
): SubstitutionUnit {
  const offUnit = layoutBandUnit(
    off.source,
    off.identity.number,
    off.identity.name,
    height,
    context,
  );
  const onUnit = layoutBandUnit(
    on.source,
    on.identity.number,
    on.identity.name,
    height,
    context,
  );
  const gap = offUnit.gap;
  const unitWidth = offUnit.unitWidth + gap + onUnit.unitWidth;
  return {
    off: offUnit,
    on: onUnit,
    offSource: off.source,
    onSource: on.source,
    offImage: off.image,
    onImage: on.image,
    gap,
    unitWidth: Math.max(1, unitWidth),
  };
}

// Draws one settled two-player unit at originX: the outgoing player on the
// left with red number and name, the incoming player on the right with
// green number and name.
export function drawSubstitutionUnit(
  context: BandPresentationRenderingContext,
  unit: SubstitutionUnit,
  originX: number,
  height: number,
  motion: { alpha?: number; scale?: number } = {},
): void {
  const alpha = motion.alpha ?? 1;
  const scale = motion.scale ?? 1;
  context.save();
  context.globalAlpha = alpha;
  // Off cluster: red number and name.
  drawBandUnit(
    context,
    unit.offImage,
    unit.offSource,
    unit.off,
    originX,
    height,
    { alpha, portraitScale: scale, textColor: BAND_PRESENTATION_COLORS.accent },
  );
  // On cluster: green number and name.
  drawBandUnit(
    context,
    unit.onImage,
    unit.onSource,
    unit.on,
    originX + unit.off.unitWidth + unit.gap,
    height,
    {
      alpha,
      portraitScale: scale,
      textColor: BAND_PRESENTATION_COLORS.substitutionGreen,
    },
  );
  context.restore();
}

// The substitution band: repeated [off portrait | number | name in red]
// [gap] [on portrait | number | name in green] units, entrance per style
// (static: fade then hold; relay: fade then drift right-to-left at the
// player-band default speed; flash: impact flash + scale-down pop, then
// hold). Speeds are defined per style; there is no separate knob.
function drawSubstitutionFrame(
  context: BandPresentationRenderingContext,
  layout: PresentationLayout,
  substitution: SubstitutionUnit,
  style: SubstitutionBandStyle,
  elapsedMs: number,
): void {
  const { width, height } = layout;
  drawFlatField(context, width, height);

  const unitWidth = substitution.unitWidth;
  const relaySpeed = PROCESSION_SPEED_PX_PER_MS_PER_HEIGHT * height * 1.5;
  const drift = style === "relay" ? -((elapsedMs * relaySpeed) % unitWidth) : 0;
  const firstIndex = Math.ceil(Math.max(0, -drift - width) / unitWidth);
  const slots: UnitSlot[] = [];
  for (let index = firstIndex; ; index += 1) {
    const x = drift + index * unitWidth;
    if (x >= width) break;
    if (x + unitWidth > 0) slots.push({ index, x });
  }

  if (style === "flash") {
    // White impact flash + scale-down pop, then hold.
    if (elapsedMs < BAND_PRESENTATION_TIMELINE.flashMs) {
      const progress = 1 - elapsedMs / BAND_PRESENTATION_TIMELINE.flashMs;
      context.fillStyle = withAlpha(
        BAND_PRESENTATION_COLORS.white,
        0.85 * progress * progress,
      );
      context.fillRect(0, 0, width, height);
    }
    const pop = easeOutCubic(elapsedMs / BAND_PRESENTATION_TIMELINE.popMs);
    const scale = 1.3 - 0.3 * pop;
    const alpha = clamp01(elapsedMs / (BAND_PRESENTATION_TIMELINE.popMs * 0.6));
    for (const slot of slots) {
      context.save();
      context.beginPath();
      context.rect(
        Math.max(0, slot.x),
        0,
        Math.max(0, Math.min(width, slot.x + unitWidth) - Math.max(0, slot.x)),
        height,
      );
      context.clip();
      drawSubstitutionUnit(context, substitution, slot.x, height, {
        alpha,
        scale,
      });
      context.restore();
    }
    return;
  }

  const entrance = easeOutCubic(elapsedMs / BAND_PRESENTATION_TIMELINE.fadeMs);
  context.save();
  for (const slot of slots) {
    context.save();
    context.beginPath();
    context.rect(
      Math.max(0, slot.x),
      0,
      Math.max(0, Math.min(width, slot.x + unitWidth) - Math.max(0, slot.x)),
      height,
    );
    context.clip();
    drawSubstitutionUnit(context, substitution, slot.x, height, {
      alpha: entrance,
    });
    context.restore();
  }
  context.restore();
}

// Creates one animated band presentation for a logical screen: a canvas
// that can redraw the band at any elapsed time for the requested style.
// The presentation anchors elapsed time at first visible render (the
// runtime passes elapsed ms), exactly like the scorer presentations.
export async function createPlayerBandPresentation(
  style: PlayerBandStyle,
  identity: BandIdentity,
  source: HTMLImageElement,
  width: number,
  height: number,
  deps: ScorerBandDeps = defaultBandDeps,
): Promise<ScorerPresentation> {
  await deps.loadFonts(scorerBandFonts(height));
  const canvas = deps.createCanvas(width, height);
  const context = canvas.getContext(
    "2d",
  ) as BandPresentationRenderingContext | null;
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  const sourceSize = {
    width: source.naturalWidth,
    height: source.naturalHeight,
  };
  const unit = layoutBandUnit(
    sourceSize,
    identity.number,
    identity.name,
    height,
    context,
  );
  const layout: PresentationLayout = {
    width,
    height,
    unitWidth: unit.unitWidth,
    units: [{ identity, source: sourceSize, image: source, unit }],
  };
  const draw = (elapsedMs: number): void => {
    context.clearRect(0, 0, width, height);
    drawPlayerFrame(context, layout, style, Math.max(0, elapsedMs));
  };
  return { canvas, draw };
}

export async function createSubstitutionBandPresentation(
  style: SubstitutionBandStyle,
  off: {
    identity: BandIdentity;
    source: HTMLImageElement;
  },
  on: {
    identity: BandIdentity;
    source: HTMLImageElement;
  },
  width: number,
  height: number,
  deps: ScorerBandDeps = defaultBandDeps,
): Promise<ScorerPresentation> {
  await deps.loadFonts(scorerBandFonts(height));
  const canvas = deps.createCanvas(width, height);
  const context = canvas.getContext(
    "2d",
  ) as BandPresentationRenderingContext | null;
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  const offSource = {
    width: off.source.naturalWidth,
    height: off.source.naturalHeight,
  };
  const onSource = {
    width: on.source.naturalWidth,
    height: on.source.naturalHeight,
  };
  const substitution = layoutSubstitutionUnit(
    { identity: off.identity, source: offSource, image: off.source },
    { identity: on.identity, source: onSource, image: on.source },
    height,
    context,
  );
  const layout: PresentationLayout = {
    width,
    height,
    unitWidth: substitution.unitWidth,
    units: [],
  };
  const draw = (elapsedMs: number): void => {
    context.clearRect(0, 0, width, height);
    drawSubstitutionFrame(
      context,
      layout,
      substitution,
      style,
      Math.max(0, elapsedMs),
    );
  };
  return { canvas, draw };
}

export const defaultBandDeps: ScorerBandDeps = {
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

// Creates one player-band presentation per configured logical screen, keyed
// by logical screen id. One band request preparation produces the complete
// map required for atomic activation.
export async function createPlayerBandPresentations(
  style: PlayerBandStyle,
  identity: BandIdentity,
  source: HTMLImageElement,
  screens: readonly { id: string; width: number; height: number }[],
  deps: ScorerBandDeps = defaultBandDeps,
): Promise<Record<string, ScorerPresentation>> {
  const presentations: Record<string, ScorerPresentation> = {};
  for (const screen of screens) {
    presentations[screen.id] = await createPlayerBandPresentation(
      style,
      identity,
      source,
      screen.width,
      screen.height,
      deps,
    );
  }
  return presentations;
}

// Creates one substitution-band presentation per configured logical screen.
export async function createSubstitutionBandPresentations(
  style: SubstitutionBandStyle,
  off: { identity: BandIdentity; source: HTMLImageElement },
  on: { identity: BandIdentity; source: HTMLImageElement },
  screens: readonly { id: string; width: number; height: number }[],
  deps: ScorerBandDeps = defaultBandDeps,
): Promise<Record<string, ScorerPresentation>> {
  const presentations: Record<string, ScorerPresentation> = {};
  for (const screen of screens) {
    presentations[screen.id] = await createSubstitutionBandPresentation(
      style,
      off,
      on,
      screen.width,
      screen.height,
      deps,
    );
  }
  return presentations;
}
