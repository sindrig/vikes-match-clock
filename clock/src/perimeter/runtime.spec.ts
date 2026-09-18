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

function loadedMedia(
  kind: "image" | "video",
  width = 2,
  height = 1,
): LoadedPerimeterMedia {
  const element = {
    naturalWidth: width,
    naturalHeight: height,
    videoWidth: width,
    videoHeight: height,
    duration: 20,
    dataset: {},
    pause: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
  } as unknown as HTMLImageElement & HTMLVideoElement;
  return {
    element,
    kind,
    durationMs: kind === "video" ? 20_000 : 0,
    release: vi.fn(),
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

  it("keeps the visible overlay while a replacement is preparing", async () => {
    const { runtime, loadPair, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    await runtime.setOverlay(overlay, 0);

    let resolveReplacement:
      | ((value: Record<string, LoadedPerimeterMedia>) => void)
      | undefined;
    loadPair.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReplacement = resolve;
        }),
    );
    const replacement = runtime.setOverlay(
      { ...overlay, id: "overlay-2" },
      1_000,
    );
    runtime.render(1_000);
    expect(getLastFrame()?.overlay?.left).toBeDefined();
    resolveReplacement?.({ left: loadedMedia("image") });
    await replacement;
  });

  it("keeps the visible overlay when a replacement fails", async () => {
    const { runtime, loadPair, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    await runtime.setOverlay(overlay, 0);
    loadPair.mockRejectedValueOnce(new Error("overlay decode failed"));

    await expect(
      runtime.setOverlay({ ...overlay, id: "overlay-2" }, 1_000),
    ).rejects.toThrow("overlay decode failed");
    runtime.render(1_000);
    expect(getLastFrame()?.overlay?.left).toBeDefined();
  });

  it("waits for a cue boundary before replacing an active base revision", async () => {
    const first = loadedMedia("image");
    const second = loadedMedia("video");
    const render = vi.fn<(sources: PerimeterRenderSources) => void>();
    const loadPair = vi
      .fn<
        (
          files: Record<string, PerimeterOverlayFile>,
        ) => Promise<Record<string, LoadedPerimeterMedia>>
      >()
      .mockResolvedValueOnce({ left: first })
      .mockResolvedValueOnce({ left: second });
    const runtime = new PerimeterRuntime(configuration, {
      renderer: { render },
      loader: { loadPair },
      now: () => 0,
    });

    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    runtime.render(0);
    await runtime.prepareBase({ ...layout, revision: "ads-2" });
    runtime.activatePreparedBase(1_000);
    runtime.render(1_000);
    expect(render).toHaveBeenLastCalledWith({ base: { left: first.element } });
    runtime.render(20_000);
    expect(render).toHaveBeenLastCalledWith({ base: { left: second.element } });
  });

  it("rejects incomplete pairs and media with incorrect logical dimensions", async () => {
    const { runtime, loadPair } = createRuntime();
    loadPair.mockRejectedValueOnce(new Error("download failed"));
    await expect(runtime.prepareBase(layout)).rejects.toThrow(
      "download failed",
    );

    await expect(
      runtime.prepareBase({
        ...layout,
        columns: [{ id: "incomplete", files: {} }],
      }),
    ).rejects.toThrow("missing left");

    const loader = {
      loadPair: vi.fn().mockResolvedValue({
        left: loadedMedia("image", 3, 1),
      }),
    };
    const invalidRuntime = new PerimeterRuntime(configuration, {
      renderer: { render: vi.fn() },
      loader,
    });
    await expect(invalidRuntime.prepareBase(layout)).rejects.toThrow(
      "expected 2x1",
    );
  });

  it("keeps the base clock and overlay state independent while powered off", async () => {
    const { runtime, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    await runtime.setOverlay(overlay, 0);
    runtime.setPowered(false, 1_000);
    runtime.render(5_000);
    expect(getLastFrame()).toEqual({ base: {} });

    runtime.setPowered(true, 10_000);
    runtime.render(10_000);
    expect(getLastFrame()?.base.left).toBeDefined();
    expect(getLastFrame()?.overlay?.left).toBeDefined();
  });

  it("rejects a malformed mapping without replacing the renderer configuration", () => {
    const replaceConfiguration = vi.fn(() => true);
    const runtime = new PerimeterRuntime(configuration, {
      renderer: { render: vi.fn(), replaceConfiguration },
      loader: { loadPair: vi.fn() },
    });
    const malformed = {
      ...configuration,
      framebuffer: { ...configuration.framebuffer, width: 0 },
    };
    expect(runtime.replaceConfiguration(malformed)).toBe(false);
    expect(replaceConfiguration).not.toHaveBeenCalled();
    expect(runtime.replaceConfiguration(configuration)).toBe(true);
    expect(replaceConfiguration).toHaveBeenCalledTimes(1);
  });
});
