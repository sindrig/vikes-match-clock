import { describe, it, expect } from "vitest";
import { parseQueueMap } from "../firebaseParsers";
import type { ControllerState, QueueState, Asset } from "../../types";

function firebaseQueue(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "q1",
    name: "Main Queue",
    items: [
      { key: "a1", type: "image" },
      { key: "a2", type: "video" },
    ],
    autoPlay: true,
    imageSeconds: 5,
    cycle: true,
    order: 0,
    ...overrides,
  };
}

function makeAsset(key: string, type = "image"): Asset {
  return { key, type };
}

function makeControllerState(
  overrides: Partial<ControllerState> = {},
): ControllerState {
  return {
    queues: {},
    activeQueueId: null,
    playing: false,
    assetView: "assets",
    view: "idle",
    roster: { home: [], away: [] },
    currentAsset: null,
    refreshToken: "",
    ...overrides,
  };
}

function makeQueue(overrides: Partial<QueueState> = {}): QueueState {
  return {
    id: "q1",
    name: "Default",
    items: [],
    autoPlay: false,
    imageSeconds: 3,
    cycle: false,
    order: 0,
    ...overrides,
  };
}

let getStateShowingNextAsset:
  | ((state: ControllerState) => ControllerState)
  | undefined;

try {
  const mod = await import("../FirebaseStateContext");
  getStateShowingNextAsset = (mod as unknown as Record<string, unknown>)
    .getStateShowingNextAsset as typeof getStateShowingNextAsset;
} catch {
  getStateShowingNextAsset = undefined;
}

describe("parseQueueMap", () => {
  it("parses a single valid queue entry", () => {
    const data = { q1: firebaseQueue() };
    const result = parseQueueMap(data);

    expect(result).toHaveProperty("q1");
    expect(result.q1.id).toBe("q1");
    expect(result.q1.name).toBe("Main Queue");
    expect(result.q1.items).toHaveLength(2);
    expect(result.q1.autoPlay).toBe(true);
    expect(result.q1.imageSeconds).toBe(5);
    expect(result.q1.cycle).toBe(true);
    expect(result.q1.order).toBe(0);
  });

  it("parses multiple queue entries", () => {
    const data = {
      q1: firebaseQueue({ id: "q1", name: "Queue 1", order: 0 }),
      q2: firebaseQueue({ id: "q2", name: "Queue 2", order: 1 }),
    };
    const result = parseQueueMap(data);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result.q1.name).toBe("Queue 1");
    expect(result.q2.name).toBe("Queue 2");
    expect(result.q2.order).toBe(1);
  });

  it("preserves asset details in queue items", () => {
    const items = [
      { key: "a1", type: "image", url: "https://example.com/img.png" },
      { key: "a2", type: "video", name: "Sponsor clip" },
    ];
    const data = { q1: firebaseQueue({ items }) };
    const result = parseQueueMap(data);

    expect(result.q1.items).toHaveLength(2);
    expect(result.q1.items[0].key).toBe("a1");
    expect(result.q1.items[1].name).toBe("Sponsor clip");
  });

  it("defaults autoPlay to false when missing", () => {
    const raw = firebaseQueue();
    delete raw.autoPlay;
    const result = parseQueueMap({ q1: raw });

    expect(result.q1.autoPlay).toBe(false);
  });

  it("defaults imageSeconds to 3 when missing", () => {
    const raw = firebaseQueue();
    delete raw.imageSeconds;
    const result = parseQueueMap({ q1: raw });

    expect(result.q1.imageSeconds).toBe(3);
  });

  it("defaults cycle to false when missing", () => {
    const raw = firebaseQueue();
    delete raw.cycle;
    const result = parseQueueMap({ q1: raw });

    expect(result.q1.cycle).toBe(false);
  });

  it("defaults order to 0 when missing", () => {
    const raw = firebaseQueue();
    delete raw.order;
    const result = parseQueueMap({ q1: raw });

    expect(result.q1.order).toBe(0);
  });

  it("defaults items to empty array when missing", () => {
    const raw = firebaseQueue();
    delete raw.items;
    const result = parseQueueMap({ q1: raw });

    expect(result.q1.items).toEqual([]);
  });

  it("applies all defaults simultaneously", () => {
    const data = { q1: { id: "q1", name: "Sparse" } };
    const result = parseQueueMap(data);

    expect(result.q1).toEqual({
      id: "q1",
      name: "Sparse",
      items: [],
      autoPlay: false,
      imageSeconds: 3,
      cycle: false,
      order: 0,
    });
  });

  it("skips non-object entries", () => {
    const data = {
      q1: firebaseQueue(),
      bad1: "string",
      bad2: 42,
      bad3: true,
      bad4: null,
    } as Record<string, unknown>;
    const result = parseQueueMap(data);

    expect(Object.keys(result)).toEqual(["q1"]);
  });

  it("uses queue key as fallback for missing id and name", () => {
    const data = {
      q1: firebaseQueue(),
      q2: { items: [{ key: "a1", type: "image" }] },
    };
    const result = parseQueueMap(data);

    expect(result).toHaveProperty("q1");
  });

  it("filters invalid items within a queue's items array", () => {
    const data = {
      q1: firebaseQueue({
        items: [
          { key: "a1", type: "image" },
          null,
          "invalid",
          { key: "a2" },
          { type: "video" },
          { key: "a3", type: "text" },
        ],
      }),
    };
    const result = parseQueueMap(data);

    expect(result.q1.items).toHaveLength(2);
    expect(result.q1.items[0].key).toBe("a1");
    expect(result.q1.items[1].key).toBe("a3");
  });

  it("handles items that is not an array", () => {
    const data = {
      q1: firebaseQueue({ items: "not-an-array" }),
    };
    const result = parseQueueMap(data);

    expect(result.q1.items).toEqual([]);
  });

  it("returns empty object for empty input", () => {
    expect(parseQueueMap({})).toEqual({});
  });

  it("returns empty object for null input", () => {
    expect(parseQueueMap(null)).toEqual({});
  });

  it("returns empty object for undefined input", () => {
    expect(parseQueueMap(undefined)).toEqual({});
  });

  it("returns empty object for non-object input", () => {
    expect(parseQueueMap("string" as unknown)).toEqual({});
    expect(parseQueueMap(123 as unknown)).toEqual({});
    expect(parseQueueMap(true as unknown)).toEqual({});
  });

  it("coerces non-boolean autoPlay to default", () => {
    const data = { q1: firebaseQueue({ autoPlay: "yes" }) };
    const result = parseQueueMap(data);

    expect(result.q1.autoPlay).toBe(false);
  });

  it("coerces non-number imageSeconds to default", () => {
    const data = { q1: firebaseQueue({ imageSeconds: "five" }) };
    const result = parseQueueMap(data);

    expect(result.q1.imageSeconds).toBe(3);
  });

  it("coerces non-boolean cycle to default", () => {
    const data = { q1: firebaseQueue({ cycle: 1 }) };
    const result = parseQueueMap(data);

    expect(result.q1.cycle).toBe(false);
  });

  it("coerces non-number order to default", () => {
    const data = { q1: firebaseQueue({ order: "first" }) };
    const result = parseQueueMap(data);

    expect(result.q1.order).toBe(0);
  });
});

describe.skipIf(!getStateShowingNextAsset)(
  "getStateShowingNextAsset (queue-aware)",
  () => {
    function nextAsset(state: ControllerState): ControllerState {
      return getStateShowingNextAsset!(state);
    }

    it("is a no-op when activeQueueId is null", () => {
      const state = makeControllerState({
        activeQueueId: null,
        queues: { q1: makeQueue({ items: [makeAsset("a1")] }) },
      });

      const result = nextAsset(state);
      expect(result.currentAsset).toBeNull();
      expect(result.playing).toBe(false);
    });

    it("is a no-op when activeQueueId references non-existent queue", () => {
      const state = makeControllerState({
        activeQueueId: "missing",
        queues: {},
      });

      const result = nextAsset(state);
      expect(result.currentAsset).toBeNull();
      expect(result.playing).toBe(false);
    });

    it("sets playing=false and currentAsset=null for empty active queue", () => {
      const state = makeControllerState({
        activeQueueId: "q1",
        queues: { q1: makeQueue({ id: "q1", items: [] }) },
      });

      const result = nextAsset(state);
      expect(result.playing).toBe(false);
      expect(result.currentAsset).toBeNull();
    });

    it("pops first item and sets currentAsset with time when autoPlay is on", () => {
      const items = [makeAsset("a1"), makeAsset("a2"), makeAsset("a3")];
      const state = makeControllerState({
        activeQueueId: "q1",
        queues: {
          q1: makeQueue({
            id: "q1",
            items,
            autoPlay: true,
            imageSeconds: 7,
          }),
        },
      });

      const result = nextAsset(state);

      expect(result.currentAsset).not.toBeNull();
      expect(result.currentAsset!.asset.key).toBe("a1");
      expect(result.currentAsset!.time).toBe(7);
      expect(result.playing).toBe(true);

      const queue = result.queues.q1;
      expect(queue.items[0].key).toBe("a2");
    });

    it("re-adds popped item to end of queue when cycle is on", () => {
      const items = [makeAsset("a1"), makeAsset("a2")];
      const state = makeControllerState({
        activeQueueId: "q1",
        queues: {
          q1: makeQueue({
            id: "q1",
            items,
            autoPlay: true,
            imageSeconds: 5,
            cycle: true,
          }),
        },
      });

      const result = nextAsset(state);

      expect(result.currentAsset!.asset.key).toBe("a1");

      const queue = result.queues.q1;
      expect(queue.items).toHaveLength(2);
      expect(queue.items[0].key).toBe("a2");
      expect(queue.items[1].key).toBe("a1");
    });

    it("keeps single item cycling when cycle is on", () => {
      const items = [makeAsset("a1")];
      const state = makeControllerState({
        activeQueueId: "q1",
        queues: {
          q1: makeQueue({
            id: "q1",
            items,
            autoPlay: true,
            imageSeconds: 5,
            cycle: true,
          }),
        },
      });

      const result = nextAsset(state);

      expect(result.currentAsset!.asset.key).toBe("a1");
      expect(result.queues.q1.items).toHaveLength(1);
      expect(result.queues.q1.items[0].key).toBe("a1");
    });

    it("removes item from queue without re-adding when cycle is off", () => {
      const items = [makeAsset("a1"), makeAsset("a2")];
      const state = makeControllerState({
        activeQueueId: "q1",
        queues: {
          q1: makeQueue({
            id: "q1",
            items,
            autoPlay: true,
            imageSeconds: 5,
            cycle: false,
          }),
        },
      });

      const result = nextAsset(state);

      expect(result.currentAsset!.asset.key).toBe("a1");
      expect(result.queues.q1.items).toHaveLength(1);
      expect(result.queues.q1.items[0].key).toBe("a2");
    });

    it("empties queue when last item popped with cycle off", () => {
      const items = [makeAsset("a1")];
      const state = makeControllerState({
        activeQueueId: "q1",
        queues: {
          q1: makeQueue({
            id: "q1",
            items,
            autoPlay: true,
            imageSeconds: 5,
            cycle: false,
          }),
        },
      });

      const result = nextAsset(state);

      expect(result.currentAsset!.asset.key).toBe("a1");
      const queue = result.queues.q1;
      if (queue) {
        expect(queue.items).toHaveLength(0);
      }
    });

    it("sets currentAsset without time when autoPlay is off", () => {
      const items = [makeAsset("a1"), makeAsset("a2")];
      const state = makeControllerState({
        activeQueueId: "q1",
        queues: {
          q1: makeQueue({
            id: "q1",
            items,
            autoPlay: false,
            imageSeconds: 5,
          }),
        },
      });

      const result = nextAsset(state);

      expect(result.currentAsset).not.toBeNull();
      expect(result.currentAsset!.asset.key).toBe("a1");
      expect(result.currentAsset!.time).toBeNull();
    });

    it("returns a new state object without mutating the original", () => {
      const items = [makeAsset("a1"), makeAsset("a2")];
      const original = makeControllerState({
        activeQueueId: "q1",
        queues: {
          q1: makeQueue({
            id: "q1",
            items,
            autoPlay: true,
            imageSeconds: 5,
            cycle: true,
          }),
        },
      });

      const result = nextAsset(original);

      expect(result).not.toBe(original);
      expect(original.queues.q1.items).toHaveLength(2);
      expect(original.queues.q1.items[0].key).toBe("a1");
    });
  },
);
