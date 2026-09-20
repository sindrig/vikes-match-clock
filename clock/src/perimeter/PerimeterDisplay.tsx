import { useEffect, useMemo, useRef, useState } from "react";
import { useListeners, usePerimeter } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";
import { FIREBASE_STORAGE_BUCKET, storageHelpers } from "../firebase";
import { parseGsReference } from "./cache";
import { PerimeterMediaLoader } from "./mediaLoader";
import { PerimeterWebGLRenderer } from "./webglRenderer";
import { PerimeterRuntime } from "./runtime";

export default function PerimeterDisplay() {
  const { listenPrefix } = useLocalState();
  const { screens } = useListeners();
  const { perimeter, adLayout, overlay } = usePerimeter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<PerimeterRuntime | null>(null);
  const rendererRef = useRef<PerimeterWebGLRenderer | null>(null);
  const lastSkipCueRef = useRef<string | null>(null);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const configuration = useMemo(
    () =>
      screens.find(
        (entry) =>
          entry.key === listenPrefix &&
          entry.perimeterDisplay?.renderer === "web",
      )?.perimeterDisplay,
    [listenPrefix, screens],
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
      );
      const loader = new PerimeterMediaLoader({
        bucket: FIREBASE_STORAGE_BUCKET,
        resolveDownloadUrl: (objectPath) =>
          storageHelpers.getDownloadURL(objectPath),
      });
      runtime = new PerimeterRuntime(configuration, { renderer, loader });
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
  }, [configuration]);

  useEffect(
    () => () => {
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
      rendererRef.current = null;
    },
    [listenPrefix],
  );

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

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return undefined;
    let cancelled = false;
    if (adLayout) {
      void runtime
        .prepareBase(adLayout, async (source) => {
          const reference = parseGsReference(source, FIREBASE_STORAGE_BUCKET);
          if (!reference) return null;
          const metadata = await storageHelpers.getMetadata(
            reference.objectPath,
          );
          return metadata.generation;
        })
        .then(() => {
          if (cancelled || runtimeRef.current !== runtime) return;
          runtime.activatePreparedBase(performance.now());
          runtime.render();
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
      .setOverlay(overlay, performance.now())
      .then(() => {
        if (!cancelled && runtimeRef.current === runtime) runtime.render();
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
      <div className="perimeter-display perimeter-display-error">
        <p>Engin gild perimeter stilling tiltæk.</p>
      </div>
    );
  }

  return (
    <div
      className="perimeter-display"
      data-testid="perimeter-display"
      data-renderer={configuration.renderer}
      data-state={perimeter.state}
    >
      <canvas
        ref={canvasRef}
        className="perimeter-display-canvas"
        data-testid="perimeter-canvas"
        width={configuration.framebuffer.width}
        height={configuration.framebuffer.height}
        aria-label="Perimeter display"
      />
      {rendererError && (
        <p className="perimeter-display-error" role="status">
          {rendererError}
        </p>
      )}
    </div>
  );
}
