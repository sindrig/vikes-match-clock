import type {
  PerimeterAdLayout,
  PerimeterDisplayConfig,
  PerimeterOverlay,
  PerimeterOverlayColumn,
} from "../types";
import {
  backfillStorageGenerations,
  normalizeBaseLayout,
  validateWebMediaIdentity,
} from "./media";
import { PerimeterMediaLoader, type LoadedPerimeterMedia } from "./mediaLoader";
import { validatePerimeterMapping } from "./perimeterMapping";
import {
  OverlayPlayback,
  PairSlots,
  PerimeterPower,
  pairedPlaybackPlan,
} from "./playback";
import { createBaseTimeline, nextCueBoundary } from "./timeline";
import type { PerimeterRenderSources } from "./webglRenderer";

type PreparedColumn = {
  id: string;
  sources: Record<string, LoadedPerimeterMedia>;
};

function normalizeOverlayColumn(
  column: PerimeterOverlayColumn,
  configuration: PerimeterDisplayConfig,
): PerimeterOverlayColumn {
  const files: PerimeterOverlayColumn["files"] = {};
  for (const [target, file] of Object.entries(column.files)) {
    const logicalScreenId = configuration.compatibilityKeys.overlay[target];
    if (logicalScreenId) files[logicalScreenId] = file;
  }
  return { ...column, files };
}

export interface PerimeterRuntimeOptions {
  renderer: {
    render: (sources: PerimeterRenderSources) => void;
    replaceConfiguration?: (configuration: PerimeterDisplayConfig) => boolean;
  };
  loader: Pick<PerimeterMediaLoader, "loadPair">;
  now?: () => number;
}

export class PerimeterRuntime {
  private readonly baseSlots = new PairSlots<PreparedColumn[]>();
  private readonly overlayPlayback = new OverlayPlayback();
  private readonly power: PerimeterPower;
  private readonly timeline;
  private baseColumns: PreparedColumn[] = [];
  private currentBaseCue: number | null = null;
  private baseRequest = 0;
  private overlayRequest = 0;
  private pendingBaseActivation: number | null = null;

  constructor(
    private configuration: PerimeterDisplayConfig,
    private readonly options: PerimeterRuntimeOptions,
  ) {
    const now = options.now ?? (() => performance.now());
    this.power = new PerimeterPower(now);
    this.timeline = createBaseTimeline(configuration.playback.cueDurationMs, 0);
  }

  replaceConfiguration(configuration: PerimeterDisplayConfig): boolean {
    if (!validatePerimeterMapping(configuration).valid) return false;
    if (!this.options.renderer.replaceConfiguration?.(configuration))
      return false;
    this.configuration = configuration;
    this.timeline.cueDurationMs = configuration.playback.cueDurationMs;
    return true;
  }

  async prepareBase(
    layout: PerimeterAdLayout,
    resolveGeneration?: (source: string) => Promise<string | null>,
  ): Promise<void> {
    const request = ++this.baseRequest;
    const completeLayout = resolveGeneration
      ? await backfillStorageGenerations(layout, resolveGeneration)
      : layout;
    const identityErrors = validateWebMediaIdentity(completeLayout);
    if (identityErrors.length > 0) {
      throw new Error(
        identityErrors[0]?.message ?? "Invalid perimeter media identity.",
      );
    }
    const normalized = normalizeBaseLayout(completeLayout, this.configuration);
    this.validateCompletePairs(
      normalized.map((column) => column.files),
      Object.values(this.configuration.compatibilityKeys.base),
    );
    const prepared = await Promise.all(
      normalized.map(async (column) => ({
        id: column.id,
        sources: await this.options.loader.loadPair(column.files),
      })),
    );
    try {
      this.validatePreparedColumns(prepared);
    } catch (error) {
      this.releaseColumns(prepared);
      throw error;
    }
    if (request !== this.baseRequest) {
      this.releaseColumns(prepared);
      return;
    }
    const stalePrepared = this.baseSlots.preparedNext;
    if (stalePrepared && stalePrepared !== this.baseColumns) {
      this.releaseColumns(stalePrepared);
    }
    this.baseSlots.prepare(prepared);
  }

  activatePreparedBase(now: number): void {
    if (this.baseColumns.length > 0 && this.timeline.origin !== null) {
      this.pendingBaseActivation = nextCueBoundary(
        now,
        this.timeline.origin,
        this.configuration.playback.cueDurationMs,
      );
      return;
    }
    this.commitPreparedBase(now);
  }

  private commitPreparedBase(now: number): void {
    const prepared = this.baseSlots.activate();
    if (!prepared) return;
    this.pendingBaseActivation = null;
    this.releaseColumns(this.baseColumns);
    this.baseColumns = prepared;
    this.timeline.cueCount = prepared.length;
    this.timeline.start(now);
    this.currentBaseCue = null;
  }

  async setOverlay(
    overlay: PerimeterOverlay | null,
    now: number,
  ): Promise<void> {
    const request = ++this.overlayRequest;
    if (!overlay) {
      for (const media of this.loadedOverlayMedia) media.release();
      this.loadedOverlayMedia = [];
      this.overlayPlayback.clear();
      return;
    }
    const normalized = overlay.columns.map((column) =>
      normalizeOverlayColumn(column, this.configuration),
    );
    this.validateCompletePairs(
      normalized.map((column) => column.files),
      Object.values(this.configuration.compatibilityKeys.overlay),
    );
    const prepared = await Promise.all(
      normalized.map(async (column) => ({
        column,
        sources: await this.options.loader.loadPair(column.files),
      })),
    );
    try {
      this.validatePreparedSources(prepared.flatMap((pair) => [pair.sources]));
    } catch (error) {
      for (const pair of prepared) {
        for (const media of Object.values(pair.sources)) media.release();
      }
      throw error;
    }
    if (request !== this.overlayRequest) {
      for (const pair of prepared) {
        for (const media of Object.values(pair.sources)) media.release();
      }
      return;
    }
    const previousMedia = this.loadedOverlayMedia;
    this.loadedOverlayMedia = [];
    this.overlayPlayback.set(overlay.id, normalized, now);
    this.overlayPlayback.prepareFirstPair(normalized[0]!);
    this.overlayPlayback.activatePrepared(overlay.id, now);
    for (const pair of prepared) {
      for (const [logicalScreenId, media] of Object.entries(pair.sources)) {
        const file = pair.column.files[logicalScreenId];
        if (!file) continue;
        media.element.dataset.perimeterSource = `${file.source}:${file.generation ?? ""}`;
        this.loadedOverlayMedia.push(media);
      }
      this.playPair(pair.sources);
    }
    for (const media of previousMedia) media.release();
  }

  setPowered(powered: boolean, now: number): void {
    if (this.power.setPowered(powered) && powered) {
      this.timeline.start(now);
      this.currentBaseCue = null;
    }
    if (!powered) this.render();
  }

  // Advances the base playback to the next ad column immediately. The next
  // cue boundary is pulled to `now`, so the current cue ends and the
  // following one starts with a fresh full duration. A prepared base
  // revision waiting on a cue boundary commits with the skip. No-op when
  // nothing is playing yet or the timeline is not running.
  skipCue(now: number): void {
    this.pendingBaseActivation = null;
    if (!this.timeline.skipForward(now)) return;
    this.currentBaseCue = null;
    this.render(now);
  }

  render(now = performance.now()): void {
    if (
      this.pendingBaseActivation !== null &&
      now >= this.pendingBaseActivation
    ) {
      this.commitPreparedBase(now);
    }
    if (!this.power.isPowered) {
      this.options.renderer.render({ base: {} });
      return;
    }
    const cue = this.timeline.cueIndex(now);
    if (cue !== null && cue !== this.currentBaseCue) {
      this.currentBaseCue = cue;
      const column = this.baseColumns[cue];
      if (column) this.playPair(column.sources);
    }
    const base = this.baseColumns[this.currentBaseCue ?? 0]?.sources ?? {};
    const overlayColumn = this.overlayPlayback.visibleColumn(now);
    const overlay = overlayColumn
      ? this.findOverlaySources(overlayColumn)
      : undefined;
    this.options.renderer.render({ base: this.elements(base), overlay });
  }

  destroy(): void {
    this.baseRequest += 1;
    this.overlayRequest += 1;
    this.releaseColumns(this.baseColumns);
    const prepared = this.baseSlots.preparedNext;
    if (prepared && prepared !== this.baseColumns) {
      this.releaseColumns(prepared);
    }
    for (const media of this.loadedOverlayMedia) media.release();
    this.loadedOverlayMedia = [];
    this.baseColumns = [];
    this.baseSlots.clear();
    this.overlayPlayback.clear();
  }

  private findOverlaySources(
    column: PerimeterOverlayColumn,
  ): Record<string, TexImageSource> {
    // Overlay media is uploaded before activation and is already resident in
    // the browser's media cache. The active source map is reconstructed by
    // matching the immutable file names loaded by setOverlay.
    const sources: Record<string, TexImageSource> = {};
    for (const [logicalScreenId, file] of Object.entries(column.files)) {
      const loaded = this.findLoadedMedia(file.source, file.generation);
      if (loaded) sources[logicalScreenId] = loaded.element;
    }
    return sources;
  }

  private loadedOverlayMedia: LoadedPerimeterMedia[] = [];

  private findLoadedMedia(
    source: string,
    generation?: string,
  ): LoadedPerimeterMedia | undefined {
    return this.loadedOverlayMedia.find(
      (media) =>
        (media.element as HTMLMediaElement).dataset.perimeterSource ===
        `${source}:${generation ?? ""}`,
    );
  }

  private playPair(sources: Record<string, LoadedPerimeterMedia>): void {
    for (const media of Object.values(sources)) {
      if (media.kind !== "video") continue;
      const plan = pairedPlaybackPlan(
        { kind: "video", durationMs: media.durationMs },
        this.configuration.playback.cueDurationMs,
        () => true,
      );
      const video = media.element as HTMLVideoElement;
      video.playbackRate = plan.rate;
      video.loop = plan.loop;
      void video.play().catch(() => undefined);
    }
  }

  private elements(
    sources: Record<string, LoadedPerimeterMedia>,
  ): Record<string, TexImageSource> {
    return Object.fromEntries(
      Object.entries(sources).map(([id, media]) => [id, media.element]),
    );
  }

  private releaseColumns(columns: PreparedColumn[]): void {
    for (const column of columns) {
      for (const media of Object.values(column.sources)) media.release();
    }
  }

  private validatePreparedColumns(columns: PreparedColumn[]): void {
    this.validatePreparedSources(columns.map((column) => column.sources));
  }

  private validateCompletePairs(
    pairs: Record<string, unknown>[],
    requiredScreens: string[],
  ): void {
    for (const [index, pair] of pairs.entries()) {
      for (const screenId of requiredScreens) {
        if (!pair[screenId]) {
          throw new Error(
            `Perimeter media column ${index + 1} is missing ${screenId}.`,
          );
        }
      }
    }
  }

  private validatePreparedSources(
    sourcesList: Record<string, LoadedPerimeterMedia>[],
  ): void {
    for (const sources of sourcesList) {
      for (const [logicalScreenId, media] of Object.entries(sources)) {
        const screen = this.configuration.logicalScreens[logicalScreenId];
        if (!screen)
          throw new Error(
            `Unknown perimeter logical screen: ${logicalScreenId}.`,
          );
        const element = media.element;
        const width =
          media.kind === "video"
            ? (element as HTMLVideoElement).videoWidth
            : (element as HTMLImageElement).naturalWidth;
        const height =
          media.kind === "video"
            ? (element as HTMLVideoElement).videoHeight
            : (element as HTMLImageElement).naturalHeight;
        if (width !== screen.width || height !== screen.height) {
          throw new Error(
            `Perimeter media for ${logicalScreenId} is ${width}x${height}; expected ${screen.width}x${screen.height}.`,
          );
        }
      }
    }
  }
}
