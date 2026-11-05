import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import zlib from "node:zlib";

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import ts from "typescript";

// These execute actual spec declarations with modeled Playwright/helper imports.
// The negative initializer uses the actual rules-unit SDK and blocks its own
// HTTP/socket transport. No browser, emulator, hooks or test bodies are run.
const cases = {
  "perimeter-goal-scorer.spec.ts": [
    "selects a scorer, renders the semantic overlay, falls back, and clears",
    "keeps a reopened scorer dialog usable after an earlier acknowledgement",
  ],
  "perimeter-player-band.spec.ts": [
    "anonymous reads follow the extended player media rules",
    "alternates regular and celebration portraits once per second in player and scorer displays",
    "renders the lineup band, covers it with a goal overlay, and restores",
    "derives the substitution band and drops it for an invalid sub",
    "swaps between two queued substitutions without exposing the base deck",
  ],
};

async function declarations(t, source, file) {
  const effects = [];
  const registered = [];
  const pending = [];
  const forbidden = (name) => () => {
    effects.push(name);
    throw new Error(`Forbidden collection effect: ${name}`);
  };
  t.mock.method(http, "request", forbidden("http.request"));
  t.mock.method(https, "request", forbidden("https.request"));
  t.mock.method(net.Socket.prototype, "connect", forbidden("socket.connect"));
  const register = (title) => registered.push(title);
  register.describe = (_title, declare) => declare();
  register.beforeAll = () => {};
  register.beforeEach = () => {};
  register.afterAll = () => {};
  register.afterEach = () => {};
  register.setTimeout = () => {};
  const dependencies = {
    "node:fs": { readFileSync },
    "node:path": { resolve: (await import("node:path")).resolve },
    "node:zlib": zlib,
    "@playwright/test": { expect: forbidden("expect during collection") },
    "@firebase/rules-unit-testing": {
      initializeTestEnvironment: (config) => {
        effects.push("initializeTestEnvironment");
        const promise = initializeTestEnvironment(config);
        pending.push(promise);
        void promise.catch(() => {});
        return promise;
      },
    },
    "./fixtures/test-helpers": {
      test: register,
      TEST_LISTEN_PREFIX: "owned-model-venue",
      clearEmulatorData: forbidden("clearEmulatorData"),
      ensureEmulatorUser: forbidden("ensureEmulatorUser"),
      loginWithEmulatorUser: forbidden("loginWithEmulatorUser"),
      emulatorFixture: { uploadStorage: forbidden("uploadStorage") },
    },
  };
  const module = { exports: {} };
  let evaluationError;
  try {
    vm.runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
      {
        module,
        exports: module.exports,
        require: (name) => {
          assert(
            name in dependencies,
            `Unmodeled declaration dependency: ${name}`,
          );
          return dependencies[name];
        },
        __dirname: dirname(file),
        __filename: file,
        Buffer,
        fetch: forbidden("vm.fetch"),
      },
      { filename: file, timeout: 1000 },
    );
  } catch (error) {
    evaluationError = error;
  }
  await Promise.allSettled(pending);
  return { effects, registered, evaluationError };
}

for (const [spec, expected] of Object.entries(cases)) {
  const file = fileURLToPath(new URL(`../e2e/${spec}`, import.meta.url));
  const source = readFileSync(file, "utf8");
  test(`Storage fixture declarations: ${spec} registers its unchanged cases without I/O`, async (t) => {
    const result = await declarations(t, source, file);
    assert.equal(result.evaluationError, undefined);
    assert.deepEqual(result.effects, []);
    assert.deepEqual(result.registered, expected);
  });

  test(`Storage fixture declarations: ${spec} detects an import-time initializer through the SDK's own transport`, async (t) => {
    const mutation = `
import { initializeTestEnvironment as initializeCollectionControl } from "@firebase/rules-unit-testing";
${source}
void initializeCollectionControl({
  projectId: "vikes-match-clock-test",
  storage: {
    host: "127.0.0.1",
    port: 9199,
    rules: 'rules_version = "2"; service firebase.storage { match /b/{bucket}/o { match /{all=**} { allow read, write: if false; } } }',
  },
});`;
    const result = await declarations(t, mutation, file);
    assert.equal(result.evaluationError, undefined);
    assert.deepEqual(result.registered, expected);
    assert(result.effects.includes("initializeTestEnvironment"));
    assert(
      result.effects.some((effect) =>
        /^(http|https)\.request$|^socket\.connect$/.test(effect),
      ),
      "the real SDK transport, not just a global fetch stub, must be intercepted",
    );
  });
}

test("Storage fixture declarations: a direct collection fetch is also detected", async (t) => {
  const spec = "perimeter-player-band.spec.ts";
  const file = fileURLToPath(new URL(`../e2e/${spec}`, import.meta.url));
  const source = readFileSync(file, "utf8");
  const result = await declarations(
    t,
    `${source}\nvoid fetch("http://127.0.0.1:9199/");`,
    file,
  );
  assert.match(
    result.evaluationError?.message ?? "",
    /Forbidden collection effect/,
  );
  assert.deepEqual(result.effects, ["vm.fetch"]);
  assert.deepEqual(result.registered, cases[spec]);
});
