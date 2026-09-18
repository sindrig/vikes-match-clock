import { describe, expect, it, vi } from "vitest";
import type {
  PerimeterAdLayout,
  PerimeterDisplayConfig,
  PerimeterOverlay,
  PerimeterOverlayFile,
} from "../types";
import type { LoadedPerimeterMedia } from "./mediaLoader";
import { PerimeterRuntime } from "./runtime";
import type { PerimeterRenderSources } from "./webglRenderer";

const configuration: PerimeterDisplayConfig = {
  version: 1,
  revision: "mapping",
  renderer: "web",
  framebuffer: { width: 4, height: 1, background: "black" },
  logicalScreens: {
    left: { id: "left", name: "Left", width: 2, height: 1 },
  },
  compatibilityKeys: { base: { "1": "left" }, overlay: { "2": "left" } },
  regions: [
    {
      id: "left-region",
      logicalScreenId: "left",
      source: { x: 0, y: 0, width: 2, height: 1 },
      destination: { x: 0, y: 0, width: 2, height: 1 },
      transform: {
        rotation: 0,
        flipX: false,
        flipY: false,
        allowScaling: false,
        allowClipping: false,
        allowSourceOverlap: false,
        allowDestinationOverlap: false,
        zIndex: 0,
      },
    },
  ],
  playback: { cueDurationMs: 20_000, videoPolicy: "fit-to-cue" },
};

const layout: PerimeterAdLayout = {
  version: 1,
  revision: "ads-1",
  columns: [
    {
      id: "column-1",
      files: {
        "1": {
          name: "ad.png",
          source: "gs://bucket/ad.png",
          generation: "1",
        },
      },
    },
  ],
};

const overlay: PerimeterOverlay = {
  version: 1,
  id: "overlay-1",
  columns: [
    {
      durationMs: 10_000,
      files: {
        "2": {
          name: "overlay.png",
          source: "gs://bucket/overlay.png",
          generation: "1",
        },
      },
    },
  ],
};

function createRuntime() {
  let lastFrame: PerimeterRenderSources | null = null;
  let renderCount = 0;
  const render = vi.fn<(sources: PerimeterRenderSources) => void>((sources) => {
    lastFrame = sources;
    renderCount += 1;
  });
  const release = vi.fn();
  const element = {
    naturalWidth: 2,
    naturalHeight: 1,
    dataset: {},
  } as unknown as HTMLImageElement;
  const media: LoadedPerimeterMedia = {
    element,
    kind: "image",
    durationMs: 0,
    release,
  };
  const loadPair = vi.fn<
    (
      files: Record<string, PerimeterOverlayFile>,
    ) => Promise<Record<string, LoadedPerimeterMedia>>
  >((files) =>
    Promise.resolve(
      Object.fromEntries(Object.keys(files).map((key) => [key, media])),
    ),
  );
  const runtime = new PerimeterRuntime(configuration, {
    renderer: { render },
    loader: { loadPair },
    now: () => 0,
  });
  return {
    runtime,
    render,
    loadPair,
    release,
    getLastFrame: () => lastFrame,
    getRenderCount: () => renderCount,
  };
}

describe("PerimeterRuntime", () => {
  it("keeps the framebuffer black while off and starts cue zero on power on", async () => {
    const { runtime, render, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);

    runtime.render(1);
    expect(render).toHaveBeenLastCalledWith({ base: {} });

    runtime.setPowered(true, 100);
    runtime.render(100);
    const poweredFrame = getLastFrame();
    expect(poweredFrame?.base.left).toBeDefined();
  });

  it("keeps the active revision when a replacement cannot be prepared", async () => {
    const { runtime, loadPair, getLastFrame, getRenderCount } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    runtime.render(0);
    const activeCallCount = getRenderCount();

    loadPair.mockRejectedValueOnce(new Error("decode failed"));
    await expect(
      runtime.prepareBase({ ...layout, revision: "ads-2" }),
    ).rejects.toThrow("decode failed");
    runtime.render(1_000);

    expect(getRenderCount()).toBe(activeCallCount + 1);
    const retainedFrame = getLastFrame();
    expect(retainedFrame?.base.left).toBeDefined();
  });

  it("renders a prepared overlay above the active base channel", async () => {
    const { runtime, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    await runtime.setOverlay(overlay, 0);
    runtime.render(1);

    const overlayFrame = getLastFrame();
    expect(overlayFrame?.base.left).toBeDefined();
    expect(overlayFrame?.overlay?.left).toBeDefined();
  });
});
