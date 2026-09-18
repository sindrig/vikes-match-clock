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
    return () => {
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      runtime?.destroy();
    };
  }, [configuration]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.setPowered(perimeter.state === "on", performance.now());
  }, [perimeter.state, configuration]);

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
