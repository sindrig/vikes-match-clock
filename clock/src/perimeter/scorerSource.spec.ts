import { describe, expect, it, vi } from "vitest";
import { PersistentMediaCache } from "./cache";
import {
  ScorerSourceLoader,
  scorerSourcePaths,
  type ScorerSourceLoaderOptions,
} from "./scorerSource";

const PLAYER = { id: "2492", name: "Jón Jónsson", number: "7" };

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

function responseFor(bytes: Uint8Array): Response {
  return new Response(bytes.buffer as ArrayBuffer, {
    headers: { "content-type": "image/png" },
  });
}

function fakeCacheStorage(): { storage: Cache; size: () => number } {
  const entries = new Map<string, Response>();
  const storage = {
    match: (key: string) => Promise.resolve(entries.get(key)),
    put: (key: string, response: Response) => {
      entries.set(key, response.clone());
      return Promise.resolve();
    },
    keys: () =>
      Promise.resolve([...entries.keys()].map((url) => new Request(url))),
    delete: (key: Request) => Promise.resolve(entries.delete(key.url)),
  } as unknown as Cache;
  return { storage, size: () => entries.size };
}

// Decoding uses the jsdom Image element, which never fires load/error for
// blob: URLs. Swap in a controllable fake whose src setter resolves (or
// rejects) on the next microtask so loader awaits behave deterministically.
const decodeFailures = new Set<string>();
class FakeImage {
  decoding = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}
vi.stubGlobal("Image", FakeImage);
Object.defineProperty(FakeImage.prototype, "src", {
  set(this: FakeImage, value: string) {
    (this as unknown as { srcValue: string }).srcValue = value;
    if (decodeFailures.has(value)) {
      queueMicrotask(() => this.onerror?.());
    } else {
      queueMicrotask(() => this.onload?.());
    }
  },
  get(this: FakeImage) {
    return (this as unknown as { srcValue: string }).srcValue ?? "";
  },
  configurable: true,
});

function createHarness(
  overrides: {
    resolveGeneration?: (path: string) => Promise<string | null>;
  } = {},
) {
  const objectUrls: string[] = [];
  let nextUrlId = 0;
  const cacheStore = fakeCacheStorage();
  const fetchSpy = vi.fn(() => Promise.resolve(responseFor(PNG_BYTES)));
  const options: ScorerSourceLoaderOptions = {
    bucket: "bucket",
    location: "vikuti",
    cache: new PersistentMediaCache({
      cacheStorage: { open: () => Promise.resolve(cacheStore.storage) },
      fetchImpl: fetchSpy as unknown as typeof fetch,
    }),
    resolveGeneration:
      overrides.resolveGeneration ??
      (() => Promise.resolve("1700000000000000")),
    resolveDownloadUrl: () => Promise.resolve("https://dl.example/url"),
    createObjectUrl: (blob) => {
      const url = `blob:${nextUrlId++}-${blob.size}`;
      objectUrls.push(url);
      return url;
    },
    revokeObjectUrl: (url) => {
      const index = objectUrls.indexOf(url);
      if (index >= 0) objectUrls.splice(index, 1);
    },
  };
  const loader = new ScorerSourceLoader(options);
  return {
    loader,
    objectUrls,
    cacheStore,
    fetches: () => fetchSpy.mock.calls.length,
  };
}

describe("scorerSourcePaths", () => {
  it("derives same-location celebration and crest paths", () => {
    const paths = scorerSourcePaths(PLAYER, "vikuti");
    expect(paths.celebrationPath).toBe("vikuti/players/2492-fagn.png");
    expect(paths.crestPath).toBe("vikuti/crest.png");
  });
});

describe("ScorerSourceLoader", () => {
  it("loads the personalized celebration image first", async () => {
    const { loader, objectUrls } = createHarness();
    const loaded = await loader.load(PLAYER);
    expect(loaded.kind).toBe("player");
    expect(loaded.objectPath).toBe("vikuti/players/2492-fagn.png");
    expect(loaded.generation).toBe("1700000000000000");
    expect(loaded.image.src).toBe(objectUrls[0]);
  });

  it("falls back to the crest when the portrait is missing", async () => {
    const { loader } = createHarness({
      resolveGeneration: (path) =>
        Promise.resolve(path.includes("players/") ? null : "1700000000000000"),
    });
    const loaded = await loader.load(PLAYER);
    expect(loaded.kind).toBe("crest");
    expect(loaded.objectPath).toBe("vikuti/crest.png");
  });

  it("falls back to the crest when the portrait cannot be decoded", async () => {
    const { loader, objectUrls } = createHarness();
    // The first object URL created during the load is the portrait's
    // (deterministic `blob:0-<size>`); make its decode fail.
    decodeFailures.add(`blob:0-${PNG_BYTES.length}`);
    try {
      const loaded = await loader.load(PLAYER);
      expect(loaded.kind).toBe("crest");
      // The failed portrait's object URL was released eagerly, leaving only
      // the crest's URL.
      expect(objectUrls).toHaveLength(1);
      loaded.release();
      expect(objectUrls).toHaveLength(0);
    } finally {
      decodeFailures.clear();
    }
  });

  it("fails without activating either source when both are unusable", async () => {
    const { loader, objectUrls } = createHarness({
      resolveGeneration: () => Promise.resolve(null),
    });
    await expect(loader.load(PLAYER)).rejects.toThrow(
      "Scorer source could not be loaded",
    );
    expect(objectUrls).toHaveLength(0);
  });

  it("releases the object URL while the generation stays cached", async () => {
    const { loader, objectUrls, cacheStore, fetches } = createHarness();
    const loaded = await loader.load(PLAYER);
    expect(fetches()).toBe(1);
    expect(objectUrls).toHaveLength(1);
    loaded.release();
    expect(objectUrls).toHaveLength(0);
    // The persistent cache still holds the downloaded bytes: reloading the
    // same generation succeeds without another network download.
    const again = await loader.load(PLAYER);
    expect(fetches()).toBe(1);
    expect(cacheStore.size()).toBe(1);
    expect(objectUrls).toHaveLength(1);
    again.release();
    expect(objectUrls).toHaveLength(0);
  });
});
