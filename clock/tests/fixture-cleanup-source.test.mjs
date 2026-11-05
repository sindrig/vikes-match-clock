import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import { observeFixtureMutations } from "../e2e/fixtures/fixture-mutations.ts";
import { LocalFixture } from "../e2e/fixtures/local-fixture.ts";

// These execute actual handler source with in-memory Firebase dependencies and
// a browser event model. They are NOT real-emulator or browser qualification.
const source = readFileSync(
  new URL("../../functions/src/adminWrite.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const json = (body) => new Response(JSON.stringify(body));
const callableUrl =
  "http://127.0.0.1:5001/vikes-match-clock-test/us-central1/adminWrite";

function enableEmulator(t) {
  const previous = process.env.VITE_USE_EMULATOR;
  process.env.VITE_USE_EMULATOR = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.VITE_USE_EMULATOR;
    else process.env.VITE_USE_EMULATOR = previous;
  });
}

function actualHandler(database, entered, release) {
  const db = {
    ref(path) {
      return {
        once: async () => ({ val: () => database.get(path) ?? null }),
        push: () => ({
          key: "actual-handler-generated",
          set: async (data) => {
            entered.resolve();
            await release.promise;
            database.set("invitations/actual-handler-generated", data);
          },
        }),
      };
    },
  };
  class HttpsError extends Error {}
  const module = { exports: {} };
  const dependencies = {
    "firebase-functions/v2/https": { onCall: (handler) => handler },
    "firebase-functions": { https: { HttpsError }, logger: { info() {} } },
    "firebase-admin": { apps: [{}], database: () => db },
    "firebase-admin/database": { ServerValue: { TIMESTAMP: 1 } },
  };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => {
      assert(
        name in dependencies,
        "handler dependency must be explicitly modeled",
      );
      return dependencies[name];
    },
  });
  return module.exports.adminWrite;
}

for (const timing of ["before-cleanup", "during-cleanup"]) {
  test(`actual handler source / browser event model: ${timing} invitation is retired`, async (t) => {
    enableEmulator(t);
    const database = new Map();
    const requests = [];
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const handler = actualHandler(database, entered, release);
    const fixture = new LocalFixture(
      "actual-handler",
      "0",
      async (value, init) => {
        const url = new URL(value);
        const path = url.pathname.slice(1, -5);
        requests.push({ path, method: init.method });
        if (url.port === "9000") {
          if (init.method === "GET" && path === "invitations")
            return json(
              Object.fromEntries(
                [...database]
                  .filter(([key]) => key.startsWith("invitations/"))
                  .map(([key, data]) => [key.slice(12), data]),
              ),
            );
          if (init.method === "PUT") database.set(path, JSON.parse(init.body));
          if (init.method === "DELETE")
            for (const key of database.keys())
              if (key === path || key.startsWith(path + "/"))
                database.delete(key);
          return json(null);
        }
        if (url.port === "9199") return json({ items: [] });
        if (url.pathname.endsWith(":delete")) return json({});
        return json({
          email: JSON.parse(init.body).email,
          localId: "owned-admin",
          idToken: "synthetic",
        });
      },
    );
    const venue = fixture.venue();
    const adminEmail = fixture.email("admin");
    const recipient = fixture.email("invitee");
    const uid = await fixture.createUser(adminEmail, "synthetic");
    await fixture.database("PUT", `admins/${uid}`, true);
    const foreignRecipient = {
      email: "foreign@example.test",
      createdBy: adminEmail,
      locations: {},
      createdAt: 1,
    };
    const foreignCreator = {
      email: recipient,
      createdBy: "foreign@example.test",
      locations: {},
      createdAt: 1,
    };
    database.set("invitations/foreign-recipient", foreignRecipient);
    database.set("invitations/foreign-creator", foreignCreator);
    const page = new EventEmitter();
    // Compatibility lets this invariant run against the original fixture: its
    // missing completion accounting must fail the residue assertion, not merely
    // throw because the repair API is absent.
    if (typeof fixture.trackMutation === "function")
      observeFixtureMutations(page, fixture);
    const invocation = handler({
      auth: { uid, token: { email: adminEmail } },
      data: {
        action: "createInvitation",
        email: recipient,
        locations: { [venue]: true },
      },
    });
    page.emit("request", {
      url: () => callableUrl,
      method: () => "POST",
      response: () =>
        invocation.then((result) => ({
          finished: async () => null,
          status: () => 200,
          json: async () => ({ result }),
        })),
    });
    await entered.promise; // Actual authorization succeeded; ref.set is held.
    if (timing === "before-cleanup") {
      release.resolve();
      await invocation;
    }
    const cleanup = fixture.cleanup();
    await new Promise(setImmediate);
    const earlyDiscovery =
      timing === "during-cleanup" &&
      requests.some((request) => request.path === "invitations");
    release.resolve();
    await invocation;
    await cleanup;
    assert.equal(
      database.has("invitations/actual-handler-generated"),
      false,
      "cleanup must remove a late actual-handler commit",
    );
    assert.equal(
      earlyDiscovery,
      false,
      "final discovery must follow producer completion",
    );
    assert.deepEqual(
      [...database],
      [
        ["invitations/foreign-recipient", foreignRecipient],
        ["invitations/foreign-creator", foreignCreator],
      ],
    );
  });
}

for (const completion of [
  "lost",
  "invalid-json",
  "invalid-envelope",
  "null-result",
  "error",
  "http-failure",
]) {
  test(`browser event model: ${completion} callable response cannot certify cleanup`, async (t) => {
    enableEmulator(t);
    const fixture = new LocalFixture("ambiguous-callable", "0", async () =>
      json(null),
    );
    const page = new EventEmitter();
    observeFixtureMutations(page, fixture);
    page.emit("request", {
      url: () => callableUrl,
      method: () => "POST",
      response: async () =>
        completion === "lost"
          ? null
          : {
              finished: async () => null,
              status: () => (completion === "http-failure" ? 500 : 200),
              json: async () => {
                if (completion === "invalid-json")
                  throw new Error("private-response");
                if (completion === "null-result") return { result: null };
                if (completion === "error")
                  return { error: { status: "INTERNAL" } };
                if (completion === "http-failure")
                  return { result: { success: true } };
                return {};
              },
            },
    });
    await assert.rejects(
      fixture.cleanup(),
      /cleanup incomplete.*unresolved submitted mutation/,
    );
  });
}

test("browser event model: a submission first observed during retirement makes cleanup incomplete", async (t) => {
  enableEmulator(t);
  const page = new EventEmitter();
  let emitted = false;
  const fixture = new LocalFixture(
    "retirement-race",
    "0",
    async (_url, init) => {
      if (!emitted && init.method === "DELETE") {
        emitted = true;
        page.emit("request", {
          url: () => callableUrl,
          method: () => "POST",
          response: async () => null,
        });
      }
      return json(null);
    },
  );
  fixture.venue();
  observeFixtureMutations(page, fixture);
  await assert.rejects(
    fixture.cleanup(),
    /cleanup incomplete.*unresolved submitted mutation/,
  );
});
