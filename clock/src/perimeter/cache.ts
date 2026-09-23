export interface GsReference {
  bucket: string;
  objectPath: string;
}

export interface ImmutableMediaReference extends GsReference {
  generation: string;
}

export type CacheStorageLike = Pick<CacheStorage, "open">;

export function parseGsReference(
  source: string,
  approvedBucket: string,
): GsReference | null {
  if (!source.startsWith("gs://")) return null;
  const value = source.slice(5);
  const slash = value.indexOf("/");
  if (slash <= 0) return null;
  const bucket = value.slice(0, slash);
  const objectPath = value.slice(slash + 1);
  if (bucket !== approvedBucket || !objectPath) return null;
  return { bucket, objectPath };
}

export function cacheKey(reference: ImmutableMediaReference): string {
  const params = new URLSearchParams({
    bucket: reference.bucket,
    object: reference.objectPath,
    generation: reference.generation,
  });
  return `https://perimeter-cache.invalid/perimeter-cache?${params.toString()}`;
}

export interface PersistentMediaCacheOptions {
  cacheStorage?: CacheStorageLike;
  cacheName?: string;
  fetchImpl?: typeof fetch;
}

export class PersistentMediaCache {
  private readonly cacheStorage: CacheStorageLike | undefined;
  private readonly cacheName: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PersistentMediaCacheOptions = {}) {
    this.cacheStorage = options.cacheStorage ?? globalThis.caches;
    this.cacheName = options.cacheName ?? "perimeter-media-v1";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async getOrDownload(
    reference: ImmutableMediaReference,
    downloadUrl: string,
  ): Promise<Response> {
    if (!this.cacheStorage) throw new Error("Cache Storage is unavailable.");
    const cache = await this.cacheStorage.open(this.cacheName);
    const key = cacheKey(reference);
    const cached = await cache.match(key);
    if (cached) {
      try {
        await cached.clone().arrayBuffer();
        return cached;
      } catch {
        await cache.delete(key);
      }
    }

    const response = await this.fetchImpl(downloadUrl);
    if (!response.ok) {
      throw new Error(`Perimeter media download failed (${response.status}).`);
    }
    const previousKeys = await cache.keys();
    const identityPrefix = `https://perimeter-cache.invalid/perimeter-cache?bucket=${encodeURIComponent(reference.bucket)}&object=${encodeURIComponent(reference.objectPath)}&`;
    await Promise.all(
      previousKeys
        .filter(
          (entry) => entry.url.includes(identityPrefix) && entry.url !== key,
        )
        .map((entry) => cache.delete(entry)),
    );
    await cache.put(key, response.clone());
    return response;
  }

  // Fetches a full download URL (immutable per object version, so the URL
  // alone is the cache identity) through the same persistent cache. Used by
  // the player band loader for card photos and club override logos, whose
  // references are download URLs rather than gs:// paths.
  async getUrl(url: string): Promise<Response> {
    if (!this.cacheStorage) throw new Error("Cache Storage is unavailable.");
    const cache = await this.cacheStorage.open(this.cacheName);
    const cached = await cache.match(url);
    if (cached) {
      try {
        await cached.clone().arrayBuffer();
        return cached;
      } catch {
        await cache.delete(url);
      }
    }
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Perimeter media download failed (${response.status}).`);
    }
    await cache.put(url, response.clone());
    return response;
  }
}

export interface StoragePersistenceResult {
  persistent: boolean;
  sufficient: boolean;
  quota: number | null;
  usage: number | null;
  error?: string;
}

export async function ensurePersistentStorage(
  requiredBytes: number,
  storageManager:
    | Pick<StorageManager, "persist" | "estimate">
    | undefined = globalThis.navigator?.storage,
): Promise<StoragePersistenceResult> {
  if (!storageManager) {
    return {
      persistent: false,
      sufficient: false,
      quota: null,
      usage: null,
      error: "Persistent browser storage is unavailable.",
    };
  }
  try {
    const persistent = await storageManager.persist();
    const estimate = await storageManager.estimate();
    const quota = estimate.quota ?? null;
    const usage = estimate.usage ?? null;
    const sufficient =
      quota === null || usage === null
        ? false
        : quota - usage >= Math.max(0, requiredBytes);
    return { persistent, sufficient, quota, usage };
  } catch (error) {
    return {
      persistent: false,
      sufficient: false,
      quota: null,
      usage: null,
      error: error instanceof Error ? error.message : "Storage check failed.",
    };
  }
}
