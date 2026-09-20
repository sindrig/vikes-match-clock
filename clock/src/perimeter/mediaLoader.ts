import type { PerimeterOverlayFile } from "../types";
import { PersistentMediaCache, parseGsReference } from "./cache";

export type LoadedPerimeterMedia = {
  element: HTMLImageElement | HTMLVideoElement;
  kind: "image" | "video";
  durationMs: number;
  release: () => void;
};

export interface PerimeterMediaLoaderOptions {
  bucket: string;
  cache?: PersistentMediaCache;
  resolveDownloadUrl: (objectPath: string) => Promise<string>;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  return new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("Perimeter image could not be decoded."));
  });
}

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () =>
      reject(new Error("Perimeter video metadata could not be read."));
  });
}

export class PerimeterMediaLoader {
  private readonly cache: PersistentMediaCache;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;

  constructor(private readonly options: PerimeterMediaLoaderOptions) {
    this.cache = options.cache ?? new PersistentMediaCache();
    this.createObjectUrl =
      options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectUrl =
      options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
  }

  async load(file: PerimeterOverlayFile): Promise<LoadedPerimeterMedia> {
    if (!file.generation) {
      throw new Error(
        `Perimeter media ${file.name} has no Storage generation.`,
      );
    }
    const reference = parseGsReference(file.source, this.options.bucket);
    if (!reference)
      throw new Error(`Perimeter media source is not approved: ${file.source}`);
    const downloadUrl = await this.options.resolveDownloadUrl(
      reference.objectPath,
    );
    const response = await this.cache.getOrDownload(
      { ...reference, generation: file.generation },
      downloadUrl,
    );
    const objectUrl = this.createObjectUrl(await response.blob());
    const isVideo =
      /^video\//.test(response.headers.get("content-type") ?? "") ||
      /\.(mp4|webm|mov|m4v)$/i.test(file.name);

    if (isVideo) {
      const element = document.createElement("video");
      element.muted = true;
      element.playsInline = true;
      element.preload = "auto";
      element.src = objectUrl;
      try {
        await waitForVideo(element);
      } catch (error) {
        this.revokeObjectUrl(objectUrl);
        throw error;
      }
      return {
        element,
        kind: "video",
        durationMs: Number.isFinite(element.duration)
          ? element.duration * 1000
          : 0,
        release: () => {
          element.pause();
          element.removeAttribute("src");
          this.revokeObjectUrl(objectUrl);
        },
      };
    }

    const element = new Image();
    element.decoding = "async";
    element.src = objectUrl;
    try {
      await waitForImage(element);
    } catch (error) {
      this.revokeObjectUrl(objectUrl);
      throw error;
    }
    return {
      element,
      kind: "image",
      durationMs: 0,
      release: () => this.revokeObjectUrl(objectUrl),
    };
  }

  async loadPair(
    files: Record<string, PerimeterOverlayFile>,
  ): Promise<Record<string, LoadedPerimeterMedia>> {
    const loaded: LoadedPerimeterMedia[] = [];
    try {
      const entries = await Promise.all(
        Object.entries(files).map(async ([target, file]) => {
          const media = await this.load(file);
          loaded.push(media);
          return [target, media] as const;
        }),
      );
      return Object.fromEntries(entries);
    } catch (error) {
      for (const media of loaded) media.release();
      throw error;
    }
  }
}
