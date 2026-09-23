import { useEffect, useMemo, useRef, useState } from "react";
import {
  useFirebaseState,
  useListeners,
  usePerimeter,
  useClubOverrides,
} from "../contexts/FirebaseStateContext";
import { useDisplayDiagnostics } from "../contexts/DisplayDiagnosticsContext";
import { useLocalState } from "../contexts/LocalStateContext";
import clubLogos from "../images/clubLogos";
import { FIREBASE_STORAGE_BUCKET, storageHelpers } from "../firebase";
import { parseGsReference } from "./cache";
import { PerimeterMediaLoader } from "./mediaLoader";
import { PerimeterWebGLRenderer } from "./webglRenderer";
import { PerimeterRuntime } from "./runtime";
import { ScorerSourceLoader } from "./scorerSource";
import { PlayerBandSourceLoader } from "./bandSource";
import {
  DEFAULT_PLAYER_BAND_STYLE,
  DEFAULT_SUBSTITUTION_BAND_STYLE,
  createPlayerBandPresentations,
  createSubstitutionBandPresentations,
} from "./playerBandPresentation";
import { deriveBandRequest } from "./bandDerivation";
import {
  DEFAULT_SCORER_CELEBRATION_STYLE,
  createScorerPresentations,
} from "./scorerPresentation";
import type { ScorerCelebrationStyle } from "../types";
import { defaultScorerBandDeps } from "./scorerCompositor";

const NO_CONFIGURATION_MESSAGE = "Engin gild perimeter stilling tiltæk.";

// Immutable Storage identity: both the base layout and overlay commands may
// be written by writers that could not know the object generation (legacy
// media pairs, goal-scorer preparation), so it is resolved from Storage at
// preparation time — the same backfill for both channels.
const resolveGeneration = async (source: string) => {
  const reference = parseGsReference(source, FIREBASE_STORAGE_BUCKET);
  if (!reference) return null;
  const metadata = await storageHelpers.getMetadata(reference.objectPath);
  return metadata.generation;
};

export default function PerimeterDisplay() {
  const { listenPrefix } = useLocalState();
  const { screens } = useListeners();
  const { ready, match, controller } = useFirebaseState();
  const { perimeter, adLayout, overlay } = usePerimeter();
  const { clubOverrides } = useClubOverrides();
  const { reportError } = useDisplayDiagnostics();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<PerimeterRuntime | null>(null);
  const rendererRef = useRef<PerimeterWebGLRenderer | null>(null);
  const lastSkipCueRef = useRef<string | null>(null);
  const lastRefreshTokenRef = useRef<string | null>(null);
  // The goal-scorer celebration style selected in the perimeter admin view;
  // absent or invalid values fall back to the default presentation.
  const scorerCelebration: ScorerCelebrationStyle =
    perimeter.scorerCelebration ?? DEFAULT_SCORER_CELEBRATION_STYLE;
  // The band presentation styles selected in the perimeter admin view;
  // absent or invalid values fall back to the default presentations.
  const playerBandStyle =
    perimeter.playerDisplayStyle ?? DEFAULT_PLAYER_BAND_STYLE;
  const substitutionStyle =
    perimeter.substitutionStyle ?? DEFAULT_SUBSTITUTION_BAND_STYLE;
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [bandError, setBandError] = useState<string | null>(null);
  const [textureError, setTextureError] = useState<string | null>(null);
  // The runtime (and its scorer source loader) is constructed once per
  // configuration, so the bundled-crest fallback resolves the home team's
  // club logo through this ref at load time instead of capturing state that
  // would go stale between scorer selections.
  const homeTeamRef = useRef(match.homeTeam);
  useEffect(() => {
    homeTeamRef.current = match.homeTeam;
  }, [match.homeTeam]);
  // Club override logos are resolved at band-load time through this ref so
  // the loader always sees the latest override without re-creating it.
  const clubOverridesRef = useRef(clubOverrides);
  useEffect(() => {
    clubOverridesRef.current = clubOverrides;
  }, [clubOverrides]);
  const configuration = useMemo(
    () =>
      screens.find(
        (entry) =>
          entry.key === listenPrefix &&
          entry.perimeterDisplay?.renderer === "web",
      )?.perimeterDisplay,
    [listenPrefix, screens],
  );

  // Report display-side problems to the controller (Skjáarvillur). Reports
  // are gated on `ready` so the brief window before the mapping subscription
  // delivers cannot publish a phantom missing-configuration error, and a
  // disconnect clears the report so a stale error never outlives the screen.
  const reportedError = !ready
    ? null
    : configuration
      ? [rendererError, bandError, textureError].filter(Boolean).join(" ") ||
        null
      : NO_CONFIGURATION_MESSAGE;
  const displayError = ready && configuration ? reportedError : null;

  useEffect(() => {
    reportError(reportedError);
  }, [reportedError, reportError]);

  useEffect(
    () => () => {
      reportError(null);
    },
    [reportError],
  );

  useEffect(() => {
    if (!configuration || !canvasRef.current) return undefined;
    const existingRuntime = runtimeRef.current;
    if (existingRuntime && rendererRef.current) {
      if (!existingRuntime.replaceConfiguration(configuration)) {
        queueMicrotask(() =>
          setRendererError("Published perimeter mapping is invalid."),
        );
      } else {
        queueMicrotask(() => setRendererError(null));
      }
      return undefined;
    }

    let runtime: PerimeterRuntime | null = null;
    try {
      const renderer = new PerimeterWebGLRenderer(
        canvasRef.current,
        configuration,
        {
          // Renderer-internal problems (e.g. media larger than the GPU
          // max texture size) are only detectable inside the render loop.
          // They get their own state so a successful preparation can never
          // hide a still-broken texture, and are joined into the reported
          // error and the on-screen message below the canvas.
          onError: (message) => setTextureError(message || null),
        },
      );
      const loader = new PerimeterMediaLoader({
        bucket: FIREBASE_STORAGE_BUCKET,
        resolveDownloadUrl: (objectPath) =>
          storageHelpers.getDownloadURL(objectPath),
      });
      // Semantic scorer source access is location-scoped: the loader derives
      // the approved `{location}/players/{id}-fagn.png` celebration path and
      // `{location}/crest.png` fallback inside the active subscription's
      // location and loads through the persistent media cache. When both
      // Storage objects are unusable, the bundled club crest for the home
      // team keeps the band showing crest + number + name.
      const scorerSourceLoader = new ScorerSourceLoader({
        bucket: FIREBASE_STORAGE_BUCKET,
        location: listenPrefix,
        resolveGeneration: async (objectPath) => {
          const metadata = await storageHelpers.getMetadata(objectPath);
          return metadata.generation;
        },
        resolveDownloadUrl: (objectPath) =>
          storageHelpers.getDownloadURL(objectPath),
        bundledCrest: () => {
          const clubName = homeTeamRef.current;
          const crestUrl = (clubLogos as Record<string, string>)[
            clubName?.trim() ?? ""
          ];
          if (!crestUrl) return Promise.resolve(null);
          return new Promise<HTMLImageElement | null>((resolve) => {
            const image = new Image();
            image.decoding = "async";
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = crestUrl;
          });
        },
      });
      // Player band source access extends the scorer chain: the card's own
      // photo (a download URL) first, then the team logo for the asset's
      // team name (club override `logoUrl`, then the bundled `clubLogos`
      // crest — works for away teams), finally the venue crest chain.
      const bandSourceLoader = new PlayerBandSourceLoader({
        bucket: FIREBASE_STORAGE_BUCKET,
        location: listenPrefix,
        resolveGeneration: async (objectPath) => {
          const metadata = await storageHelpers.getMetadata(objectPath);
          return metadata.generation;
        },
        resolveDownloadUrl: (objectPath) =>
          storageHelpers.getDownloadURL(objectPath),
        clubOverrideLogoUrl: (teamName) => {
          const override = Object.values(clubOverridesRef.current).find(
            (entry) => entry.name === teamName,
          );
          return Promise.resolve(override?.logoUrl ?? null);
        },
        bundledCrestFor: (teamName) => {
          const crestUrl = (clubLogos as Record<string, string>)[
            teamName?.trim() ?? ""
          ];
          if (!crestUrl) return Promise.resolve(null);
          return new Promise<HTMLImageElement | null>((resolve) => {
            const image = new Image();
            image.decoding = "async";
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = crestUrl;
          });
        },
      });
      runtime = new PerimeterRuntime(configuration, {
        renderer,
        loader,
        scorer: {
          loadSource: async (command) => {
            const loaded = await scorerSourceLoader.load(command.player);
            return { image: loaded.image, release: loaded.release };
          },
          compose: (style, command, source, screens) =>
            createScorerPresentations(
              style,
              command,
              source,
              screens,
              defaultScorerBandDeps,
            ),
        },
        playerBand: {
          loadSource: async (request) => {
            if (request.kind === "player") {
              const loaded = await bandSourceLoader.load(request.identity);
              return {
                images: {
                  player: loaded.image,
                } as Record<string, HTMLImageElement>,
                release: loaded.release,
              };
            }
            const [off, on] = await Promise.all([
              bandSourceLoader.load(request.off),
              bandSourceLoader.load(request.on),
            ]);
            return {
              images: {
                off: off.image,
                on: on.image,
              } as Record<string, HTMLImageElement>,
              release: () => {
                off.release();
                on.release();
              },
            };
          },
          compose: (
            playerStyle,
            substitutionStyle,
            request,
            images,
            screens,
          ) =>
            request.kind === "player"
              ? createPlayerBandPresentations(
                  playerStyle,
                  request.identity,
                  images.player!,
                  screens,
                  defaultScorerBandDeps,
                )
              : createSubstitutionBandPresentations(
                  substitutionStyle,
                  { identity: request.off, source: images.off! },
                  { identity: request.on, source: images.on! },
                  screens,
                  defaultScorerBandDeps,
                ),
        },
      });
      rendererRef.current = renderer;
      runtimeRef.current = runtime;
      runtime.render();
      queueMicrotask(() => {
        if (runtimeRef.current === runtime) setRendererError(null);
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "WebGL renderer could not start.";
      queueMicrotask(() => setRendererError(message));
    }
    return undefined;
  }, [configuration, listenPrefix]);

  useEffect(
    () => () => {
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
      rendererRef.current = null;
    },
    [listenPrefix],
  );

  // The goal-scorer celebration style is applied to the live runtime before
  // the overlay effect below runs, so a commit that changes both the style
  // and the overlay command prepares with the new presentation style. The
  // runtime itself recomposes an active scorer presentation when the style
  // changes; failures keep the current textures on screen.
  useEffect(() => {
    runtimeRef.current?.setScorerStyle(scorerCelebration);
  }, [scorerCelebration, configuration]);

  // Both band styles are applied to the live runtime before the band effect
  // below runs, so a commit that changes the style and the current asset
  // prepares with the new presentation style. The runtime itself recomposes
  // an active band when the style changes; failures keep the current
  // textures on screen.
  useEffect(() => {
    runtimeRef.current?.setPlayerBandStyle(playerBandStyle);
  }, [playerBandStyle, configuration]);

  useEffect(() => {
    runtimeRef.current?.setSubstitutionBandStyle(substitutionStyle);
  }, [substitutionStyle, configuration]);

  // The band is derived from the already-subscribed controller state
  // (`controller.currentAsset`): player-like assets become a player band
  // request, SUB assets become a substitution request, everything else
  // drops the band. Read-only: no Firebase writes are involved.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return undefined;
    let cancelled = false;
    const request = deriveBandRequest(controller?.currentAsset ?? null);
    void runtime
      .setPlayerBand(request, performance.now())
      .then(() => {
        if (cancelled || runtimeRef.current !== runtime) return;
        runtime.render();
        setBandError(null);
      })
      .catch((error: unknown) => {
        if (cancelled || runtimeRef.current !== runtime) return;
        setBandError(
          error instanceof Error
            ? error.message
            : "Perimeter player band could not be prepared.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [controller?.currentAsset, configuration]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.setPowered(perimeter.state === "on", performance.now());
  }, [perimeter.state, configuration]);

  // The controller publishes a fresh `skipCue` token under the desired
  // perimeter state to request an immediate advance to the next ad column
  // on every display. The first observed token only initializes the
  // baseline so a display that (re)connects never replays an old skip.
  useEffect(() => {
    const token = perimeter.skipCue ?? null;
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const previous = lastSkipCueRef.current;
    lastSkipCueRef.current = token;
    if (previous === null || token === null || token === previous) return;
    runtime.skipCue(performance.now());
  }, [perimeter.skipCue, perimeter.state, configuration]);

  // The controller publishes a fresh `refreshToken` token under the desired
  // perimeter state to request a full page reload of every display (remote
  // restart). The first observed token only initializes the baseline so a
  // display that (re)connects never replays an old restart.
  useEffect(() => {
    const token = perimeter.refreshToken ?? null;
    const previous = lastRefreshTokenRef.current;
    lastRefreshTokenRef.current = token;
    if (previous === null || token === null || token === previous) return;
    window.location.reload();
  }, [perimeter.refreshToken]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return undefined;
    let cancelled = false;
    if (adLayout) {
      void runtime
        .prepareBase(adLayout, resolveGeneration)
        .then(() => {
          if (cancelled || runtimeRef.current !== runtime) return;
          runtime.activatePreparedBase(performance.now());
          runtime.render();
          // A successful preparation clears any earlier failure report so a
          // recovered deck never leaves a stale error on the display or in
          // the controller's Skjáarvillur list.
          setRendererError(null);
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setRendererError(
              error instanceof Error
                ? error.message
                : "Perimeter media could not be prepared.",
            );
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [adLayout, configuration]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return undefined;
    let cancelled = false;
    void runtime
      .setOverlay(overlay, performance.now(), resolveGeneration)
      .then(() => {
        if (!cancelled && runtimeRef.current === runtime) {
          runtime.render();
          setRendererError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRendererError(
            error instanceof Error
              ? error.message
              : "Perimeter overlay could not be prepared.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [overlay, configuration]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return undefined;
    let frame = 0;
    const render = () => {
      runtime.render();
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [configuration, adLayout, overlay]);

  if (!configuration) {
    return (
      <div
        className="perimeter-display perimeter-display-error"
        style={{ minHeight: "100vh", background: "#000", color: "#fff" }}
      >
        <p>{NO_CONFIGURATION_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div
      className="perimeter-display"
      data-testid="perimeter-display"
      data-renderer={configuration.renderer}
      data-state={perimeter.state}
      // Black from the first paint: the wrapper chain is otherwise
      // transparent and <body> is white (rsuite), so the frames before the
      // WebGL context exists (created in a post-paint effect) would flash
      // white. Never rely on CSS files or the renderer for this.
      style={{ minHeight: "100vh", background: "#000" }}
    >
      <canvas
        ref={canvasRef}
        className="perimeter-display-canvas"
        data-testid="perimeter-canvas"
        width={configuration.framebuffer.width}
        height={configuration.framebuffer.height}
        aria-label="Perimeter display"
        style={{ display: "block", background: "#000" }}
      />
      {displayError && (
        <p className="perimeter-display-error" role="status">
          {displayError}
        </p>
      )}
    </div>
  );
}
