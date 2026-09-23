import type {
  PerimeterAdLayout,
  PerimeterDisplayConfig,
  GoalScorerOverlayCommand,
  PerimeterOverlayColumn,
  PerimeterOverlay,
  ScorerCelebrationStyle,
  PlayerBandStyle,
  SubstitutionBandStyle,
} from "../types";
import {
  backfillOverlayGenerations,
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
import {
  DEFAULT_SCORER_CELEBRATION_STYLE,
  type ScorerPresentation,
} from "./scorerPresentation";
import {
  DEFAULT_PLAYER_BAND_STYLE,
  DEFAULT_SUBSTITUTION_BAND_STYLE,
} from "./playerBandPresentation";
import { bandRequestKey, type PlayerBandRequest } from "./bandDerivation";
import { createBaseTimeline, nextCueBoundary } from "./timeline";
import type { PerimeterRenderSources } from "./webglRenderer";

const SCORER_FRAME_DURATION_MS = 1000 / 30;

type PreparedColumn = {
  id: string;
  sources: Record<string, LoadedPerimeterMedia>;
};

// One prepared version-1 column: the normalized column plus the media
// loaded for every logical screen it covers.
type PreparedOverlayColumn = {
  column: PerimeterOverlayColumn;
  sources: Record<string, LoadedPerimeterMedia>;
};

// A fully prepared overlay generation: either timed version-1 file columns
// or a static version-2 scorer source map. Both variants carry the command
// id they were prepared for plus a release function, so the runtime can
// activate the latest generation atomically and release stale or failed
// work without knowing which branch produced it.
interface PreparedOverlayGeneration {
  commandId: string;
  kind: "file" | "scorer";
  // File commands: normalized columns with loaded media, keyed by logical
  // screen id. Scorer commands: animated presentations per logical screen.
  columns?: PreparedOverlayColumn[];
  presentations?: Record<string, ScorerPresentation>;
  // The semantic command behind a scorer generation, retained so a mapping
  // replacement or style change can recompose it.
  scorerCommand?: GoalScorerOverlayCommand;
  release: () => void;
}

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

export interface PerimeterOverlayScorerDependencies {
  // Loads and decodes the scorer source image (player portrait or crest)
  // through the persistent media cache, falling back in the specified
  // order. The returned handle must be released by the caller.
  loadSource: (command: GoalScorerOverlayCommand) => Promise<{
    image: HTMLImageElement;
    release: () => void;
  }>;
  // Awaits readiness of the fonts the compositor will use.
  ensureFonts?: (command: GoalScorerOverlayCommand) => Promise<void>;
  // Creates one animated presentation per logical screen for the requested
  // celebration style. The runtime passes the overlay logical screens of its
  // CURRENT configuration, so a mapping replacement or style change recreates
  // the presentations at the new native dimensions.
  compose: (
    style: ScorerCelebrationStyle,
    command: GoalScorerOverlayCommand,
    source: HTMLImageElement,
    screens: readonly { id: string; width: number; height: number }[],
  ) => Promise<Record<string, ScorerPresentation>>;
}

export interface PerimeterPlayerBandDependencies {
  // Loads the band source image(s) for the request through the band image
  // chain (photo → team logo → venue crest). The returned handles must be
  // released by the caller: one image for `player` requests, the two side
  // images (`off`, `on`) for substitution requests.
  loadSource: (request: PlayerBandRequest) => Promise<{
    images: Record<string, HTMLImageElement>;
    release: () => void;
  }>;
  // Awaits readiness of the fonts the band compositor will use.
  ensureFonts?: (request: PlayerBandRequest) => Promise<void>;
  // Creates one animated band presentation per logical screen for the
  // request, using the active player/substitution presentation styles. The
  // runtime passes the logical screens of its CURRENT configuration, so a
  // mapping replacement or style change recreates the presentations at the
  // new native dimensions.
  compose: (
    playerStyle: PlayerBandStyle,
    substitutionStyle: SubstitutionBandStyle,
    request: PlayerBandRequest,
    sources: Record<string, HTMLImageElement>,
    screens: readonly { id: string; width: number; height: number }[],
  ) => Promise<Record<string, ScorerPresentation>>;
}

export interface PerimeterRuntimeOptions {
  renderer: {
    render: (sources: PerimeterRenderSources) => void;
    replaceConfiguration?: (configuration: PerimeterDisplayConfig) => boolean;
    // Forgets every uploaded texture of a channel so content that is no
    // longer live can never be re-drawn as a stale fallback.
    clearChannel?: (channel: "base" | "band" | "overlay") => void;
  };
  loader: Pick<PerimeterMediaLoader, "loadPair">;
  scorer?: PerimeterOverlayScorerDependencies;
  playerBand?: PerimeterPlayerBandDependencies;
  now?: () => number;
}

export class PerimeterRuntime {
  private readonly baseSlots = new PairSlots<PreparedColumn[]>();
  private readonly overlayPlayback = new OverlayPlayback();
  private readonly power: PerimeterPower;
  private readonly timeline;
  private readonly nowMs: () => number;
  private baseColumns: PreparedColumn[] = [];
  private currentBaseCue: number | null = null;
  private baseRequest = 0;
  private overlayRequest = 0;
  private pendingBaseActivation: number | null = null;
  // The active file-command columns and every loaded media element behind
  // them. Kept together so clear/replacement releases exactly what the
  // active overlay uses.
  private activeFileColumns: PerimeterOverlayColumn[] | null = null;
  private activeFileMedia: LoadedPerimeterMedia[] = [];
  // Storage identity of the generation currently on screen, used to ignore
  // re-deliveries of an already-live command.
  private activeOverlayCommandId: string | null = null;
  // The active semantic scorer generation. Presentations stay in memory
  // until clear or replacement; released sources are re-decoded from the
  // persistent media cache when a mapping change or style change requires
  // recomposition. `startedAt` is anchored on the first visible render so
  // the entrance animation plays from the frame the scorer appears.
  private activeScorer: {
    command: GoalScorerOverlayCommand;
    presentations: Record<string, ScorerPresentation>;
    startedAt: number | null;
    lastFrameIndex: number | null;
    release: () => void;
  } | null = null;
  // The goal-scorer celebration style written by the perimeter admin view.
  private scorerStyle: ScorerCelebrationStyle =
    DEFAULT_SCORER_CELEBRATION_STYLE;
  // The active semantic band generation (player or substitution request).
  // Presentations stay resident until clear or replacement, and while an
  // overlay generation is active the renderer simply receives no band
  // sources, so clearing the overlay restores the band without
  // re-preparation. `startedAt` is anchored on the first visible render.
  private activeBand: {
    request: PlayerBandRequest;
    presentations: Record<string, ScorerPresentation>;
    startedAt: number | null;
    lastFrameIndex: number | null;
    release: () => void;
  } | null = null;
  // The request whose preparation is in flight but not yet activated. Used
  // to deduplicate re-deliveries of a request that is still preparing (the
  // active-band dedup cannot see it yet).
  private pendingBand: PlayerBandRequest | null = null;
  private bandRequest = 0;
  private bandStyle: PlayerBandStyle = DEFAULT_PLAYER_BAND_STYLE;
  private subStyle: SubstitutionBandStyle = DEFAULT_SUBSTITUTION_BAND_STYLE;

  constructor(
    private configuration: PerimeterDisplayConfig,
    private readonly options: PerimeterRuntimeOptions,
  ) {
    this.nowMs = options.now ?? (() => performance.now());
    this.power = new PerimeterPower(this.nowMs);
    this.timeline = createBaseTimeline(configuration.playback.cueDurationMs, 0);
  }

  replaceConfiguration(configuration: PerimeterDisplayConfig): boolean {
    if (!validatePerimeterMapping(configuration).valid) return false;
    if (!this.options.renderer.replaceConfiguration?.(configuration))
      return false;
    this.configuration = configuration;
    this.timeline.cueDurationMs = configuration.playback.cueDurationMs;
    // A mapping replacement is a new overlay preparation for an active
    // semantic scorer: recompose at the new logical-screen dimensions while
    // the current textures stay visible until every new-size band is ready.
    // Failures retain the current textures and surface through the same
    // overlay preparation error path.
    const activeCommand = this.activeScorer?.command;
    if (activeCommand) {
      const request = ++this.overlayRequest;
      void this.prepareScorerOverlay(
        activeCommand,
        request,
        this.nowMs(),
      ).catch((error: unknown) => {
        console.error(
          "Scorer recomposition after mapping replacement failed:",
          error,
        );
      });
    }
    // A mapping replacement is a new band preparation too: recompose the
    // active request at the new logical-screen dimensions while the current
    // textures stay visible. Failures retain the current textures and
    // surface through the band preparation error path.
    const activeBandRequest = this.activeBand?.request;
    if (activeBandRequest) {
      const request = ++this.bandRequest;
      void this.prepareBand(activeBandRequest, request).catch(
        (error: unknown) => {
          console.error(
            "Band recomposition after mapping replacement failed:",
            error,
          );
        },
      );
    }
    return true;
  }

  // Applies the goal-scorer celebration style chosen in the perimeter admin
  // view. Changing the style while a scorer is visible is a new overlay
  // preparation for the active command: the current textures stay visible
  // until every presentation for the new style is ready. Failures retain the
  // current textures and surface through the overlay preparation error path.
  setScorerStyle(style: ScorerCelebrationStyle): void {
    if (style === this.scorerStyle) return;
    this.scorerStyle = style;
    const activeCommand = this.activeScorer?.command;
    if (!activeCommand) return;
    const request = ++this.overlayRequest;
    void this.prepareScorerOverlay(activeCommand, request, this.nowMs()).catch(
      (error: unknown) => {
        console.error("Scorer recomposition after style change failed:", error);
      },
    );
  }

  // Applies the player-band presentation style chosen in the perimeter
  // admin view. A style change while a player band is visible recomposes
  // the active request's presentations; the current textures stay visible
  // until the new ones are ready (mirroring the scorer style change).
  setPlayerBandStyle(style: PlayerBandStyle): void {
    if (style === this.bandStyle) return;
    this.bandStyle = style;
    this.recomposeActiveBand();
  }

  // Applies the substitution-band presentation style. Same recomposition
  // semantics as the player-band style, but only substitution bands are
  // affected.
  setSubstitutionBandStyle(style: SubstitutionBandStyle): void {
    if (style === this.subStyle) return;
    this.subStyle = style;
    this.recomposeActiveBand();
  }

  private recomposeActiveBand(): void {
    const activeRequest = this.activeBand?.request;
    if (!activeRequest) return;
    const request = ++this.bandRequest;
    void this.prepareBand(activeRequest, request).catch((error: unknown) => {
      console.error("Band recomposition after style change failed:", error);
    });
  }

  // Sets the band derived from the scoreboard's current asset. `null`
  // drops any active band (the base deck shows through again). A new
  // request keeps the active band visible while the replacement prepares
  // and hands the fully prepared band to the renderer in one transition —
  // the base ads never show through between two bands (a failed
  // preparation reports through the band error path and leaves the
  // previous band untouched). A re-delivery of the already-active or
  // already-preparing request is a no-op. While an overlay generation is
  // active the prepared band stays resident but the renderer receives no
  // band sources, so clearing the overlay restores it without
  // re-preparation.
  async setPlayerBand(
    band: PlayerBandRequest | null,
    now: number,
  ): Promise<void> {
    if (!band) {
      this.bandRequest += 1;
      this.pendingBand = null;
      if (this.activeBand) {
        this.releaseActiveBand();
        this.options.renderer.clearChannel?.("band");
        // Refresh immediately so the base shows through without waiting
        // for the next animation frame.
        this.render(now);
      }
      return;
    }
    if (
      this.activeBand &&
      bandRequestKey(this.activeBand.request) === bandRequestKey(band)
    ) {
      return;
    }
    if (
      this.pendingBand &&
      bandRequestKey(this.pendingBand) === bandRequestKey(band)
    ) {
      return;
    }
    const request = ++this.bandRequest;
    this.pendingBand = band;
    // The active band stays visible until the fully prepared replacement
    // activates atomically in prepareBand; a new request starts a fresh
    // entrance because the previous generation is released after the swap.
    // A failed preparation reports through the band error path and drops
    // the held band so a stale substitution never lingers on screen.
    try {
      await this.prepareBand(band, request);
    } catch (error) {
      if (request === this.bandRequest) {
        this.pendingBand = null;
        if (this.activeBand) {
          this.releaseActiveBand();
          this.options.renderer.clearChannel?.("band");
          this.render(now);
        }
      }
      throw error;
    }
    if (request === this.bandRequest) this.pendingBand = null;
  }

  private releaseActiveBand(): void {
    if (!this.activeBand) return;
    this.activeBand.release();
    this.activeBand = null;
  }

  private async prepareBand(
    band: PlayerBandRequest,
    request: number,
  ): Promise<void> {
    const playerBand = this.options.playerBand;
    if (!playerBand) {
      throw new Error("Player band is not configured.");
    }
    const loaded = await playerBand.loadSource(band);
    try {
      if (request !== this.bandRequest) {
        loaded.release();
        return;
      }
      if (playerBand.ensureFonts) await playerBand.ensureFonts(band);
      if (request !== this.bandRequest) {
        loaded.release();
        return;
      }
      const presentations = await playerBand.compose(
        this.bandStyle,
        this.subStyle,
        band,
        loaded.images,
        Object.values(this.configuration.logicalScreens),
      );
      const missing = Object.keys(this.configuration.logicalScreens).filter(
        (screenId) => !presentations[screenId],
      );
      if (missing.length > 0) {
        throw new Error(`Band composition is missing ${missing.join(", ")}.`);
      }
      if (request !== this.bandRequest) {
        loaded.release();
        return;
      }
      // Atomic activation: build the new active band completely before
      // discarding the previous one. A recomposition of the same request
      // (style change or mapping replacement) keeps the current timeline
      // anchor so the entrance does not replay; a genuinely new request
      // starts a fresh entrance on its first visible render.
      const previous = this.activeBand;
      const recomposition =
        previous !== null &&
        bandRequestKey(previous.request) === bandRequestKey(band);
      this.activeBand = {
        request: band,
        presentations,
        startedAt: recomposition ? previous.startedAt : null,
        lastFrameIndex: null,
        release: loaded.release,
      };
      if (previous) previous.release();
    } catch (error) {
      loaded.release();
      throw error;
    }
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
    resolveGeneration?: (source: string) => Promise<string | null>,
  ): Promise<void> {
    const request = ++this.overlayRequest;
    if (!overlay) {
      this.releaseActiveOverlay();
      this.overlayPlayback.clear();
      // The cleared generation's uploaded pixels must not survive in the
      // renderer: while a later command prepares, the base channel shows
      // through, and a slot without its own texture must never re-draw the
      // cleared content.
      this.options.renderer.clearChannel?.("overlay");
      return;
    }
    // The same command re-delivered (snapshot refresh, reconnect) is already
    // live: re-preparing identical media would only restart its playback.
    if (this.activeOverlayCommandId === overlay.id) return;
    if (overlay.version === 2) {
      await this.prepareScorerOverlay(overlay, request, now);
      return;
    }
    await this.prepareFileOverlay(overlay, request, now, resolveGeneration);
  }

  private releaseActiveOverlay(): void {
    for (const media of this.activeFileMedia) media.release();
    this.activeFileMedia = [];
    this.activeFileColumns = null;
    this.activeOverlayCommandId = null;
    if (this.activeScorer) this.activeScorer.release();
    this.activeScorer = null;
  }

  private async prepareFileOverlay(
    overlay: Extract<PerimeterOverlay, { version: 1 }>,
    request: number,
    now: number,
    resolveGeneration?: (source: string) => Promise<string | null>,
  ): Promise<void> {
    const complete = resolveGeneration
      ? ((await backfillOverlayGenerations(
          overlay,
          resolveGeneration,
        )) as Extract<PerimeterOverlay, { version: 1 }>)
      : overlay;
    const normalized = complete.columns.map((column) =>
      normalizeOverlayColumn(column, this.configuration),
    );
    this.validateCompletePairs(
      normalized.map((column) => column.files),
      Object.values(this.configuration.compatibilityKeys.overlay),
    );
    const preparedColumns = await Promise.all(
      normalized.map(async (column) => ({
        column,
        sources: await this.options.loader.loadPair(column.files),
      })),
    );
    const loadedMedia: LoadedPerimeterMedia[] = preparedColumns.flatMap(
      (pair) => Object.values(pair.sources),
    );
    try {
      this.validatePreparedSources(preparedColumns.map((pair) => pair.sources));
    } catch (error) {
      for (const media of loadedMedia) media.release();
      throw error;
    }
    if (request !== this.overlayRequest) {
      for (const media of loadedMedia) media.release();
      return;
    }
    this.commitPreparedGeneration(
      {
        commandId: complete.id,
        kind: "file",
        columns: normalized.map((column, index) => {
          const sources = preparedColumns[index]?.sources ?? {};
          for (const [logicalScreenId, media] of Object.entries(sources)) {
            const file = column.files[logicalScreenId];
            if (!file) continue;
            media.element.dataset.perimeterSource = `${file.source}:${file.generation ?? ""}`;
          }
          return { column, sources };
        }),
        release: () => {
          for (const media of loadedMedia) media.release();
        },
      },
      now,
    );
  }

  private async prepareScorerOverlay(
    command: GoalScorerOverlayCommand,
    request: number,
    now: number,
  ): Promise<void> {
    const scorer = this.options.scorer;
    if (!scorer) {
      throw new Error("Semantic scorer overlays are not configured.");
    }
    const loaded = await scorer.loadSource(command);
    try {
      if (request !== this.overlayRequest) {
        loaded.release();
        return;
      }
      if (scorer.ensureFonts) await scorer.ensureFonts(command);
      if (request !== this.overlayRequest) {
        loaded.release();
        return;
      }
      const presentations = await scorer.compose(
        this.scorerStyle,
        command,
        loaded.image,
        Object.values(this.configuration.logicalScreens),
      );
      const missing = Object.values(
        this.configuration.compatibilityKeys.overlay,
      ).filter((screenId) => !presentations[screenId]);
      if (missing.length > 0) {
        throw new Error(`Scorer composition is missing ${missing.join(", ")}.`);
      }
      if (request !== this.overlayRequest) {
        loaded.release();
        return;
      }
      this.commitPreparedGeneration(
        {
          commandId: command.id,
          kind: "scorer",
          presentations,
          scorerCommand: command,
          release: loaded.release,
        },
        now,
      );
    } catch (error) {
      loaded.release();
      throw error;
    }
  }

  private commitPreparedGeneration(
    prepared: PreparedOverlayGeneration,
    now: number,
  ): void {
    // One atomic activation: build the new active state completely before
    // discarding the previous generation so a failed hand-off can never
    // show the base through the overlay channel.
    const previousFileMedia = this.activeFileMedia;
    const previousScorer = this.activeScorer;
    this.activeOverlayCommandId = prepared.commandId;
    // The previous generation's textures are gone from the runtime; forget
    // them in the renderer too, so a new-generation slot whose video has not
    // decoded yet holds on the base instead of re-drawing old pixels.
    this.options.renderer.clearChannel?.("overlay");

    if (prepared.kind === "file") {
      const columns = prepared.columns ?? [];
      const media: LoadedPerimeterMedia[] = [];
      for (const pair of columns) {
        for (const item of Object.values(pair.sources)) media.push(item);
      }
      this.activeFileColumns = columns.map((pair) => pair.column);
      this.activeFileMedia = media;
      this.activeScorer = null;
      this.overlayPlayback.set(prepared.commandId, this.activeFileColumns, now);
      this.overlayPlayback.prepareFirstPair(this.activeFileColumns[0]!);
      this.overlayPlayback.activatePrepared(prepared.commandId, now);
      for (const pair of columns) this.playPair(pair.sources);
    } else {
      this.activeFileColumns = null;
      this.activeFileMedia = [];
      this.activeScorer = {
        command: prepared.scorerCommand!,
        presentations: prepared.presentations ?? {},
        startedAt: null,
        lastFrameIndex: null,
        release: prepared.release,
      };
      this.overlayPlayback.clear();
    }

    if (previousScorer && previousScorer !== this.activeScorer) {
      previousScorer.release();
    }
    for (const media of previousFileMedia) media.release();
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
      this.options.renderer.render({ base: {}, overlayDynamic: false });
      return;
    }
    const cue = this.timeline.cueIndex(now);
    if (cue !== null && cue !== this.currentBaseCue) {
      this.currentBaseCue = cue;
      const column = this.baseColumns[cue];
      if (column) this.playPair(column.sources);
    }
    const base = this.baseColumns[this.currentBaseCue ?? 0]?.sources ?? {};
    let band: Record<string, TexImageSource> | undefined;
    let bandDynamic = false;
    let overlay: Record<string, TexImageSource> | undefined;
    let overlayDynamic = false;
    // The overlay generation currently on screen (scorer or file command).
    // While one is active the band channel is suppressed: the renderer
    // receives no band sources, but the band object stays resident so
    // clearing the overlay restores it without re-preparation.
    const overlayActive =
      this.activeScorer !== null || this.activeFileColumns !== null;
    if (this.activeBand && !overlayActive) {
      // Band canvases advance at no more than 30 fps; intervening display
      // refreshes reuse the existing WebGL textures while base videos can
      // keep updating. The elapsed anchor is the first visible render.
      if (this.activeBand.startedAt === null) {
        this.activeBand.startedAt = now;
      }
      const elapsed = Math.max(0, now - this.activeBand.startedAt);
      const frameIndex = Math.floor(elapsed / SCORER_FRAME_DURATION_MS);
      const shouldDraw =
        this.activeBand.lastFrameIndex === null ||
        frameIndex > this.activeBand.lastFrameIndex;
      band = {};
      for (const [screenId, presentation] of Object.entries(
        this.activeBand.presentations,
      )) {
        if (shouldDraw) presentation.draw(elapsed);
        band[screenId] = presentation.canvas;
      }
      if (shouldDraw) this.activeBand.lastFrameIndex = frameIndex;
      bandDynamic = shouldDraw;
    }
    if (this.activeScorer) {
      // The entrance is anchored on the first visible render. Scorer canvases
      // advance at no more than 30 fps; intervening display refreshes reuse
      // the existing WebGL textures while base videos continue updating at
      // the browser's render rate.
      if (this.activeScorer.startedAt === null) {
        this.activeScorer.startedAt = now;
      }
      const elapsed = Math.max(0, now - this.activeScorer.startedAt);
      const frameIndex = Math.floor(elapsed / SCORER_FRAME_DURATION_MS);
      const shouldDraw =
        this.activeScorer.lastFrameIndex === null ||
        frameIndex > this.activeScorer.lastFrameIndex;
      overlay = {};
      for (const [screenId, presentation] of Object.entries(
        this.activeScorer.presentations,
      )) {
        if (shouldDraw) presentation.draw(elapsed);
        overlay[screenId] = presentation.canvas;
      }
      if (shouldDraw) this.activeScorer.lastFrameIndex = frameIndex;
      overlayDynamic = shouldDraw;
    } else {
      const overlayColumn = this.overlayPlayback.visibleColumn(now);
      overlay = overlayColumn
        ? this.findOverlaySources(overlayColumn)
        : undefined;
    }
    this.options.renderer.render({
      base: this.elements(base),
      // The band keys are only sent while a band is live: an absent key
      // keeps the payload shape unchanged for the base/overlay-only paths.
      ...(band ? { band, bandDynamic } : {}),
      overlay,
      overlayDynamic,
    });
  }

  destroy(): void {
    this.baseRequest += 1;
    this.overlayRequest += 1;
    this.bandRequest += 1;
    this.releaseColumns(this.baseColumns);
    const prepared = this.baseSlots.preparedNext;
    if (prepared && prepared !== this.baseColumns) {
      this.releaseColumns(prepared);
    }
    this.releaseActiveOverlay();
    this.releaseActiveBand();
    this.pendingBand = null;
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
      if (!loaded) continue;
      // A video whose first frame is not decoded yet must not reach the
      // renderer: uploadSource would skip the upload and the slot would keep
      // sampling the previous generation's texture. The region falls back to
      // the base channel until the frame is actually available.
      if (
        loaded.kind === "video" &&
        (loaded.element as HTMLVideoElement).readyState < 2
      ) {
        continue;
      }
      sources[logicalScreenId] = loaded.element;
    }
    return sources;
  }

  private findLoadedMedia(
    source: string,
    generation?: string,
  ): LoadedPerimeterMedia | undefined {
    return this.activeFileMedia.find(
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
        // Dimension mismatches never block playback: the renderer samples the
        // whole texture with normalized UVs, so mismatched media stretches
        // (with skew) to fill the region's destination rectangle.
        if (width !== screen.width || height !== screen.height) {
          console.warn(
            `Perimeter media for ${logicalScreenId} is ${width}x${height}; expected ${screen.width}x${screen.height}. Content will be stretched to fit.`,
          );
        }
      }
    }
  }
}
