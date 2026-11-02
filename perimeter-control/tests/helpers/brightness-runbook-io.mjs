// Only used by the documentation command tests. No real network fallback.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";

const rules = JSON.parse(
  readFileSync(new URL("../../../firebase-rules.json", import.meta.url)),
).rules;
const filename = process.env.RUNBOOK_MOCK_STATE;
assert(filename, "Runbook I/O mock needs its owned fixture file");

export function load() {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function save(state) {
  writeFileSync(filename, JSON.stringify(state));
}

function at(data, pathname) {
  return (
    pathname
      .split("/")
      .filter(Boolean)
      .reduce((node, key) => node?.[key], data) ?? null
  );
}

function put(data, pathname, value) {
  const parts = pathname.split("/");
  const last = parts.pop();
  let node = data;
  for (const part of parts) node = node[part] ??= {};
  if (value === null) delete node[last];
  else node[last] = value;
}

class Snapshot {
  constructor(value) {
    this.value = value;
  }
  val() {
    return this.value ?? null;
  }
  child(key) {
    return new Snapshot(at(this.value, key));
  }
  exists() {
    return this.val() !== null;
  }
  hasChild(key) {
    return this.child(key).exists();
  }
  hasChildren(keys = []) {
    return keys.every((key) => this.hasChild(key));
  }
  isString() {
    return typeof this.value === "string";
  }
  isNumber() {
    return typeof this.value === "number" && Number.isFinite(this.value);
  }
  isBoolean() {
    return typeof this.value === "boolean";
  }
}

// Evaluate the actual relevant rule expressions, not copies of their policy.
// This small double is not a Firebase rules emulator (see the smoke guide).
function allowed(expression, state, auth, before, after) {
  if (typeof expression === "boolean") return expression;
  try {
    return (
      new Function(
        "root",
        "auth",
        "data",
        "newData",
        "$location",
        "$user_id",
        "now",
        `return (${expression});`,
      )(
        new Snapshot(state.db),
        auth,
        new Snapshot(before),
        new Snapshot(after),
        state.location,
        state.uid,
        state.now,
      ) === true
    );
  } catch {
    return false;
  }
}

function resolveTimestamps(value, now) {
  if (value?.[".sv"] === "timestamp") return now;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        resolveTimestamps(child, now),
      ]),
    );
  }
  return value;
}

function validAuto(state, auth, before, after) {
  if (after === null) return true; // .validate is skipped for deletions.
  const autoRules = rules.states.$location.perimeter.brightnessAuto;
  return (
    allowed(autoRules[".validate"], state, auth, before, after) &&
    Object.keys(after).every((key) =>
      allowed(
        (autoRules[key] ?? autoRules.$other)[".validate"],
        state,
        auth,
        before?.[key],
        after[key],
      ),
    )
  );
}

function firebase(state, url, init) {
  assert.equal(url.pathname.endsWith(".json"), true);
  assert.deepEqual([...url.searchParams.keys()], ["auth"]);
  const supplied = url.searchParams.get("auth");
  const auth =
    supplied === "synthetic-operator-token"
      ? { uid: state.uid }
      : supplied === "synthetic-outsider-token"
        ? { uid: "outsider" }
        : null;
  const resource = url.pathname.slice(1, -5);
  const before = at(state.db, resource);
  if (init.method === "GET") {
    let permitted = false;
    if (resource === `auth/${state.uid}/${state.location}`) {
      permitted = allowed(rules.auth.$user_id[".read"], state, auth);
    } else if (resource === `states/${state.location}/perimeter`) {
      permitted = rules.states.$location[".read"];
    } else if (resource === `perimeter/${state.location}/brightnessStatus`) {
      permitted = allowed(rules.perimeter.$location[".read"], state, auth);
    } else if (resource.startsWith(`audit/${state.location}/`)) {
      permitted = allowed(rules.audit.$location[".read"], state, auth);
    } else throw new Error("Unexpected mocked Firebase read path");
    state.events.push({
      type: "firebase-read",
      resource,
      authenticated: !!auth,
      permitted,
    });
    return new Response(
      JSON.stringify(permitted ? before : { error: "Permission denied" }),
      { status: permitted ? 200 : 401 },
    );
  }
  assert.equal(init.method, "PATCH");
  assert.equal(resource, "");
  assert.equal(init.redirect, "error");
  const updates = JSON.parse(init.body);
  const next = structuredClone(state.db);
  state.now += 1;
  for (const [key, value] of Object.entries(updates))
    put(next, key, resolveTimestamps(value, state.now));
  let permitted = true;
  for (const key of Object.keys(updates)) {
    if (key.startsWith(`states/${state.location}/perimeter/`)) {
      permitted &&= allowed(rules.states.$location[".write"], state, auth);
      const autoPath = `states/${state.location}/perimeter/brightnessAuto`;
      permitted &&= validAuto(
        state,
        auth,
        at(state.db, autoPath),
        at(next, autoPath),
      );
    } else if (key.startsWith(`audit/${state.location}/`)) {
      const eventPath = key.split("/").slice(0, 3).join("/");
      const eventRules = rules.audit.$location.$eventId;
      permitted &&= allowed(
        eventRules[".write"],
        state,
        auth,
        at(state.db, eventPath),
        at(next, eventPath),
      );
      permitted &&= allowed(
        eventRules[".validate"],
        state,
        auth,
        at(state.db, eventPath),
        at(next, eventPath),
      );
    } else if (key.startsWith(`perimeter/${state.location}/`)) {
      permitted &&= rules.perimeter.$location[".write"];
    } else throw new Error("Unexpected mocked Firebase write path");
  }
  state.events.push({
    type: "firebase-patch",
    permitted,
    updates,
    workerRunning: state.workerRunning,
  });
  if (!permitted)
    return new Response('{"error":"Permission denied"}', { status: 401 });
  state.db = next;
  const percent = updates[`states/${state.location}/perimeter/brightness`];
  if (
    state.workerRunning &&
    state.featureEnabled &&
    Number.isInteger(percent)
  ) {
    // Simulated worker acknowledgement only. Real arbitration is tested separately.
    state.screens[0].brightness = {
      ratio: percent * 100,
      ratioScale: 10000,
      nit: 0,
      nitType: 0,
    };
    state.events.push({ type: "simulated-worker-write", percent });
    put(state.db, `perimeter/${state.location}/brightnessStatus`, {
      requestedPercent: percent,
      appliedPercent: percent,
      phase: "applied",
      updatedAt: state.now + 1,
    });
  }
  return new Response(JSON.stringify(updates));
}

function vnnox(state, url, init) {
  const headers = init.headers;
  assert.equal(headers.ip, "192.0.2.10");
  assert.equal(headers.port, "8088");
  assert.equal(headers.protocol, "http");
  const resource = url.pathname;
  state.events.push({ type: "device-request", resource, method: init.method });
  if (resource === "/unico/v1/system/auth/login") {
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), {
      username: "synthetic-device-user",
      password: Buffer.from("synthetic-device-password").toString("base64"),
    });
    return Response.json({
      code: 0,
      data: { token: "synthetic-device-token" },
    });
  }
  assert.equal(headers.Authorization, "synthetic-device-token");
  if (state.rejectDeviceAuth) return Response.json({ code: 8273 });
  if (resource === "/unico/v1/ucenter/screen/normal-screen") {
    assert.equal(init.method, "GET");
    assert.equal(headers.sn, "synthetic-device-serial");
    assert.equal(url.search, "?projectId=synthetic-project");
    return Response.json({
      code: 0,
      data: {
        list: state.screens.map((screen) => ({
          guid: screen.guid,
          deviceList: [
            {
              screenInfo: {
                guid: screen.guid,
                name: screen.name,
                adjustment: { brightness: screen.brightness },
              },
            },
          ],
        })),
      },
    });
  }
  assert.equal(resource, "/unico/v1/ucenter/cabinet/brightness");
  assert.equal(init.method, "POST");
  assert.equal(
    state.workerRunning,
    false,
    "Direct restoration must follow worker stop/drain",
  );
  const payload = JSON.parse(init.body);
  assert.deepEqual(payload.guidList, [state.guid]);
  assert.deepEqual(payload.list, []);
  assert.equal(Object.keys(payload.brightness).length, 4);
  state.events.push({
    type: "direct-restore",
    payload,
    workerRunning: state.workerRunning,
  });
  if (!state.ignoreRestore) state.screens[0].brightness = payload.brightness;
  if (state.changeOtherScreen) state.screens[1].brightness.ratio = 1;
  if (state.ambiguousRestore)
    throw new Error("Synthetic ambiguous response after write");
  return Response.json({ code: 0, data: {} });
}

function deniedNetwork() {
  throw new Error("Unexpected network access denied by runbook fixture");
}
http.request = http.get = https.request = https.get = deniedNetwork;
net.connect =
  net.createConnection =
  net.Socket.prototype.connect =
  tls.connect =
    deniedNetwork;
syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => {
  const state = load();
  const url = new URL(input);
  try {
    if (url.origin === "https://firebase.invalid")
      return firebase(state, url, init);
    if (url.origin === "http://vnnox.invalid") return vnnox(state, url, init);
    state.events.push({ type: "unexpected-network-denied" });
    return deniedNetwork();
  } finally {
    save(state);
  }
};

export function systemctl(args) {
  const state = load();
  assert(args.includes("perimeter-control"));
  const [action] = args;
  if (action === "stop") {
    state.workerRunning = false;
    state.events.push({ type: "service-stop-and-simulated-drain" });
  } else if (action === "start") {
    assert.equal(
      at(state.db, `states/${state.location}/perimeter/brightness`),
      null,
      "Prepare before service start",
    );
    assert.notEqual(
      at(state.db, `states/${state.location}/perimeter/brightnessAuto`)
        ?.enabled,
      true,
    );
    state.workerRunning = true;
    state.events.push({ type: "service-start" });
  } else if (action === "is-active") {
    process.exitCode = state.workerRunning ? 0 : 3;
  } else if (action === "show") {
    assert(args.includes("--property=MainPID"));
    process.stdout.write(state.workerRunning ? "9999\n" : "0\n");
  } else throw new Error("Unexpected mocked systemctl action");
  save(state);
}
