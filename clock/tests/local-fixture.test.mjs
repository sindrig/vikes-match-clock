import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBrowserEmulatorTarget,
  assertLocalFixtureUrl,
  fixtureIdentity,
  initializeExecutionToken,
  LocalFixture,
  requireEmulatorSelection,
} from "../e2e/fixtures/local-fixture.ts";

function enableEmulator(t) {
  const previous = process.env.VITE_USE_EMULATOR;
  process.env.VITE_USE_EMULATOR = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.VITE_USE_EMULATOR;
    else process.env.VITE_USE_EMULATOR = previous;
  });
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });

// A transport model tests request/cleanup safety; it does not qualify Firebase
// rules, SDK integration or callables. Those require the separate emulator run.
function model() {
  const database = new Map();
  const objects = new Map();
  const accounts = new Map();
  const requests = [];
  const transport = async (value, init) => {
    assert.equal(init.redirect, "manual");
    assert(init.signal instanceof AbortSignal);
    const url = new URL(value);
    const data = init.body === undefined ? undefined : JSON.parse(init.body);
    requests.push({ url: value, method: init.method, data });
    if (url.port === "9000") {
      assert.equal(init.headers.Authorization, "Bearer owner");
      const path = url.pathname.slice(1, -5);
      if (init.method === "GET" && path === "invitations") {
        return json(
          Object.fromEntries(
            [...database]
              .filter(([key]) => key.startsWith("invitations/"))
              .map(([key, invitation]) => [key.slice(12), invitation]),
          ),
        );
      }
      if (init.method === "GET") return json(database.get(path) ?? null);
      if (init.method === "PUT") {
        // Model RTDB's omission of an empty invitation grant child on storage.
        if (
          path.startsWith("invitations/") &&
          data?.locations !== null &&
          typeof data?.locations === "object" &&
          !Array.isArray(data.locations) &&
          Object.keys(data.locations).length === 0
        )
          delete data.locations;
        database.set(path, data);
      } else
        for (const key of database.keys()) {
          if (key === path || key.startsWith(path + "/")) database.delete(key);
        }
      return json(null);
    }
    if (url.port === "9199") {
      const prefix = url.searchParams.get("prefix");
      if (init.method === "GET")
        return json({
          items: [...objects.keys()]
            .filter((name) => name.startsWith(prefix))
            .map((name) => ({ name })),
        });
      const name = decodeURIComponent(url.pathname.split("/o/")[1]);
      objects.delete(name);
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith(":lookup")) {
      assert.equal(init.headers.Authorization, "Bearer owner");
      assert.deepEqual(Object.keys(data), ["email"]);
      return json({
        users: [...accounts.values()].filter((account) =>
          data.email.includes(account.email),
        ),
      });
    }
    if (url.pathname.endsWith(":delete")) {
      assert.equal(init.headers.Authorization, "Bearer owner");
      for (const [email, account] of accounts) {
        if (account.localId === data.localId) {
          accounts.delete(email);
          return json({});
        }
      }
      return json({ error: { message: "USER_NOT_FOUND" } }, 400);
    }
    if (url.pathname.endsWith(":signUp") && accounts.has(data.email)) {
      return json({ error: { message: "EMAIL_EXISTS" } }, 400);
    }
    if (!accounts.has(data.email))
      accounts.set(data.email, {
        localId: "uid-" + (accounts.size + 1),
        idToken: "synthetic-token-" + (accounts.size + 1),
        email: data.email,
      });
    return json(accounts.get(data.email));
  };
  return { database, objects, accounts, requests, transport };
}

test("execution token is inherited and worker incarnations never reuse their resources", (t) => {
  const previous = process.env.VIKES_E2E_EXECUTION;
  delete process.env.VIKES_E2E_EXECUTION;
  t.after(() => {
    if (previous === undefined) delete process.env.VIKES_E2E_EXECUTION;
    else process.env.VIKES_E2E_EXECUTION = previous;
  });
  const execution = initializeExecutionToken();
  assert.equal(initializeExecutionToken(), execution);
  const identities = new Set(
    Array.from({ length: 20 }, () => fixtureIdentity(execution, "0")),
  );
  assert.equal(identities.size, 20);
  assert.notEqual(
    fixtureIdentity(execution, "0").split("-")[0],
    fixtureIdentity("another-run", "0").split("-")[0],
  );
  assert.match(
    fixtureIdentity(execution, "7"),
    /^[a-f0-9]{10}-7-[a-f0-9]{16}$/,
  );
  assert.throws(() => fixtureIdentity(execution, "../worker"), /Invalid/);
  process.env.VIKES_E2E_EXECUTION = "../invalid";
  assert.throws(initializeExecutionToken, /Invalid/);
});

test("the explicit flag is required before every fixture request", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture("flag-check", "0", server.transport);
  const venue = fixture.venue();
  for (const flag of [undefined, "", "false", "TRUE"]) {
    if (flag === undefined) delete process.env.VITE_USE_EMULATOR;
    else process.env.VITE_USE_EMULATOR = flag;
    assert.throws(requireEmulatorSelection, /VITE_USE_EMULATOR=true/);
    await assert.rejects(
      fixture.database("PUT", "states/" + venue, {}),
      /VITE_USE_EMULATOR=true/,
    );
  }
  assert.equal(server.requests.length, 0);
});

test("actual served selection must include both the test project and Auth emulator", () => {
  const target = {
    projectId: "vikes-match-clock-test",
    databaseURL: "http://127.0.0.1:9000?ns=vikes-match-clock-test",
    storageBucket: "vikes-match-clock-test.appspot.com",
    auth: { host: "127.0.0.1", port: 9099, protocol: "http" },
  };
  assert.doesNotThrow(() => assertBrowserEmulatorTarget(target));
  for (const replacement of [
    null,
    {},
    { ...target, projectId: "staging" },
    { ...target, databaseURL: "https://example.test" },
    { ...target, storageBucket: "production.appspot.com" },
    { ...target, auth: null },
    { ...target, auth: { host: "remote", port: 9099, protocol: "http" } },
  ])
    assert.throws(() => assertBrowserEmulatorTarget(replacement));
});

test("literal endpoints reject remote hosts, alternate namespaces/buckets and credentials", () => {
  for (const url of [
    "https://127.0.0.1:9000/states/a.json?ns=vikes-match-clock-test",
    "http://localhost:9000/states/a.json?ns=vikes-match-clock-test",
    "http://127.0.0.1.example.test:9000/states/a.json?ns=vikes-match-clock-test",
    "http://2130706433:9000/states/a.json?ns=vikes-match-clock-test",
    "http://0x7f000001:9000/states/a.json?ns=vikes-match-clock-test",
    "http://127.1:9000/states/a.json?ns=vikes-match-clock-test",
    "http://127.0.0.1:9001/states/a.json?ns=vikes-match-clock-test",
    "http://user:password@127.0.0.1:9000/states/a.json?ns=vikes-match-clock-test",
    "http://127.0.0.1:9000/states/a.json?ns=other",
    "http://127.0.0.1:9000/states/a.json?ns=vikes-match-clock-test&auth=foreign",
    "http://127.0.0.1:9199/v0/b/other.appspot.com/o",
    "http://127.0.0.1:9199/v0/b/vikes-match-clock-test.appspot.com/o-foreign",
    "http://127.0.0.1:9099/emulator/v1/projects/other/accounts",
  ])
    assert.throws(() => assertLocalFixtureUrl(url), /Refusing/);
});

test("collection/root/foreign database mutations are rejected before transport", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture("path-check", "0", server.transport);
  for (const path of [
    "",
    "invitations",
    "locations",
    "states/foreign",
    "auth/foreign",
    "admins/foreign",
    ".settings/rules",
    "states/../foreign",
    "states/%2f",
    "states/a?ns=other",
  ]) {
    await assert.rejects(fixture.database("PUT", path, null), /outside owned/);
  }
  assert.equal(server.requests.length, 0);
});

test("a mixed invitation batch validates every key/email/venue before writing", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture("batch-check", "0", server.transport);
  const venue = fixture.venue();
  const id = fixture.invitationKey("ok");
  const invitation = {
    email: fixture.email("invitee"),
    locations: { [venue]: true },
    createdBy: "synthetic",
    createdAt: 1,
  };
  for (const invalid of [
    { foreign: invitation },
    { [id]: { ...invitation, email: "foreign@example.test" } },
    { [id]: { ...invitation, locations: { foreign: true } } },
    { [id]: invitation, foreign: invitation },
  ])
    await assert.rejects(
      fixture.seedInvitations(invalid),
      /outside fixture ownership/,
    );
  assert.equal(server.requests.length, 0);
});

test("owned setup and teardown preserve a separate fixture including after a failed action", async (t) => {
  enableEmulator(t);
  const server = model();
  const first = new LocalFixture("sentinels", "0", server.transport);
  const foreign = new LocalFixture("sentinels", "0", server.transport);
  const venue = first.venue();
  const other = foreign.venue();
  const uid = await first.createUser(first.email("operator"), "synthetic");
  const otherUid = await foreign.createUser(
    foreign.email("operator"),
    "synthetic",
  );
  const id = first.invitationKey("owned");
  const foreignId = foreign.invitationKey("keep");
  const invitation = {
    email: first.email("invitee"),
    locations: { [venue]: true },
    createdBy: "synthetic",
    createdAt: 1,
  };
  const sentinel = {
    email: foreign.email("invitee"),
    locations: { [other]: true },
    createdBy: "foreign",
    createdAt: 1,
    metadata: { keep: true },
  };
  await foreign.seedInvitations({ [foreignId]: sentinel });
  await foreign.database("PUT", "locations/" + other, { keep: true });
  await foreign.database("PUT", "auth/" + otherUid, { [other]: true });
  server.objects.set(other + "/perimeter/keep.png", { generation: "123" });
  const foreignBefore = [...server.database];
  await first.seedInvitations({ [id]: invitation });
  await first.database("PUT", "states/" + venue, { score: 1 });
  await first.database("PUT", "auth/" + uid, { [venue]: true });
  server.objects.set(venue + "/images/upload.png", { generation: "456" });
  // Model an ID assigned by the real invitation callable.
  server.database.set("invitations/generated-owned-id", {
    ...invitation,
    createdBy: first.email("admin"),
  });
  assert.throws(() => {
    throw new Error("deliberate action failure");
  }, /deliberate/);
  await first.cleanup();
  assert.deepEqual([...server.database], foreignBefore);
  assert.deepEqual(
    [...server.objects],
    [[other + "/perimeter/keep.png", { generation: "123" }]],
  );
  assert.deepEqual([...server.accounts.keys()], [foreign.email("operator")]);
  assert(
    !server.requests.some(
      (request) =>
        request.method !== "GET" &&
        new URL(request.url).pathname === "/invitations.json",
    ),
  );
});

test("RTDB canonicalization model: seeded empty grants read as an empty map and cleanup succeeds", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture(
    "seeded-empty-grants",
    "0",
    server.transport,
  );
  const id = fixture.invitationKey("empty");
  const invitation = {
    email: fixture.email("invitee"),
    // A registered ID does not require an owned creator, unlike discovery.
    createdBy: "seed-creator",
    createdAt: 1,
    locations: {},
  };
  await fixture.seedInvitations({ [id]: invitation });
  const stored = { ...invitation };
  delete stored.locations;
  assert.deepEqual(server.database.get(`invitations/${id}`), stored);
  assert.equal(Object.hasOwn(stored, "locations"), false);
  const read = await fixture.invitations().then(
    (value) => ({ value }),
    (error) => ({ error: error.message }),
  );
  assert.deepEqual(read, { value: { [id]: invitation } });
  await fixture.cleanup();
  await fixture.cleanup();
  assert.equal(server.database.size, 0);
});

test("RTDB canonicalization model: cleanup discovers generated empty grants and later valid siblings, preserving foreign records", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture(
    "generated-empty-grants",
    "0",
    server.transport,
  );
  const email = fixture.email("invitee");
  const createdBy = fixture.email("admin");
  const invitation = { email, createdBy, createdAt: 1, locations: {} };
  const foreign = new Map([
    [
      "invitations/foreign-recipient",
      { ...invitation, email: "foreign@example.test", locations: null },
    ],
    [
      "invitations/foreign-creator",
      { ...invitation, createdBy: "foreign@example.test", locations: [] },
    ],
    [
      "invitations/foreign-both",
      {
        email: "foreign@example.test",
        createdBy: "foreign@example.test",
        metadata: { keep: true },
      },
    ],
  ]);
  // Model completed callable writes through the same canonicalizing transport;
  // their IDs were never registered through invitationKey or seedInvitations.
  const writeGenerated = (id, value) =>
    server.transport(
      `http://127.0.0.1:9000/invitations/${id}.json?ns=vikes-match-clock-test`,
      {
        method: "PUT",
        redirect: "manual",
        signal: AbortSignal.timeout(1000),
        headers: { Authorization: "Bearer owner" },
        body: JSON.stringify(value),
      },
    );
  await writeGenerated("generated-empty", invitation);
  for (const [path, value] of foreign) server.database.set(path, value);
  await writeGenerated("generated-valid", {
    ...invitation,
    locations: { granted: true, denied: false },
  });
  await writeGenerated("generated-empty-later", invitation);
  assert.equal(
    Object.hasOwn(
      server.database.get("invitations/generated-empty"),
      "locations",
    ),
    false,
  );
  for (const id of [
    "generated-empty",
    "generated-valid",
    "generated-empty-later",
  ])
    await assert.rejects(
      fixture.database("DELETE", `invitations/${id}`),
      /outside owned/,
    );
  const failure = await fixture.cleanup().then(
    () => null,
    (error) => error.message,
  );
  assert.deepEqual(
    [...server.database],
    [...foreign],
    "cleanup must leave only foreign records, including after an omitted empty child",
  );
  assert.equal(failure, null);
  await fixture.cleanup();
  assert.deepEqual([...server.database], [...foreign]);
  assert.deepEqual(
    [
      ...new Set(
        server.requests
          .filter((request) => request.method === "DELETE")
          .map((request) => new URL(request.url).pathname),
      ),
    ].sort(),
    [
      "/invitations/generated-empty.json",
      "/invitations/generated-empty-later.json",
      "/invitations/generated-valid.json",
    ].sort(),
  );
});

test("RTDB canonicalization model: malformed present grants fail without acquiring generated ID ownership", async (t) => {
  enableEmulator(t);
  for (const locations of [
    null,
    [],
    "",
    0,
    false,
    { venue: "true" },
    { venue: null },
  ]) {
    const server = model();
    const fixture = new LocalFixture(
      "malformed-present-grants",
      "0",
      server.transport,
    );
    const invitation = {
      email: fixture.email("invitee"),
      createdBy: fixture.email("admin"),
      createdAt: 1,
      locations,
    };
    server.database.set("invitations/generated-malformed", invitation);
    const before = [...server.database];
    await assert.rejects(fixture.invitations(), /Invalid .*fixture/);
    await assert.rejects(
      fixture.database("DELETE", "invitations/generated-malformed"),
      /outside owned/,
    );
    await assert.rejects(fixture.cleanup(), /Invalid .*fixture/);
    assert.deepEqual([...server.database], before);
    assert(!server.requests.some((request) => request.method === "DELETE"));
  }
});

test("invitation ownership: a registered ID still requires its owned recipient", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture(
    "registered-recipient",
    "0",
    server.transport,
  );
  const id = fixture.invitationKey("registered");
  server.database.set(`invitations/${id}`, {
    email: "foreign@example.test",
    createdBy: fixture.email("admin"),
    createdAt: 1,
  });
  assert.deepEqual(await fixture.invitations(), {});
});

test("unexpected HTTP and transport errors fail with sanitized diagnostics", async (t) => {
  enableEmulator(t);
  for (const transport of [
    async () => json({ private: "must-not-appear" }, 500),
    async () => {
      throw new Error("must-not-appear in URL/password/token");
    },
    async () => new Response("must-not-appear invalid JSON"),
  ]) {
    const fixture = new LocalFixture("error-check", "0", transport);
    const venue = fixture.venue();
    await assert.rejects(
      fixture.database("PUT", "states/" + venue, {}),
      (error) => {
        assert(!error.message.includes("must-not-appear"));
        return /Local fixture/.test(error.message);
      },
    );
  }
});

test("redirects are not followed and cannot forward owner credentials", async (t) => {
  enableEmulator(t);
  let calls = 0;
  const fixture = new LocalFixture(
    "redirect-check",
    "0",
    async (_url, init) => {
      calls++;
      assert.equal(init.redirect, "manual");
      return new Response(null, {
        status: 307,
        headers: { Location: "https://example.test/secret" },
      });
    },
  );
  await assert.rejects(
    fixture.database("PUT", "states/" + fixture.venue(), {}),
    /transport.response failed/,
  );
  assert.equal(calls, 1);
});

test("signup handles only EMAIL_EXISTS and validates real account identifiers", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture("signup-check", "0", server.transport);
  const email = fixture.email("operator");
  const uid = await fixture.createUser(email, "synthetic");
  assert.equal(await fixture.createUser(email, "synthetic"), uid);
  assert.equal(
    server.requests.filter((request) =>
      request.url.includes("signInWithPassword"),
    ).length,
    1,
  );
  await assert.rejects(
    fixture.createUser("foreign@example.test", "synthetic"),
    /outside owned/,
  );
  for (const response of [
    json({ error: { message: "INVALID_PASSWORD" } }, 400),
    json({ error: { message: "must-not-appear" } }, 503),
    json({ localId: "../foreign", idToken: "synthetic", email }),
    json({ localId: "uid", idToken: "", email }),
    json({
      localId: "uid",
      idToken: "synthetic",
      email: "foreign@example.test",
    }),
  ]) {
    let count = 0;
    const invalid = new LocalFixture("invalid-signup", "0", async () => {
      count++;
      return response;
    });
    const ownEmail = invalid.email("operator");
    await assert.rejects(
      invalid.createUser(ownEmail, "synthetic"),
      (error) => !error.message.includes("must-not-appear"),
    );
    assert.equal(count, 1);
  }
});

test("cleanup continues after a failed owned delete without touching foreign resources", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture("cleanup-error", "0", async (url, init) => {
    if (
      init.method === "DELETE" &&
      new URL(url).pathname.startsWith("/states/")
    )
      return json({ private: "must-not-appear" }, 503);
    return server.transport(url, init);
  });
  const venue = fixture.venue();
  const uid = await fixture.createUser(fixture.email("operator"), "synthetic");
  await fixture.database("PUT", "states/" + venue, { keepOnFailure: true });
  await fixture.database("PUT", "auth/" + uid, {});
  await fixture.database("PUT", "locations/" + venue, {});
  server.database.set("locations/foreign", { keep: true });
  await assert.rejects(fixture.cleanup(), /HTTP 503/);
  assert.deepEqual(server.database.get("locations/foreign"), { keep: true });
  assert(!server.database.has("locations/" + venue));
  assert.equal(server.accounts.size, 0);
});

test("transport model: repeated cleanup accepts only checked absence of its owned account", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture("repeat-cleanup", "0", server.transport);
  const uid = await fixture.createUser(fixture.email("operator"), "synthetic");
  await fixture.database("PUT", `auth/${uid}`, { owned: true });
  await fixture.database("PUT", `admins/${uid}`, true);
  await fixture.cleanup();
  await fixture.cleanup();
  assert.equal(server.accounts.size, 0);
  assert.equal(server.database.size, 0);
  assert.deepEqual(
    server.requests
      .filter((request) => request.url.includes(":delete"))
      .map((request) => request.data),
    [{ localId: uid }, { localId: uid }],
  );
});

for (const area of ["auth", "admins"]) {
  test(`transport model: retry removes failed ${area} after Auth deletion without losing ownership`, async (t) => {
    enableEmulator(t);
    const server = model();
    let failRemoval = true;
    const fixture = new LocalFixture("partial-cleanup", "0", (url, init) => {
      if (
        failRemoval &&
        init.method === "DELETE" &&
        new URL(url).pathname.startsWith(`/${area}/`)
      )
        return Promise.resolve(json({ error: "private-failure" }, 503));
      return server.transport(url, init);
    });
    const email = fixture.email("operator");
    const uid = await fixture.createUser(email, "synthetic");
    const foreign = new LocalFixture("foreign-cleanup", "0", server.transport);
    const foreignEmail = foreign.email("operator");
    const foreignUid = await foreign.createUser(foreignEmail, "synthetic");
    await foreign.database("PUT", `auth/${foreignUid}`, { keep: true });
    await foreign.database("PUT", `admins/${foreignUid}`, true);
    const foreignBefore = [...server.database];
    await fixture.database("PUT", `auth/${uid}`, { owned: true });
    await fixture.database("PUT", `admins/${uid}`, true);
    await assert.rejects(fixture.cleanup(), /HTTP 503/);
    assert.equal(server.accounts.has(email), false, "Auth delete succeeded");
    assert(server.database.has(`${area}/${uid}`), "failed record remains");
    failRemoval = false;
    await fixture.cleanup();
    await fixture.cleanup();
    assert.deepEqual([...server.database], foreignBefore);
    assert.deepEqual([...server.accounts.keys()], [foreignEmail]);
    assert.deepEqual(
      server.requests
        .filter((request) => request.url.includes(":delete"))
        .map((request) => request.data.localId),
      [uid, uid, uid],
      "only the owned UID is retried",
    );
  });
}

test("transport model: other Auth delete errors remain fatal and can be retried", async (t) => {
  enableEmulator(t);
  for (const [body, status] of [
    [{ error: { message: "MISSING_ID_TOKEN" } }, 400],
    [{ error: { message: "PROJECT_DISABLED" } }, 400],
    [{ error: { message: "USER_NOT_FOUND : unexpected detail" } }, 400],
    [{ message: "USER_NOT_FOUND" }, 400],
    [{ error: ["USER_NOT_FOUND"] }, 400],
    [{ error: { message: "USER_NOT_FOUND" } }, 500],
  ]) {
    const server = model();
    let failRemoval = true;
    const fixture = new LocalFixture("delete-negative", "0", (url, init) => {
      if (failRemoval && url.includes(":delete"))
        return Promise.resolve(json(body, status));
      return server.transport(url, init);
    });
    const email = fixture.email("operator");
    await fixture.createUser(email, "synthetic");
    await assert.rejects(fixture.cleanup(), /local fixture/i);
    assert(server.accounts.has(email));
    failRemoval = false;
    await fixture.cleanup();
    assert.equal(server.accounts.size, 0);
  }
});

for (const committed of [false, true]) {
  test(`transport model: lost Auth deletion response (committed=${committed}) fails, then converges`, async (t) => {
    enableEmulator(t);
    const server = model();
    let loseResponse = true;
    const fixture = new LocalFixture("delete-loss", "0", async (url, init) => {
      if (loseResponse && url.includes(":delete")) {
        if (committed) await server.transport(url, init);
        throw new Error("private-delete-transport");
      }
      return server.transport(url, init);
    });
    const email = fixture.email("operator");
    await fixture.createUser(email, "synthetic");
    await assert.rejects(fixture.cleanup(), (error) => {
      assert(!error.message.includes("private"));
      return /transport\/response failed/.test(error.message);
    });
    assert.equal(server.accounts.has(email), !committed);
    loseResponse = false;
    await fixture.cleanup();
    assert.equal(server.accounts.size, 0);
  });
}

test("Storage cleanup rejects a foreign object returned by a faulty listing", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture(
    "storage-negative",
    "0",
    async (url, init) => {
      if (new URL(url).port === "9199" && init.method === "GET")
        return json({ items: [{ name: "foreign/keep.png" }] });
      return server.transport(url, init);
    },
  );
  fixture.venue();
  await assert.rejects(fixture.cleanup(), /unowned fixture Storage object/);
  assert(
    !server.requests.some(
      (request) =>
        new URL(request.url).port === "9199" && request.method === "DELETE",
    ),
  );
});

test("transport model: committed signup response loss reconciles UID, grants and admin records", async (t) => {
  enableEmulator(t);
  for (const loss of ["transport", "parse", "shape"]) {
    const server = model();
    const foreign = new LocalFixture(
      "signup-loss-foreign",
      "0",
      server.transport,
    );
    const foreignEmail = foreign.email("operator");
    const foreignUid = await foreign.createUser(foreignEmail, "synthetic");
    await foreign.database("PUT", `admins/${foreignUid}`, true);
    const fixture = new LocalFixture("signup-loss", "0", async (url, init) => {
      const response = await server.transport(url, init);
      if (url.includes(":signUp")) {
        const account = server.accounts.get(JSON.parse(init.body).email);
        server.database.set(`auth/${account.localId}`, { owned: true });
        server.database.set(`admins/${account.localId}`, true);
        if (loss === "transport") throw new Error("private-response-loss");
        if (loss === "parse") return new Response("private-invalid-json");
        return json({ email: account.email, localId: "invalid/uid" });
      }
      return response;
    });
    const email = fixture.email("operator");
    await assert.rejects(fixture.createUser(email, "synthetic"), (error) => {
      assert(!error.message.includes("private"));
      return true;
    });
    assert(server.accounts.has(email), "signup committed before response loss");
    await fixture.cleanup();
    assert.deepEqual([...server.accounts.keys()], [foreignEmail]);
    assert.deepEqual([...server.database], [[`admins/${foreignUid}`, true]]);
    const lookups = server.requests.filter((request) =>
      request.url.includes(":lookup"),
    );
    assert.deepEqual(
      lookups.map((request) => request.data),
      [{ email: [email] }],
    );
    assert(
      !server.requests.some((request) => request.url.includes("/emulator/")),
    );
  }
});

test("transport model: an absent account cannot settle an ambiguous signup", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture("signup-absent", "0", (url, init) => {
    if (url.includes(":signUp")) return Promise.reject(new Error("private"));
    return server.transport(url, init);
  });
  await assert.rejects(
    fixture.createUser(fixture.email("operator"), "synthetic"),
  );
  await assert.rejects(
    fixture.cleanup(),
    /cleanup incomplete.*unresolved submitted mutation/,
  );
  assert.equal(server.accounts.size, 0);
});

test("transport model: uncertain signup lookup rejects foreign identities and checked API failures", async (t) => {
  enableEmulator(t);
  for (const lookup of [
    json({ users: [{ email: "foreign@example.test", localId: "foreign" }] }),
    json({ users: [{ email: "foreign@example.test", localId: "../foreign" }] }),
    json({ users: [{}, {}] }),
    json({ private: "private-response" }, 503),
    new Response("private-invalid-json"),
  ]) {
    const server = model();
    const fixture = new LocalFixture("bad-lookup", "0", (url, init) => {
      if (url.includes(":signUp")) return Promise.reject(new Error("private"));
      if (url.includes(":lookup")) return Promise.resolve(lookup);
      return server.transport(url, init);
    });
    await assert.rejects(
      fixture.createUser(fixture.email("operator"), "synthetic"),
    );
    await assert.rejects(fixture.cleanup(), (error) => {
      assert(!error.message.includes("private"));
      return /fixture/.test(error.message);
    });
    assert(!server.requests.some((request) => request.url.includes(":delete")));
  }
});

test("transport model: teardown waits for a submitted signup before reconciling its lost response", async (t) => {
  enableEmulator(t);
  const server = model();
  const committed = Promise.withResolvers();
  const release = Promise.withResolvers();
  const fixture = new LocalFixture(
    "signup-late-loss",
    "0",
    async (url, init) => {
      const response = await server.transport(url, init);
      if (url.includes(":signUp")) {
        committed.resolve();
        await release.promise;
        throw new Error("private-response-loss");
      }
      return response;
    },
  );
  const email = fixture.email("operator");
  const signup = assert.rejects(fixture.createUser(email, "synthetic"));
  await committed.promise;
  const cleanup = fixture.cleanup();
  await new Promise(setImmediate);
  const discoveredEarly = server.requests.some((request) =>
    request.url.includes("/invitations.json"),
  );
  release.resolve();
  await signup;
  await cleanup;
  assert.equal(
    discoveredEarly,
    false,
    "discovery must follow submitted signup completion",
  );
  assert.equal(server.accounts.size, 0);
});

test("transport model: a submitted mutation that cannot finish fails the bounded teardown", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture("unsettled", "0", server.transport);
  const release = Promise.withResolvers();
  const producer = fixture.trackMutation(() => release.promise);
  const cleanup = fixture.cleanup(30);
  await assert.rejects(cleanup, /completion deadline expired/);
  release.resolve();
  await producer;
  const before = server.requests.length;
  assert.throws(() => fixture.venue(), /retiring/);
  await assert.rejects(fixture.database("PUT", "states/foreign", {}));
  await assert.rejects(
    fixture.trackMutation(() => server.transport("unused", {})),
    /retiring/,
  );
  assert.equal(server.requests.length, before);
});

test("transport model: ambiguous mutation response fails cleanup even if discovery is empty", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture("ambiguous", "0", server.transport);
  await assert.rejects(
    fixture.trackMutation(() => Promise.reject(new Error("private"))),
  );
  await assert.rejects(
    fixture.cleanup(),
    /cleanup incomplete.*unresolved submitted mutation/,
  );
});

test("transport model: teardown drains an entire submitted seed batch before final discovery", async (t) => {
  enableEmulator(t);
  const server = model();
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  let first = true;
  const fixture = new LocalFixture("seed-late", "0", async (url, init) => {
    if (init.method === "PUT" && first) {
      first = false;
      entered.resolve();
      await release.promise;
    }
    return server.transport(url, init);
  });
  const invitation = {
    email: fixture.email("invitee"),
    createdBy: fixture.email("admin"),
    createdAt: 1,
    locations: {},
  };
  const batch = fixture.seedInvitations({
    [fixture.invitationKey("first")]: invitation,
    [fixture.invitationKey("last")]: invitation,
  });
  await entered.promise;
  const cleanup = fixture.cleanup();
  await new Promise(setImmediate);
  assert.equal(server.requests.length, 0);
  release.resolve();
  await batch;
  await cleanup;
  assert.equal(server.database.size, 0);
});

test("transport model: an unresolved signup cannot start another producer for the same email", async (t) => {
  enableEmulator(t);
  const server = model();
  const fixture = new LocalFixture("signup-retry", "0", async (url, init) => {
    const response = await server.transport(url, init);
    if (url.includes(":signUp")) throw new Error("private-response-loss");
    return response;
  });
  const email = fixture.email("operator");
  await assert.rejects(fixture.createUser(email, "synthetic"));
  const before = server.requests.length;
  await assert.rejects(
    fixture.createUser(email, "synthetic"),
    /creation is unresolved/,
  );
  assert.equal(server.requests.length, before);
  await fixture.cleanup();
  assert.equal(server.accounts.size, 0);
});
