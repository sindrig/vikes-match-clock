import { afterEach, describe, expect, it, vi } from "vitest";
import {
  composeIdleClock,
  createIdleClocks,
  formatIdleTime,
  idleClockPosition,
} from "./idleClock";
import { parsePerimeterState } from "../contexts/firebaseParsers";

const crest = {
  naturalWidth: 400,
  naturalHeight: 500,
} as unknown as HTMLImageElement;

function makeRecordingCanvas() {
  const drawImage = vi.fn();
  const fillText = vi.fn();
  const context = {
    fillStyle: "",
    font: "",
    textBaseline: "",
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage,
    fillText,
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
  return { canvas, context, drawImage, fillText };
}

describe("composeIdleClock", () => {
  it("scales the canvas to the logical screen's native size", () => {
    const { canvas } = makeRecordingCanvas();

    composeIdleClock({ width: 3648, height: 192 }, crest, canvas);

    expect(canvas.width).toBe(3648);
    expect(canvas.height).toBe(192);
  });

  it("throws when the 2D context is unavailable", () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
    } as unknown as HTMLCanvasElement;

    expect(() =>
      composeIdleClock({ width: 3648, height: 192 }, crest, canvas),
    ).toThrow("Idle clock canvas is unavailable.");
  });

  it("draws a black background and one pair per origin when idle", () => {
    const { canvas, context, drawImage, fillText } = makeRecordingCanvas();
    const presentation = composeIdleClock(
      { width: 3648, height: 192 },
      crest,
      canvas,
    );

    presentation.draw(0, new Date("2026-09-24T13:07:00Z"));

    expect(context.fillStyle).toBe("white");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 3648, 192);
    // The pair is drawn twice: at the scroll origin and one width behind it
    // so the wrap is seamless.
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(fillText).toHaveBeenCalledTimes(2);
    const time = formatIdleTime(new Date("2026-09-24T13:07:00Z"));
    expect(fillText).toHaveBeenLastCalledWith(time, expect.anything(), 0, 50);
    expect(context.textBaseline).toBe("middle");
  });

  it("moves the pair with the 60-second scroll position", () => {
    const { canvas, drawImage } = makeRecordingCanvas();
    const presentation = composeIdleClock(
      { width: 3648, height: 192 },
      crest,
      canvas,
    );

    presentation.draw(30_000, new Date("2026-09-24T13:07:00Z"));

    expect(idleClockPosition(30_000, 3648)).toBe(1824);
    const drawCalls = drawImage.mock.calls;
    expect(drawCalls).toHaveLength(2);
    // Half-way through the minute both copies sit around x=1824.
    for (const call of drawCalls) {
      expect(call[3]).toBeGreaterThan(0);
      expect(call[4]).toBeGreaterThan(0);
    }
  });
});

describe("createIdleClocks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the crest and fonts once and composes one canvas per strip", async () => {
    class MockImage {
      naturalWidth = 400;
      naturalHeight = 500;
      src = "";
      decode = vi.fn(() => Promise.resolve());
    }
    vi.stubGlobal("Image", MockImage as unknown as typeof Image);
    const fontsLoad = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, "fonts", {
      value: { load: fontsLoad },
      configurable: true,
    });
    // jsdom has no 2D context; every composed strip gets a fresh recording
    // canvas.
    const created: HTMLCanvasElement[] = [];
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "canvas") {
        const { canvas } = makeRecordingCanvas();
        created.push(canvas);
        return canvas;
      }
      return document.createElement(tagName);
    });

    const clocks = await createIdleClocks([
      { id: "strip-1", width: 3648, height: 192 },
      { id: "strip-2", width: 3264, height: 192 },
    ]);

    expect(fontsLoad).toHaveBeenCalledWith('bold 100px "GT America"');
    expect(Object.keys(clocks)).toEqual(["strip-1", "strip-2"]);
    expect(created).toHaveLength(2);
    expect(created[0]!.width).toBe(3648);
    expect(created[1]!.width).toBe(3264);
    expect(typeof clocks["strip-1"]!.draw).toBe("function");
  });
});

describe("perimeter idle clock", () => {
  it("uses Icelandic 24-hour time across minute and midnight boundaries", () => {
    expect(formatIdleTime(new Date("2026-09-23T23:59:59Z"))).toBe("23:59");
    expect(formatIdleTime(new Date("2026-09-24T00:00:00Z"))).toBe("00:00");
    expect(formatIdleTime(new Date("2026-09-24T13:07:00+02:00"))).toBe("11:07");
  });

  it("moves right once per minute independently of strip width and wraps", () => {
    expect(idleClockPosition(0, 3648)).toBe(0);
    expect(idleClockPosition(30_000, 3648)).toBe(1824);
    expect(idleClockPosition(30_000, 3264)).toBe(1632);
    expect(idleClockPosition(60_000, 3648)).toBe(0);
    expect(idleClockPosition(90_000, 3648)).toBe(1824);
  });

  it("only enables the presentation for an explicit boolean true", () => {
    for (const idleClock of [undefined, null, "true", 1, false]) {
      expect(parsePerimeterState({ idleClock })?.idleClock === true).toBe(
        false,
      );
    }
    expect(parsePerimeterState({ idleClock: true })?.idleClock).toBe(true);
  });
});
