import { describe, expect, it, vi } from "vitest";
import {
  SCORER_BAND_STYLE,
  bandGap,
  bandNameFontSize,
  bandNumberFontSize,
  composeScorerBand,
  composeScorerBands,
  coverCrop,
  layoutBandUnit,
  scorerBandFonts,
  scorerBandFontSpec,
  type BandRenderingContext,
} from "./scorerCompositor";

const PLAYER = { name: "Jón Jónsson", number: "7" };

// A predictable width estimator: bold GT America approximated at 0.62em per
// character (wide M/W at 1.0em, narrow i/l at 0.35em), matching the server
// renderer's deterministic layout estimator.
function estimateWidth(text: string, fontSize: number): number {
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

interface RecordingCall {
  op: "drawImage" | "fillText" | "clip";
  args: unknown[];
}

function makeRecordingContext(
  overrides: { measureWidth?: (text: string, font: string) => number } = {},
) {
  const calls: RecordingCall[] = [];
  const measureWidth =
    overrides.measureWidth ??
    ((text: string, font: string) => {
      const size = Number(/(\d+)px/.exec(font)?.[1] ?? 1);
      return estimateWidth(text, size);
    });
  const context = {
    fillStyle: "#000000",
    font: "",
    textBaseline: "alphabetic",
    measureText: (text: string) => ({
      width: measureWidth(text, context.font),
    }),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(() => {
      calls.push({ op: "clip", args: [] });
    }),
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
      ) => {
        calls.push({
          op: "drawImage",
          args: [sx, sy, sw, sh, dx, dy, dw, dh],
        });
      },
    ),
    fillText: vi.fn((text: string, x: number, y: number) => {
      calls.push({ op: "fillText", args: [text, x, y] });
    }),
  } as unknown as BandRenderingContext;
  return { context, calls };
}

function makeFakeCanvas(
  recordings: ReturnType<typeof makeRecordingContext>,
  expectedWidth: number,
  expectedHeight: number,
): HTMLCanvasElement {
  return {
    width: expectedWidth,
    height: expectedHeight,
    getContext: (type: string) => (type === "2d" ? recordings.context : null),
  } as unknown as HTMLCanvasElement;
}

const deps = (recordings: ReturnType<typeof makeRecordingContext>) => ({
  createCanvas: (width: number, height: number) =>
    makeFakeCanvas(recordings, width, height),
  loadFonts: vi.fn(() => Promise.resolve(undefined)),
});

describe("band metrics", () => {
  it("scales measurements from the band height", () => {
    const height = 108;
    expect(bandGap(height)).toBe(Math.round(height * 0.45));
    expect(bandNumberFontSize(height)).toBe(Math.round(height * 0.55));
    expect(bandNameFontSize(height)).toBe(Math.round(height * 0.28));
  });

  it("derives the font specs preparation must await", () => {
    const height = 108;
    const fonts = scorerBandFonts(height);
    expect(fonts).toHaveLength(2);
    for (const font of fonts) {
      expect(font).toContain("700");
      expect(font).toContain('"GT America"');
    }
  });

  it("cover-crops a tall portrait to the band aspect", () => {
    const crop = coverCrop(100, 200, 108);
    // Crop width keeps the source aspect: (100/200)*108 = 54 wide slice,
    // centered horizontally, full source height.
    expect(crop.sw).toBeCloseTo(54);
    expect(crop.sh).toBeCloseTo(108);
    expect(crop.sx).toBeCloseTo(23);
    expect(crop.sy).toBeCloseTo(46);
  });

  it("cover-crops a wide image by clamping to the source width", () => {
    const crop = coverCrop(400, 50, 108);
    expect(crop.sw).toBe(400);
    expect(crop.sh).toBe(50);
    expect(crop.sx).toBe(0);
    expect(crop.sy).toBe(0);
  });
});

describe("layoutBandUnit", () => {
  it("lays out portrait, number, and name with the fixed gaps", () => {
    const { context } = makeRecordingContext();
    const unit = layoutBandUnit(
      { width: 100, height: 200 },
      "7",
      "Jón Jónsson",
      108,
      context,
    );
    const gap = bandGap(108);
    expect(unit.gap).toBe(gap);
    // Portrait cover-cropped: aspect 0.5 → 54 wide at height 108.
    expect(unit.portraitWidth).toBe(54);
    expect(unit.numberFontSize).toBe(bandNumberFontSize(108));
    expect(unit.nameFontSize).toBe(bandNameFontSize(108));
    expect(unit.numberText).toBe("7");
    expect(unit.nameText).toBe("Jón Jónsson");
    expect(unit.unitWidth).toBe(
      54 + gap + unit.numberWidth + gap + unit.nameWidth + gap,
    );
  });

  it("reduces an overlong name before truncating it", () => {
    const { context } = makeRecordingContext();
    const unit = layoutBandUnit(
      { width: 100, height: 200 },
      "7",
      "Jón Jónsson Jónssonar Jónssonsson",
      108,
      context,
    );
    const maxNameWidth = 108 * SCORER_BAND_STYLE.maxNameWidthMultiplier;
    expect(unit.nameWidth).toBeLessThanOrEqual(maxNameWidth);
    expect(unit.nameText.endsWith("…")).toBe(true);
  });

  it("never lets the name area overlap the next unit for long names", () => {
    const { context } = makeRecordingContext();
    const unit = layoutBandUnit(
      { width: 100, height: 200 },
      "7",
      "Jón Jónsson Jónsson Jónsson Jónsson Jónsson Jónsson",
      108,
      context,
    );
    expect(unit.nameWidth + unit.gap).toBeLessThanOrEqual(unit.unitWidth);
  });

  it("keeps short names at the nominal font size", () => {
    const { context } = makeRecordingContext();
    const unit = layoutBandUnit(
      { width: 100, height: 200 },
      "7",
      "Jón",
      108,
      context,
    );
    expect(unit.nameFontSize).toBe(bandNameFontSize(108));
    expect(unit.nameText).toBe("Jón");
  });
});

describe("composeScorerBand", () => {
  it("creates the canvas at the logical screen's native dimensions", async () => {
    const recordings = makeRecordingContext();
    const loadFonts = vi.fn(() => Promise.resolve(undefined));
    await composeScorerBand(PLAYER, imageLike(2, 1), 1920, 108, {
      createCanvas: (width, height) =>
        makeFakeCanvas(recordings, width, height),
      loadFonts,
    });
    expect(loadFonts).toHaveBeenCalledWith(scorerBandFonts(108));
    expect(recordings.calls.length).toBeGreaterThan(0);
  });

  it("draws each unit in order: portrait, number, name", async () => {
    const recordings = makeRecordingContext();
    const canvas = await composeScorerBand(
      PLAYER,
      imageLike(100, 200),
      920,
      108,
      deps(recordings),
    );
    expect(canvas.width).toBe(920);
    expect(canvas.height).toBe(108);
    // The layout must match the composed data exactly.
    const unit = layoutBandUnit(
      { width: 100, height: 200 },
      PLAYER.number,
      PLAYER.name,
      108,
      makeRecordingContext().context,
    );
    // 920px fits two complete units (2 * 443 = 886) plus a clipped third.
    expect(unit.unitWidth).toBe(443);
    const expectedUnits = 3;
    // Clip calls are recorded too; filter to the drawing operations.
    const drawCalls = recordings.calls.filter((call) => call.op !== "clip");
    for (let unitIndex = 0; unitIndex < expectedUnits; unitIndex += 1) {
      const slice = drawCalls.slice(unitIndex * 3, unitIndex * 3 + 3);
      expect(slice[0]?.op).toBe("drawImage");
      expect(slice[1]?.op).toBe("fillText");
      expect(slice[2]?.op).toBe("fillText");
      expect(slice[0]?.args[4]).toBe(unitIndex * unit.unitWidth);
    }
  });

  it("repeats the unit across the full width", async () => {
    const recordings = makeRecordingContext();
    const width = 2000;
    const height = 60;
    await composeScorerBand(
      PLAYER,
      imageLike(100, 200),
      width,
      height,
      deps(recordings),
    );
    const unit = layoutBandUnit(
      { width: 100, height: 200 },
      PLAYER.number,
      PLAYER.name,
      height,
      makeRecordingContext().context,
    );
    const repeats = Math.ceil(width / unit.unitWidth);
    expect(recordings.calls.length).toBeGreaterThanOrEqual(repeats * 3);
    // The last repetition starts before the width ends.
    const imageCalls = recordings.calls.filter(
      (call) => call.op === "drawImage",
    );
    const lastImage = imageCalls[imageCalls.length - 1];
    expect(lastImage).toBeDefined();
    expect(Number(lastImage!.args[4])).toBeLessThan(width);
  });

  it("clips the final unit without rescaling the text", async () => {
    const recordings = makeRecordingContext();
    const height = 108;
    const unit = layoutBandUnit(
      { width: 100, height: 200 },
      PLAYER.number,
      PLAYER.name,
      height,
      makeRecordingContext().context,
    );
    // Pick a width that cuts inside the second unit.
    const partial = unit.unitWidth + 30;
    expect(partial).toBeLessThan(unit.unitWidth * 2);
    await composeScorerBand(
      PLAYER,
      imageLike(100, 200),
      partial,
      height,
      deps(recordings),
    );
    // The clipped unit applies a clip rectangle.
    expect(recordings.calls.some((call) => call.op === "clip")).toBe(true);
    // Both units draw all three elements (portrait, number, name) — only
    // pixels are cut, the text is not rescaled.
    expect(recordings.calls.filter((call) => call.op !== "clip")).toHaveLength(
      6,
    );
  });

  it("fills a very wide band with repeated complete units", async () => {
    const recordings = makeRecordingContext();
    const width = 3840;
    const height = 192;
    await composeScorerBand(
      { name: "Jón Jónsson", number: "10" },
      imageLike(100, 200),
      width,
      height,
      deps(recordings),
    );
    const fillCalls = recordings.calls.filter((call) => call.op === "fillText");
    const unit = layoutBandUnit(
      { width: 100, height: 200 },
      "10",
      "Jón Jónsson",
      height,
      makeRecordingContext().context,
    );
    const repeats = Math.ceil(width / unit.unitWidth);
    expect(fillCalls.length).toBe(repeats * 2);
  });
});

describe("composeScorerBands", () => {
  it("composes one complete band per configured logical screen", async () => {
    const screens = [
      { id: "screen-west", width: 1920, height: 108 },
      { id: "screen-east", width: 1600, height: 90 },
    ];
    const composed: HTMLCanvasElement[] = [];
    const fontRequests: string[][] = [];
    const bands = await composeScorerBands(
      {
        version: 2,
        kind: "goal-scorer",
        id: "command",
        player: { id: "2492", name: "Jón Jónsson", number: "7" },
      },
      imageLike(100, 200),
      screens,
      {
        createCanvas: (width, height) => {
          const recordings = makeRecordingContext();
          const canvas = makeFakeCanvas(recordings, width, height);
          composed.push(canvas);
          return canvas;
        },
        loadFonts: (requested) => {
          fontRequests.push(requested);
          return Promise.resolve();
        },
      },
    );
    expect(Object.keys(bands).sort()).toEqual(["screen-east", "screen-west"]);
    for (let index = 0; index < screens.length; index += 1) {
      expect(composed[index].width).toBe(screens[index].width);
      expect(composed[index].height).toBe(screens[index].height);
    }
    // Each band awaited its own height-scaled font specs.
    expect(fontRequests).toEqual([scorerBandFonts(108), scorerBandFonts(90)]);
  });
});

function imageLike(width: number, height: number): HTMLImageElement {
  return {
    naturalWidth: width,
    naturalHeight: height,
  } as unknown as HTMLImageElement;
}

expect(scorerBandFontSpec(10)).toContain("10px");
