import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SCORER_BAND_STYLE,
  bandGap,
  bandNameFontSize,
  bandNumberFontSize,
  composeScorerBand,
  scorerBandFonts,
  type BandRenderingContext,
} from "./scorerCompositor";

// Production scorer fixtures: the bundled GT America font is the band text
// family (declared in src/assets/fonts/gt-america.css with a 700 weight),
// and the source-image combinations come from real PNG fixtures so every
// snapshot below exercises the approved public object shapes.
const FONT_FAMILY = SCORER_BAND_STYLE.fontFamily;
const FIXTURES = resolve(__dirname, "__fixtures__");
const portraitBytes = readFileSync(resolve(FIXTURES, "portrait-fagn.png"));
const crestBytes = readFileSync(resolve(FIXTURES, "crest.png"));

interface RecordingCall {
  op: "drawImage" | "fillText";
  args: number[];
}

// A deterministic text metric that emulates the GT America bold width so
// snapshots are stable across environments without DOM rasterization.
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

function makeRecordingContext() {
  const calls: RecordingCall[] = [];
  const context = {
    fillStyle: "",
    font: "",
    textBaseline: "alphabetic",
    measureText: (text: string) => ({
      width: measureFont(text, Number(/(\d+)px/.exec(context.font)?.[1] ?? 1)),
    }),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
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
      calls.push({ op: "fillText", args: [0, 0, 0, 0, x, y] });
      texts.push(text);
    }),
  } as unknown as BandRenderingContext;
  const texts: string[] = [];
  const fonts: string[] = [];
  return {
    context,
    calls,
    texts,
    fonts,
  };
}

function fontOf(context: BandRenderingContext): string {
  return context.font;
}

interface FakeCanvas extends HTMLCanvasElement {
  getContext(type: string): BandRenderingContext | null;
}

function depsFor(recordings: ReturnType<typeof makeRecordingContext>) {
  const createdFonts: string[] = [];
  return {
    deps: {
      createCanvas: (width: number, height: number): HTMLCanvasElement => {
        const canvas = {
          width,
          height,
          getContext: (type: string) =>
            type === "2d" ? recordings.context : null,
        } as unknown as FakeCanvas;
        return canvas;
      },
      loadFonts: (requested: string[]) => {
        createdFonts.push(...requested);
        return Promise.resolve();
      },
    },
    createdFonts,
  };
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

// Compact, deterministic snapshot form of one composed band: draw order,
// geometry, and content per recorded call.
function renderRecord(
  recordings: ReturnType<typeof makeRecordingContext>,
  texts: string[],
) {
  let textIndex = 0;
  return recordings.calls
    .map((call) =>
      call.op === "drawImage"
        ? `image crop=(${call.args[0]},${call.args[1]},${call.args[2]},${call.args[3]}) dest=(${call.args[4]},${call.args[5]},${call.args[6]},${call.args[7]})`
        : `text "${texts[textIndex++]}" at=${call.args[4]},${call.args[5]} font=${fontOf(recordings.context)}`,
    )
    .join("\n");
}

describe("production scorer font", () => {
  it("uses the bundled GT America bold family for band text", () => {
    expect(FONT_FAMILY).toBe('"GT America"');
    expect(SCORER_BAND_STYLE.fontWeight).toBe(700);
  });

  it("keeps height multipliers in parity with the server band renderer", () => {
    // Mirrors functions/src/goalScorerPreparation.ts constants so both
    // renderers share the same visual proportions.
    expect(SCORER_BAND_STYLE.gapMultiplier).toBe(0.45);
    expect(SCORER_BAND_STYLE.numberFontMultiplier).toBe(0.55);
    expect(SCORER_BAND_STYLE.nameFontMultiplier).toBe(0.28);
    expect(SCORER_BAND_STYLE.maxNameWidthMultiplier).toBe(3);
    const height = 108;
    expect(bandGap(height)).toBe(Math.max(1, Math.round(height * 0.45)));
    expect(bandNumberFontSize(height)).toBe(Math.round(height * 0.55));
    expect(bandNameFontSize(height)).toBe(Math.round(height * 0.28));
    expect(scorerBandFonts(height)).toEqual([
      '700 59px "GT America"',
      '700 30px "GT America"',
    ]);
  });
});

describe("stable band snapshots", () => {
  it("personalized: portrait fixture + number + name at the Víkin web mapping", async () => {
    const recordings = makeRecordingContext();
    const { deps } = depsFor(recordings);
    await composeScorerBand(
      { name: "Jón Jónsson", number: "7" },
      imageOf(portraitBytes, 4, 8),
      960,
      108,
      deps,
    );
    expect(renderRecord(recordings, recordings.texts)).toMatchSnapshot();
  });

  it("crest fallback: crest fixture + number + name at the Víkin web mapping", async () => {
    const recordings = makeRecordingContext();
    const { deps } = depsFor(recordings);
    await composeScorerBand(
      { name: "Jón Jónsson", number: "7" },
      imageOf(crestBytes, 8, 8),
      960,
      108,
      deps,
    );
    expect(renderRecord(recordings, recordings.texts)).toMatchSnapshot();
  });

  it("personalized: long name truncation stays deterministic", async () => {
    const recordings = makeRecordingContext();
    const { deps } = depsFor(recordings);
    await composeScorerBand(
      { name: "Jón Jónssonar Jónssonssonarson", number: "10" },
      imageOf(portraitBytes, 4, 8),
      3840,
      192,
      deps,
    );
    expect(renderRecord(recordings, recordings.texts)).toMatchSnapshot();
  });
});
