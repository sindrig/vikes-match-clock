import { describe, expect, it, vi } from "vitest";
import type { PerimeterOverlayFile } from "../types";
import { PerimeterMediaLoader, type LoadedPerimeterMedia } from "./mediaLoader";

const file = (name: string): PerimeterOverlayFile => ({
  name,
  source: `gs://bucket/${name}`,
  generation: "1",
});

function media(): LoadedPerimeterMedia {
  return {
    element: {} as HTMLImageElement,
    kind: "image",
    durationMs: 0,
    release: vi.fn(),
  };
}

class StubLoader extends PerimeterMediaLoader {
  override load(asset: PerimeterOverlayFile): Promise<LoadedPerimeterMedia> {
    if (asset.name === "broken.png") {
      return Promise.reject(new Error("decode failed"));
    }
    return Promise.resolve(media());
  }
}

describe("PerimeterMediaLoader", () => {
  it("releases already decoded members when a pair is incomplete", async () => {
    const loader = new StubLoader({
      bucket: "bucket",
      resolveDownloadUrl: vi.fn(),
    });
    const first = media();
    const release = vi.spyOn(first, "release");
    vi.spyOn(loader, "load")
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("decode failed"));

    await expect(
      loader.loadPair({
        left: file("left.png"),
        right: file("broken.png"),
      }),
    ).rejects.toThrow("decode failed");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("requires immutable Storage identity before loading", async () => {
    const loader = new PerimeterMediaLoader({
      bucket: "bucket",
      resolveDownloadUrl: vi.fn(),
    });
    await expect(
      loader.load({ name: "legacy.png", source: "gs://bucket/legacy.png" }),
    ).rejects.toThrow("no Storage generation");
  });
});
