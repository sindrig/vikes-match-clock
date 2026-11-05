import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

import {
  assertPlaybackFixtureTarget,
  parsePlaybackFixtureInput,
} from "../e2e/fixtures/playback-fixture-input.ts";
import {
  assertLocalFixtureUrl,
  EMULATOR_PROJECT,
  LocalFixture,
} from "../e2e/fixtures/local-fixture.ts";

// Source/models only. These execute the actual admission, instrumentation and
// fixture-finally code, not Firebase services, Chromium or production providers.
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const harnessSource = read("../e2e/fixtures/playback-occurrence-harness.tsx");
const specSource = read("../e2e/playback-occurrences.spec.ts");
const fixtureId = "0123456789-0-0123456789abcdef";
const venue = `playback-${fixtureId}`;
const deniedVenue = `playback-denied-${fixtureId}`;
const email = `e2e-playback-${fixtureId}@example.test`;
const target = {
  compiledEmulator: true,
  projectId: "vikes-match-clock-test",
  databaseURL: "http://127.0.0.1:9000?ns=vikes-match-clock-test",
  storageBucket: "vikes-match-clock-test.appspot.com",
  auth: { host: "127.0.0.1", port: 9099, protocol: "http" },
};
function url(role = "controller") {
  const result = new URL(
    "http://localhost:4600/e2e/fixtures/playback-occurrences.html",
  );
  result.search = new URLSearchParams({
    fixture: fixtureId,
    prefix: venue,
    denied: deniedVenue,
    role,
  });
  return result;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
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

function harnessModel({
  role = "controller",
  selected = target,
  source = harnessSource,
  location = url(role),
  clock = Date,
} = {}) {
  const effects = [],
    calls = [],
    subscriptions = [];
  const readErrors = [];
  const auth = { currentUser: null, emulatorConfig: selected.auth };
  const app = { options: selected };
  const server = {};
  for (const method of ["put", "merge"])
    server[method] = function (...args) {
      assert.equal(this, server, "original SDK receiver is preserved");
      const [path, data, callback, hash] = args;
      effects.push(`sdk:${method}`);
      calls.push({ method, path, data, callback, hash });
    };
  const database = { _repoInternal: { server_: server } };
  const audited = {
    writeAudited: (...args) => audited.writeAuditOnly(...args),
    writeAuditOnly: () =>
      new Promise((resolve, reject) => {
        server.merge(
          "/",
          { [`audit/${venue}/event/uid`]: "model-uid" },
          (status) => (status === "ok" ? resolve() : reject(new Error(status))),
        );
      }),
  };
  let currentApi = {
    controller: {
      currentAsset: { asset: { key: "A" }, time: 30 },
      activeQueueId: "q",
      playing: true,
      queues: { q: { autoPlay: false } },
    },
    writeEligible: true,
    addItemsToQueue: async () => undefined,
    completeAssetIfCurrent: async () => false,
    renderAsset: async () => undefined,
    showNextAsset: () => undefined,
    updateQueueSettings: () => undefined,
  };
  const jsx = (component, props) =>
    typeof component === "function" ? component(props) : props;
  const window = { location: { href: location.href } };
  const sandbox = {
    module: { exports: {} },
    exports: {},
    window,
    URL,
    Error,
    Promise,
    Object,
    Reflect,
    Date: clock,
    setTimeout,
    clearTimeout,
    localStorage: {
      setItem: (key, value) => effects.push(["storage", key, value]),
    },
    document: { getElementById: () => ({}) },
  };
  sandbox.exports = sandbox.module.exports;
  const dependencies = {
    "firebase/app": {
      deleteApp: async () => {
        effects.push("deleteApp");
      },
    },
    "firebase/auth": {
      signInWithEmailAndPassword: async (_auth, email) => {
        effects.push("login");
        auth.currentUser = { uid: "model-uid", email };
        return { user: auth.currentUser };
      },
    },
    "firebase/database": {
      ref: (_database, path = "") => {
        effects.push("ref");
        return { path };
      },
      onValue: (reference, callback, error) => {
        readErrors.push(error);
        subscriptions.push(reference.path);
        callback({
          val: () => (reference.path === ".info/connected" ? true : null),
        });
        return () => effects.push("unsubscribe");
      },
      goOffline: () => effects.push("offline"),
      set: (reference, value) =>
        new Promise((resolve, reject) =>
          server.put(reference.path, value, (status) =>
            status === "ok"
              ? resolve()
              : reject(new Error(`permission_denied:${status}`)),
          ),
        ),
      runTransaction: (reference, update) => {
        const next = update(currentApi.controller);
        if (next === undefined) return Promise.resolve({ committed: false });
        return new Promise((resolve) =>
          server.put(
            reference.path,
            next,
            (status) => resolve({ committed: status === "ok" }),
            "actual-model-hash",
          ),
        );
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
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "../../src/firebase": { app, auth, database },
    "../../src/firebaseDatabase": { firebaseDatabase: audited },
    "../../src/contexts/FirebaseStateContext": {
      FirebaseStateProvider: ({ children }) => children,
      useFirebaseState: () => currentApi,
    },
    "../../src/contexts/LocalStateContext": {
      LocalStateProvider: ({ children }) => children,
      useLocalState: () => ({
        listenPrefix: venue,
        auth: { isLoaded: true, isEmpty: false, uid: "model-uid" },
        mutationSession: {},
      }),
    },
    "../../src/controller/asset/Asset": {
      PlaybackAsset: () => null,
      useDeferredAsset: () => null,
    },
    "./playback-fixture-input": {
      parsePlaybackFixtureInput,
      assertPlaybackFixtureTarget,
    },
  };
  sandbox.require = (name) => {
    assert(name in dependencies, `Unmodeled harness import: ${name}`);
    return dependencies[name];
  };
  let error;
  try {
    const actual = source.replace(
      "import.meta.env.VITE_USE_EMULATOR",
      JSON.stringify(selected.compiledEmulator ? "true" : "false"),
    );
    vm.runInNewContext(
      compile(actual) +
        "\nexports.Producers=PlaybackProducers;exports.renderBridge=Screen;exports.beforeDeadline=beforeDeadline;",
      sandbox,
      { timeout: 1000 },
    );
  } catch (caught) {
    error = caught;
  }
  return {
    harness: window.playbackHarness,
    effects,
    calls,
    subscriptions,
    error,
    server,
    audited,
    auth,
    input: error ? undefined : parsePlaybackFixtureInput(location),
    Producers: sandbox.exports.Producers,
    deadline: sandbox.exports.beforeDeadline,
    cancelRead: (path) => {
      const error = readErrors[subscriptions.indexOf(path)];
      assert.equal(typeof error, "function");
      error();
    },
    setApi(api) {
      currentApi = { ...currentApi, ...api };
      sandbox.exports.renderBridge();
    },
  };
}

for (const role of ["controller", "display", "observer"]) {
  test(`input: immutable ${role} tuple has exact case-owned children`, () => {
    const input = parsePlaybackFixtureInput(url(role));
    assert(Object.isFrozen(input));
    assert.deepEqual(input, { fixtureId, venue, deniedVenue, role });
  });
}
const invalidInputs = [
  (value) => value.searchParams.delete("fixture"),
  (value) => value.searchParams.append("prefix", venue),
  (value) => value.searchParams.set("fixture", "0"),
  (value) => value.searchParams.set("fixture", fixtureId + "\n"),
  (value) => value.searchParams.set("prefix", "audit244"),
  (value) => value.searchParams.set("prefix", venue + "-foreign"),
  (value) => value.searchParams.set("denied", venue),
  (value) => value.searchParams.set("denied", "../audit244-denied"),
  (value) => value.searchParams.set("role", "admin"),
  (value) => value.searchParams.set("unknown", "x"),
  (value) => {
    value.hash = "prefix";
  },
  (value) => {
    value.hostname = "staging-klukka.irdn.is";
  },
  (value) => {
    value.protocol = "https:";
  },
];
for (const [index, invalidate] of invalidInputs.entries())
  test(`input: invalid tuple ${index} cannot fall back or mount`, () => {
    const location = url();
    invalidate(location);
    assert.throws(() => parsePlaybackFixtureInput(location), /identity/);
    const model = harnessModel({ location });
    assert(model.error);
    assert.deepEqual(model.effects, []);
  });

for (const [field, value] of [
  ["compiledEmulator", false],
  ["projectId", "production"],
  ["databaseURL", "https://production.firebaseio.com"],
  ["storageBucket", "foreign.appspot.com"],
  ["auth", { host: "localhost", port: 9099, protocol: "http" }],
  ["auth", { host: "127.0.0.1", port: 9099, protocol: "https" }],
  ["auth", { host: "127.0.0.1", port: 9098, protocol: "http" }],
  ["auth", null],
])
  test(`target: wrong ${field} is read-only even with a process flag`, () => {
    const model = harnessModel({ selected: { ...target, [field]: value } });
    assert.equal(model.error, undefined);
    assert.deepEqual(model.effects, []);
    assert.throws(
      () => model.harness.initialize(model.input),
      /target|local emulators/,
    );
    assert.deepEqual(model.effects, []);
  });

test("admission: import is inert, immutable input mismatch and pre-init calls cannot mutate", () => {
  const model = harnessModel();
  assert.equal(model.error, undefined);
  assert.deepEqual(model.effects, []);
  assert.throws(() => model.harness.commands, /not active/);
  assert.throws(
    () => model.harness.initialize({ ...model.input, venue: "foreign" }),
    /mismatch/,
  );
  assert.deepEqual(model.effects, []);
  model.harness.initialize(model.input);
  assert(
    model.effects.some(
      (effect) => Array.isArray(effect) && effect[2] === venue,
    ),
  );
  assert.throws(() => model.harness.initialize(model.input), /mismatch/);
});

test("observer: separate SDK reads, no mount, writable API or transport wrapper", async () => {
  const model = harnessModel({ role: "observer" });
  const originalPut = model.server.put;
  model.harness.initialize(model.input);
  await model.harness.login(email, "synthetic", "model-uid");
  assert.equal(model.server.put, originalPut);
  assert(!model.effects.includes("createRoot"));
  assert.deepEqual(model.subscriptions, [
    ".info/connected",
    `states/${venue}/controller`,
    `audit/${venue}`,
  ]);
  assert.throws(() => model.harness.commands, /No writable/);
  assert.throws(() => model.harness.deny(), /No writable/);
  await model.harness.dispose(100);
  assert(model.harness.lifecycle().disposed);
});

test("original commands retain their captured origin when a newer render arrives", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  const calls = [];
  model.setApi({
    completeAssetIfCurrent: async () => {
      calls.push("A");
      return false;
    },
  });
  const retained = model.harness.commands.completeAssetIfCurrent;
  model.setApi({
    completeAssetIfCurrent: async () => {
      calls.push("B");
      return true;
    },
  });
  assert.equal(await retained({}), false);
  assert.equal(await model.harness.commands.completeAssetIfCurrent({}), true);
  assert.deepEqual(calls, ["A", "B"]);
  await model.harness.dispose(100);
});

test("hash gate preserves SDK receiver, original callback order and a pending datastale retry", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  const order = [];
  model.harness.arm();
  model.server.put(
    `/states/${venue}/controller`,
    {},
    (status) => {
      order.push(status);
      model.server.put(
        `/states/${venue}/controller`,
        {},
        () => order.push("retry"),
        "hash2",
      );
    },
    "hash1",
  );
  assert.equal(model.calls.length, 0);
  assert.equal(model.harness.held, 1);
  assert.deepEqual([...model.harness.hashes], ["hash1"]);
  model.harness.release();
  model.calls[0].callback("datastale", { server: "value" });
  assert.deepEqual(order, ["datastale"]);
  assert.equal(model.harness.lifecycle().pendingSdk, 1);
  assert.deepEqual([...model.harness.hashes], ["hash1", "hash2"]);
  model.calls[1].callback("ok");
  assert.deepEqual(order, ["datastale", "retry"]);
  assert.equal(model.harness.lifecycle().pendingSdk, 0);
  await model.harness.dispose(100);
});

test("audit tail: retirement releases the original send and waits for its actual callback", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  model.harness.arm("audit");
  const audit = model.audited.writeAuditOnly();
  assert.equal(model.harness.lifecycle().pendingAudits, 1);
  assert.equal(model.calls.length, 0);
  let finished = false;
  const dispose = model.harness.dispose(1000).then(() => {
    finished = true;
  });
  await new Promise(setImmediate);
  assert.equal(
    model.calls.length,
    1,
    "original held send was released, not dropped",
  );
  assert(!finished);
  assert(!model.effects.includes("deleteApp"));
  model.calls[0].callback("ok");
  await audit;
  await dispose;
  assert(model.harness.lifecycle().disposed);
});

test("lost SDK acknowledgement cannot be certified by timeout or apparent state absence", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  model.server.put(
    `/states/${venue}/controller`,
    null,
    () => undefined,
    "hash",
  );
  await assert.rejects(model.harness.dispose(15), /deadline/);
  assert.equal(model.harness.lifecycle().pendingSdk, 1);
  assert(!model.harness.lifecycle().disposed);
  assert(!model.effects.includes("deleteApp"));
});

test("unsettled original command has the same bounded disposal deadline", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  const held = deferred();
  model.setApi({ completeAssetIfCurrent: () => held.promise });
  const command = model.harness.commands.completeAssetIfCurrent({});
  await assert.rejects(model.harness.dispose(15), /deadline/);
  assert.equal(model.harness.lifecycle().pendingCommands, 1);
  held.resolve(false);
  await command;
  assert(
    !model.harness.lifecycle().disposed,
    "later settlement cannot rewrite failed disposal",
  );
});

test("known permission denial is terminal only after the real SDK callback", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  const denied = assert.rejects(model.harness.deny(), /permission_denied/);
  assert.equal(model.harness.lifecycle().pendingCommands, 1);
  assert.equal(model.calls[0].path, `states/${deniedVenue}/controller/playing`);
  model.calls[0].callback("permission_denied");
  await denied;
  assert.deepEqual([...model.harness.lifecycle().failures], []);
  await model.harness.dispose(100);
});

test("an error mentioning permission_denied without an SDK acknowledgement stays failed", async () => {
  const ast = ts.createSourceFile(
    "harness.tsx",
    harnessSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let call;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "set")
      call = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(call, "mutate the actual set call regardless of formatting");
  const broken =
    harnessSource.slice(0, call.getStart(ast)) +
    'Promise.reject(new Error("permission_denied transport lost"))' +
    harnessSource.slice(call.end);
  assert.notEqual(broken, harnessSource);
  const model = harnessModel({ source: broken });
  model.harness.initialize(model.input);
  await assert.rejects(model.harness.deny(), /permission_denied/);
  await assert.rejects(model.harness.dispose(100), /producer failed/);
  assert(model.harness.lifecycle().failures.length);
});

test("old tuple-only SDK writer targets the owned controller and still ignores occurrence IDs", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  const observation = {
    occurrenceId: "old-id",
    assetKey: "A",
    time: 30,
    activeQueueId: "q",
    playing: true,
  };
  model.setApi({
    controller: {
      ...model.harness.commands.controller,
      currentAsset: { asset: { key: "A" }, time: 30, occurrenceId: "new-id" },
    },
  });
  const result = model.harness.oldComplete(observation);
  assert.equal(model.calls[0].path, `states/${venue}/controller`);
  assert.equal(model.calls[0].data.currentAsset, null);
  model.calls[0].callback("ok");
  assert.equal(await result, true);
  await model.harness.dispose(100);
});

test("rejected original audit remains a failed cleanup, never a successful transaction-only result", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  const audit = assert.rejects(
    model.audited.writeAuditOnly(),
    /permission_denied/,
  );
  model.calls[0].callback("permission_denied");
  await audit;
  await assert.rejects(model.harness.dispose(100), /producer failed/);
  assert(!model.harness.lifecycle().disposed);
});

function enableEmulator(t) {
  const previous = process.env.VITE_USE_EMULATOR;
  process.env.VITE_USE_EMULATOR = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.VITE_USE_EMULATOR;
    else process.env.VITE_USE_EMULATOR = previous;
  });
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
    "./fixtures/playback-fixture-input": {
      parsePlaybackFixtureInput,
      assertPlaybackFixtureTarget,
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
  vm.runInNewContext(compile(source) + "\nexports.until=until;", sandbox, {
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
                const input = parsePlaybackFixtureInput(current);
                const harness = {
                  target,
                  input,
                  initialize(expected) {
                    assert.deepEqual(plain(input), plain(expected));
                    context.storage.set("prefix", input.venue);
                  },
                  async login(_email, _password, uid) {
                    this.uid = uid;
                  },
                  snapshot() {
                    return {
                      connected: true,
                      eligible: true,
                      uid: this.uid,
                      rawController: get(`states/${input.venue}/controller`),
                      rawAudit: get(`audit/${input.venue}`),
                      controllerDeliveries: 1,
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
                    if (failure === "dispose" && input.role === "observer")
                      return uncertain.promise;
                  },
                };
                this.window = { playbackHarness: harness };
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
    deadline: sandbox.exports.until,
  };
}

const playbackTitles = [
  "real SDK competing legacy completions commit once, including a forced hash conflict",
  "real SDK competing identified completions commit once, including a forced hash conflict",
  "A to B to A rejects the old observation and preserves URLs and keys",
  "malformed present IDs never become eligible legacy observations and real SDK rules still deny unauthorized writes",
  "unchanged rules permit an old writer to clear replayed identified media: documented mixed-binary limit",
  "native video replay remounts with the same source and an old actual onEnded cannot clear it",
  "animated GIF replay restarts with identical persisted media identity",
  "real browser react-youtube recreates the player and captures old end callbacks with an offline API double",
];

test("actual spec declarations are inert and retain all eight expanded titles", () => {
  const model = fixtureModel();
  assert.deepEqual(model.registered, playbackTitles);
  assert.deepEqual(model.effects, []);
});

test("actual spec declaration control detects a reinstated global rules initializer", async () => {
  const model = fixtureModel({
    source: specSource + '\nvoid canonicalRules("PUT").catch(() => undefined);',
  });
  await new Promise(setImmediate);
  assert(model.effects.includes("fetch"));
  assert.deepEqual(model.registered, playbackTitles);
});

for (const failure of [undefined, "body", "attachment", "seed", "target"]) {
  test(`actual fixture finally: ${failure ?? "success"} retires only owned resources`, async (t) => {
    enableEmulator(t);
    const model = fixtureModel({ failure });
    const work = model.extensions.playback(
      { browser: model.browser },
      async (playback) => {
        assert.equal(playback.page === playback.observer, false);
        assert.equal(model.contexts.length, 2);
        await playback.bootstrap(playback.page);
        await playback.settle(playback.page);
        if (failure === "body") throw new Error("body failed");
      },
      {
        workerIndex: 0,
        titlePath: ["native"],
        retry: 0,
        repeatEachIndex: 0,
        async attach() {
          if (failure === "attachment") throw new Error("attachment failed");
        },
      },
    );
    if (failure) await assert.rejects(work);
    else await work;
    assert(model.contexts.every((context) => context.closed));
    assert.deepEqual(model.db.states.foreign, { marker: "keep" });
    assert.deepEqual(model.db.audit.foreign, { marker: "keep" });
    assert(
      !Object.keys(model.db.states).some((key) => key.startsWith("playback-")),
    );
    if (failure === "target")
      assert(
        !model.effects.some((effect) => /^(POST|PUT|DELETE):/.test(effect)),
        "wrong served target cannot mutate Auth, data or cleanup roots",
      );
    if (!failure)
      assert(
        model.effects.indexOf("dispose:controller") <
          model.effects.indexOf("dispose:observer"),
      );
  });
}

test("actual fixture: unresolved client disposal cannot become success after best-effort deletion", async (t) => {
  enableEmulator(t);
  // Shorten only the disposable model deadline to exercise actual propagation
  // without waiting twenty seconds; the real fixture keeps its original bound.
  const shorter = specSource.replace(
    "const deadline = Date.now() + 20000;",
    "const deadline = Date.now() + 25;",
  );
  assert.notEqual(shorter, specSource);
  const model = fixtureModel({ failure: "dispose", source: shorter });
  await assert.rejects(
    model.extensions.playback(
      { browser: model.browser },
      async () => undefined,
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

test("fixed-root old writer mutant is caught by the owned destination oracle", async () => {
  const broken = harnessSource.replaceAll(
    "`states/${input.venue}/controller`",
    '"states/audit244/controller"',
  );
  assert.notEqual(broken, harnessSource);
  const model = harnessModel({ source: broken });
  model.harness.initialize(model.input);
  const result = model.harness.oldComplete({
    occurrenceId: null,
    assetKey: "A",
    time: 30,
    activeQueueId: "q",
    playing: true,
  });
  assert.throws(() =>
    assert.equal(model.calls[0].path, `states/${venue}/controller`),
  );
  model.calls[0].callback("ok");
  await result;
  await model.harness.dispose(100);
});

test("void command submission preserves void return and follows the original audit acknowledgement", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  let submitted;
  model.setApi({
    showNextAsset: () => {
      submitted = model.audited.writeAuditOnly();
    },
  });
  assert.equal(model.harness.commands.showNextAsset(), undefined);
  assert.equal(model.harness.lifecycle().invocations, 1);
  assert.equal(model.harness.lifecycle().pendingAudits, 1);
  model.calls[0].callback("ok");
  await submitted;
  await model.harness.dispose(100);
});

test("SDK callback receiver and payload survive interception unchanged", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  const receiver = { from: "SDK" };
  const payload = { retained: true };
  let observed;
  model.server.put(
    "/states/owned/controller",
    {},
    function (status, data) {
      observed = { receiver: this, status, data };
    },
    "hash",
  );
  Reflect.apply(model.calls[0].callback, receiver, ["ok", payload]);
  assert.equal(observed.receiver, receiver);
  assert.equal(observed.data, payload);
  assert.equal(observed.status, "ok");
  await model.harness.dispose(100);
});

for (const path of [
  ".info/connected",
  `states/${venue}/controller`,
  `audit/${venue}`,
]) {
  test(`cancelled observer read ${path} cannot certify a successful lifetime`, async () => {
    const model = harnessModel({ role: "observer" });
    model.harness.initialize(model.input);
    await model.harness.login(email, "synthetic", "model-uid");
    model.cancelRead(path);
    await assert.rejects(model.harness.dispose(100), /producer failed/);
    assert(!model.harness.lifecycle().disposed);
  });
}

test("display owns object URLs and restores the exact original creator after retirement", async (t) => {
  const original = URL.createObjectURL;
  const revoke = URL.revokeObjectURL.bind(URL);
  const revoked = [];
  t.mock.method(URL, "revokeObjectURL", (value) => {
    revoked.push(value);
    revoke(value);
  });
  const model = harnessModel({ role: "display" });
  model.harness.initialize(model.input);
  const objectUrl = URL.createObjectURL(new Blob(["fixture bytes"]));
  assert.notEqual(URL.createObjectURL, original);
  await model.harness.dispose(100);
  assert.deepEqual(revoked, [objectUrl]);
  assert.equal(URL.createObjectURL, original);
});

test("SDK echo and rollback snapshots remain the original provider values without acknowledging a send", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  const original = model.harness.commands.controller;
  model.server.put(
    `states/${deniedVenue}/controller/playing`,
    true,
    () => undefined,
  );
  const echoed = { ...original, playing: false };
  model.setApi({ controller: echoed });
  assert.equal(model.harness.commands.controller, echoed);
  assert.equal(model.harness.lifecycle().pendingSdk, 1);
  model.calls[0].callback("permission_denied");
  model.setApi({ controller: original });
  assert.equal(model.harness.commands.controller, original);
  await model.harness.dispose(100);
});

test("a known failure still drains other submitted SDK work before reporting failed retirement", async () => {
  const model = harnessModel();
  model.harness.initialize(model.input);
  const failed = assert.rejects(
    model.audited.writeAuditOnly(),
    /permission_denied/,
  );
  model.server.put("/states/owned/controller", {}, () => undefined, "hash");
  model.calls[0].callback("permission_denied");
  await failed;
  let finished = false;
  const disposing = model.harness.dispose(1000);
  const rejected = assert.rejects(disposing, /producer failed/);
  void disposing.then(
    () => {
      finished = true;
    },
    () => {
      finished = true;
    },
  );
  await new Promise(setImmediate);
  assert(!finished, "known failure must not close over another pending send");
  assert.equal(model.harness.lifecycle().pendingSdk, 1);
  model.calls[1].callback("ok");
  await rejected;
  assert.equal(model.harness.lifecycle().pendingSdk, 0);
});

for (const layer of ["harness", "fixture"]) {
  test(`${layer} deadline rejects a late response even before the overdue timer can run`, async () => {
    let now = 0;
    class Clock extends Date {
      static now() {
        return now;
      }
    }
    const model =
      layer === "harness"
        ? harnessModel({ clock: Clock })
        : fixtureModel({ clock: Clock });
    const response = Promise.resolve().then(() => {
      now = 1001;
      return "late result";
    });
    const pending =
      layer === "harness"
        ? model.deadline(response, 1000)
        : model.deadline(() => response, 1000);
    await assert.rejects(pending, /deadline/);
  });
}
