import type { BandIdentity } from "./playerBandPresentation";
import { PersistentMediaCache } from "./cache";

// One decoded band source image. `release` revokes the object URL backing
// the decoded element; the encoded bytes stay in the persistent media cache
// so a later band request can re-decode without another download.
export interface LoadedBandSource {
  image: HTMLImageElement;
  alternateImage?: HTMLImageElement;
  release: () => void;
}

// Only derive a sibling portrait from this venue's identifier-shaped player
// photo in the active bucket. Never rewrite arbitrary URLs or reuse their
// download token for a different object.
export function alternatePlayerPhotoPath(
  imageRef: string,
  bucket: string,
  location: string,
): string | null {
  try {
    const url = new URL(imageRef);
    const firebaseHost =
      url.protocol === "https:" &&
      url.hostname === "firebasestorage.googleapis.com";
    const emulatorHost =
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);
    if (!firebaseHost && !emulatorHost) return null;
    const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
    if (!match || decodeURIComponent(match[1]!) !== bucket) return null;
    const path = decodeURIComponent(match[2]!);
    const prefix = `${location}/players/`;
    if (!path.startsWith(prefix)) return null;
    const filename = path.slice(prefix.length);
    const celebration = filename.endsWith("-fagn.png");
    const id = filename.slice(0, celebration ? -9 : -4);
    if (!filename.endsWith(".png") || !/^[A-Za-z0-9_-]{1,64}$/.test(id))
      return null;
    return `${prefix}${id}${celebration ? "" : "-fagn"}.png`;
  } catch {
    return null;
  }
}

export interface PlayerBandSourceLoaderOptions {
  bucket: string;
  location: string;
  cache?: PersistentMediaCache;
  // Resolves the Firebase Storage download URL for an approved object path
  // (a sibling player portrait or the venue crest fallback).
  resolveDownloadUrl: (objectPath: string) => Promise<string>;
  resolveGeneration: (objectPath: string) => Promise<string | null>;
  // The club override logo download URL for a team name, or null when the
  // team has no override logo (checked before the bundled crest map).
  clubOverrideLogoUrl?: (teamName: string) => Promise<string | null>;
  // The bundled club crest image for a team name, or null when unknown.
  // Per-team so away players resolve their own crest, unlike the scorer
  // loader's home-team-only closure.
  bundledCrestFor?: (teamName: string) => Promise<HTMLImageElement | null>;
  fetchImpl?: typeof fetch;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

// Band image chain (per design D3): the card asset's own image (a download
// URL) → team logo resolved by the asset's team name (club override
// `logoUrl`, then the bundled `clubLogos` crest — works for away teams) →
// the venue crest chain. Every hop is tried only when the previous one is
// missing, unreadable, or undecodable. Same-venue player photos additionally
// preload their regular/celebration sibling for display-local alternation.
export class PlayerBandSourceLoader {
  private readonly cache: PersistentMediaCache;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;

  constructor(private readonly options: PlayerBandSourceLoaderOptions) {
    this.cache = options.cache ?? new PersistentMediaCache();
    this.createObjectUrl =
      options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectUrl =
      options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
  }

  // Resolves one side of a band (the single player identity of a player
  // band, or one side of a substitution band) through the fallback chain.
  // Throws only when every source is unusable so the caller can retain the
  // currently visible band (or the base deck).
  async load(identity: BandIdentity): Promise<LoadedBandSource> {
    if (identity.imageRef) {
      const alternatePath = alternatePlayerPhotoPath(
        identity.imageRef,
        this.options.bucket,
        this.options.location,
      );
      const [primary, alternate] = await Promise.all([
        this.loadFromUrl(identity.imageRef).catch(() => null),
        alternatePath
          ? this.loadObject(alternatePath).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (primary && alternate) {
        return {
          image: primary.image,
          alternateImage: alternate.image,
          release: () => {
            primary.release();
            alternate.release();
          },
        };
      }
      if (primary) return primary;
      if (alternate) return alternate;
      // Fall through to the team-logo hop when neither portrait is usable.
    }
    const overrideUrl = this.options.clubOverrideLogoUrl
      ? await this.tryClubOverrideLogo(identity.teamName ?? "")
      : null;
    if (overrideUrl) {
      try {
        return await this.loadFromUrl(overrideUrl);
      } catch {
        // Fall through to the bundled crest hop.
      }
    }
    const bundled = this.options.bundledCrestFor
      ? await this.tryBundledCrest(identity.teamName ?? "")
      : null;
    if (bundled) return bundled;
    try {
      return await this.loadVenueCrest();
    } catch {
      throw new Error("Player band source could not be loaded.");
    }
  }

  private async tryClubOverrideLogo(teamName: string): Promise<string | null> {
    try {
      const url = await this.options.clubOverrideLogoUrl!(teamName);
      return url ?? null;
    } catch {
      return null;
    }
  }

  private async tryBundledCrest(
    teamName: string,
  ): Promise<LoadedBandSource | null> {
    try {
      const image = await this.options.bundledCrestFor!(teamName);
      if (!image) return null;
      return { image, release: () => undefined };
    } catch {
      return null;
    }
  }

  private async loadVenueCrest(): Promise<LoadedBandSource> {
    return this.loadObject(`${this.options.location}/crest.png`);
  }

  private async loadObject(objectPath: string): Promise<LoadedBandSource> {
    const generation = await this.options.resolveGeneration(objectPath);
    if (!generation) {
      throw new Error(`Band source is unavailable: ${objectPath}`);
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
    return this.decodeResponse(response);
  }

  private async loadFromUrl(url: string): Promise<LoadedBandSource> {
    const response = await this.cache.getUrl(url);
    return this.decodeResponse(response);
  }

  private async decodeResponse(response: Response): Promise<LoadedBandSource> {
    const blob = await response.blob();
    const objectUrl = this.createObjectUrl(blob);
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error("Band source image could not be decoded."));
      });
    } catch (error) {
      this.revokeObjectUrl(objectUrl);
      throw error instanceof Error ? error : new Error(String(error));
    }
    return {
      image,
      release: () => this.revokeObjectUrl(objectUrl),
    };
  }
}
