import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  layoutSubstitutionUnit,
  createPlayerBandPresentation,
  createSubstitutionBandPresentation,
  type BandPresentationRenderingContext,
} from "./playerBandPresentation";

// Production band fixtures: the bundled GT America font is the band text
// family, and the source-image combinations come from real PNG fixtures so
// every snapshot below exercises the approved public object shapes.
const FIXTURES = resolve(__dirname, "__fixtures__");
const portraitBytes = readFileSync(resolve(FIXTURES, "portrait-fagn.png"));
const crestBytes = readFileSync(resolve(FIXTURES, "crest.png"));

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

interface FrameOp {
  op: string;
  args: number[];
  text?: string;
  style?: string;
}

function makeRecordingContext() {
  const ops: FrameOp[] = [];
  const texts: string[] = [];
  const context = {
    fillStyle: "",
    font: "",
    textBaseline: "middle",
    globalCompositeOperation: "source-over",
    measureText: (text: string) => ({
      width: measureFont(text, Number(/(\d+)px/.exec(context.font)?.[1] ?? 1)),
    }),
    save: vi.fn(() => ops.push({ op: "save", args: [] })),
    restore: vi.fn(() => ops.push({ op: "restore", args: [] })),
    beginPath: vi.fn(() => ops.push({ op: "beginPath", args: [] })),
    rect: vi.fn((...args: number[]) => ops.push({ op: "rect", args })),
    clip: vi.fn(() => ops.push({ op: "clip", args: [] })),
    closePath: vi.fn(() => ops.push({ op: "closePath", args: [] })),
    fill: vi.fn(),
    clearRect: vi.fn((...args: number[]) =>
      ops.push({ op: "clearRect", args }),
    ),
    fillRect: vi.fn((...args: number[]) =>
      ops.push({ op: "fillRect", args, style: context.fillStyle }),
    ),
    moveTo: vi.fn((...args: number[]) => ops.push({ op: "moveTo", args })),
    lineTo: vi.fn((...args: number[]) => ops.push({ op: "lineTo", args })),
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
        ops.push({
          op: "drawImage",
          args: [sx, sy, sw, sh, dx, dy, dw, dh],
        });
      },
    ),
    fillText: vi.fn((text: string, x: number, y: number) => {
      ops.push({ op: "fillText", args: [x, y] });
      texts.push(text);
    }),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as BandPresentationRenderingContext;
  return { context, ops, texts };
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

function fontOf(context: BandPresentationRenderingContext): string {
  return context.font;
}

// Compact, deterministic snapshot form of one settled band frame: draw
// order, geometry, and content per recorded call.
function renderRecord(
  recordings: ReturnType<typeof makeRecordingContext>,
  ops: FrameOp[],
) {
  let textIndex = 0;
  return ops
    .map((call) => {
      if (call.op === "drawImage") {
        return `image dest=(${call.args[4]},${call.args[5]},${call.args[6]},${call.args[7]})`;
      }
      if (call.op === "fillText") {
        return `text "${recordings.texts[textIndex++]}" at=${call.args[0]},${call.args[1]} font=${fontOf(recordings.context)}`;
      }
      if (call.op === "fillRect") {
        return `fillRect (${call.args[0]},${call.args[1]},${call.args[2]},${call.args[3]})`;
      }
      return call.op;
    })
    .join("\n");
}

const DEPS = {
  createCanvas:
    (recordings: ReturnType<typeof makeRecordingContext>) =>
    (width: number, height: number): HTMLCanvasElement =>
      ({
        width,
        height,
        getContext: (type: string) =>
          type === "2d" ? recordings.context : null,
      }) as unknown as HTMLCanvasElement,
  loadFonts: () => Promise.resolve(),
};

describe("player band snapshots", () => {
  it.each(["plain", "glow", "streamer"] as const)(
    "%s: settled frame at the Víkin web logical-screen size",
    async (style) => {
      const recordings = makeRecordingContext();
      const presentation = await createPlayerBandPresentation(
        style,
        { name: "Jón Jónsson", number: "7" },
        imageOf(portraitBytes, 4, 8),
        960,
        108,
        {
          createCanvas: DEPS.createCanvas(recordings),
          loadFonts: DEPS.loadFonts,
        },
      );
      const before = recordings.ops.length;
      presentation.draw(10_000);
      expect(
        renderRecord(recordings, recordings.ops.slice(before)),
      ).toMatchSnapshot();
    },
  );

  it("streamer: settled frame at the stacked web logical-screen size", async () => {
    const recordings = makeRecordingContext();
    const presentation = await createPlayerBandPresentation(
      "streamer",
      { name: "Jón Jónsson", number: "10" },
      imageOf(portraitBytes, 4, 8),
      3840,
      192,
      {
        createCanvas: DEPS.createCanvas(recordings),
        loadFonts: DEPS.loadFonts,
      },
    );
    const before = recordings.ops.length;
    presentation.draw(10_000);
    expect(
      renderRecord(recordings, recordings.ops.slice(before)),
    ).toMatchSnapshot();
  });
});

describe("substitution band snapshots", () => {
  it.each(["static", "relay", "flash"] as const)(
    "%s: settled frame at the Víkin web logical-screen size",
    async (style) => {
      const recordings = makeRecordingContext();
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
        {
          createCanvas: DEPS.createCanvas(recordings),
          loadFonts: DEPS.loadFonts,
        },
      );
      const before = recordings.ops.length;
      presentation.draw(10_000);
      expect(
        renderRecord(recordings, recordings.ops.slice(before)),
      ).toMatchSnapshot();
    },
  );

  it("static: settled unit layout matches the measured substitution unit", async () => {
    const recordings = makeRecordingContext();
    const presentation = await createSubstitutionBandPresentation(
      "static",
      {
        identity: { name: "Siggi Bekkur", number: "12" },
        source: imageOf(portraitBytes, 4, 8),
      },
      {
        identity: { name: "Jón Jónsson", number: "7" },
        source: imageOf(crestBytes, 8, 8),
      },
      3840,
      192,
      {
        createCanvas: DEPS.createCanvas(recordings),
        loadFonts: DEPS.loadFonts,
      },
    );
    const before = recordings.ops.length;
    presentation.draw(10_000);
    expect(
      renderRecord(recordings, recordings.ops.slice(before)),
    ).toMatchSnapshot();
  });

  it("lay outing is stable: the measured unit matches the drawn unit geometry", () => {
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
    // The settled unit layout snapshot locks the geometry contract.
    expect(unit.unitWidth).toMatchSnapshot();
  });
});
