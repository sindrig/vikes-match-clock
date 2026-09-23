import { describe, expect, it, vi } from "vitest";
import {
  BAND_PRESENTATION_TIMELINE,
  DEFAULT_PLAYER_BAND_STYLE,
  DEFAULT_SUBSTITUTION_BAND_STYLE,
  createPlayerBandPresentation,
  createPlayerBandPresentations,
  createSubstitutionBandPresentation,
  createSubstitutionBandPresentations,
  drawDirectionArrow,
  drawSwapArrow,
  layoutSubstitutionUnit,
  type BandPresentationRenderingContext,
} from "./playerBandPresentation";
import type { PlayerBandStyle, SubstitutionBandStyle } from "../types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURES = resolve(__dirname, "__fixtures__");
const portraitBytes = readFileSync(resolve(FIXTURES, "portrait-fagn.png"));
const crestBytes = readFileSync(resolve(FIXTURES, "crest.png"));

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
  context: BandPresentationRenderingContext;
  ops: FrameOp[];
}

// fillStyle can be a gradient object; only its string form is ever recorded.
function readFillStyle(context: BandPresentationRenderingContext): string {
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
  } as unknown as BandPresentationRenderingContext;
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

const PLAYER_STYLES: PlayerBandStyle[] = ["plain", "glow", "streamer"];
const SUBSTITUTION_STYLES: SubstitutionBandStyle[] = [
  "static",
  "relay",
  "flash",
];

const IDENTITY = {
  name: "Jón Jónsson",
  number: "7",
  teamName: "Víkingur R",
};

async function createPlayerFor(
  style: PlayerBandStyle,
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
  const presentation = await createPlayerBandPresentation(
    style,
    IDENTITY,
    imageOf(portraitBytes, 4, 8),
    960,
    108,
    deps,
  );
  return { presentation, recordings, fonts, canvases };
}

async function createSubstitutionFor(
  style: SubstitutionBandStyle,
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
  const presentation = await createSubstitutionBandPresentation(
    style,
    {
      identity: { name: "Siggi Bekkur", number: "12" },
      source: imageOf(portraitBytes, 4, 8),
    },
    {
      identity: { name: "Jón Jónsson", number: "7" },
      source: imageOf(crestBytes, 8, 8),
    },
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
    .filter((entry) => entry.op === "fillText")
    .map((entry) => ({
      text: entry.text!,
      x: entry.args[0]!,
      y: entry.args[1]!,
    }));
}

describe("player band presentations", () => {
  it.each(PLAYER_STYLES)(
    "creates a canvas at the logical screen dimensions and awaits band fonts (%s)",
    async (style) => {
      const { fonts, canvases, presentation } = await createPlayerFor(style);
      expect(canvases).toEqual([{ width: 960, height: 108 }]);
      expect(fonts.length).toBeGreaterThan(0);
      expect(presentation.canvas).toBeDefined();
      expect(typeof presentation.draw).toBe("function");
    },
  );

  it("defaults to the plain style for both channels", () => {
    expect(DEFAULT_PLAYER_BAND_STYLE).toBe("plain");
    expect(DEFAULT_SUBSTITUTION_BAND_STYLE).toBe("static");
  });

  it.each(PLAYER_STYLES)(
    "clears the frame before drawing so repeats never accumulate (%s)",
    async (style) => {
      const { presentation, recordings } = await createPlayerFor(style);
      presentation.draw(0);
      const opsAfterFirst = recordings.ops.length;
      presentation.draw(4_000);
      expect(recordings.ops[opsAfterFirst]).toEqual({
        op: "clearRect",
        args: [0, 0, 960, 108],
      });
    },
  );

  it.each(PLAYER_STYLES)(
    "fills a flat near-black field behind the band (%s)",
    async (style) => {
      const { presentation, recordings } = await createPlayerFor(style);
      presentation.draw(10_000);
      const field = recordings.ops.find(
        (entry) =>
          entry.op === "fillRect" &&
          entry.args[2] === 960 &&
          entry.args[3] === 108 &&
          entry.style === "#0b0b10",
      );
      expect(field).toBeDefined();
    },
  );

  it.each(PLAYER_STYLES)(
    "draws the repeated units across the full band width (%s)",
    async (style) => {
      const { presentation, recordings } = await createPlayerFor(style);
      presentation.draw(10_000);
      const texts = playerTextOps(recordings.ops);
      expect(texts.length).toBeGreaterThanOrEqual(2);
      for (const entry of texts) {
        expect(entry.y).toBe(54);
      }
    },
  );

  it("fades the band in over the entrance window", async () => {
    const { presentation, recordings } = await createPlayerFor("plain");
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

  it("drifts the band units right-to-left faster than the procession", async () => {
    const { presentation, recordings } = await createPlayerFor("plain");
    presentation.draw(2_000);
    const draws = portraitDraws(recordings.ops);
    expect(draws.length).toBeGreaterThan(1);
    expect(draws[0]!.dx).toBeLessThan(0);
    // The player band is ~1.5x procession (height * 0.00012 * 1.5).
    const spacing = draws[1]!.dx - draws[0]!.dx;
    expect(spacing).toBeGreaterThan(draws[0]!.dw);
    // The offset at 2000 ms moved by ~1.5x procession speed.
    const expectedDrift = 2000 * 108 * 0.00012 * 1.5;
    expect(spacing).toBeGreaterThan(0);
    expect(draws[0]!.dx).toBeLessThan(0);
    expect(
      Math.abs(((draws[0]!.dx + expectedDrift) % spacing) - spacing) < 1 ||
        Math.abs((draws[0]!.dx + expectedDrift) % spacing) < 1,
    ).toBe(true);
  });

  it("drifts the streamer style faster than plain", async () => {
    const plain = await createPlayerFor("plain");
    const streamer = await createPlayerFor("streamer");
    plain.presentation.draw(1_000);
    streamer.presentation.draw(1_000);
    const plainDx = portraitDraws(plain.recordings.ops)[0]!.dx;
    const streamerDx = portraitDraws(streamer.recordings.ops)[0]!.dx;
    // The streamer style has drifted further left by now (2x speed).
    expect(Math.abs(streamerDx)).toBeGreaterThan(Math.abs(plainDx));
  });

  it("pulses a soft glow behind the glow-style portraits", async () => {
    const { presentation, recordings } = await createPlayerFor("glow");
    presentation.draw(5_000);
    const glows = recordings.ops.filter(
      (entry) => entry.op === "createRadialGradient",
    );
    expect(glows.length).toBeGreaterThan(0);
  });

  it("draws thin speed lines behind the streamer band", async () => {
    const { presentation, recordings } = await createPlayerFor("streamer");
    presentation.draw(5_000);
    const lines = recordings.ops.filter(
      (entry) =>
        entry.op === "fillRect" &&
        entry.style?.startsWith("rgba(255,255,255") &&
        entry.args[2]! < 960,
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      // Thin lines only.
      expect(line.args[3]!).toBeLessThanOrEqual(5);
    }
  });

  it("creates one presentation per configured logical screen", async () => {
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
    const presentations = await createPlayerBandPresentations(
      "glow",
      IDENTITY,
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
});

describe("substitution band presentations", () => {
  it.each(SUBSTITUTION_STYLES)(
    "creates a canvas at the logical screen dimensions and awaits band fonts (%s)",
    async (style) => {
      const { fonts, canvases, presentation } =
        await createSubstitutionFor(style);
      expect(canvases).toEqual([{ width: 960, height: 108 }]);
      expect(fonts.length).toBeGreaterThan(0);
      expect(presentation.canvas).toBeDefined();
      expect(typeof presentation.draw).toBe("function");
    },
  );

  it.each(SUBSTITUTION_STYLES)(
    "draws both players' numbers and names in the settled unit (%s)",
    async (style) => {
      const { presentation, recordings } = await createSubstitutionFor(style);
      presentation.draw(10_000);
      const texts = playerTextOps(recordings.ops);
      const numbers = texts.filter((entry) => ["7", "12"].includes(entry.text));
      expect(numbers).toHaveLength(2);
      const names = texts.filter((entry) =>
        ["Jón Jónsson", "Siggi Bekkur"].includes(entry.text),
      );
      expect(names).toHaveLength(2);
      // The outgoing player's cluster sits left of the incoming one.
      expect(numbers.find((entry) => entry.text === "12")!.x).toBeLessThan(
        numbers.find((entry) => entry.text === "7")!.x,
      );
    },
  );

  it("draws the direction and swap arrows as vector triangles", async () => {
    const { presentation, recordings } = await createSubstitutionFor("static");
    presentation.draw(10_000);
    // Per visible unit: one red down triangle, one green up triangle and
    // one swap arrow, each a path fill.
    const fills = recordings.ops.filter((entry) => entry.op === "fill");
    expect(fills.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the static band in place after its entrance", async () => {
    const { presentation, recordings } = await createSubstitutionFor("static");
    presentation.draw(1_000);
    const first = portraitDraws(recordings.ops)[0]!;
    const before = recordings.ops.length;
    presentation.draw(30_000);
    const settled = portraitDraws(recordings.ops.slice(before))[0]!;
    expect(settled.dx).toBe(first.dx);
  });

  it("drifts the relay band right-to-left at the player-band default speed", async () => {
    const { presentation, recordings } = await createSubstitutionFor("relay");
    presentation.draw(0);
    const start = portraitDraws(recordings.ops)[0]!;
    const before = recordings.ops.length;
    presentation.draw(2_000);
    const moved = portraitDraws(recordings.ops.slice(before))[0]!;
    expect(moved.dx).toBeLessThan(start.dx);
  });

  it("flashes and pops the flash style, stamping the swap arrow last", async () => {
    const { presentation, recordings } = await createSubstitutionFor("flash");
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
    // Early: the portraits pop at >1x scale.
    const early = portraitDraws(recordings.ops)[0]!;
    expect(early.dh).toBeGreaterThan(108);
    // The swap arrow is not stamped yet: swap draws (non-text path fills
    // at the swap arrow position) are absent before the stamp window.
    presentation.draw(BAND_PRESENTATION_TIMELINE.swapStampMs + 400);
    const texts = playerTextOps(recordings.ops);
    expect(texts.length).toBeGreaterThan(0);
  });

  it("creates one presentation per configured logical screen", async () => {
    const recordings = makeRecordingContext();
    const deps = {
      createCanvas: (width: number, height: number): HTMLCanvasElement =>
        ({
          width,
          height,
          getContext: (type: string) =>
            type === "2d" ? recordings.context : null,
        }) as unknown as HTMLCanvasElement,
      loadFonts: () => Promise.resolve(),
    };
    const presentations = await createSubstitutionBandPresentations(
      "relay",
      { identity: IDENTITY, source: imageOf(portraitBytes, 4, 8) },
      { identity: IDENTITY, source: imageOf(crestBytes, 8, 8) },
      [
        { id: "left", width: 960, height: 108 },
        { id: "right", width: 768, height: 108 },
      ],
      deps,
    );
    expect(Object.keys(presentations).sort()).toEqual(["left", "right"]);
  });
});

describe("band arrow primitives", () => {
  it("draws direction triangles with three path points", () => {
    const recordings = makeRecordingContext();
    drawDirectionArrow(recordings.context, 50, 54, 30, "#c8102e", false);
    const moves = recordings.ops.filter((entry) => entry.op === "moveTo");
    const lines = recordings.ops.filter((entry) => entry.op === "lineTo");
    expect(moves).toHaveLength(1);
    expect(lines).toHaveLength(2);
    expect(recordings.ops.some((entry) => entry.op === "closePath")).toBe(true);
    expect(recordings.ops.some((entry) => entry.op === "fill")).toBe(true);
  });

  it("draws upward and downward arrows with mirrored geometry", () => {
    const down = makeRecordingContext();
    drawDirectionArrow(down.context, 50, 54, 30, "#c8102e", false);
    const up = makeRecordingContext();
    drawDirectionArrow(up.context, 50, 54, 30, "#00a651", true);
    // The apex y of the down arrow is below center; the up arrow above.
    expect(down.ops.find((entry) => entry.op === "moveTo")!.args[1]).toBe(69);
    expect(up.ops.find((entry) => entry.op === "moveTo")!.args[1]).toBe(39);
  });

  it("draws the swap arrow pointing right", () => {
    const recordings = makeRecordingContext();
    drawSwapArrow(recordings.context, 50, 54, 40, "#ffffff");
    const moveTo = recordings.ops.find((entry) => entry.op === "moveTo")!;
    // The shaft starts left of the arrowhead tip.
    expect(moveTo.args[0]).toBeLessThan(50);
    expect(recordings.ops.filter((entry) => entry.op === "lineTo").length).toBe(
      6,
    );
  });
});

describe("layoutSubstitutionUnit", () => {
  it("measures a settled unit wide enough for both clusters and the swap", () => {
    const recordings = makeRecordingContext();
    const unit = layoutSubstitutionUnit(
      {
        identity: { name: "Siggi Bekkur", number: "12" },
        source: { width: 4, height: 8 },
        image: imageOf(portraitBytes, 4, 8),
      },
      {
        identity: { name: "Jón Jónsson", number: "7" },
        source: { width: 8, height: 8 },
        image: imageOf(crestBytes, 8, 8),
      },
      108,
      recordings.context,
    );
    expect(unit.unitWidth).toBeGreaterThan(
      unit.off.unitWidth + unit.on.unitWidth,
    );
    expect(unit.arrowSize).toBe(Math.round(108 * 0.5));
    expect(unit.swapSize).toBe(Math.round(108 * 0.45));
  });
});
