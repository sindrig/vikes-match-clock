import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
// HTTP/socket transport. Image body controls stop at the actual filename oracle
// with a modeled Page; no browser, emulator or compression is qualified here.
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

async function declarations(t, source, file, { helpers = {}, expect } = {}) {
  const effects = [];
  const registered = [];
  const pending = [];
  const bodies = new Map();
  const forbidden = (name) => () => {
    effects.push(name);
    throw new Error(`Forbidden collection effect: ${name}`);
  };
  t.mock.method(http, "request", forbidden("http.request"));
  t.mock.method(https, "request", forbidden("https.request"));
  t.mock.method(net.Socket.prototype, "connect", forbidden("socket.connect"));
  const register = (title, body) => {
    registered.push(title);
    bodies.set(title, body);
  };
  register.describe = (_title, declare) => declare();
  register.beforeAll = () => {};
  register.beforeEach = () => {};
  register.afterAll = () => {};
  register.afterEach = () => {};
  register.setTimeout = () => {};
  const dependencies = {
    "node:crypto": { randomUUID },
    "node:fs": {
      readFileSync,
      writeFileSync: forbidden("writeFileSync"),
      unlinkSync: forbidden("unlinkSync"),
    },
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
      expect: expect ?? forbidden("expect during collection"),
      ...helpers,
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
        Date: class extends Date {
          static now() {
            return 123;
          }
        },
        fetch: forbidden("vm.fetch"),
      },
      { filename: file, timeout: 1000 },
    );
  } catch (error) {
    evaluationError = error;
  }
  await Promise.allSettled(pending);
  return { effects, registered, evaluationError, bodies };
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

const imageFile = fileURLToPath(
  new URL("../e2e/image-upload.spec.ts", import.meta.url),
);
const imageSource = readFileSync(imageFile, "utf8");
const imageTitles = [
  "uploads image with correct filename preserved",
  "uploads image with compression enabled",
];
const imageHash =
  "d6ad79754ddf8117ef07ae148ac239cf61d9ff537511a2b6f86e5d5b8de08d6b";

test("Storage fixture declarations: image cases register unchanged without I/O", async (t) => {
  const result = await declarations(t, imageSource, imageFile);
  assert.equal(result.evaluationError, undefined);
  assert.deepEqual(result.effects, []);
  assert.deepEqual(result.registered, imageTitles);
});

// The modeled body executes only far enough to inspect the real setInputFiles
// argument and the real listing filter. UI success/decoding is browser evidence.
async function imageInputs(t, source) {
  const fixture = { id: "owned-worker-a" };
  const seen = new Set();
  let payload;
  let checked;
  const reachedOracle = new Error("reached actual filename oracle");
  const locator = {
    async click() {},
    async check() {
      checked = true;
    },
    filter({ hasText }) {
      if (typeof hasText === "string") {
        assert.equal(
          hasText,
          payload.name,
          "listing uses the actual uploaded filename",
        );
        throw reachedOracle;
      }
      return locator;
    },
    async setInputFiles(value) {
      assert.equal(
        typeof value,
        "object",
        "browser upload requires an in-memory payload",
      );
      assert(value && Buffer.isBuffer(value.buffer));
      assert.equal(value.mimeType, "image/png");
      assert.equal(value.buffer.length, 70);
      assert.equal(
        createHash("sha256").update(value.buffer).digest("hex"),
        imageHash,
      );
      assert.match(value.name, /^[A-Za-z0-9_.-]+\.png$/);
      assert(
        value.name.includes(fixture.id),
        "filename belongs to this fixture",
      );
      assert(!seen.has(value.name), "filename collision within the worker");
      seen.add(value.name);
      payload = value;
    },
  };
  const page = {
    getByRole: () => locator,
    getByText: () => locator,
    locator: () => locator,
    async waitForTimeout(ms) {
      assert.equal(ms, 1000);
    },
  };
  const result = await declarations(t, source, imageFile, {
    helpers: {
      emulatorFixture: fixture,
      loginWithEmulatorUser: async () => {},
    },
    expect: (value) => ({
      async toBeVisible() {},
      async toBeChecked() {
        assert(checked);
      },
      async toContainText() {},
      async toPass() {
        await value();
      },
    }),
  });
  assert.equal(result.evaluationError, undefined);
  assert.deepEqual(result.effects, []);
  for (const id of ["owned-worker-a", "owned-worker-a", "owned-worker-b"]) {
    fixture.id = id;
    for (const title of imageTitles) {
      checked = false;
      const body = result.bodies.get(title);
      assert.equal(typeof body, "function");
      // Only this sentinel is success. Payload/FS failures propagate unchanged.
      try {
        await body({ page });
        assert.fail("actual body did not reach its filename oracle");
      } catch (error) {
        if (error !== reachedOracle) throw error;
      }
    }
  }
  assert.equal(seen.size, 6);
  assert.deepEqual(result.effects, []);
}

test("Image input source / Page model: exact bytes, filename oracle and fresh invocation ownership", async (t) => {
  await imageInputs(t, imageSource);
});

for (const operation of ["writeFileSync", "unlinkSync"]) {
  test(`Image input source / Page model: detects actual ${operation} regression`, async (t) => {
    const mutation =
      `import { ${operation} } from "node:fs";\n` +
      imageSource.replace(
        "  const pngBuffer = Buffer.from([",
        `  ${operation}("forbidden-source-adjacent.png"${operation === "writeFileSync" ? ', "x"' : ""});\n  const pngBuffer = Buffer.from([`,
      );
    assert.notEqual(mutation, imageSource);
    await assert.rejects(
      imageInputs(t, mutation),
      new RegExp(`Forbidden collection effect: ${operation}`),
    );
  });
}

test("Image input source / Page model: detects a string-path upload regression", async (t) => {
  const mutation = imageSource.replaceAll(
    "setInputFiles(testImage)",
    "setInputFiles(testImage.name)",
  );
  assert.notEqual(mutation, imageSource);
  await assert.rejects(
    imageInputs(t, mutation),
    /requires an in-memory payload/,
  );
});

test("Image input source / Page model: detects timestamp-only collisions with Date frozen", async (t) => {
  const mutation = imageSource.replaceAll("${randomUUID()}", "${Date.now()}");
  assert.notEqual(mutation, imageSource);
  await assert.rejects(
    imageInputs(t, mutation),
    /filename collision within the worker/,
  );
});
