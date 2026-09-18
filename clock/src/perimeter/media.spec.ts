import { describe, expect, it } from "vitest";
import type { PerimeterAdLayout } from "../types";
import {
  backfillStorageGenerations,
  normalizeBaseLayout,
  validateWebMediaIdentity,
} from "./media";

const layout: PerimeterAdLayout = {
  version: 1,
  revision: "revision",
  columns: [
    {
      id: "column-1",
      files: {
        "1": { name: "left.png", source: "gs://bucket/location/left.png" },
        "3": { name: "right.png", source: "gs://bucket/location/right.png" },
      },
    },
  ],
};

describe("perimeter media identity", () => {
  it("rejects legacy files for web activation", () => {
    expect(validateWebMediaIdentity(layout)).toHaveLength(2);
  });

  it("normalizes legacy lane keys at the Firebase boundary", () => {
    const result = normalizeBaseLayout(layout, {
      version: 1,
      revision: "mapping",
      renderer: "web",
      framebuffer: { width: 8, height: 1, background: "black" },
      logicalScreens: {
        left: { id: "left", name: "Left", width: 4, height: 1 },
        right: { id: "right", name: "Right", width: 4, height: 1 },
      },
      compatibilityKeys: { base: { "1": "left", "3": "right" }, overlay: {} },
      regions: [],
      playback: { cueDurationMs: 20_000, videoPolicy: "fit-to-cue" },
    });
    expect(Object.keys(result[0]!.files)).toEqual(["left", "right"]);
  });

  it("backfills every file while preserving column order and IDs", async () => {
    const result = await backfillStorageGenerations(layout, (source) =>
      Promise.resolve(source.endsWith("left.png") ? "1" : "2"),
    );
    expect(result.columns.map((column) => column.id)).toEqual(["column-1"]);
    expect(result.columns[0]?.files["1"]?.generation).toBe("1");
    expect(result.columns[0]?.files["3"]?.generation).toBe("2");
  });

  it("refuses activation when a generation cannot be resolved", async () => {
    await expect(
      backfillStorageGenerations(layout, () => Promise.resolve(null)),
    ).rejects.toThrow("Storage generation unavailable");
  });
});
