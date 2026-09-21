import { describe, expect, it, vi } from "vitest";
import {
  PersistentMediaCache,
  cacheKey,
  ensurePersistentStorage,
  parseGsReference,
} from "./cache";

function createCacheMock() {
  const entries = new Map<string, Response>();
  return {
    entries,
    open: vi.fn(() =>
      Promise.resolve({
        match: (key: string) => Promise.resolve(entries.get(key)),
        put: (key: string, response: Response) => {
          entries.set(key, response);
          return Promise.resolve();
        },
        delete: (key: string | Request) => {
          const value = typeof key === "string" ? key : key.url;
          return Promise.resolve(entries.delete(value));
        },
        keys: () =>
          Promise.resolve([...entries.keys()].map((url) => new Request(url))),
      }),
    ),
  };
}

describe("perimeter media cache", () => {
  it("parses only approved gs references", () => {
    expect(parseGsReference("gs://bucket/path/file.png", "bucket")).toEqual({
      bucket: "bucket",
      objectPath: "path/file.png",
    });
    expect(parseGsReference("gs://other/path/file.png", "bucket")).toBeNull();
  });

  it("hits cache, replaces generations, and downloads misses", async () => {
    const cacheMock = createCacheMock();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("first"));
    const cache = new PersistentMediaCache({
      cacheStorage: cacheMock,
      fetchImpl,
    });
    const first = { bucket: "bucket", objectPath: "file", generation: "1" };
    const second = { ...first, generation: "2" };

    await cache.getOrDownload(first, "https://example.test/1");
    await cache.getOrDownload(first, "https://example.test/1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await cache.getOrDownload(second, "https://example.test/2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(cacheMock.entries.has(cacheKey(first))).toBe(false);
    expect(cacheMock.entries.has(cacheKey(second))).toBe(true);
  });

  it("does not cache failed downloads", async () => {
    const cacheMock = createCacheMock();
    const cache = new PersistentMediaCache({
      cacheStorage: cacheMock,
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("no", { status: 503 })),
    });
    await expect(
      cache.getOrDownload(
        { bucket: "bucket", objectPath: "file", generation: "1" },
        "https://example.test/file",
      ),
    ).rejects.toThrow("download failed");
    expect(cacheMock.entries.size).toBe(0);
  });

  it("removes a corrupt cached response before retrying the download", async () => {
    const cacheMock = createCacheMock();
    const reference = { bucket: "bucket", objectPath: "file", generation: "1" };
    cacheMock.entries.set(cacheKey(reference), {
      clone: () => ({
        arrayBuffer: () => Promise.reject(new Error("corrupt")),
      }),
    } as unknown as Response);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("fresh"));
    const cache = new PersistentMediaCache({
      cacheStorage: cacheMock,
      fetchImpl,
    });

    await cache.getOrDownload(reference, "https://example.test/file");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cacheMock.entries.get(cacheKey(reference))).toBeInstanceOf(Response);
  });

  it("reports persistence and quota outcomes without a playlist limit", async () => {
    await expect(
      ensurePersistentStorage(100, {
        persist: () => Promise.resolve(true),
        estimate: () => Promise.resolve({ usage: 10, quota: 1000 }),
      }),
    ).resolves.toMatchObject({ persistent: true, sufficient: true });
    await expect(
      ensurePersistentStorage(1000, {
        persist: () => Promise.resolve(false),
        estimate: () => Promise.resolve({ usage: 10, quota: 100 }),
      }),
    ).resolves.toMatchObject({ persistent: false, sufficient: false });
  });
});
