import { useEffect, useState } from "react";
import { FIREBASE_STORAGE_BUCKET, storageHelpers } from "../firebase";
import { parseGsReference } from "../perimeter/cache";

const VIDEO_NAME = /\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/i;

// Download URLs are stable per Storage object; cache them so the board, the
// drag overlay, and the file pickers share one request per file.
const downloadUrlCache = new Map<string, Promise<string | null>>();

const resolveFileUrl = (objectPath: string): Promise<string | null> => {
  const cached = downloadUrlCache.get(objectPath);
  if (cached) return cached;
  const promise = Promise.resolve(
    storageHelpers.getDownloadURL(objectPath),
  ).catch(() => null);
  downloadUrlCache.set(objectPath, promise);
  return promise;
};

interface PerimeterFileThumbProps {
  name: string;
  source?: string;
  /** "card" = board card (large, contain); "option" = picker list row (small) */
  variant?: "card" | "option";
}

// Resolve perimeter thumbnails from Storage: an image or a first-frame video
// preview, with a placeholder when the object is unavailable.
const PerimeterFileThumb = ({
  name,
  source,
  variant = "card",
}: PerimeterFileThumbProps) => {
  const baseClass =
    variant === "option" ? "perimeter-option-thumb" : "perimeter-file-thumb";
  const objectPath =
    parseGsReference(source ?? "", FIREBASE_STORAGE_BUCKET)?.objectPath ?? null;
  const resolvable =
    objectPath !== null && typeof storageHelpers.getDownloadURL === "function";

  // Resolved download URL for the current objectPath (null = pending,
  // url === null = resolution failed). setState only happens in async
  // callbacks so no cascading renders occur inside the effect body.
  const [resolved, setResolved] = useState<{
    key: string;
    url: string | null;
  } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (objectPath === null || !resolvable) return undefined;
    let cancelled = false;
    void resolveFileUrl(objectPath).then((url) => {
      if (!cancelled) setResolved({ key: objectPath, url });
    });
    return () => {
      cancelled = true;
    };
  }, [objectPath, resolvable]);

  const failed = failedKey !== null && failedKey === objectPath;
  const resolvedUrl =
    resolved !== null && resolved.key === objectPath ? resolved.url : null;
  const unavailable =
    failed ||
    !resolvable ||
    (resolved !== null && resolved.key === objectPath && resolved.url === null);

  if (unavailable) {
    return (
      <div className={`${baseClass} perimeter-thumb-unavailable`}>
        <span>Engin mynd</span>
      </div>
    );
  }
  const mediaUrl = resolvedUrl;
  if (!mediaUrl) {
    return <div className={`${baseClass} perimeter-thumb-loading`} />;
  }
  if (VIDEO_NAME.test(name)) {
    return (
      <video
        className={baseClass}
        src={mediaUrl}
        preload="metadata"
        muted
        playsInline
        onError={() => setFailedKey(objectPath)}
      />
    );
  }
  return (
    <img
      className={baseClass}
      src={mediaUrl}
      alt={name}
      loading="lazy"
      onError={() => setFailedKey(objectPath)}
    />
  );
};

export default PerimeterFileThumb;
