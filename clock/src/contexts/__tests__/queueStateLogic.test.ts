import { describe, it, expect } from "vitest";
import { parseQueueMap } from "../firebaseParsers";
import {
  computeControllerDiff,
  maybeAutoDeleteQueue,
} from "../FirebaseStateContext";
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
    expect(result.q1!.id).toBe("q1");
    expect(result.q1!.name).toBe("Main Queue");
    expect(result.q1!.items).toHaveLength(2);
    expect(result.q1!.autoPlay).toBe(true);
    expect(result.q1!.imageSeconds).toBe(5);
    expect(result.q1!.cycle).toBe(true);
    expect(result.q1!.order).toBe(0);
  });

  it("parses multiple queue entries", () => {
    const data = {
      q1: firebaseQueue({ id: "q1", name: "Queue 1", order: 0 }),
      q2: firebaseQueue({ id: "q2", name: "Queue 2", order: 1 }),
    };
    const result = parseQueueMap(data);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result.q1!.name).toBe("Queue 1");
    expect(result.q2!.name).toBe("Queue 2");
    expect(result.q2!.order).toBe(1);
  });

  it("preserves asset details in queue items", () => {
    const items = [
      { key: "a1", type: "image", url: "https://example.com/img.png" },
      { key: "a2", type: "video", name: "Sponsor clip" },
    ];
    const data = { q1: firebaseQueue({ items }) };
    const result = parseQueueMap(data);

    expect(result.q1!.items).toHaveLength(2);
    expect(result.q1!.items[0]!.key).toBe("a1");
    expect(result.q1!.items[1]!.name).toBe("Sponsor clip");
  });

  it("defaults autoPlay to false when missing", () => {
    const raw = firebaseQueue();
    delete raw.autoPlay;
    const result = parseQueueMap({ q1: raw });

    expect(result.q1!.autoPlay).toBe(false);
  });

  it("defaults imageSeconds to 3 when missing", () => {
    const raw = firebaseQueue();
    delete raw.imageSeconds;
    const result = parseQueueMap({ q1: raw });

    expect(result.q1!.imageSeconds).toBe(3);
  });

  it("defaults cycle to false when missing", () => {
    const raw = firebaseQueue();
    delete raw.cycle;
    const result = parseQueueMap({ q1: raw });

    expect(result.q1!.cycle).toBe(false);
  });

  it("defaults order to 0 when missing", () => {
    const raw = firebaseQueue();
    delete raw.order;
    const result = parseQueueMap({ q1: raw });

    expect(result.q1!.order).toBe(0);
  });

  it("defaults items to empty array when missing", () => {
    const raw = firebaseQueue();
    delete raw.items;
    const result = parseQueueMap({ q1: raw });

    expect(result.q1!.items).toEqual([]);
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

    expect(result.q1!.items).toHaveLength(2);
    expect(result.q1!.items[0]!.key).toBe("a1");
    expect(result.q1!.items[1]!.key).toBe("a3");
  });

  it("handles items that is not an array", () => {
    const data = {
      q1: firebaseQueue({ items: "not-an-array" }),
    };
    const result = parseQueueMap(data);

    expect(result.q1!.items).toEqual([]);
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

    expect(result.q1!.autoPlay).toBe(false);
  });

  it("coerces non-number imageSeconds to default", () => {
    const data = { q1: firebaseQueue({ imageSeconds: "five" }) };
    const result = parseQueueMap(data);

    expect(result.q1!.imageSeconds).toBe(3);
  });

  it("coerces non-boolean cycle to default", () => {
    const data = { q1: firebaseQueue({ cycle: 1 }) };
    const result = parseQueueMap(data);

    expect(result.q1!.cycle).toBe(false);
  });

  it("coerces non-number order to default", () => {
    const data = { q1: firebaseQueue({ order: "first" }) };
    const result = parseQueueMap(data);

    expect(result.q1!.order).toBe(0);
  });

  it("detects and re-sequences duplicate orders", () => {
    const data = {
      q1: firebaseQueue({ id: "q1", name: "Queue 1", order: 0 }),
      q2: firebaseQueue({ id: "q2", name: "Queue 2", order: 0 }),
      q3: firebaseQueue({ id: "q3", name: "Queue 3", order: 1 }),
    };
    const result = parseQueueMap(data);

    const orders = [result.q1!.order, result.q2!.order, result.q3!.order];
    const uniqueOrders = new Set(orders);

    expect(uniqueOrders.size).toBe(3);
    expect(orders).toEqual([0, 1, 2]);
  });

  it("re-sequences all orders when partial duplicates are found", () => {
    const data = {
      q1: firebaseQueue({ id: "q1", order: 5 }),
      q2: firebaseQueue({ id: "q2", order: 5 }),
      q3: firebaseQueue({ id: "q3", order: 10 }),
    };
    const result = parseQueueMap(data);

    const orders = [result.q1!.order, result.q2!.order, result.q3!.order];
    expect(orders.sort()).toEqual([0, 1, 2]);
  });

  it("leaves unique orders unchanged", () => {
    const data = {
      q1: firebaseQueue({ id: "q1", order: 0 }),
      q2: firebaseQueue({ id: "q2", order: 1 }),
      q3: firebaseQueue({ id: "q3", order: 2 }),
    };
    const result = parseQueueMap(data);

    expect(result.q1!.order).toBe(0);
    expect(result.q2!.order).toBe(1);
    expect(result.q3!.order).toBe(2);
  });

  it("handles all queues having the same order", () => {
    const data = {
      q1: firebaseQueue({ id: "q1", order: 99 }),
      q2: firebaseQueue({ id: "q2", order: 99 }),
      q3: firebaseQueue({ id: "q3", order: 99 }),
    };
    const result = parseQueueMap(data);

    const orders = [result.q1!.order, result.q2!.order, result.q3!.order];
    const uniqueOrders = new Set(orders);

    expect(uniqueOrders.size).toBe(3);
    expect(orders.sort()).toEqual([0, 1, 2]);
  });
});

describe("computeControllerDiff", () => {
  it("writes a nested queue path for a single queue update", () => {
    const prev = makeControllerState({
      queues: {
        q1: makeQueue({ id: "q1", name: "Queue 1" }),
        q2: makeQueue({ id: "q2", name: "Queue 2" }),
      },
    });
    const next = {
      ...prev,
      queues: {
        ...prev.queues,
        q1: { ...prev.queues.q1!, name: "Updated" },
      },
    };

    const diff = computeControllerDiff(prev, next);

    expect(diff["queues/q1"]).toEqual(next.queues.q1);
    expect(diff["queues/q2"]).toBeUndefined();
    expect(diff.queues).toBeUndefined();
  });

  it("writes null for deleted queues", () => {
    const prev = makeControllerState({
      queues: {
        q1: makeQueue({ id: "q1", name: "Queue 1" }),
        q2: makeQueue({ id: "q2", name: "Queue 2" }),
      },
    });
    const next = {
      ...prev,
      queues: {
        q2: prev.queues.q2!,
      },
    };

    const diff = computeControllerDiff(prev, next);

    expect(diff["queues/q1"]).toBeNull();
    expect(diff["queues/q2"]).toBeUndefined();
  });

  it("does not include queue paths when queues are unchanged", () => {
    const prev = makeControllerState({
      queues: {
        q1: makeQueue({ id: "q1" }),
        q2: makeQueue({ id: "q2" }),
      },
    });
    const next = { ...prev };

    const diff = computeControllerDiff(prev, next);

    const queueKeys = Object.keys(diff).filter(
      (key) => key === "queues" || key.startsWith("queues/"),
    );
    expect(queueKeys).toHaveLength(0);
  });

  it("writes a nested path for newly added queues", () => {
    const prev = makeControllerState({
      queues: {
        q1: makeQueue({ id: "q1" }),
      },
    });
    const next = {
      ...prev,
      queues: {
        ...prev.queues,
        q3: makeQueue({ id: "q3", name: "Queue 3" }),
      },
    };

    const diff = computeControllerDiff(prev, next);

    expect(diff["queues/q3"]).toEqual(next.queues.q3);
    expect(diff["queues/q1"]).toBeUndefined();
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

      const queue = result.queues.q1!;
      expect(queue.items[0]!.key).toBe("a2");
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

      const queue = result.queues.q1!;
      expect(queue.items).toHaveLength(2);
      expect(queue.items[0]!.key).toBe("a2");
      expect(queue.items[1]!.key).toBe("a1");
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
      expect(result.queues.q1!.items).toHaveLength(1);
      expect(result.queues.q1!.items[0]!.key).toBe("a1");
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
      expect(result.queues.q1!.items).toHaveLength(1);
      expect(result.queues.q1!.items[0]!.key).toBe("a2");
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
      expect(result.queues.q1).toBeDefined();
      expect(result.queues.q1!.items).toHaveLength(0);
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
      expect(original.queues.q1!.items).toHaveLength(2);
      expect(original.queues.q1!.items[0]!.key).toBe("a1");
    });

    it("deletes empty non-cycling queue and nulls activeQueueId", () => {
      const state = makeControllerState({
        activeQueueId: "q1",
        queues: {
          q1: makeQueue({ id: "q1", items: [], cycle: false }),
        },
      });

      const result = nextAsset(state);

      expect(result.activeQueueId).toBeNull();
      expect(result.queues.q1).toBeUndefined();
      expect(result.playing).toBe(false);
      expect(result.currentAsset).toBeNull();
    });

    it("preserves empty cycling queue and keeps activeQueueId", () => {
      const state = makeControllerState({
        activeQueueId: "q1",
        queues: {
          q1: makeQueue({ id: "q1", items: [], cycle: true }),
        },
      });

      const result = nextAsset(state);

      expect(result.activeQueueId).toBe("q1");
      expect(result.queues.q1).toBeDefined();
      expect(result.queues.q1!.items).toHaveLength(0);
      expect(result.playing).toBe(false);
      expect(result.currentAsset).toBeNull();
    });

    it("plays last item from non-cycling queue, keeps queue with 0 items and activeQueueId", () => {
      const state = makeControllerState({
        activeQueueId: "q1",
        queues: {
          q1: makeQueue({
            id: "q1",
            items: [makeAsset("a1")],
            autoPlay: true,
            imageSeconds: 5,
            cycle: false,
          }),
        },
      });

      const result = nextAsset(state);

      expect(result.currentAsset).not.toBeNull();
      expect(result.currentAsset!.asset.key).toBe("a1");
      expect(result.queues.q1).toBeDefined();
      expect(result.queues.q1!.items).toHaveLength(0);
      expect(result.activeQueueId).toBe("q1");
      expect(result.playing).toBe(false);
    });
  },
);

describe("maybeAutoDeleteQueue", () => {
  it("returns state unchanged when queue does not exist", () => {
    const state = makeControllerState({ queues: {}, activeQueueId: null });
    const result = maybeAutoDeleteQueue(state, "nonexistent");
    expect(result).toBe(state);
  });

  it("returns state unchanged when queue is cycling", () => {
    const state = makeControllerState({
      queues: {
        q1: makeQueue({ id: "q1", items: [], cycle: true }),
      },
      activeQueueId: null,
    });
    const result = maybeAutoDeleteQueue(state, "q1");
    expect(result).toBe(state);
  });

  it("returns state unchanged when queue has items", () => {
    const state = makeControllerState({
      queues: {
        q1: makeQueue({
          id: "q1",
          items: [makeAsset("a1")],
          cycle: false,
        }),
      },
      activeQueueId: null,
    });
    const result = maybeAutoDeleteQueue(state, "q1");
    expect(result).toBe(state);
  });

  it("deletes non-cycling empty queue that is NOT active", () => {
    const state = makeControllerState({
      queues: {
        q1: makeQueue({ id: "q1", items: [], cycle: false }),
        q2: makeQueue({ id: "q2", items: [makeAsset("a1")], cycle: false }),
      },
      activeQueueId: "q2",
      playing: true,
      currentAsset: { asset: makeAsset("a1"), time: 5 },
    });
    const result = maybeAutoDeleteQueue(state, "q1");
    expect(result.queues).toEqual({ q2: state.queues.q2 });
    expect(result.activeQueueId).toBe("q2");
    expect(result.playing).toBe(true);
    expect(result.currentAsset).toEqual({ asset: makeAsset("a1"), time: 5 });
  });

  it("deletes non-cycling empty queue that IS active and clears active state", () => {
    const state = makeControllerState({
      queues: {
        q1: makeQueue({ id: "q1", items: [], cycle: false }),
      },
      activeQueueId: "q1",
      playing: true,
      currentAsset: { asset: makeAsset("a1"), time: 5 },
    });
    const result = maybeAutoDeleteQueue(state, "q1");
    expect(result.queues).toEqual({});
    expect(result.activeQueueId).toBeNull();
    expect(result.playing).toBe(false);
    expect(result.currentAsset).toBeNull();
  });

  it("handles deletion when multiple queues exist", () => {
    const state = makeControllerState({
      queues: {
        q1: makeQueue({ id: "q1", items: [], cycle: false }),
        q2: makeQueue({ id: "q2", items: [makeAsset("a1")], cycle: false }),
        q3: makeQueue({ id: "q3", items: [], cycle: true }),
      },
      activeQueueId: "q1",
      playing: false,
      currentAsset: null,
    });
    const result = maybeAutoDeleteQueue(state, "q1");
    expect(result.queues).toEqual({ q2: state.queues.q2, q3: state.queues.q3 });
    expect(result.activeQueueId).toBeNull();
    expect(result.playing).toBe(false);
    expect(result.currentAsset).toBeNull();
  });
});
