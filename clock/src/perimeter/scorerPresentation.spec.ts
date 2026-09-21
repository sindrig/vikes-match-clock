import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SCORER_CELEBRATION_STYLE,
  SCORER_PRESENTATION_TIMELINE,
  createScorerPresentation,
  createScorerPresentations,
  type PresentationRenderingContext,
} from "./scorerPresentation";
import type { BandUnitMotion } from "./scorerCompositor";
import type {
  GoalScorerOverlayCommand,
  ScorerCelebrationStyle,
} from "../types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURES = resolve(__dirname, "__fixtures__");
const portraitBytes = readFileSync(resolve(FIXTURES, "portrait-fagn.png"));

// A deterministic text metric emulating the GT America bold width so tests
// are stable across environments without DOM rasterization.
function measureFont(text: string, fontSize: number): number {
  const chars = Array.from(text);
  const width = chars.reduce((sum, ch) => {
    const wide = /[MW@%]/.test(ch)
      ? 1.0
      : ch === "i" || ch === "l"
        ? 0.35
        : 0.62;
    return sum + wide;
  }, 0);
  return Math.max(Math.round(width * fontSize), 1);
}

interface FrameOp {
  op: string;
  args: number[];
  text?: string;
  style?: string;
}

interface Recording {
  context: PresentationRenderingContext;
  ops: FrameOp[];
}

// fillStyle can be a gradient object; only its string form is ever recorded.
function readFillStyle(context: PresentationRenderingContext): string {
  const value = (context as { fillStyle?: unknown }).fillStyle;
  return typeof value === "string" ? value : "";
}

function makeRecordingContext(): Recording {
  const ops: FrameOp[] = [];
  const context = {
    fillStyle: "",
    font: "",
    textBaseline: "middle",
    globalCompositeOperation: "source-over",
    measureText(text: string) {
      return {
        width: measureFont(
          text,
          Number(/(\d+)px/.exec(context.font)?.[1] ?? 1),
        ),
      };
    },
    save: vi.fn(() => ops.push({ op: "save", args: [] })),
    restore: vi.fn(() => ops.push({ op: "restore", args: [] })),
    beginPath: vi.fn(() => ops.push({ op: "beginPath", args: [] })),
    rect: (...args: number[]) => ops.push({ op: "rect", args }),
    clip: vi.fn(() => ops.push({ op: "clip", args: [] })),
    closePath: vi.fn(() => ops.push({ op: "closePath", args: [] })),
    fill: vi.fn(() =>
      ops.push({ op: "fill", args: [], style: readFillStyle(context) }),
    ),
    clearRect: (...args: number[]) => ops.push({ op: "clearRect", args }),
    fillRect: (...args: number[]) =>
      ops.push({ op: "fillRect", args, style: readFillStyle(context) }),
    moveTo: (...args: number[]) => ops.push({ op: "moveTo", args }),
    lineTo: (...args: number[]) => ops.push({ op: "lineTo", args }),
    drawImage: vi.fn(
      (
        _image: CanvasImageSource,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
      ) =>
        ops.push({
          op: "drawImage",
          args: [sx, sy, sw, sh, dx, dy, dw, dh],
        }),
    ),
    fillText: vi.fn((text: string, x: number, y: number) =>
      ops.push({ op: "fillText", args: [x, y], text }),
    ),
    createLinearGradient: vi.fn((...args: number[]) => {
      ops.push({ op: "createLinearGradient", args });
      return { addColorStop: vi.fn() };
    }),
    createRadialGradient: vi.fn((...args: number[]) => {
      ops.push({ op: "createRadialGradient", args });
      return { addColorStop: vi.fn() };
    }),
  } as unknown as PresentationRenderingContext;
  let globalAlpha = 1;
  Object.defineProperty(context, "globalAlpha", {
    get: () => globalAlpha,
    set: (value: number) => {
      globalAlpha = value;
      ops.push({ op: "globalAlpha", args: [value] });
    },
  });
  return { context, ops };
}

function imageOf(
  bytes: Buffer,
  width: number,
  height: number,
): HTMLImageElement {
  return {
    src: `data:image/png;base64,${bytes.toString("base64")}`,
    naturalWidth: width,
    naturalHeight: height,
  } as unknown as HTMLImageElement;
}

const STYLES: ScorerCelebrationStyle[] = [
  "ribbon",
  "tunnel",
  "wave",
  "procession",
  "cutout",
];

async function createFor(
  style: ScorerCelebrationStyle,
  recordings: Recording = makeRecordingContext(),
) {
  const fonts: string[] = [];
  const canvases: { width: number; height: number }[] = [];
  const deps = {
    createCanvas: (width: number, height: number): HTMLCanvasElement => {
      canvases.push({ width, height });
      return {
        width,
        height,
        getContext: (type: string) =>
          type === "2d" ? recordings.context : null,
      } as unknown as HTMLCanvasElement;
    },
    loadFonts: (requested: string[]) => {
      fonts.push(...requested);
      return Promise.resolve();
    },
  };
  const presentation = await createScorerPresentation(
    style,
    { name: "Jón Jónsson", number: "7" },
    imageOf(portraitBytes, 4, 8),
    960,
    108,
    deps,
  );
  return { presentation, recordings, fonts, canvases };
}

function portraitDraws(
  ops: FrameOp[],
): { dx: number; dy: number; dw: number; dh: number }[] {
  return ops
    .filter((entry) => entry.op === "drawImage")
    .map((entry) => ({
      dx: entry.args[4]!,
      dy: entry.args[5]!,
      dw: entry.args[6]!,
      dh: entry.args[7]!,
    }));
}

function playerTextOps(
  ops: FrameOp[],
): { text: string; x: number; y: number }[] {
  return ops
    .filter((entry) => entry.op === "fillText" && entry.text !== "MARK")
    .map((entry) => ({
      text: entry.text!,
      x: entry.args[0]!,
      y: entry.args[1]!,
    }));
}

describe("scorer presentations", () => {
  it("defaults to the ribbon style", () => {
    expect(DEFAULT_SCORER_CELEBRATION_STYLE).toBe("ribbon");
  });

  it.each(STYLES)(
    "creates a canvas at the logical screen dimensions and awaits band fonts (%s)",
    async (style) => {
      const { fonts, canvases, presentation } = await createFor(style);
      expect(canvases).toEqual([{ width: 960, height: 108 }]);
      expect(fonts.length).toBeGreaterThan(0);
      expect(presentation.canvas).toBeDefined();
      expect(typeof presentation.draw).toBe("function");
    },
  );

  it.each(STYLES)(
    "clears the frame before drawing so repeats never accumulate (%s)",
    async (style) => {
      const { presentation, recordings } = await createFor(style);
      presentation.draw(0);
      const opsAfterFirst = recordings.ops.length;
      presentation.draw(4_000);
      // The clear happens at the start of every frame.
      expect(recordings.ops[opsAfterFirst]).toEqual({
        op: "clearRect",
        args: [0, 0, 960, 108],
      });
    },
  );

  it.each(STYLES)(
    "keeps the portrait contained inside the band height after the entrance",
    async (style) => {
      const { presentation, recordings } = await createFor(style);
      presentation.draw(10_000);
      const draws = portraitDraws(recordings.ops);
      expect(draws.length).toBeGreaterThan(0);
      for (const draw of draws) {
        // The source is drawn in full (contain fit) and scaled to the band
        // height, so 4x8 becomes 54x108.
        expect(draw.dh).toBe(108);
        expect(draw.dw).toBeCloseTo(54, 0);
      }
    },
  );

  it.each(STYLES)(
    "draws the repeated units across the full band width (%s)",
    async (style) => {
      const { presentation, recordings } = await createFor(style);
      presentation.draw(10_000);
      const texts = playerTextOps(recordings.ops);
      expect(texts.length).toBeGreaterThanOrEqual(2);
      // Number and name text use the shared vertical center.
      for (const entry of texts) {
        expect(entry.y).toBe(54);
      }
    },
  );

  it("flashes and reveals inside the shared entrance timeline", async () => {
    const { presentation, recordings } = await createFor("ribbon");
    presentation.draw(0);
    // The impact flash covers the whole frame at t=0.
    const flash = recordings.ops.find(
      (entry) =>
        entry.op === "fillRect" &&
        entry.args[2] === 960 &&
        entry.args[3] === 108 &&
        entry.style?.startsWith("rgba(255,255,255"),
    );
    expect(flash).toBeDefined();

    // Only frames inside the reveal window clip the foreground.
    const clipsDuring = (() => {
      presentation.draw(400);
      return recordings.ops.filter((entry) => entry.op === "clip").length;
    })();
    expect(clipsDuring).toBeGreaterThan(0);
    const clipsBefore = recordings.ops.filter(
      (entry) => entry.op === "clip",
    ).length;
    presentation.draw(
      SCORER_PRESENTATION_TIMELINE.revealStartMs +
        SCORER_PRESENTATION_TIMELINE.revealMs +
        10_000,
    );
    const clipsAfter = recordings.ops.filter(
      (entry) => entry.op === "clip",
    ).length;
    expect(clipsAfter).toBe(clipsBefore);
  });

  it("scales the cutout portrait down over its entrance", async () => {
    const { presentation, recordings } = await createFor("cutout");
    presentation.draw(0);
    const early = portraitDraws(recordings.ops)[0]!;
    expect(early.dw).toBeCloseTo(54 * 1.35, 0);
    presentation.draw(10_000);
    const settled = portraitDraws(recordings.ops).slice(-1)[0]!;
    expect(settled.dw).toBeCloseTo(54, 0);
  });

  it("slides the cutout number and name in from the right", async () => {
    const { presentation, recordings } = await createFor("cutout");
    presentation.draw(0);
    const early = playerTextOps(recordings.ops);
    expect(early.length).toBeGreaterThanOrEqual(2);
    const before = recordings.ops.length;
    presentation.draw(10_000);
    const settled = playerTextOps(recordings.ops.slice(before));
    expect(settled.length).toBeGreaterThanOrEqual(2);
    // The settled positions come from the static layout: the number sits
    // after the 54px portrait slot and the 49px gap.
    expect(settled[0]!.x).toBeCloseTo(103, 0);
    expect(early[0]!.x).toBeGreaterThan(settled[0]!.x);
  });

  it("drifts the procession units right-to-left without leaving gaps", async () => {
    const { presentation, recordings } = await createFor("procession");
    presentation.draw(2_000);
    const draws = portraitDraws(recordings.ops);
    expect(draws.length).toBeGreaterThan(1);
    // The first unit starts at a negative offset so the drift never opens a
    // gap on the left edge.
    expect(draws[0]!.dx).toBeLessThan(0);
    expect(draws[0]!.dx + draws[0]!.dw).toBeGreaterThan(0);
    // Units keep a consistent spacing wider than one portrait slot.
    const spacing = draws[1]!.dx - draws[0]!.dx;
    expect(spacing).toBeGreaterThan(draws[0]!.dw);
  });

  it("fades the procession units in over the entrance", async () => {
    const { presentation, recordings } = await createFor("procession");
    presentation.draw(0);
    const alphas = recordings.ops
      .filter((entry) => entry.op === "globalAlpha")
      .map((entry) => entry.args[0]!);
    expect(Math.min(...alphas)).toBeCloseTo(0, 2);
    const before = recordings.ops.length;
    presentation.draw(10_000);
    const settled = recordings.ops
      .slice(before)
      .filter((entry) => entry.op === "globalAlpha")
      .map((entry) => entry.args[0]!);
    expect(Math.min(...settled)).toBe(1);
  });

  it("draws the tunnel typography behind the band at a low contrast", async () => {
    const { presentation, recordings } = await createFor("tunnel");
    presentation.draw(1_000);
    const markOps = recordings.ops.filter(
      (entry) => entry.op === "fillText" && entry.text === "MARK",
    );
    expect(markOps.length).toBeGreaterThan(0);
    for (const entry of markOps) {
      expect(entry.args[0]!).toBeLessThanOrEqual(960);
      expect(entry.args[1]!).toBe(54);
    }
    // The MARK glyphs repeat across the width.
    const positions = markOps.map((entry) => entry.args[0]!);
    expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(0);
  });

  it("glows the wave portraits from their slot centers", async () => {
    const { presentation, recordings } = await createFor("wave");
    presentation.draw(5_000);
    const glows = recordings.ops.filter(
      (entry) => entry.op === "createRadialGradient",
    );
    // One glow per portrait unit plus the travelling pulse.
    expect(glows.length).toBeGreaterThan(1);
  });

  it("creates one presentation per configured overlay logical screen", async () => {
    const recordings = makeRecordingContext();
    const fonts: string[] = [];
    const deps = {
      createCanvas: (width: number, height: number): HTMLCanvasElement =>
        ({
          width,
          height,
          getContext: (type: string) =>
            type === "2d" ? recordings.context : null,
        }) as unknown as HTMLCanvasElement,
      loadFonts: (requested: string[]) => {
        fonts.push(...requested);
        return Promise.resolve();
      },
    };
    const command: GoalScorerOverlayCommand = {
      version: 2,
      kind: "goal-scorer",
      id: "scorer-1",
      player: { id: "2492", name: "Jón Jónsson", number: "7" },
    };
    const presentations = await createScorerPresentations(
      "cutout",
      command,
      imageOf(portraitBytes, 4, 8),
      [
        { id: "left", width: 960, height: 108 },
        { id: "right", width: 768, height: 108 },
      ],
      deps,
    );
    expect(Object.keys(presentations).sort()).toEqual(["left", "right"]);
    expect(typeof presentations.left!.draw).toBe("function");
    expect(typeof presentations.right!.draw).toBe("function");
  });

  it("applies every band unit motion field deterministically", async () => {
    const { drawBandUnit, layoutBandUnit } = await import("./scorerCompositor");
    const recordings = makeRecordingContext();
    const unit = layoutBandUnit(
      { width: 4, height: 8 },
      "7",
      "Jón Jónsson",
      108,
      recordings.context,
    );
    const motion: BandUnitMotion = {
      portraitScale: 1.2,
      portraitAlpha: 0.5,
      textAlpha: 0.25,
      textOffsetX: 12,
      alpha: 0.75,
    };
    drawBandUnit(
      recordings.context,
      imageOf(portraitBytes, 4, 8),
      { width: 4, height: 8 },
      unit,
      0,
      108,
      motion,
    );
    const draws = portraitDraws(recordings.ops);
    // Portrait: slot center fixed; the unit alpha scales opacity only,
    // never geometry.
    const draw = draws[draws.length - 1]!;
    expect(draw.dw).toBeCloseTo(54 * 1.2, 0);
    expect(draw.dh).toBeCloseTo(108 * 1.2, 0);
    const alphas = recordings.ops
      .filter((entry) => entry.op === "globalAlpha")
      .map((entry) => entry.args[0]!);
    expect(Math.min(...alphas)).toBeCloseTo(0.75 * 0.25, 2);
    expect(Math.max(...alphas)).toBeCloseTo(0.75 * 0.5, 2);
  });
});
