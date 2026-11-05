import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

import { beforeDeadline } from "../e2e/fixtures/fixture-sdk-producers.ts";
import {
  assertLocalFixtureUrl,
  EMULATOR_PROJECT,
  LocalFixture,
} from "../e2e/fixtures/local-fixture.ts";

import {
  assertNestedFixtureTarget,
  nestedMediaPaths,
  nestedPairId,
  parseNestedFixtureInput,
} from "../e2e/fixtures/nested-fixture-input.ts";

// Actual fixture modules with controlled SDK/Page dependencies; no browser,
// emulator or rules authorization is qualified by these native controls.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../e2e/fixtures/nested-state-harness.tsx");
const specSource = read("../e2e/nested-state.spec.ts");
const producerSource = read("../e2e/fixtures/fixture-sdk-producers.ts");
const fixtureId = "0123456789-0-0123456789abcdef";
const venue = `nested-${fixtureId}`;
const deniedVenue = `nested-denied-${fixtureId}`;
const email = `e2e-nested-${fixtureId}@example.test`;
const target = {
  compiledEmulator: true,
  projectId: "vikes-match-clock-test",
  databaseURL: "http://127.0.0.1:9000?ns=vikes-match-clock-test",
  storageBucket: "vikes-match-clock-test.appspot.com",
  auth: { host: "127.0.0.1", port: 9099, protocol: "http" },
};
function url(role = "controller") {
  const url = new URL("http://localhost:4600/e2e/fixtures/nested-state.html");
  url.search = new URLSearchParams({
    fixture: fixtureId,
    prefix: venue,
    denied: deniedVenue,
    role,
  });
  return url;
}
function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
}
function moduleIn(context, source) {
  return vm.runInContext(
    `(function () {const module = {exports: {}}; const exports = module.exports;\n${compile(source)}\nreturn module.exports;})()`,
    context,
    { timeout: 1000 },
  );
}
function harnessModel({
  role = "controller",
  location = url(role),
  selected = target,
  actual = source,
  clock = Date,
} = {}) {
  const effects = [],
    calls = [],
    subscriptions = [];
  const auth = { currentUser: null, emulatorConfig: selected.auth };
  const app = { options: selected };
  const server = {};
  for (const method of ["put", "merge"])
    server[method] = function (path, data, callback, hash) {
      assert.equal(this, server);
      effects.push(`sdk:${method}`);
      calls.push({ method, path, data, callback, hash });
    };
  const database = { _repoInternal: { server_: server } };
  const audited = {
    writeAudited: () => audited.writeAuditOnly(),
    writeAuditOnly: () =>
      new Promise((resolve, reject) =>
        server.merge(
          "/",
          { [`audit/${venue}/event/uid`]: "owned-uid" },
          (status) => (status === "ok" ? resolve() : reject(new Error(status))),
        ),
      ),
  };
  const window = { location: { href: location.href } };
  const context = vm.createContext({
    URL,
    URLSearchParams,
    Promise,
    Error,
    Object,
    Reflect,
    Date: clock,
    setTimeout,
    clearTimeout,
    structuredClone,
    Uint8Array,
    window,
    localStorage: {
      setItem: (key, value) => effects.push(["prefix", key, value]),
    },
    document: { getElementById: () => ({}) },
  });
  const producers = moduleIn(context, producerSource);
  const dependencies = {
    "./fixture-sdk-producers": producers,
    "./nested-fixture-input": {
      assertNestedFixtureTarget,
      parseNestedFixtureInput,
      nestedMediaPaths,
    },
    "firebase/app": { deleteApp: async () => effects.push("deleteApp") },
    "firebase/auth": {
      signInWithEmailAndPassword: async (_auth, email) => {
        effects.push("login");
        auth.currentUser = { uid: "owned-uid", email };
        return { user: auth.currentUser };
      },
    },
    "firebase/database": {
      ref: (_database, path) => {
        effects.push("ref");
        return { path };
      },
      onValue: (reference, callback, error) => {
        subscriptions.push({ path: reference.path, error });
        callback({
          val: () => (reference.path === ".info/connected" ? true : null),
        });
        return () => effects.push("unsubscribe");
      },
      goOffline: () => effects.push("offline"),
      set: (reference, data) =>
        new Promise((resolve, reject) =>
          server.put(reference.path, data, (status) =>
            status === "ok"
              ? resolve()
              : reject(new Error(`permission_denied:${status}`)),
          ),
        ),
    },
    "firebase/storage": {
      ref: (_storage, path) => ({ path }),
      uploadBytes: async () => {
        throw Object.assign(new Error("actual modeled denial"), {
          code: "storage/unauthorized",
        });
      },
      getBytes: async () => {
        throw Object.assign(new Error("actual modeled denial"), {
          code: "storage/unauthorized",
        });
      },
      listAll: async () => {
        throw Object.assign(new Error("actual modeled denial"), {
          code: "storage/unauthorized",
        });
      },
    },
    react: { useLayoutEffect: (effect) => effect() },
    "react-dom/client": {
      createRoot: () => {
        effects.push("createRoot");
        return {
          render: () => effects.push("render"),
          unmount: () => effects.push("unmount"),
        };
      },
    },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "../../src/firebase": {
      app,
      auth,
      database,
      storage: {},
      storageHelpers: {},
    },
    "../../src/firebaseDatabase": { firebaseDatabase: audited },
    "../../src/contexts/FirebaseStateContext": {},
    "../../src/contexts/LocalStateContext": {},
    "../../src/controller/asset/Asset": {},
    "../../src/controller/asset/queue/SubstitutionInfo": {},
    "../../src/controller/asset/team/Team": {},
    "../../src/match/MatchLifecycle": {},
    "../../src/perimeter/media": {},
  };
  context.require = (name) => {
    assert(name in dependencies, `Unmodeled import: ${name}`);
    return dependencies[name];
  };
  let exports, error;
  try {
    exports = moduleIn(
      context,
      actual.replace(
        "import.meta.env.VITE_USE_EMULATOR",
        JSON.stringify(selected.compiledEmulator ? "true" : "false"),
      ) + "\nexports.bind=value=>api=trackCommands(value);",
    );
  } catch (caught) {
    error = caught;
  }
  return {
    h: window.nestedHarness,
    effects,
    calls,
    subscriptions,
    server,
    audited,
    auth,
    error,
    bind: (value) => exports.bind(value),
    input: error ? undefined : parseNestedFixtureInput(location),
    producers,
  };
}
function controller(model, value = {}) {
  model.h.initialize(model.input);
  model.bind({
    controller: { marker: "original" },
    writeEligible: true,
    ...value,
  });
}

for (const role of ["controller", "observer", "anonymous"])
  test(`immutable ${role} admission and owned media roots`, () => {
    const input = parseNestedFixtureInput(url(role));
    assert(Object.isFrozen(input));
    assert.deepEqual(input, { fixtureId, venue, deniedVenue, role });
    assert.equal(
      nestedMediaPaths(input)[2],
      `${venue}/perimeter-overlays/${nestedPairId}/48/pair-left.gif`,
    );
  });
const invalid = [
  (value) => value.searchParams.delete("fixture"),
  (value) => value.searchParams.append("prefix", venue),
  (value) => value.searchParams.set("prefix", "audit246"),
  (value) => value.searchParams.set("denied", venue),
  (value) => value.searchParams.set("fixture", fixtureId + "\n"),
  (value) => value.searchParams.set("role", "display"),
  (value) => value.searchParams.set("extra", "x"),
  (value) => {
    value.hash = "wrong";
  },
  (value) => {
    value.hostname = "staging-klukka.irdn.is";
  },
  (value) => {
    value.protocol = "https:";
  },
  (value) => {
    value.pathname = "/e2e/fixtures/playback-occurrences.html";
  },
];
for (const [index, invalidate] of invalid.entries())
  test(`invalid tuple ${index} is inert with no fixed-root fallback`, () => {
    const location = url();
    invalidate(location);
    assert.throws(() => parseNestedFixtureInput(location));
    const model = harnessModel({ location });
    assert(model.error);
    assert.deepEqual(model.effects, []);
  });
for (const [field, value] of [
  ["compiledEmulator", false],
  ["projectId", "production"],
  ["databaseURL", "https://production.firebaseio.com"],
  ["storageBucket", "foreign"],
  ["auth", null],
  ["auth", { host: "localhost", port: 9099, protocol: "http" }],
])
  test(`wrong served ${field} cannot initialize`, () => {
    const model = harnessModel({ selected: { ...target, [field]: value } });
    assert.equal(model.error, undefined);
    assert.deepEqual(model.effects, []);
    assert.throws(() => model.h.initialize(model.input));
    assert.deepEqual(model.effects, []);
  });
test("admission rechecks expected tuple and current URL before mutation", () => {
  const model = harnessModel();
  assert.deepEqual(model.effects, []);
  assert.throws(() => model.h.commands);
  assert.throws(() => model.h.initialize({ ...model.input, venue: "foreign" }));
  assert.deepEqual(model.effects, []);
});
for (const role of ["observer", "anonymous"])
  test(`${role} has no writer/provider interception`, async () => {
    const model = harnessModel({ role });
    const put = model.server.put;
    model.h.initialize(model.input);
    assert.equal(model.server.put, put);
    assert(!model.effects.includes("createRoot"));
    assert.throws(() => model.h.commands);
    assert.throws(() => model.h.seedCurrent({}));
    if (role === "anonymous")
      await assert.rejects(async () =>
        model.h.login(email, "synthetic", "owned-uid"),
      );
    else await model.h.login(email, "synthetic", "owned-uid");
    await model.h.dispose(100);
    assert(model.h.lifecycle().disposed);
  });
test("void roster command preserves return and drains actual helper/callback", async () => {
  const model = harnessModel();
  let submitted;
  controller(model, {
    editPlayer: () => {
      submitted = model.audited.writeAudited();
    },
  });
  assert.equal(
    model.h.commands.editPlayer("home", "17", { show: false }),
    undefined,
  );
  assert.equal(model.h.lifecycle().pendingCommands, 1);
  assert.equal(model.calls.length, 1);
  assert.throws(() => model.h.resetAttempts(), /producers/);
  assert.equal(model.h.snapshot().attempts, 1);
  model.calls[0].callback("ok");
  await submitted;
  await model.h.dispose(100);
});
test("callbacks retain receiver/data/hash and continuation-created audit", async () => {
  const model = harnessModel();
  controller(model);
  const receiver = {},
    data = { keep: true };
  let observed, tail;
  model.server.put(
    `/states/${venue}/controller`,
    { raw: true },
    function (status, payload) {
      observed = { receiver: this, payload, status };
      tail = model.audited.writeAuditOnly();
    },
    "original-hash",
  );
  Reflect.apply(model.calls[0].callback, receiver, ["ok", data]);
  assert.equal(observed.receiver, receiver);
  assert.equal(observed.payload, data);
  assert.equal(model.calls[0].hash, "original-hash");
  assert.equal(model.h.lifecycle().pendingAudits, 1);
  assert.equal(model.h.lifecycle().pendingSdk, 1);
  let finished = false;
  const retiring = model.h.dispose(1000).then(() => {
    finished = true;
  });
  await new Promise(setImmediate);
  assert(!finished);
  assert(!model.effects.includes("deleteApp"));
  model.calls[1].callback("ok");
  await tail;
  await retiring;
});
test("lost original callback stays uncertain after apparent empty data", async () => {
  const model = harnessModel();
  controller(model);
  model.server.put(`/states/${venue}/controller`, null, () => undefined);
  await assert.rejects(model.h.dispose(15), /deadline/);
  assert.equal(model.h.lifecycle().pendingSdk, 1);
  assert(!model.h.lifecycle().disposed);
  assert(!model.effects.includes("deleteApp"));
  assert.throws(() => model.h.commands, /not active/);
});
test("known RTDB denial requires delivered SDK acknowledgement", async () => {
  const model = harnessModel();
  controller(model);
  const denied = assert.rejects(model.h.denied(), /permission_denied/);
  assert.equal(model.calls[0].path, `states/${deniedVenue}/controller/playing`);
  model.calls[0].callback("permission_denied");
  await denied;
  assert.deepEqual([...model.h.lifecycle().failures], []);
  await model.h.dispose(100);
});
test("render-bound roster wrappers never upgrade retained origin", async () => {
  const model = harnessModel(),
    calls = [];
  controller(model, { editPlayer: () => calls.push("old") });
  const retained = model.h.commands.editPlayer;
  model.bind({ editPlayer: () => calls.push("new") });
  retained();
  model.h.commands.editPlayer();
  assert.deepEqual(calls, ["old", "new"]);
  await model.h.dispose(100);
});
test("observer cancellation fails retirement", async () => {
  const model = harnessModel({ role: "observer" });
  model.h.initialize(model.input);
  model.subscriptions[0].error();
  await assert.rejects(model.h.dispose(100), /producer failed/);
});
test("diagnostic reset cannot erase failure ledger", async () => {
  const model = harnessModel();
  controller(model);
  const failed = assert.rejects(model.audited.writeAuditOnly());
  model.calls[0].callback("permission_denied");
  await failed;
  model.h.resetAttempts();
  assert.equal(model.h.snapshot().attempts, 0);
  assert(model.h.lifecycle().failures.length);
  await assert.rejects(model.h.dispose(100), /producer failed/);
});
test("disposable fixed-root mutant fails the actual owned destination oracle", async () => {
  const broken = source.replaceAll(
    "`states/${input.venue}/controller/currentAsset`",
    '"states/audit246/controller/currentAsset"',
  );
  assert.notEqual(broken, source);
  const model = harnessModel({ actual: broken });
  controller(model);
  const pending = model.h.seedCurrent({ raw: true });
  assert.notEqual(
    model.calls[0].path,
    `states/${venue}/controller/currentAsset`,
  );
  model.calls[0].callback("ok");
  await pending;
  await model.h.dispose(100);
});
test("actual spec declarations are inert and retain 15 nested registrations and matrices", () => {
  const titles = [],
    effects = [];
  const register = (title) => titles.push(title);
  register.extend = () => register;
  register.describe = { configure: () => undefined };
  register.beforeAll = () => undefined;
  const context = vm.createContext({
    require: (name) => {
      if (name === "node:fs") return { readFileSync };
      if (name === "node:path")
        return {
          resolve: () =>
            new URL("../../firebase-rules.json", import.meta.url).pathname,
        };
      if (name === "@playwright/test") return { test: register };
      if (name === "./fixtures/local-fixture")
        return { EMULATOR_PROJECT: "vikes-match-clock-test" };
      if (
        name === "./fixtures/nested-fixture-input" ||
        name === "./fixtures/fixture-sdk-producers"
      )
        return {};
      throw Error(name);
    },
    fetch: () => {
      effects.push("fetch");
      throw Error("Collection I/O");
    },
    __dirname: "/modeled/e2e",
    URL,
    URLSearchParams,
    process,
  });
  moduleIn(context, specSource);
  assert.equal(titles.length, 15);
  assert.equal(new Set(titles).size, 15);
  assert.deepEqual(effects, []);
  for (const layout of ["dense", "hole", "sparse", "named"])
    for (const side of ["home", "away"])
      assert(
        titles.includes(`ordinary roster raw child writes: ${layout} ${side}`),
      );
});

function enableEmulator(t) {
  const previous = process.env.VITE_USE_EMULATOR;
  process.env.VITE_USE_EMULATOR = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.VITE_USE_EMULATOR;
    else process.env.VITE_USE_EMULATOR = previous;
  });
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}
function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
function match(value, expected) {
  for (const [key, child] of Object.entries(expected)) {
    if (child !== null && typeof child === "object" && !Array.isArray(child))
      match(value[key], child);
    else assert.deepEqual(plain(value[key]), plain(child));
  }
}
function modeledExpect(value) {
  return {
    toBe: (expected) => assert.equal(value, expected),
    toBeNull: () => assert.equal(value, null),
    toEqual: (expected) => assert.deepEqual(plain(value), plain(expected)),
    toBeGreaterThan: (minimum) => assert(value > minimum),
    toMatchObject: (expected) => match(value, expected),
  };
}
modeledExpect.poll = (action) => ({
  toMatchObject: async (expected) => match(await action(), expected),
  toBe: async (expected) => assert.equal(await action(), expected),
  toBeGreaterThan: async (minimum) => assert((await action()) > minimum),
});

function fixtureModel({ failure, source = specSource, clock = Date } = {}) {
  const db = {
    states: { foreign: { marker: "keep" } },
    audit: { foreign: { marker: "keep" } },
  };
  const effects = [],
    contexts = [],
    registered = [],
    extensions = {};
  const uncertain = deferred();
  let pageWindow;
  const get = (path) =>
    path.split("/").reduce((node, key) => node?.[key], db) ?? null;
  const put = (path, value) => {
    const parts = path.split("/");
    let parent = db;
    for (const key of parts.slice(0, -1)) parent = parent[key] ??= {};
    if (value === null) delete parent[parts.at(-1)];
    else parent[parts.at(-1)] = value;
  };
  const transport = async (url, init = {}) => {
    const selected = new URL(url);
    effects.push(`${init.method}:${selected.pathname}`);
    let body = null;
    if (selected.port === "9099") {
      const data = JSON.parse(init.body);
      if (selected.pathname.endsWith(":signUp"))
        body = {
          localId: "owned-uid",
          idToken: "synthetic-model-only",
          email: data.email,
        };
      else if (selected.pathname.endsWith(":lookup")) body = { users: [] };
      else body = {};
    } else if (selected.port === "9199") body = { items: [] };
    else {
      const path = selected.pathname.slice(1, -5);
      if (init.method === "GET") body = get(path);
      else {
        put(path, init.method === "DELETE" ? null : JSON.parse(init.body));
        if (failure === "seed" && path.startsWith("states/"))
          return new Response("{}", { status: 503 });
      }
    }
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const register = (title) => registered.push(title);
  register.extend = (value) => {
    Object.assign(extensions, value);
    return register;
  };
  register.info = () => ({
    project: { use: { baseURL: "http://localhost:4600" } },
  });
  register.describe = () => undefined;
  register.describe.configure = () => undefined;
  register.beforeAll = () => undefined;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    URL,
    URLSearchParams,
    AbortSignal,
    Promise,
    Error,
    Date: clock,
    Object,
    Reflect,
    Buffer,
    process,
    setTimeout,
    clearTimeout,
    __dirname: new URL("../e2e/", import.meta.url).pathname,
  };
  Object.defineProperty(sandbox, "window", { get: () => pageWindow });
  sandbox.exports = sandbox.module.exports;
  const originalImports = {
    "./fixtures/fixture-sdk-producers": { beforeDeadline },
    "node:fs": { readFileSync },
    "node:path": { resolve: (...parts) => parts.join("/") },
    "node:zlib": {},
    "@playwright/test": { test: register, expect: modeledExpect },
    "./fixtures/local-fixture": {
      LocalFixture: class extends LocalFixture {
        constructor(execution, worker) {
          super(execution, worker, transport);
          effects.push("allocate");
        }
      },
      initializeExecutionToken: () => "native-fixture-model",
      assertLocalFixtureUrl,
      EMULATOR_PROJECT,
      requireEmulatorSelection: () => undefined,
      record(value) {
        assert(
          value !== null && typeof value === "object" && !Array.isArray(value),
        );
        return value;
      },
      assertBrowserEmulatorTarget: (value) => {
        if (value.projectId !== target.projectId)
          throw new Error("wrong target");
      },
    },
    "./fixtures/nested-fixture-input": {
      parseNestedFixtureInput,
      assertNestedFixtureTarget,
      nestedMediaPaths,
      nestedPairId,
    },
  };
  sandbox.require = (name) => {
    assert(name in originalImports, `Unmodeled spec import: ${name}`);
    return originalImports[name];
  };
  sandbox.fetch = () => {
    effects.push("fetch");
    throw new Error("Forbidden collection mutation");
  };
  vm.runInNewContext(compile(source) + "\n", sandbox, {
    timeout: 1000,
  });
  const browser = {
    async newContext() {
      const context = {
        storage: new Map(),
        pages: [],
        async close() {
          effects.push("close");
          this.closed = true;
        },
        async newPage() {
          const page = {
            async route() {},
            on() {},
            async goto(value) {
              const current = new URL(value, "http://localhost:4600");
              if (value.includes("emulator-target")) {
                this.window = {
                  __e2eEmulatorTarget:
                    failure === "target"
                      ? { ...target, projectId: "foreign" }
                      : target,
                };
              } else if (value === "about:blank") this.window = {};
              else {
                const input = parseNestedFixtureInput(current);
                const harness = {
                  target,
                  input,
                  resetAttempts() {
                    effects.push("reset-diagnostics");
                  },
                  initialize(expected) {
                    assert.deepEqual(plain(input), plain(expected));
                    context.storage.set("prefix", input.venue);
                  },
                  async login(_email, _password, uid) {
                    this.uid = uid;
                  },
                  status() {
                    return {
                      connected: true,
                      eligible: true,
                      uid: this.uid,
                      rawState: get(`states/${input.venue}/controller`),
                      rawAudit: get(`audit/${input.venue}`),
                      stateDeliveries: 1,
                      auditDeliveries: 1,
                    };
                  },
                  lifecycle: () => ({
                    pendingCommands: 0,
                    pendingSdk: 0,
                    pendingAudits: 0,
                    held: 0,
                    failures: [],
                  }),
                  async dispose(timeout) {
                    effects.push(`dispose:${input.role}`);
                    assert(timeout <= 20000 && timeout > 0);
                    if (failure === "dispose" && input.role === "controller")
                      return uncertain.promise;
                  },
                };
                this.window = { nestedHarness: harness };
              }
            },
            async waitForFunction(action) {
              pageWindow = this.window;
              assert(action());
            },
            async evaluate(action, arg) {
              pageWindow = this.window;
              return action(arg);
            },
          };
          this.pages.push(page);
          return page;
        },
      };
      contexts.push(context);
      return context;
    },
  };
  return {
    browser,
    db,
    effects,
    contexts,
    registered,
    extensions,
    uncertain,
  };
}

for (const failure of [undefined, "body", "attachment", "seed", "target"]) {
  test(`actual nested fixture finally: ${failure ?? "success"} keeps foreign resources`, async (t) => {
    enableEmulator(t);
    const model = fixtureModel({ failure });
    const work = model.extensions.nested(
      { browser: model.browser },
      async (nested) => {
        await nested.bootstrap(nested.page);
        await nested.settle(nested.page);
        if (failure === "body") throw Error("expected body failure");
      },
      {
        workerIndex: 0,
        titlePath: ["native"],
        retry: 0,
        repeatEachIndex: 0,
        async attach() {
          if (failure === "attachment")
            throw Error("expected attachment failure");
        },
      },
    );
    if (failure) await assert.rejects(work);
    else await work;
    assert(model.contexts.every((context) => context.closed));
    assert.deepEqual(model.db.states.foreign, { marker: "keep" });
    assert.deepEqual(model.db.audit.foreign, { marker: "keep" });
    if (failure === "target")
      assert(
        !model.effects.some((effect) => /^(POST|PUT|DELETE):/.test(effect)),
      );
  });
}
test("actual nested finally cannot turn unresolved disposal into success", async (t) => {
  enableEmulator(t);
  const shortened = specSource.replace(
    "const deadline = Date.now() + 20000;",
    "const deadline = Date.now() + 25;",
  );
  assert.notEqual(shortened, specSource);
  const model = fixtureModel({ failure: "dispose", source: shortened });
  await assert.rejects(
    model.extensions.nested(
      { browser: model.browser },
      async (nested) => nested.bootstrap(nested.page),
      {
        workerIndex: 0,
        titlePath: ["native"],
        retry: 0,
        repeatEachIndex: 0,
        async attach() {},
      },
    ),
    /incomplete/,
  );
  model.uncertain.resolve();
  assert.deepEqual(model.db.states.foreign, { marker: "keep" });
});
