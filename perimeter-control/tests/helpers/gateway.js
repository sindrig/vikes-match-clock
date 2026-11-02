import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";

export class FakeDb {
  constructor() {
    this.refs = new Map();
    this.trace = [];
  }

  ref(path) {
    this.trace.push(["ref", path]);
    if (!this.refs.has(path)) this.refs.set(path, new FakeRef(this, path));
    return this.refs.get(path);
  }
}

class FakeRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.handlers = new Set();
    this.value = null;
  }

  on(event, handler) {
    this.db.trace.push(["on", this.path, event]);
    this.handlers.add(handler);
  }

  off(event, handler) {
    this.db.trace.push(["off", this.path, event]);
    if (handler) this.handlers.delete(handler);
    else this.handlers.clear();
  }

  emit(value) {
    this.value = value;
    for (const handler of this.handlers) handler({ val: () => value });
  }

  async set(value) {
    this.db.trace.push(["set", this.path, value]);
    this.value = value;
  }

  async update(value) {
    this.db.trace.push(["update", this.path, value]);
    this.value = { ...this.value, ...value };
  }

  async push(value) {
    this.db.trace.push(["push", this.path, value]);
  }

  async get() {
    this.db.trace.push(["get", this.path]);
    const value = this.value;
    return { val: () => value };
  }
}

export const configuredEnv = {
  PERIMETER_BRIGHTNESS_ENABLED: "true",
  PERIMETER_VNNOX_SN: "fixture-serial",
  PERIMETER_VNNOX_PERIMETER_GUID: "fixture-perimeter-guid",
  PERIMETER_VNNOX_PASSWORD: "fixture-only-not-a-device-login",
  PERIMETER_BRIGHTNESS_VERIFY_ATTEMPTS: "2",
  PERIMETER_BRIGHTNESS_VERIFY_INTERVAL_SECONDS: "0.001",
  PERIMETER_INITIAL_BACKOFF_SECONDS: "0.001",
  PERIMETER_MAX_BACKOFF_SECONDS: "0.002",
};

export async function settle() {
  // Allow the real serialized worker and async Firebase doubles to finish.
  for (let i = 0; i < 6; i += 1) await setImmediate();
}

export async function waitFor(predicate) {
  const until = Date.now() + 2000;
  while (!predicate() && Date.now() < until) await setImmediate();
  assert.ok(predicate(), "gateway operation completed");
}

export function fakeDevice(
  worker,
  { writeError = false, mismatch = false } = {},
) {
  const calls = [];
  let percent = 12.5;
  worker.client = {
    async readScreenBrightness() {
      calls.push(["read", percent]);
      return { percent, ratio: percent * 100, ratioScale: 10000 };
    },
    async readCabinets() {
      calls.push(["cabinets"]);
      return [];
    },
    async writeBrightness(target) {
      calls.push(["write", target]);
      if (writeError) throw new Error("fixture write response lost");
      if (!mismatch) percent = target;
    },
    async restoreBrightness(snapshot) {
      calls.push(["restore", snapshot]);
      percent = snapshot.percent;
    },
  };
  return calls;
}
