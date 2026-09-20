import { describe, expect, it, vi } from "vitest";
import type {
  PerimeterAdLayout,
  PerimeterDisplayConfig,
  GoalScorerOverlayCommand,
  PerimeterOverlay,
} from "../types";
import type { LoadedPerimeterMedia } from "./mediaLoader";
import type { Mock } from "vitest";
import type { PerimeterOverlayScorerDependencies } from "./runtime";
import { PerimeterRuntime } from "./runtime";
import type { PerimeterRenderSources } from "./webglRenderer";

const configuration: PerimeterDisplayConfig = {
  version: 1,
  revision: "mapping-1",
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

const fileOverlay: PerimeterOverlay = {
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

const scorerCommand: GoalScorerOverlayCommand = {
  version: 2,
  kind: "goal-scorer",
  id: "scorer-1",
  player: { id: "2492", name: "Jón Jónsson", number: "7" },
};

function fakeCanvas(tag: string): HTMLCanvasElement {
  return {
    width: 2,
    height: 1,
    tag,
    dataset: {},
  } as unknown as HTMLCanvasElement;
}

type LoadSourceMock = Mock<PerimeterOverlayScorerDependencies["loadSource"]>;
type ComposeMock = Mock<PerimeterOverlayScorerDependencies["compose"]>;

interface Harness {
  runtime: PerimeterRuntime;
  render: ReturnType<typeof vi.fn>;
  loadPair: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  scorer: PerimeterOverlayScorerDependencies & {
    loadSource: LoadSourceMock;
    compose: ComposeMock;
  };
  releaseSource: ReturnType<typeof vi.fn>;
  getLastFrame: () => PerimeterRenderSources | null;
  canvases: string[];
}

function createHarness(
  overrides: {
    loadSource?: LoadSourceMock;
    compose?: ComposeMock;
    ensureFonts?: PerimeterOverlayScorerDependencies["ensureFonts"];
  } = {},
): Harness {
  let lastFrame: PerimeterRenderSources | null = null;
  const render = vi.fn<(sources: PerimeterRenderSources) => void>((sources) => {
    lastFrame = sources;
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
  const loadPair = vi.fn().mockResolvedValue({ left: media });
  const releaseSource = vi.fn();
  const canvases: string[] = [];
  const compose: ComposeMock =
    overrides.compose ??
    vi.fn(() => {
      const tag = `canvas-${canvases.length + 1}`;
      canvases.push(tag);
      return Promise.resolve({ left: fakeCanvas(tag) });
    });
  const loadSource: LoadSourceMock =
    overrides.loadSource ??
    vi.fn(() =>
      Promise.resolve({
        image: {
          naturalWidth: 4,
          naturalHeight: 8,
        } as unknown as HTMLImageElement,
        release: releaseSource,
      }),
    );
  const scorer: PerimeterOverlayScorerDependencies = {
    resolveGeneration: () => Promise.resolve("42"),
    loadSource,
    ensureFonts: overrides.ensureFonts,
    compose,
  };
  const runtime = new PerimeterRuntime(configuration, {
    renderer: { render, replaceConfiguration: () => true },
    loader: { loadPair },
    scorer,
    now: () => 0,
  });
  return {
    runtime,
    render,
    loadPair,
    release,
    scorer,
    releaseSource,
    getLastFrame: () => lastFrame,
    canvases,
  };
}

async function prepareActiveBase(harness: Harness): Promise<void> {
  await harness.runtime.prepareBase(layout);
  harness.runtime.activatePreparedBase(0);
  harness.runtime.setPowered(true, 0);
  harness.runtime.render(0);
}

describe("PerimeterRuntime semantic scorer overlays", () => {
  it("composes every configured overlay logical screen and activates atomically", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setOverlay(scorerCommand, 1_000);
    harness.runtime.render(1_000);
    const frame = harness.getLastFrame();
    expect(frame?.overlay?.left).toBeDefined();
    expect(harness.scorer.compose).toHaveBeenCalledWith(
      scorerCommand,
      expect.anything(),
      [{ height: 1, id: "left", name: "Left", width: 2 }],
    );
  });

  it("shows only the base while a scorer replacement is preparing", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setOverlay(scorerCommand, 1_000);
    harness.runtime.render(1_000);

    let resolveReplacement:
      | ((value: Record<string, HTMLCanvasElement>) => void)
      | undefined;
    harness.scorer.compose.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReplacement = resolve;
        }),
    );
    const replacement = harness.runtime.setOverlay(
      { ...scorerCommand, id: "scorer-2" },
      2_000,
    );
    // The replacement's compose only runs after its source load resolves.
    await vi.waitFor(() => expect(resolveReplacement).toBeDefined());
    // The previous band is dropped the moment its replacement is requested,
    // so the base shows through instead of stale scorer content.
    harness.runtime.render(2_000);
    expect(harness.getLastFrame()?.overlay).toBeUndefined();
    resolveReplacement?.({ left: fakeCanvas("replacement") });
    await replacement;
    harness.runtime.render(2_500);
    expect(harness.getLastFrame()?.overlay?.left).toBeDefined();
  });

  it("clears the visible scorer overlay when a replacement fails", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setOverlay(scorerCommand, 1_000);
    harness.runtime.render(1_000);
    const releasesBefore = harness.releaseSource.mock.calls.length;
    harness.scorer.loadSource.mockRejectedValueOnce(new Error("no sources"));
    await expect(
      harness.runtime.setOverlay({ ...scorerCommand, id: "scorer-2" }, 2_000),
    ).rejects.toThrow("no sources");
    harness.runtime.render(2_000);
    expect(harness.getLastFrame()?.overlay).toBeUndefined();
    // Dropping the replaced band releases its source; the failed replacement
    // itself loaded nothing, so nothing further is released.
    expect(harness.releaseSource.mock.calls.length).toBe(releasesBefore + 1);
  });

  it("releases the loaded source when composition fails", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    harness.scorer.compose.mockRejectedValueOnce(new Error("compose failed"));
    await expect(
      harness.runtime.setOverlay(scorerCommand, 1_000),
    ).rejects.toThrow("compose failed");
    // The loaded source was released so nothing leaks behind the failure.
    expect(harness.releaseSource).toHaveBeenCalled();
    harness.runtime.render(1_000);
    expect(harness.getLastFrame()?.overlay).toBeUndefined();
  });

  it("leaves the base visible when a cold-start scorer preparation fails", async () => {
    const harness = createHarness({
      loadSource: vi.fn(() => Promise.reject(new Error("no sources"))),
    });
    await prepareActiveBase(harness);
    await expect(harness.runtime.setOverlay(scorerCommand, 0)).rejects.toThrow(
      "no sources",
    );
    harness.runtime.render(1_000);
    const frame = harness.getLastFrame();
    expect(frame?.overlay).toBeUndefined();
    expect(frame?.base.left).toBeDefined();
  });

  it("discards a stale scorer preparation when a newer command arrives", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    // Block the first preparation at source load so the staleness check
    // after the await is what discards it.
    let resolveFirstSource:
      | ((value: { image: HTMLImageElement; release: () => void }) => void)
      | undefined;
    harness.scorer.loadSource.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSource = resolve;
        }),
    );
    const first = harness.runtime.setOverlay(scorerCommand, 1_000);
    // A newer command arrives before the first finishes preparing.
    const second = harness.runtime.setOverlay(
      { ...scorerCommand, id: "scorer-2" },
      1_500,
    );
    await second;
    resolveFirstSource?.({
      image: {
        naturalWidth: 4,
        naturalHeight: 8,
      } as unknown as HTMLImageElement,
      release: harness.releaseSource,
    });
    await first;
    harness.runtime.render(2_000);
    // Only the newer command's canvases are active; the stale source was
    // released instead of replacing the newer generation.
    expect(harness.canvases[harness.canvases.length - 1]).toBe("canvas-1");
    expect(harness.releaseSource).toHaveBeenCalled();
    expect(harness.getLastFrame()?.overlay?.left).toBeDefined();
  });

  it("releases stale scorer sources after a successful replacement", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setOverlay(scorerCommand, 1_000);
    const releasesBefore = harness.releaseSource.mock.calls.length;
    await harness.runtime.setOverlay(
      { ...scorerCommand, id: "scorer-2" },
      2_000,
    );
    expect(harness.releaseSource.mock.calls.length).toBe(releasesBefore + 1);
  });

  it("clears the scorer overlay atomically", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setOverlay(scorerCommand, 1_000);
    harness.runtime.render(1_000);
    expect(harness.getLastFrame()?.overlay?.left).toBeDefined();
    await harness.runtime.setOverlay(null, 2_000);
    harness.runtime.render(2_000);
    expect(harness.getLastFrame()?.overlay).toBeUndefined();
    expect(harness.releaseSource).toHaveBeenCalled();
  });

  it("renders black while off and restores the composed scorer after power returns", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setOverlay(scorerCommand, 1_000);
    harness.runtime.setPowered(false, 2_000);
    harness.runtime.render(2_000);
    expect(harness.getLastFrame()).toEqual({ base: {} });

    harness.runtime.setPowered(true, 3_000);
    harness.runtime.render(3_000);
    const frame = harness.getLastFrame();
    expect(frame?.overlay?.left).toBeDefined();
    expect(frame?.base.left).toBeDefined();
  });

  it("keeps the base advancing underneath the scorer overlay", async () => {
    const first = {
      naturalWidth: 2,
      naturalHeight: 1,
      dataset: {},
      pause: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
      videoWidth: 2,
      videoHeight: 1,
      duration: 20,
    } as unknown as HTMLImageElement & HTMLVideoElement;
    const secondMedia: LoadedPerimeterMedia = {
      element: {
        naturalWidth: 2,
        naturalHeight: 1,
        dataset: {},
        videoWidth: 2,
        videoHeight: 1,
        duration: 20,
        pause: vi.fn(),
        play: vi.fn(() => Promise.resolve()),
      } as unknown as HTMLVideoElement,
      kind: "video",
      durationMs: 20_000,
      release: vi.fn(),
    };
    const firstMedia: LoadedPerimeterMedia = {
      element: first,
      kind: "image",
      durationMs: 0,
      release: vi.fn(),
    };
    const frameState: { lastFrame: PerimeterRenderSources | null } = {
      lastFrame: null,
    };
    const render = vi.fn<(sources: PerimeterRenderSources) => void>(
      (sources) => {
        frameState.lastFrame = sources;
      },
    );
    const loadPair = vi
      .fn()
      .mockResolvedValueOnce({ left: firstMedia })
      .mockResolvedValueOnce({ left: secondMedia });
    const runtime = new PerimeterRuntime(configuration, {
      renderer: { render },
      loader: { loadPair },
      scorer: createHarness().scorer,
      now: () => 0,
    });
    const lastFrame = () => frameState.lastFrame;
    await runtime.prepareBase({
      ...layout,
      columns: [layout.columns[0]!, { ...layout.columns[0]!, id: "column-2" }],
    });
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    await runtime.setOverlay(scorerCommand, 0);
    runtime.render(0);
    expect(lastFrame()?.overlay?.left).toBeDefined();
    expect(lastFrame()?.base.left).toBe(first);
    runtime.render(20_000);
    expect(lastFrame()?.base.left).toBe(secondMedia.element);
    // The scorer band is still visible above the advanced base.
    expect(lastFrame()?.overlay?.left).toBeDefined();
  });

  it("recomposes at the new logical dimensions after a mapping replacement", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setOverlay(scorerCommand, 1_000);
    const composeCallsBefore = harness.scorer.compose.mock.calls.length;
    // A valid second overlay screen: the mapping replacement is a new
    // scorer preparation using every configured logical screen.
    const replacement: PerimeterDisplayConfig = {
      ...configuration,
      revision: "mapping-2",
      logicalScreens: {
        left: { id: "left", name: "Left", width: 2, height: 1 },
        right: { id: "right", name: "Right", width: 2, height: 2 },
      },
      regions: [
        ...configuration.regions,
        {
          id: "right-region",
          logicalScreenId: "right",
          source: { x: 0, y: 0, width: 2, height: 2 },
          destination: { x: 2, y: 0, width: 2, height: 2 },
          transform: {
            rotation: 0,
            flipX: false,
            flipY: false,
            allowScaling: false,
            allowClipping: false,
            allowSourceOverlap: false,
            allowDestinationOverlap: false,
            zIndex: 1,
          },
        },
      ],
      framebuffer: { width: 4, height: 2, background: "black" },
    };
    expect(harness.runtime.replaceConfiguration(replacement)).toBe(true);
    // Recomposition runs asynchronously; wait for it to settle.
    await vi.waitFor(() => {
      expect(harness.scorer.compose.mock.calls.length).toBe(
        composeCallsBefore + 1,
      );
    });
    harness.runtime.render(2_000);
    expect(harness.getLastFrame()?.overlay?.left).toBeDefined();
  });

  it("retains the current scorer textures when recomposition fails", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setOverlay(scorerCommand, 1_000);
    harness.scorer.compose.mockRejectedValueOnce(new Error("recompose failed"));
    const replacement: PerimeterDisplayConfig = {
      ...configuration,
      revision: "mapping-2",
      playback: { cueDurationMs: 30_000, videoPolicy: "fit-to-cue" },
    };
    expect(harness.runtime.replaceConfiguration(replacement)).toBe(true);
    await vi.waitFor(() => {
      expect(harness.scorer.compose).toHaveBeenCalledTimes(2);
    });
    harness.runtime.render(2_000);
    expect(harness.getLastFrame()?.overlay?.left).toBeDefined();
  });

  it("continues timed version-1 playback alongside scorer support", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setOverlay(fileOverlay, 0);
    harness.runtime.render(1_000);
    expect(harness.getLastFrame()?.overlay?.left).toBeDefined();
    // The loader was used for the file command, not the scorer deps.
    expect(harness.loadPair).toHaveBeenCalled();
    expect(harness.scorer.loadSource).not.toHaveBeenCalled();
  });
});
