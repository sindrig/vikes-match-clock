import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_ERROR_CODES,
  normalizeBrightness,
  parseBrightnessCommand,
  percentToFraction,
  VnnoxClient,
} from "../vnnox.js";
import { validateBrightnessConfig } from "../brightness.js";

const PERIMETER_GUID = "75f3072e-4940-4682-a91c-44edf697b1ca";
const MVR_GUID = "7a794be7-95b2-42d2-8f8b-2b0b5397b480";

function makeConfig(overrides = {}) {
  return {
    vnnoxBaseUrl: "http://localhost:81",
    vnnoxIp: "10.182.45.40",
    vnnoxPort: "8088",
    vnnoxProtocol: "http",
    vnnoxSerial: "26126A000018457",
    vnnoxProjectId: "defaultProject-vx",
    vnnoxPerimeterGuid: PERIMETER_GUID,
    vnnoxUsername: "admin",
    vnnoxPasswordSource: "env",
    vnnoxPassword: "123456",
    vnnoxPasswordFile: null,
    vnnoxTimeoutMs: 1_000,
    ...overrides,
  };
}

function jsonResponse(json, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  };
}

// A handler that answers login, screen reads, cabinet reads, and brightness
// writes by default. `respond` can short-circuit any request; returning
// undefined falls through to the defaults.
function mockVnnox(t, respond) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const method = options?.method ?? "GET";
    const body = options?.body ? JSON.parse(options.body) : undefined;
    const req = { url, method, body, headers: options?.headers };
    calls.push(req);
    if (typeof respond === "function") {
      const custom = await respond(req);
      if (custom) return custom;
    }
    if (url.endsWith("/system/auth/login")) {
      return jsonResponse({
        code: 0,
        data: { token: "jwt-token" },
      });
    }
    if (url.includes("/ucenter/screen/normal-screen")) {
      return jsonResponse({
        code: 0,
        data: {
          list: [
            {
              name: "System 1",
              deviceList: [
                {
                  guid: MVR_GUID,
                  screenInfo: {
                    adjustment: { brightness: { ratio: 0, ratioScale: 0 } },
                  },
                },
              ],
            },
            {
              name: "Perimeter Knattspyrna",
              deviceList: [
                {
                  guid: PERIMETER_GUID,
                  screenInfo: {
                    adjustment: {
                      brightness: { ratio: 450, ratioScale: 10000 },
                    },
                  },
                },
              ],
            },
          ],
        },
      });
    }
    if (url.endsWith("/cabinet/info-v2")) {
      return jsonResponse({
        code: 0,
        data: [
          {
            cabinetDisplayParam: {
              brightness: { ratio: 450, ratioScale: 10000 },
            },
          },
          {
            cabinetDisplayParam: {
              brightness: { ratio: 450, ratioScale: 10000 },
            },
          },
        ],
      });
    }
    if (url.endsWith("/ucenter/cabinet/brightness")) {
      return jsonResponse({ code: 0, data: {} });
    }
    return jsonResponse({ code: 0, data: {} });
  });
  return calls;
}

// -- parseBrightnessCommand ---------------------------------------------------

test("parseBrightnessCommand accepts whole percentages 0..100", () => {
  assert.equal(parseBrightnessCommand(0), 0);
  assert.equal(parseBrightnessCommand(50), 50);
  assert.equal(parseBrightnessCommand(100), 100);
});

test("parseBrightnessCommand treats null/undefined as no command", () => {
  assert.equal(parseBrightnessCommand(null), null);
  assert.equal(parseBrightnessCommand(undefined), null);
});

test("parseBrightnessCommand rejects malformed or out-of-range values", () => {
  assert.equal(parseBrightnessCommand(-1), null);
  assert.equal(parseBrightnessCommand(101), null);
  assert.equal(parseBrightnessCommand(4.5), null);
  assert.equal(parseBrightnessCommand("50"), null);
  assert.equal(parseBrightnessCommand({}), null);
  assert.equal(parseBrightnessCommand(Number.NaN), null);
  assert.equal(parseBrightnessCommand(Number.POSITIVE_INFINITY), null);
});

// -- scale conversions --------------------------------------------------------

test("percentToFraction converts a percentage to the 0..1 write scale", () => {
  assert.equal(percentToFraction(0), 0);
  assert.equal(percentToFraction(4), 0.04);
  assert.equal(percentToFraction(50), 0.5);
  assert.equal(percentToFraction(100), 1);
});

test("percentToFraction rejects values outside 0..100 or non-integers", () => {
  assert.throws(() => percentToFraction(-1), /invalid brightness percentage/);
  assert.throws(() => percentToFraction(101), /invalid brightness percentage/);
  assert.throws(() => percentToFraction(4.5), /invalid brightness percentage/);
});

test("normalizeBrightness converts a 10000-scaled read to a percentage", () => {
  assert.deepEqual(
    normalizeBrightness({ ratio: 450, ratioScale: 10000, nitType: 0, nit: 0 }),
    { percent: 4.5, ratio: 450, ratioScale: 10000, nitType: 0, nit: 0 },
  );
});

test("normalizeBrightness fails safely on zero or missing scales", () => {
  assert.throws(
    () => normalizeBrightness({ ratio: 0, ratioScale: 0 }),
    /invalid scale/,
  );
  assert.throws(() => normalizeBrightness({ ratio: 450 }), /invalid scale/);
  assert.throws(() => normalizeBrightness(null), /missing/);
  assert.throws(
    () => normalizeBrightness({ ratio: 450, ratioScale: Number.NaN }),
    /invalid scale/,
  );
});

// -- login --------------------------------------------------------------------

test("login posts the base64 password with the device headers", async (t) => {
  const calls = mockVnnox(t);
  const client = new VnnoxClient(makeConfig());
  await client.login();
  const login = calls[0];
  assert.equal(login.method, "POST");
  assert.equal(login.url, "http://localhost:81/unico/v1/system/auth/login");
  assert.deepEqual(login.body, {
    username: "admin",
    password: Buffer.from("123456", "utf8").toString("base64"),
  });
  assert.equal(login.headers["Content-Type"], "application/json");
  assert.equal(login.headers.ip, "10.182.45.40");
  assert.equal(login.headers.port, "8088");
  assert.equal(login.headers.protocol, "http");
});

test("login resolves the password from a file source", async (t) => {
  const calls = mockVnnox(t);
  const client = new VnnoxClient(
    makeConfig({
      vnnoxPasswordSource: "file",
      vnnoxPassword: null,
      vnnoxPasswordFile: "./tests/fixtures/vnnox-password.txt",
    }),
  );
  await client.login();
  assert.equal(
    calls[0].body.password,
    Buffer.from("s3cret", "utf8").toString("base64"),
  );
});

test("login throws when the response has no token", async (t) => {
  mockVnnox(t, (req) => {
    if (req.url.endsWith("/system/auth/login")) {
      return jsonResponse({ code: 0, data: {} });
    }
    return undefined;
  });
  const client = new VnnoxClient(makeConfig());
  await assert.rejects(() => client.login(), /no token/);
});

test("login throws on a nonzero response code", async (t) => {
  mockVnnox(t, (req) => {
    if (req.url.endsWith("/system/auth/login")) {
      return jsonResponse({ code: 500, data: {} });
    }
    return undefined;
  });
  const client = new VnnoxClient(makeConfig());
  await assert.rejects(() => client.login(), /code 500/);
});

test("login fails when the env password is missing", async (t) => {
  const client = new VnnoxClient(makeConfig({ vnnoxPassword: null }));
  await assert.rejects(() => client.login(), /PERIMETER_VNNOX_PASSWORD/);
});

// -- screen reads -------------------------------------------------------------

test("readScreenBrightness finds the configured GUID and sends sn + token", async (t) => {
  const calls = mockVnnox(t);
  const client = new VnnoxClient(makeConfig());
  const read = await client.readScreenBrightness();
  assert.equal(read.percent, 4.5);
  const screenCall = calls.find((c) =>
    c.url.includes("/ucenter/screen/normal-screen"),
  );
  assert.equal(screenCall.headers.sn, "26126A000018457");
  assert.equal(screenCall.headers.Authorization, "jwt-token");
  assert.equal(screenCall.headers.ip, "10.182.45.40");
  assert.equal(
    screenCall.url,
    "http://localhost:81/unico/v1/ucenter/screen/normal-screen?projectId=defaultProject-vx",
  );
});

test("readScreenBrightness never falls back to another screen when the GUID is absent", async (t) => {
  mockVnnox(t, (req) => {
    if (req.url.includes("/ucenter/screen/normal-screen")) {
      // Only the MVR screen exists on this device.
      return jsonResponse({
        code: 0,
        data: {
          list: [
            {
              name: "System 1",
              deviceList: [
                {
                  guid: MVR_GUID,
                  screenInfo: {
                    adjustment: { brightness: { ratio: 0, ratioScale: 0 } },
                  },
                },
              ],
            },
          ],
        },
      });
    }
    return undefined;
  });
  const client = new VnnoxClient(makeConfig());
  await assert.rejects(() => client.readScreenBrightness(), /GUID not found/);
});

test("readScreenBrightness fails safely on the MVR-style zero scale", async (t) => {
  mockVnnox(t, (req) => {
    if (req.url.includes("/ucenter/screen/normal-screen")) {
      return jsonResponse({
        code: 0,
        data: {
          list: [
            {
              name: "Target",
              deviceList: [
                {
                  guid: PERIMETER_GUID,
                  screenInfo: {
                    adjustment: { brightness: { ratio: 0, ratioScale: 0 } },
                  },
                },
              ],
            },
          ],
        },
      });
    }
    return undefined;
  });
  const client = new VnnoxClient(makeConfig());
  await assert.rejects(() => client.readScreenBrightness(), /invalid scale/);
});

test("readScreens lists every discovered screen with its guid", async (t) => {
  mockVnnox(t);
  const client = new VnnoxClient(makeConfig());
  const screens = await client.readScreens();
  assert.equal(screens.length, 2);
  assert.ok(screens.some((s) => s.guid === PERIMETER_GUID));
  assert.ok(screens.some((s) => s.guid === MVR_GUID));
});

// -- brightness write ---------------------------------------------------------

test("writeBrightness issues a fraction write scoped to exactly one guid", async (t) => {
  const calls = mockVnnox(t);
  const client = new VnnoxClient(makeConfig());
  await client.writeBrightness(4);
  const write = calls.find((c) =>
    c.url.endsWith("/ucenter/cabinet/brightness"),
  );
  assert.equal(write.method, "POST");
  assert.deepEqual(write.body, {
    brightness: { nitType: 0, ratioScale: 1, ratio: 0.04, nit: 0 },
    list: [],
    guidList: [PERIMETER_GUID],
  });
  assert.equal(write.headers.Authorization, "jwt-token");
  assert.equal(write.headers["Content-Type"], "application/json");
  // Exactly one GUID — never an all-screen or MVR-inclusive write.
  assert.equal(write.body.guidList.length, 1);
  assert.equal(write.body.guidList[0], PERIMETER_GUID);
});

test("writeBrightness rejects invalid percentages before any request", async (t) => {
  const calls = mockVnnox(t);
  const client = new VnnoxClient(makeConfig());
  await assert.rejects(() => client.writeBrightness(150), /invalid brightness/);
  assert.equal(calls.length, 0);
});

test("restoreBrightness writes the exact snapshot ratio and ratioScale", async (t) => {
  const calls = mockVnnox(t);
  const client = new VnnoxClient(makeConfig());
  await client.restoreBrightness({
    ratio: 450,
    ratioScale: 10000,
    nitType: 0,
    nit: 0,
  });
  const write = calls.find((c) =>
    c.url.endsWith("/ucenter/cabinet/brightness"),
  );
  assert.deepEqual(write.body.brightness, {
    nitType: 0,
    ratioScale: 10000,
    ratio: 450,
    nit: 0,
  });
  assert.deepEqual(write.body.guidList, [PERIMETER_GUID]);
});

test("restoreBrightness refuses a missing snapshot", async (t) => {
  const calls = mockVnnox(t);
  const client = new VnnoxClient(makeConfig());
  await assert.rejects(
    () => client.restoreBrightness(null),
    /no brightness snapshot/,
  );
  assert.equal(calls.length, 0);
});

test("write response with a nonzero code throws", async (t) => {
  mockVnnox(t, (req) => {
    if (req.url.endsWith("/ucenter/cabinet/brightness")) {
      return jsonResponse({ code: 8273, data: {} });
    }
    return undefined;
  });
  const client = new VnnoxClient(makeConfig());
  await assert.rejects(() => client.writeBrightness(4), /code 8273/);
});

// -- token handling -----------------------------------------------------------

test("authed calls reuse the token; each device request carries the base headers", async (t) => {
  const calls = mockVnnox(t);
  const client = new VnnoxClient(makeConfig());
  await client.readCabinets();
  await client.readScreenBrightness();
  const logins = calls.filter((c) => c.url.endsWith("/system/auth/login"));
  assert.equal(logins.length, 1);
  for (const call of calls) {
    if (!call.url.endsWith("/system/auth/login")) {
      assert.equal(call.headers.Authorization, "jwt-token");
      assert.equal(call.headers.ip, "10.182.45.40");
    }
  }
});

test("an HTTP 401 clears the token and the next call re-logs in", async (t) => {
  const calls = mockVnnox(t, (req) => {
    if (req.url.endsWith("/system/auth/login")) {
      return jsonResponse({ code: 0, data: { token: "jwt-token" } });
    }
    if (req.url.endsWith("/cabinet/info-v2") && req.headers.Authorization) {
      return { ok: false, status: 401, json: async () => ({}) };
    }
    return undefined;
  });
  const client = new VnnoxClient(makeConfig());
  await assert.rejects(() => client.readCabinets(), /HTTP 401/);
  // The token was cleared, so the next request must re-login first.
  const screens = await client.readScreenBrightness();
  assert.equal(screens.percent, 4.5);
  const logins = calls.filter((c) => c.url.endsWith("/system/auth/login"));
  assert.equal(logins.length, 2);
});

test("auth-failure response codes are recognized as token problems", () => {
  assert.ok(AUTH_ERROR_CODES.has(401));
  assert.ok(AUTH_ERROR_CODES.has(403));
  assert.ok(AUTH_ERROR_CODES.has(8273));
});

// -- configuration ------------------------------------------------------------

test("validateBrightnessConfig reports missing GUID and serial", () => {
  assert.match(
    validateBrightnessConfig(makeConfig({ vnnoxPerimeterGuid: null })),
    /vnnoxPerimeterGuid/,
  );
  assert.match(
    validateBrightnessConfig(makeConfig({ vnnoxSerial: "" })),
    /vnnoxSerial/,
  );
});

test("validateBrightnessConfig reports an unsatisfiable password source", () => {
  assert.match(
    validateBrightnessConfig(makeConfig({ vnnoxPassword: null })),
    /PERIMETER_VNNOX_PASSWORD/,
  );
  assert.match(
    validateBrightnessConfig(
      makeConfig({ vnnoxPasswordSource: "file", vnnoxPasswordFile: null }),
    ),
    /PERIMETER_VNNOX_PASSWORD_FILE/,
  );
  assert.match(
    validateBrightnessConfig(makeConfig({ vnnoxPasswordSource: "keyring" })),
    /unknown Vnnox password source/,
  );
});

test("validateBrightnessConfig accepts a complete configuration", () => {
  assert.equal(validateBrightnessConfig(makeConfig()), null);
});
