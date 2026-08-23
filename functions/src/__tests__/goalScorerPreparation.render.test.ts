import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";

vi.mock("firebase-admin", () => {
  const mockRef = vi.fn(() => ({
    once: vi.fn().mockResolvedValue({ val: () => null }),
    set: vi.fn().mockResolvedValue(undefined),
  }));
  return {
    default: {
      apps: [],
      initializeApp: vi.fn(),
      database: vi.fn(() => ({ ref: mockRef })),
      storage: vi.fn(() => ({
        bucket: vi.fn(() => ({
          file: vi.fn(() => ({
            exists: vi.fn().mockResolvedValue([false]),
            download: vi.fn().mockResolvedValue([Buffer.from("")]),
            save: vi.fn().mockResolvedValue(undefined),
          })),
        })),
      })),
    },
    apps: [],
    initializeApp: vi.fn(),
    database: vi.fn(() => ({ ref: mockRef })),
    storage: vi.fn(() => ({
      bucket: vi.fn(() => ({
        file: vi.fn(() => ({
          exists: vi.fn().mockResolvedValue([false]),
          download: vi.fn().mockResolvedValue([Buffer.from("")]),
          save: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    })),
  };
});

import {
  renderBand,
  estimateTextWidth,
  sanitizeFilename,
} from "../goalScorerPreparation";

describe("renderBand", () => {
  it("renders a native-size repeating band", async () => {
    const source = await sharp({
      create: {
        width: 200,
        height: 300,
        channels: 3,
        background: { r: 200, g: 30, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const band = await renderBand(source, {
      width: 920,
      height: 192,
      number: 7,
      name: "Jón Jónsson",
    });
    const meta = await sharp(band).metadata();
    expect(meta.width).toBe(920);
    expect(meta.height).toBe(192);
    expect(meta.format).toBe("png");
  });

  it("renders with no number and an empty name", async () => {
    const source = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 3,
        background: { r: 0, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer();
    const band = await renderBand(source, {
      width: 480,
      height: 192,
      number: undefined,
      name: "",
    });
    const meta = await sharp(band).metadata();
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(192);
  });

  it("handles a tiny source without failing", async () => {
    const source = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();
    const band = await renderBand(source, {
      width: 384,
      height: 192,
      number: "10",
      name: "A",
    });
    const meta = await sharp(band).metadata();
    expect(meta.width).toBe(384);
    expect(meta.height).toBe(192);
  });
});

describe("estimateTextWidth", () => {
  it("returns a positive integer for any text", () => {
    expect(estimateTextWidth("", 10)).toBeGreaterThanOrEqual(1);
    expect(estimateTextWidth("7", 105)).toBeGreaterThan(0);
    expect(estimateTextWidth("Jón Jónsson", 53)).toBeGreaterThan(
      estimateTextWidth("7", 53),
    );
  });
});

describe("sanitizeFilename", () => {
  it("replaces unsafe characters", () => {
    expect(sanitizeFilename("a/b\\c:d")).toBe("a_b_c_d");
  });
  it("falls back for an empty result", () => {
    expect(sanitizeFilename("")).toBe("player");
  });
});
