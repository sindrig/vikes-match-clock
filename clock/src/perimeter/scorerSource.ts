import type { GoalScorerOverlayPlayer } from "../types";
import { PersistentMediaCache } from "./cache";

export type ScorerSourceKind = "player" | "crest";

// One decoded scorer source image. `release` revokes the object URL backing
// the decoded element; the encoded bytes stay in the persistent media cache
// so a mapping revision can re-decode the same generation later.
export interface LoadedScorerSource {
  kind: ScorerSourceKind;
  objectPath: string;
  generation: string;
  image: HTMLImageElement;
  release: () => void;
}

export interface ScorerSourceLoaderOptions {
  bucket: string;
  location: string;
  cache?: PersistentMediaCache;
  resolveGeneration: (objectPath: string) => Promise<string | null>;
  resolveDownloadUrl: (objectPath: string) => Promise<string>;
  // Last-resort source used when neither approved Storage object can be
  // loaded: a bundled club crest decoded without Storage access so a goal
  // scorer band never fails outright while the crest object is missing.
  bundledCrest?: () => Promise<HTMLImageElement | null>;
  fetchImpl?: typeof fetch;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

export function scorerSourcePaths(
  player: GoalScorerOverlayPlayer,
  location: string,
): { celebrationPath: string; crestPath: string } {
  return {
    celebrationPath: `${location}/players/${player.id}-fagn.png`,
    crestPath: `${location}/crest.png`,
  };
}

export class ScorerSourceLoader {
  private readonly cache: PersistentMediaCache;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;

  constructor(private readonly options: ScorerSourceLoaderOptions) {
    this.cache = options.cache ?? new PersistentMediaCache();
    this.createObjectUrl =
      options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectUrl =
      options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
  }

  // Loads the selected player's celebration image first and falls back to
  // the venue crest only when the celebration image is missing, unreadable,
  // or undecodable. When the Storage crest is also unusable, the optional
  // bundled club crest keeps the band renderable (crest + number + name).
  // Throws only when every source is unusable so the caller can retain the
  // currently visible overlay.
  async load(player: GoalScorerOverlayPlayer): Promise<LoadedScorerSource> {
    const { celebrationPath, crestPath } = scorerSourcePaths(
      player,
      this.options.location,
    );
    const celebrationError = await this.tryLoadCelebration(celebrationPath);
    if (!(celebrationError instanceof Error)) return celebrationError;
    try {
      return await this.loadObject(crestPath, "crest");
    } catch {
      const bundled = await this.tryLoadBundledCrest();
      if (bundled) return bundled;
      throw new Error(
        `Scorer source could not be loaded (${celebrationError.message}).`,
      );
    }
  }

  private async tryLoadCelebration(
    celebrationPath: string,
  ): Promise<LoadedScorerSource | Error> {
    try {
      return await this.loadObject(celebrationPath, "player");
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  private async tryLoadBundledCrest(): Promise<LoadedScorerSource | null> {
    const bundledCrest = this.options.bundledCrest;
    if (!bundledCrest) return null;
    try {
      const image = await bundledCrest();
      if (!image) return null;
      return {
        kind: "crest",
        objectPath: "bundled-crest",
        generation: "bundled",
        image,
        release: () => undefined,
      };
    } catch {
      return null;
    }
  }

  private async loadObject(
    objectPath: string,
    kind: ScorerSourceKind,
  ): Promise<LoadedScorerSource> {
    const generation = await this.options.resolveGeneration(objectPath);
    if (!generation) {
      throw new Error(`Scorer source is unavailable: ${objectPath}`);
    }
    const downloadUrl = await this.options.resolveDownloadUrl(objectPath);
    const response = await this.cache.getOrDownload(
      {
        bucket: this.options.bucket,
        objectPath,
        generation,
      },
      downloadUrl,
    );
    const blob = await response.blob();
    const objectUrl = this.createObjectUrl(blob);
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error("Scorer source image could not be decoded."));
      });
    } catch (error) {
      this.revokeObjectUrl(objectUrl);
      throw error instanceof Error ? error : new Error(String(error));
    }
    return {
      kind,
      objectPath,
      generation,
      image,
      release: () => this.revokeObjectUrl(objectUrl),
    };
  }
}
