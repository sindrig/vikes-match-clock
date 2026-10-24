import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistentMediaCache } from "./cache";
import {
  PlayerBandSourceLoader,
  type PlayerBandSourceLoaderOptions,
  alternatePlayerPhotoPath,
} from "./bandSource";
import type { BandIdentity } from "./playerBandPresentation";

const IDENTITY: BandIdentity = {
  name: "Jón Jónsson",
  number: "7",
  teamName: "Víkingur R",
  imageRef: "https://dl.example/photo.png",
};

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
    delete: (key: Request | string) =>
      Promise.resolve(entries.delete(typeof key === "string" ? key : key.url)),
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
    clubOverrideLogoUrl?: (teamName: string) => Promise<string | null>;
    bundledCrestFor?: (teamName: string) => Promise<HTMLImageElement | null>;
    resolveGeneration?: (path: string) => Promise<string | null>;
    resolveDownloadUrl?: (path: string) => Promise<string>;
    fetchResponses?: Map<string, Response>;
  } = {},
) {
  const objectUrls: string[] = [];
  let nextUrlId = 0;
  const cacheStore = fakeCacheStorage();
  const responses = overrides.fetchResponses ?? new Map<string, Response>();
  const fetchSpy = vi.fn((url: string) =>
    Promise.resolve(responses.get(url) ?? responseFor(PNG_BYTES)),
  );
  const options: PlayerBandSourceLoaderOptions = {
    bucket: "bucket",
    location: "vikuti",
    cache: new PersistentMediaCache({
      cacheStorage: { open: () => Promise.resolve(cacheStore.storage) },
      fetchImpl: fetchSpy as unknown as typeof fetch,
    }),
    resolveGeneration:
      overrides.resolveGeneration ??
      (() => Promise.resolve("1700000000000000")),
    resolveDownloadUrl:
      overrides.resolveDownloadUrl ??
      (() => Promise.resolve("https://dl.example/crest")),
    clubOverrideLogoUrl:
      overrides.clubOverrideLogoUrl ?? (() => Promise.resolve(null)),
    bundledCrestFor: overrides.bundledCrestFor ?? (() => Promise.resolve(null)),
    createObjectUrl: (blob) => {
      const url = `blob:${nextUrlId++}-${blob.size}`;
      objectUrls.push(url);
      return url;
    },
    revokeObjectUrl: (url) => {
      const index = objectUrls.indexOf(url);
      if (index !== -1) objectUrls.splice(index, 1);
    },
  };
  return {
    loader: new PlayerBandSourceLoader(options),
    objectUrls,
    fetches: () => fetchSpy.mock.calls.length,
    cacheStore,
  };
}

afterEach(() => {
  decodeFailures.clear();
});

describe("PlayerBandSourceLoader", () => {
  const photoUrl = (filename: string) =>
    `https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(`vikuti/players/${filename}`)}?alt=media&token=primary-token`;

  it("preloads both poses and releases both decoded images", async () => {
    const resolveGeneration = vi.fn(() => Promise.resolve("42"));
    const resolveDownloadUrl = vi.fn(() =>
      Promise.resolve("https://dl.example/alternate"),
    );
    const { loader, objectUrls, fetches } = createHarness({
      resolveGeneration,
      resolveDownloadUrl,
    });
    const identity = { ...IDENTITY, imageRef: photoUrl("2492.png") };
    const loaded = await loader.load(identity);
    expect(loaded.alternateImage).toBeInstanceOf(FakeImage);
    expect(loaded.alternateImage).not.toBe(loaded.image);
    expect(resolveGeneration).toHaveBeenCalledWith(
      "vikuti/players/2492-fagn.png",
    );
    expect(resolveDownloadUrl).toHaveBeenCalledWith(
      "vikuti/players/2492-fagn.png",
    );
    expect(objectUrls).toHaveLength(2);
    loaded.release();
    expect(objectUrls).toHaveLength(0);
    const again = await loader.load(identity);
    expect(fetches()).toBe(2);
    again.release();
  });

  it("loads the regular pose when the card already uses the celebration pose", async () => {
    const resolveGeneration = vi.fn(() => Promise.resolve("42"));
    const { loader } = createHarness({ resolveGeneration });
    const loaded = await loader.load({
      ...IDENTITY,
      imageRef: photoUrl("2492-fagn.png"),
    });
    expect(resolveGeneration).toHaveBeenCalledWith("vikuti/players/2492.png");
    expect(loaded.alternateImage).toBeDefined();
    loaded.release();
  });

  it("holds the card portrait when the alternate is missing", async () => {
    const { loader, objectUrls } = createHarness({
      resolveGeneration: () => Promise.resolve(null),
    });
    const loaded = await loader.load({
      ...IDENTITY,
      imageRef: photoUrl("2492.png"),
    });
    expect(loaded.alternateImage).toBeUndefined();
    expect(objectUrls).toHaveLength(1);
    loaded.release();
  });

  it("holds the alternate portrait rather than a crest when the card photo fails", async () => {
    const imageRef = photoUrl("2492.png");
    const clubOverrideLogoUrl = vi.fn(() => Promise.resolve(null));
    const { loader, objectUrls } = createHarness({
      fetchResponses: new Map([
        [imageRef, new Response(null, { status: 404 })],
      ]),
      clubOverrideLogoUrl,
    });
    const loaded = await loader.load({ ...IDENTITY, imageRef });
    expect(loaded.alternateImage).toBeUndefined();
    expect(clubOverrideLogoUrl).not.toHaveBeenCalled();
    expect(objectUrls).toHaveLength(1);
    loaded.release();
  });

  it("ignores an undecodable alternate and releases its object URL", async () => {
    decodeFailures.add(`blob:1-${PNG_BYTES.length}`);
    const { loader, objectUrls } = createHarness();
    const loaded = await loader.load({
      ...IDENTITY,
      imageRef: photoUrl("2492.png"),
    });
    expect(loaded.alternateImage).toBeUndefined();
    expect(objectUrls).toHaveLength(1);
    loaded.release();
    expect(objectUrls).toHaveLength(0);
  });
  it("loads the card photo when its download URL fetches and decodes", async () => {
    const { loader, objectUrls } = createHarness();
    const loaded = await loader.load(IDENTITY);
    expect(loaded.image).toBeInstanceOf(FakeImage);
    loaded.release();
    expect(objectUrls).toHaveLength(0);
  });

  it("falls back to the team logo when the photo fetch fails", async () => {
    const clubOverrideLogoUrl = vi.fn(() =>
      Promise.resolve("https://dl.example/override.png"),
    );
    const fetchResponses = new Map<string, Response>();
    fetchResponses.set(IDENTITY.imageRef!, new Response(null, { status: 404 }));
    const { loader } = createHarness({
      clubOverrideLogoUrl,
      fetchResponses,
    });
    const loaded = await loader.load(IDENTITY);
    expect(loaded.image).toBeInstanceOf(FakeImage);
    expect(clubOverrideLogoUrl).toHaveBeenCalledWith("Víkingur R");
  });

  it("prefers the club override logo over the bundled crest", async () => {
    const bundledCrestFor = vi.fn(() => Promise.resolve(null));
    const { loader } = createHarness({
      clubOverrideLogoUrl: () =>
        Promise.resolve("https://dl.example/override.png"),
      bundledCrestFor,
    });
    const loaded = await loader.load(IDENTITY);
    expect(loaded.image).toBeInstanceOf(FakeImage);
    expect(bundledCrestFor).not.toHaveBeenCalled();
  });

  it("falls back to the per-team bundled crest for an away team", async () => {
    const bundledCrestFor = vi.fn((teamName: string) => {
      const image = new FakeImage();
      // Give the fake a src value so the test can verify the resolver saw
      // the away team name.
      Object.assign(image, { srcValue: `bundled:${teamName}` });
      return Promise.resolve(image as unknown as HTMLImageElement);
    });
    const fetchResponses = new Map<string, Response>();
    fetchResponses.set(IDENTITY.imageRef, new Response(null, { status: 404 }));
    const { loader } = createHarness({ fetchResponses, bundledCrestFor });
    const loaded = await loader.load({
      ...IDENTITY,
      teamName: "KA",
    });
    expect(bundledCrestFor).toHaveBeenCalledWith("KA");
    expect(loaded.release()).toBeUndefined();
  });

  it("falls back to the venue crest when every earlier hop fails", async () => {
    const { loader } = createHarness({
      clubOverrideLogoUrl: () => Promise.resolve(null),
      bundledCrestFor: () => Promise.resolve(null),
    });
    const loaded = await loader.load({
      name: "Jón",
      number: "7",
      teamName: "Víkingur R",
    });
    expect(loaded.image).toBeInstanceOf(FakeImage);
  });

  it("does not fetch the photo hop for identities without an imageRef", async () => {
    const { loader, fetches } = createHarness();
    await loader.load({
      name: "Jón",
      number: "7",
      teamName: "Víkingur R",
    });
    // The venue crest fetch goes through the generation + download URL path.
    expect(fetches()).toBe(1);
  });

  it("resolves two independent sides for one substitution request", async () => {
    const { loader } = createHarness();
    const [off, on] = await Promise.all([
      loader.load({
        name: "Siggi",
        number: "12",
        teamName: "Víkingur R",
        imageRef: "https://dl.example/off.png",
      }),
      loader.load({
        name: "Jón",
        number: "7",
        teamName: "KA",
        imageRef: "https://dl.example/on.png",
      }),
    ]);
    expect(off.image).toBeInstanceOf(FakeImage);
    expect(on.image).toBeInstanceOf(FakeImage);
    off.release();
    on.release();
  });

  it("throws when every source is unusable", async () => {
    decodeFailures.add("blob:0-80");
    const { loader } = createHarness({
      clubOverrideLogoUrl: () => Promise.resolve(null),
      bundledCrestFor: () => Promise.resolve(null),
      resolveGeneration: () => Promise.resolve(null),
    });
    await expect(
      loader.load({
        name: "Jón",
        number: "7",
        teamName: "Víkingur R",
      }),
    ).rejects.toThrow("Player band source could not be loaded");
  });

  it("keeps the photo bytes in the persistent cache across re-decodes", async () => {
    const { loader, cacheStore } = createHarness();
    const first = await loader.load(IDENTITY);
    first.release();
    const second = await loader.load(IDENTITY);
    expect(cacheStore.size()).toBe(1);
    second.release();
  });
});

describe("alternatePlayerPhotoPath", () => {
  const urlFor = (path: string, bucket = "bucket") =>
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=token`;

  it.each([
    ["2492.png", "2492-fagn.png"],
    ["2492-fagn.png", "2492.png"],
    ["player_12.png", "player_12-fagn.png"],
  ])("derives the sibling of %s", (filename, alternate) => {
    expect(
      alternatePlayerPhotoPath(
        urlFor(`vikuti/players/${filename}`),
        "bucket",
        "vikuti",
      ),
    ).toBe(`vikuti/players/${alternate}`);
  });

  it("supports emulator download URLs", () => {
    expect(
      alternatePlayerPhotoPath(
        `http://127.0.0.1:9199/v0/b/bucket/o/vikuti%2Fplayers%2F2492.png?alt=media`,
        "bucket",
        "vikuti",
      ),
    ).toBe("vikuti/players/2492-fagn.png");
  });

  it.each([
    urlFor("other-venue/players/2492.png"),
    urlFor("vikuti/players/2492.png", "other-bucket"),
    urlFor("vikuti/club-logos/2492.png"),
    urlFor("vikuti/players/nested/2492.png"),
    urlFor("vikuti/players/../2492.png"),
    urlFor("vikuti/players/2492.jpg"),
    urlFor("vikuti/players/-fagn.png"),
    urlFor(`vikuti/players/${"x".repeat(65)}.png`),
    urlFor("vikuti/players/2492.png").replace(
      "firebasestorage.googleapis.com",
      "example.com",
    ),
    "not-a-url",
    "https://firebasestorage.googleapis.com/v0/b/bucket/o/%invalid",
  ])(
    "does not derive a portrait from an unrelated or unsafe reference: %s",
    (url) => {
      expect(alternatePlayerPhotoPath(url, "bucket", "vikuti")).toBeNull();
    },
  );
});
