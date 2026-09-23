import { describe, expect, it, vi } from "vitest";
import type {
  PerimeterAdLayout,
  PerimeterDisplayConfig,
  PerimeterOverlay,
} from "../types";
import type { LoadedPerimeterMedia } from "./mediaLoader";
import type { Mock } from "vitest";
import type {
  PerimeterOverlayScorerDependencies,
  PerimeterPlayerBandDependencies,
} from "./runtime";
import { PerimeterRuntime } from "./runtime";
import type { ScorerPresentation } from "./scorerPresentation";
import type { PlayerBandRequest } from "./bandDerivation";
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

const playerRequest: PlayerBandRequest = {
  kind: "player",
  identity: {
    name: "Jón Jónsson",
    number: "7",
    teamName: "Víkingur R",
    imageRef: "https://dl.example/photo.png",
  },
};

const substitutionRequest: PlayerBandRequest = {
  kind: "substitution",
  off: {
    name: "Siggi Bekkur",
    number: "12",
    teamName: "Víkingur R",
    imageRef: "https://dl.example/off.png",
  },
  on: {
    name: "Jón Jónsson",
    number: "7",
    teamName: "Víkingur R",
    imageRef: "https://dl.example/on.png",
  },
};

function fakeCanvas(tag: string): HTMLCanvasElement {
  return {
    width: 2,
    height: 1,
    tag,
    dataset: {},
  } as unknown as HTMLCanvasElement;
}

function fakePresentation(tag: string): ScorerPresentation {
  const canvas = fakeCanvas(tag);
  return {
    canvas,
    draw: vi.fn(),
  };
}

type LoadSourceMock = Mock<PerimeterPlayerBandDependencies["loadSource"]>;
type ComposeMock = Mock<PerimeterPlayerBandDependencies["compose"]>;

interface Harness {
  runtime: PerimeterRuntime;
  render: ReturnType<typeof vi.fn>;
  loadPair: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  band: PerimeterPlayerBandDependencies & {
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
    ensureFonts?: PerimeterPlayerBandDependencies["ensureFonts"];
    clearChannel?: (channel: "base" | "band" | "overlay") => void;
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
      return Promise.resolve({ left: fakePresentation(tag) });
    });
  const loadSource: LoadSourceMock =
    overrides.loadSource ??
    vi.fn(() =>
      Promise.resolve({
        images: {
          player: {
            naturalWidth: 4,
            naturalHeight: 8,
          } as unknown as HTMLImageElement,
        },
        release: releaseSource,
      }),
    );
  const band: PerimeterPlayerBandDependencies = {
    loadSource,
    ensureFonts: overrides.ensureFonts,
    compose,
  };
  const runtime = new PerimeterRuntime(configuration, {
    renderer: {
      render,
      replaceConfiguration: () => true,
      clearChannel: overrides.clearChannel,
    },
    loader: { loadPair },
    playerBand: band,
    now: () => 0,
  });
  return {
    runtime,
    render,
    loadPair,
    release,
    band,
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

describe("PerimeterRuntime band channel", () => {
  it("activates the player band above the base", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(playerRequest, 1_000);
    harness.runtime.render(1_000);
    const frame = harness.getLastFrame();
    expect(frame?.band?.left).toBeDefined();
    expect(frame?.bandDynamic).toBe(true);
    expect(harness.band.compose).toHaveBeenCalledWith(
      "plain",
      "static",
      playerRequest,
      expect.anything(),
      [{ height: 1, id: "left", name: "Left", width: 2 }],
    );
  });

  it("ignores a re-delivery of the already-active band request", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(playerRequest, 1_000);
    expect(harness.band.loadSource).toHaveBeenCalledTimes(1);
    await harness.runtime.setPlayerBand(playerRequest, 2_000);
    expect(harness.band.loadSource).toHaveBeenCalledTimes(1);
  });

  it("treats a MOTM request for the same player as a new band", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(playerRequest, 1_000);
    expect(harness.band.loadSource).toHaveBeenCalledTimes(1);
    const motmRequest: PlayerBandRequest = {
      ...playerRequest,
      motm: true,
    };
    await harness.runtime.setPlayerBand(motmRequest, 2_000);
    expect(harness.band.loadSource).toHaveBeenCalledTimes(2);
    // And a re-delivery of the MOTM request is a no-op again.
    await harness.runtime.setPlayerBand(motmRequest, 3_000);
    expect(harness.band.loadSource).toHaveBeenCalledTimes(2);
  });

  it("drops the band when the request becomes null", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(playerRequest, 1_000);
    harness.runtime.render(1_000);
    const clearChannel = vi.fn();
    const harness2 = createHarness({ clearChannel });
    await prepareActiveBase(harness2);
    await harness2.runtime.setPlayerBand(playerRequest, 1_000);
    await harness2.runtime.setPlayerBand(null, 2_000);
    harness2.runtime.render(2_000);
    const frame = harness2.getLastFrame();
    expect(frame?.band).toBeUndefined();
    expect(clearChannel).toHaveBeenCalledWith("band");
  });

  it("drops the active band immediately while a replacement prepares", async () => {
    const harness = createHarness({
      loadSource: vi
        .fn<PerimeterPlayerBandDependencies["loadSource"]>()
        .mockImplementationOnce(() =>
          Promise.resolve({
            images: { player: fakeCanvas("a") } as Record<
              string,
              HTMLImageElement
            >,
            release: vi.fn(),
          }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              // Never resolves during the assertion window: the replacement
              // is still preparing.
              setTimeout(
                () =>
                  resolve({
                    images: { player: fakeCanvas("b") },
                    release: vi.fn(),
                  }),
                50,
              );
            }),
        ),
    });
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(playerRequest, 1_000);
    const pending = harness.runtime.setPlayerBand(
      {
        kind: "player",
        identity: { ...playerRequest.identity, name: "Nýr leikmaður" },
      },
      2_000,
    );
    harness.runtime.render(2_000);
    // The base shows through while the replacement prepares.
    expect(harness.getLastFrame()?.band).toBeUndefined();
    await pending;
    harness.runtime.render(2_100);
    expect(harness.getLastFrame()?.band?.left).toBeDefined();
  });

  it("supplies both side images for a substitution request", async () => {
    const harness = createHarness({
      loadSource: vi.fn(() =>
        Promise.resolve({
          images: {
            off: fakeCanvas("off") as unknown as HTMLImageElement,
            on: fakeCanvas("on") as unknown as HTMLImageElement,
          },
          release: vi.fn(),
        }),
      ),
    });
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(substitutionRequest, 1_000);
    harness.runtime.render(1_000);
    const frame = harness.getLastFrame();
    expect(frame?.band?.left).toBeDefined();
    expect(harness.band.compose).toHaveBeenCalledWith(
      "plain",
      "static",
      substitutionRequest,
      expect.anything(),
      expect.anything(),
    );
  });

  it("switches between player and substitution requests", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(playerRequest, 1_000);
    await harness.runtime.setPlayerBand(substitutionRequest, 2_000);
    expect(harness.band.compose).toHaveBeenLastCalledWith(
      "plain",
      "static",
      substitutionRequest,
      expect.anything(),
      expect.anything(),
    );
    await harness.runtime.setPlayerBand(playerRequest, 3_000);
    expect(harness.band.compose).toHaveBeenLastCalledWith(
      "plain",
      "static",
      playerRequest,
      expect.anything(),
      expect.anything(),
    );
  });

  it("suppresses band sources while a file overlay is active and restores on clear", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(playerRequest, 1_000);
    harness.runtime.render(1_000);
    expect(harness.getLastFrame()?.band?.left).toBeDefined();

    await harness.runtime.setOverlay(fileOverlay, 2_000);
    harness.runtime.render(2_000);
    // The overlay covers the band; no band sources are handed to the
    // renderer while the overlay generation is active.
    expect(harness.getLastFrame()?.overlay?.left).toBeDefined();
    expect(harness.getLastFrame()?.band).toBeUndefined();

    await harness.runtime.setOverlay(null, 3_000);
    harness.runtime.render(3_000);
    // The band returns without re-preparation.
    expect(harness.band.loadSource).toHaveBeenCalledTimes(1);
    expect(harness.getLastFrame()?.band?.left).toBeDefined();
  });

  it("suppresses band sources while a scorer overlay is active", async () => {
    let lastFrame: PerimeterRenderSources | null = null;
    // Reading through the typed accessor avoids TS control-flow narrowing
    // the closure variable to `never` at the assertion sites.
    const getLastFrame = (): PerimeterRenderSources | null => lastFrame;
    const render = vi.fn<(sources: PerimeterRenderSources) => void>(
      (sources) => {
        lastFrame = sources;
      },
    );
    const baseMedia = {
      element: fakeCanvas("base") as unknown as HTMLImageElement,
      kind: "image" as const,
      durationMs: 0,
      release: vi.fn(),
    };
    const loadPair = vi
      .fn<() => Promise<Record<string, LoadedPerimeterMedia>>>()
      .mockResolvedValue({ left: baseMedia });
    const scorer: PerimeterOverlayScorerDependencies = {
      loadSource: vi.fn(() =>
        Promise.resolve({
          image: fakeCanvas("source") as unknown as HTMLImageElement,
          release: vi.fn(),
        }),
      ),
      compose: vi.fn(() =>
        Promise.resolve({ left: fakePresentation("scorer") }),
      ),
    };
    const bandCompose = vi
      .fn<PerimeterPlayerBandDependencies["compose"]>()
      .mockResolvedValue({ left: fakePresentation("band") });
    const band: PerimeterPlayerBandDependencies = {
      loadSource: vi.fn(() =>
        Promise.resolve({
          images: {
            player: fakeCanvas("band-source") as unknown as HTMLImageElement,
          },
          release: vi.fn(),
        }),
      ),
      compose: bandCompose,
    };
    const runtime = new PerimeterRuntime(configuration, {
      renderer: { render, replaceConfiguration: () => true },
      loader: { loadPair },
      scorer,
      playerBand: band,
      now: () => 0,
    });
    await runtime.prepareBase(layout);
    runtime.activatePreparedBase(0);
    runtime.setPowered(true, 0);
    await runtime.setPlayerBand(playerRequest, 1_000);
    runtime.render(1_000);
    expect(getLastFrame()?.band?.left).toBeDefined();

    await runtime.setOverlay(
      {
        version: 2,
        kind: "goal-scorer",
        id: "scorer-1",
        player: { id: "2492", name: "Jón Jónsson", number: "7" },
      },
      2_000,
    );
    runtime.render(2_000);
    expect(getLastFrame()?.overlay?.left).toBeDefined();
    expect(getLastFrame()?.band).toBeUndefined();

    await runtime.setOverlay(null, 3_000);
    runtime.render(3_000);
    // The band returns without re-preparation.
    expect(bandCompose).toHaveBeenCalledTimes(1);
    expect(getLastFrame()?.band?.left).toBeDefined();
  });

  it("recomposes the active band when the style changes, keeping textures", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(playerRequest, 1_000);
    harness.runtime.render(1_000);
    expect(harness.getLastFrame()?.band?.left).toBeDefined();

    harness.runtime.setPlayerBandStyle("glow");
    // The active textures remain until the recomposition commits.
    expect(harness.getLastFrame()?.band?.left).toBeDefined();
    await vi.waitFor(() =>
      expect(harness.band.compose).toHaveBeenLastCalledWith(
        "glow",
        "static",
        playerRequest,
        expect.anything(),
        expect.anything(),
      ),
    );
  });

  it("recomposes the active substitution band when the substitution style changes", async () => {
    const harness = createHarness();
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(substitutionRequest, 1_000);
    harness.runtime.setSubstitutionBandStyle("flash");
    await vi.waitFor(() =>
      expect(harness.band.compose).toHaveBeenLastCalledWith(
        "plain",
        "flash",
        substitutionRequest,
        expect.anything(),
        expect.anything(),
      ),
    );
    // The player-band style change recomposes substitution bands too, with
    // the substitution style unchanged.
    harness.runtime.setPlayerBandStyle("streamer");
    await vi.waitFor(() =>
      expect(harness.band.compose).toHaveBeenLastCalledWith(
        "streamer",
        "flash",
        substitutionRequest,
        expect.anything(),
        expect.anything(),
      ),
    );
  });

  it("fails through the band preparation path and keeps the previous state", async () => {
    const harness = createHarness({
      loadSource: vi
        .fn<PerimeterPlayerBandDependencies["loadSource"]>()
        .mockRejectedValueOnce(new Error("source failed"))
        .mockImplementationOnce(() =>
          Promise.resolve({
            images: {
              player: fakeCanvas("ok") as unknown as HTMLImageElement,
            },
            release: vi.fn(),
          }),
        ),
    });
    await prepareActiveBase(harness);
    await expect(
      harness.runtime.setPlayerBand(playerRequest, 1_000),
    ).rejects.toThrow("source failed");
    harness.runtime.render(1_000);
    expect(harness.getLastFrame()?.band).toBeUndefined();
    // A later good request still activates.
    await harness.runtime.setPlayerBand(playerRequest, 2_000);
    harness.runtime.render(2_000);
    expect(harness.getLastFrame()?.band?.left).toBeDefined();
  });

  it("releases superseded band sources", async () => {
    const releaseSource = vi.fn();
    const harness = createHarness({
      loadSource: vi
        .fn<PerimeterPlayerBandDependencies["loadSource"]>()
        .mockImplementationOnce(() =>
          Promise.resolve({
            images: { player: fakeCanvas("a") as unknown as HTMLImageElement },
            release: releaseSource,
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            images: { player: fakeCanvas("b") as unknown as HTMLImageElement },
            release: vi.fn(),
          }),
        ),
    });
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(playerRequest, 1_000);
    await harness.runtime.setPlayerBand(
      { kind: "player", identity: { ...playerRequest.identity, name: "B" } },
      2_000,
    );
    expect(releaseSource).toHaveBeenCalled();
  });

  it("supports the band case in clearChannel wiring through destroy", async () => {
    const clearChannel = vi.fn();
    const harness = createHarness({ clearChannel });
    await prepareActiveBase(harness);
    await harness.runtime.setPlayerBand(playerRequest, 1_000);
    harness.runtime.destroy();
    expect(harness.band.compose).toHaveBeenCalled();
  });
});
