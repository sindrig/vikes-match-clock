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
  const clearChannel = vi.fn();
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
    renderer: { render, clearChannel },
    loader: { loadPair },
    now: () => 0,
  });
  return {
    runtime,
    render,
    loadPair,
    release,
    clearChannel,
    getLastFrame: () => lastFrame,
    getRenderCount: () => renderCount,
  };
}

function loadedMedia(
  kind: "image" | "video",
  width = 2,
  height = 1,
  readyState = 4,
): LoadedPerimeterMedia {
  const element = {
    naturalWidth: width,
    naturalHeight: height,
    videoWidth: width,
    videoHeight: height,
    duration: 20,
    readyState,
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
  it("shows idle content only while off, preserves overlays, and supports blackout", async () => {
    const { runtime, getLastFrame } = createRuntime();
    const canvas = document.createElement("canvas");
    const draw = vi.fn();
    runtime.setIdleClocks({ left: { canvas, draw } });
    await runtime.setOverlay(overlay, 0);
    runtime.render(100);
    expect(getLastFrame()?.base.left).toBe(canvas);
    expect(getLastFrame()?.overlay).toBeUndefined();
    expect(getLastFrame()?.baseDynamic).toBe(true);
    runtime.render(101);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(getLastFrame()?.baseDynamic).toBe(false);
    runtime.setPowered(true, 200);
    runtime.render(200);
    expect(getLastFrame()?.base.left).toBeUndefined();
    expect(getLastFrame()?.overlay?.left).toBeDefined();
    runtime.setPowered(false, 300);
    runtime.render(300);
    expect(getLastFrame()?.base.left).toBe(canvas);
    runtime.setIdleClocks(null);
    runtime.render(400);
    expect(getLastFrame()).toEqual({ base: {}, overlayDynamic: false });
  });

  it("keeps the framebuffer black while off and starts cue zero on power on", async () => {
    const { runtime, render, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);

    runtime.render(1);
    expect(render).toHaveBeenLastCalledWith({
      base: {},
      overlayDynamic: false,
    });

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

  it("holds an overlay slot on the base until its video has a decoded frame", async () => {
    const { runtime, loadPair, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    const unready = loadedMedia("video");
    (unready.element as HTMLVideoElement).readyState = 1;
    loadPair.mockResolvedValueOnce({ left: unready });

    await runtime.setOverlay(overlay, 0);
    runtime.render(1);
    // The renderer would keep the previous generation's texture for a slot
    // whose video has no decoded frame yet, so the runtime filters the
    // source out and the base channel fills the region instead.
    expect(getLastFrame()?.overlay).toEqual({});

    (unready.element as HTMLVideoElement).readyState = 2;
    runtime.render(1_000);
    expect(getLastFrame()?.overlay?.left).toBeDefined();
  });

  it("never resurrects the cleared overlay when a later command activates", async () => {
    const { runtime, loadPair, clearChannel, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    // First overlay (video pair) is shown and reaches the renderer.
    await runtime.setOverlay(overlay, 0);
    runtime.render(0);
    expect(getLastFrame()?.overlay?.left).toBeDefined();

    // Clearing shows the base again and forgets the cleared generation's
    // uploaded pixels in the renderer.
    await runtime.setOverlay(null, 100);
    runtime.render(100);
    expect(getLastFrame()?.overlay).toBeUndefined();
    expect(clearChannel).toHaveBeenCalledWith("overlay");

    // Selecting another overlay afterwards must not bring the cleared one
    // back: during preparation the base channel shows through.
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
    expect(getLastFrame()?.overlay).toBeUndefined();

    // The replacement commits while its video has not decoded a frame yet:
    // the slot must stay on the base rather than flashing the cleared
    // generation's pixels (the renderer keeps the previous texture for a
    // slot whose upload is skipped).
    resolveReplacement?.({ left: loadedMedia("video", 2, 1, 1) });
    await replacement;
    runtime.render(1_100);
    expect(getLastFrame()?.overlay).toEqual({});
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
    // A swap keeps the active generation visible until its replacement is
    // committed, so the overlay never blinks to the base in between.
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

  it("ignores a re-delivery of the already-live overlay command", async () => {
    const { runtime, loadPair, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    await runtime.setOverlay(overlay, 0);
    runtime.render(0);
    expect(getLastFrame()?.overlay?.left).toBeDefined();
    const loadCalls = loadPair.mock.calls.length;

    // A snapshot re-delivery (reconnect) re-runs setOverlay with the same
    // id: the live generation keeps playing instead of restarting.
    await runtime.setOverlay(overlay, 1_000);
    expect(loadPair).toHaveBeenCalledTimes(loadCalls);
    runtime.render(1_000);
    expect(getLastFrame()?.overlay?.left).toBeDefined();
  });

  it("backfills missing overlay generations before loading media", async () => {
    const { runtime, loadPair, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    const legacyOverlay: PerimeterOverlay = {
      version: 1,
      id: "overlay-legacy",
      columns: [
        {
          durationMs: 10_000,
          files: {
            "2": { name: "legacy.png", source: "gs://bucket/legacy.png" },
          },
        },
      ],
    };
    await runtime.setOverlay(legacyOverlay, 0, () => Promise.resolve("42"));
    const loaded = loadPair.mock.lastCall?.[0];
    expect(loaded?.left?.name).toBe("legacy.png");
    expect(loaded?.left?.generation).toBe("42");
    runtime.render(1);
    expect(getLastFrame()?.overlay?.left).toBeDefined();
  });

  it("refuses an overlay whose generation cannot be resolved", async () => {
    const { runtime, loadPair } = createRuntime();
    const legacyOverlay: PerimeterOverlay = {
      version: 1,
      id: "overlay-legacy",
      columns: [
        {
          durationMs: 10_000,
          files: {
            "2": { name: "legacy.png", source: "gs://bucket/legacy.png" },
          },
        },
      ],
    };
    await expect(
      runtime.setOverlay(legacyOverlay, 0, () => Promise.resolve(null)),
    ).rejects.toThrow("Storage generation unavailable");
    expect(loadPair).not.toHaveBeenCalled();
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
    expect(render).toHaveBeenLastCalledWith({
      base: { left: first.element },
      overlayDynamic: false,
    });
    runtime.render(20_000);
    expect(render).toHaveBeenLastCalledWith({
      base: { left: second.element },
      overlayDynamic: false,
    });
  });

  it("advances to the next cue immediately on skipCue", async () => {
    const first = loadedMedia("image");
    const second = loadedMedia("video");
    const third = loadedMedia("image");
    const render = vi.fn<(sources: PerimeterRenderSources) => void>();
    const loadPair = vi
      .fn<
        (
          files: Record<string, PerimeterOverlayFile>,
        ) => Promise<Record<string, LoadedPerimeterMedia>>
      >()
      .mockResolvedValueOnce({ left: first })
      .mockResolvedValueOnce({ left: second })
      .mockResolvedValueOnce({ left: third });
    const multiLayout = {
      ...layout,
      columns: [
        layout.columns[0]!,
        { ...layout.columns[0]!, id: "column-2" },
        { ...layout.columns[0]!, id: "column-3" },
      ],
    };
    const runtime = new PerimeterRuntime(configuration, {
      renderer: { render },
      loader: { loadPair },
      now: () => 0,
    });

    await runtime.prepareBase(multiLayout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    runtime.render(0);
    expect(render).toHaveBeenLastCalledWith({
      base: { left: first.element },
      overlayDynamic: false,
    });

    // Halfway through cue 0, a skip lands on cue 1 and gives it a full
    // fresh 20s duration.
    runtime.skipCue(10_000);
    expect(render).toHaveBeenLastCalledWith({
      base: { left: second.element },
      overlayDynamic: false,
    });
    runtime.render(29_000);
    expect(render).toHaveBeenLastCalledWith({
      base: { left: second.element },
      overlayDynamic: false,
    });
    runtime.render(30_000);
    expect(render).toHaveBeenLastCalledWith({
      base: { left: third.element },
      overlayDynamic: false,
    });
  });

  it("does not skip when the timeline is not running or a single cue loops", async () => {
    const single = loadedMedia("image");
    const loadPair = vi.fn().mockResolvedValue({ left: single });
    const render = vi.fn<(sources: PerimeterRenderSources) => void>();
    const runtime = new PerimeterRuntime(configuration, {
      renderer: { render },
      loader: { loadPair },
      now: () => 0,
    });

    // Nothing prepared or started: skip is inert and the frame stays black.
    runtime.skipCue(1_000);
    runtime.render(1_000);
    expect(render).toHaveBeenLastCalledWith({
      base: {},
      overlayDynamic: false,
    });

    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    runtime.render(0);
    expect(render).toHaveBeenLastCalledWith({
      base: { left: single.element },
      overlay: undefined,
      overlayDynamic: false,
    });
    const renderCount = vi.mocked(render).mock.calls.length;

    // A single-cue playlist has no next cue; skip changes nothing.
    runtime.skipCue(2_000);
    expect(vi.mocked(render).mock.calls.length).toBe(renderCount);
  });

  it("rejects incomplete pairs", async () => {
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
  });

  it("warns about mismatched media dimensions without blocking playback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { runtime, loadPair, getLastFrame } = createRuntime();
    loadPair.mockResolvedValueOnce({ left: loadedMedia("image", 3, 1) });

    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    runtime.render(0);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("expected 2x1"));
    expect(getLastFrame()?.base.left).toBeDefined();
    warn.mockRestore();
  });

  it("keeps the base clock and overlay state independent while powered off", async () => {
    const { runtime, getLastFrame } = createRuntime();
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    await runtime.setOverlay(overlay, 0);
    runtime.setPowered(false, 1_000);
    runtime.render(5_000);
    expect(getLastFrame()).toEqual({ base: {}, overlayDynamic: false });

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
