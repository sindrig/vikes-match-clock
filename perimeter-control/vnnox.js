/**
 * Vnnox/UCenter perimeter brightness client.
 *
 * Talks to the Nova UCenter service documented in `vnnox-brightness.md`, which
 * is what controls the perimeter LED screens. All hardware knowledge lives
 * here and nowhere else.
 *
 * Auth is per-device: login posts to `/unico/v1/system/auth/login` carrying
 * the target device's `ip`/`port`/`protocol` headers and the password
 * base64-encoded in the body; the returned JWT is sent as `Authorization` on
 * every later call along with the same device headers (`sn` for screen reads).
 *
 * Scales are asymmetric: reads return an integer scaled by `ratioScale`
 * (`ratio / ratioScale`), while writes take a 0--1 fraction with
 * `ratioScale: 1`. Every write is scoped with exactly the configured perimeter
 * screen GUID so no other screen (e.g. the MVR screen) is ever targeted.
 */

import { readFile } from "node:fs/promises";

// Response `code` values Vnnox returns for auth failures / rejected tokens
// (observed: 8273 when a token is used against the wrong device).
export const AUTH_ERROR_CODES = new Set([401, 403, 8273]);

// Parse the brightness command value written by the controller to
// `states/{location}/perimeter/brightness`. Accepts only whole percentages
// from 0 through 100; `null`/missing means "no command" and must never touch
// a live screen. Everything else is invalid and returns null.
export function parseBrightnessCommand(data) {
  if (data === null || data === undefined) return null;
  if (typeof data !== "number") return null;
  if (!Number.isInteger(data)) return null;
  if (data < 0 || data > 100) return null;
  return data;
}

// Convert a whole percentage (0..100) to the Vnnox write fraction.
// The write endpoint expects `ratio` as a 0--1 fraction with `ratioScale: 1`;
// copying a 10000-scaled read value straight into a write would be ~10000x
// too bright, so this conversion is the single tested boundary for writers.
export function percentToFraction(percent) {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new Error(
      `invalid brightness percentage: ${JSON.stringify(percent)}`,
    );
  }
  return percent / 100;
}

// Normalize a raw Vnnox brightness object into { percent, ratio, ratioScale,
// nit, nitType }. Fails safely (throws) on a missing, non-finite, or zero
// ratioScale — that would otherwise divide by zero or produce a bogus value.
export function normalizeBrightness(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Vnnox brightness value is missing");
  }
  const ratio = raw.ratio;
  const ratioScale = raw.ratioScale;
  if (
    !Number.isFinite(ratio) ||
    !Number.isFinite(ratioScale) ||
    ratioScale <= 0
  ) {
    throw new Error(
      `Vnnox brightness has an invalid scale (ratio=${ratio}, ratioScale=${ratioScale})`,
    );
  }
  return {
    percent: (ratio * 100) / ratioScale,
    ratio,
    ratioScale,
    nit: typeof raw.nit === "number" ? raw.nit : 0,
    nitType: typeof raw.nitType === "number" ? raw.nitType : 0,
  };
}

// Recursively find the node whose `guid` matches the configured perimeter
// screen GUID somewhere inside the `normal-screen` payload, never guessing at
// the exact nesting the UCenter version uses.
function findByGuid(node, targetGuid) {
  if (node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findByGuid(item, targetGuid);
      if (found) return found;
    }
    return null;
  }
  if (typeof node.guid === "string" && node.guid === targetGuid) return node;
  for (const [key, value] of Object.entries(node)) {
    if (key === "guid") continue;
    const found = findByGuid(value, targetGuid);
    if (found) return found;
  }
  return null;
}

export class VnnoxClient {
  constructor(config) {
    this.config = config;
    this._token = null;
  }

  _baseUrl() {
    return this.config.vnnoxBaseUrl.replace(/\/+$/, "");
  }

  // Device-targeting headers every UCenter call carries. `protocol` is the
  // linkType ("http"), not the G4A protocolType.
  _baseHeaders() {
    return {
      "Content-Type": "application/json",
      Connection: "close",
      ip: this.config.vnnoxIp,
      port: this.config.vnnoxPort,
      protocol: this.config.vnnoxProtocol,
    };
  }

  _requireSerial() {
    const serial = this.config.vnnoxSerial;
    if (!serial || typeof serial !== "string") {
      throw new Error(
        "Vnnox device serial number is not configured (PERIMETER_VNNOX_SN)",
      );
    }
    return serial;
  }

  _requirePerimeterGuid() {
    const guid = this.config.vnnoxPerimeterGuid;
    if (!guid || typeof guid !== "string") {
      throw new Error(
        "Vnnox perimeter screen GUID is not configured (PERIMETER_VNNOX_PERIMETER_GUID)",
      );
    }
    return guid;
  }

  // Resolve the plaintext password from the configured source. "env" reads
  // PERIMETER_VNNOX_PASSWORD; "file" reads the first line of
  // PERIMETER_VNNOX_PASSWORD_FILE. No tracked default for the secret itself.
  async _resolvePassword() {
    const source = this.config.vnnoxPasswordSource;
    if (source === "env") {
      if (!this.config.vnnoxPassword) {
        throw new Error(
          "Vnnox password source is env but PERIMETER_VNNOX_PASSWORD is not set",
        );
      }
      return this.config.vnnoxPassword;
    }
    if (source === "file") {
      if (!this.config.vnnoxPasswordFile) {
        throw new Error(
          "Vnnox password source is file but PERIMETER_VNNOX_PASSWORD_FILE is not set",
        );
      }
      const raw = await readFile(this.config.vnnoxPasswordFile, "utf8");
      return raw.replace(/\r?\n$/, "");
    }
    throw new Error(`unknown Vnnox password source: ${JSON.stringify(source)}`);
  }

  async _request(method, pathname, options = {}) {
    const { search = "", body = null } = options;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.vnnoxTimeoutMs,
    );
    const url = `${this._baseUrl()}${pathname}${search}`;
    const headers = { ...this._baseHeaders(), ...(options.headers || {}) };
    if (options.authed) {
      if (!this._token) await this.login();
      headers.Authorization = this._token;
    }
    const init = { method, headers, signal: controller.signal };
    if (body !== null) init.body = JSON.stringify(body);
    try {
      let response;
      try {
        response = await fetch(url, init);
      } catch (err) {
        throw new Error(
          `Vnnox ${method} ${pathname} request failed: ${err.message}`,
        );
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Token rejected — force a fresh login on the next call.
          this._token = null;
        }
        throw new Error(
          `Vnnox ${method} ${pathname} returned HTTP ${response.status}`,
        );
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(
          `Vnnox ${method} ${pathname} returned a malformed (non-JSON) response`,
        );
      }
      if (
        typeof data?.code === "number" &&
        data.code !== 0 &&
        data.code !== 200
      ) {
        if (AUTH_ERROR_CODES.has(data.code)) this._token = null;
        throw new Error(
          `Vnnox ${method} ${pathname} failed: code ${data.code}`,
        );
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async login() {
    const password = await this._resolvePassword();
    const data = await this._request("POST", "/unico/v1/system/auth/login", {
      body: {
        username: this.config.vnnoxUsername,
        password: Buffer.from(password, "utf8").toString("base64"),
      },
    });
    if (
      typeof data?.code === "number" &&
      data.code !== 0 &&
      data.code !== 200
    ) {
      throw new Error(`Vnnox login failed: code ${data.code}`);
    }
    const token = data?.data?.token;
    if (typeof token !== "string" || token.length === 0) {
      throw new Error("Vnnox login response has no token");
    }
    this._token = token;
    return token;
  }

  // Read the target device's screen list. Returns the parsed screen entries so
  // callers can locate the configured perimeter GUID (multi-screen scoping is
  // asserted here, never guessed).
  async readScreens() {
    const serial = this._requireSerial();
    const data = await this._request(
      "GET",
      "/unico/v1/ucenter/screen/normal-screen",
      {
        search: `?projectId=${encodeURIComponent(this.config.vnnoxProjectId)}`,
        authed: true,
        headers: { sn: serial },
      },
    );
    const list = data?.data?.list;
    if (!Array.isArray(list)) {
      throw new Error("Vnnox screen read returned no screens");
    }
    const screens = [];
    const seen = new Set();
    const push = (node) => {
      if (node === null || typeof node !== "object") return;
      if (typeof node.guid === "string" && !seen.has(node.guid)) {
        const brightness = node?.screenInfo?.adjustment?.brightness;
        screens.push({
          guid: node.guid,
          name: typeof node.name === "string" ? node.name : null,
          brightness:
            brightness && typeof brightness === "object" ? brightness : null,
        });
        seen.add(node.guid);
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const item of value) push(item);
        } else if (value && typeof value === "object") {
          push(value);
        }
      }
    };
    for (const entry of list) push(entry);
    return screens;
  }

  // Read and normalize the configured perimeter screen's brightness. Fails if
  // the configured GUID is absent from the device's screens (never falls back
  // to a name-based or device-wide selection).
  async readScreenBrightness() {
    const guid = this._requirePerimeterGuid();
    const serial = this._requireSerial();
    const data = await this._request(
      "GET",
      "/unico/v1/ucenter/screen/normal-screen",
      {
        search: `?projectId=${encodeURIComponent(this.config.vnnoxProjectId)}`,
        authed: true,
        headers: { sn: serial },
      },
    );
    const target = findByGuid(data?.data?.list, guid);
    if (!target) {
      throw new Error(
        `Vnnox perimeter screen GUID not found in device screens: ${guid}`,
      );
    }
    return normalizeBrightness(target?.screenInfo?.adjustment?.brightness);
  }

  // Read cabinet-level metadata for diagnostics (cabinet count and uniformity
  // only). Not required for the write; failures degrade to a warning.
  async readCabinets() {
    const data = await this._request("GET", "/unico/v1/cabinet/info-v2", {
      authed: true,
    });
    if (!Array.isArray(data?.data)) {
      throw new Error("Vnnox cabinet read returned no cabinets");
    }
    return data.data;
  }

  // Write a whole-percentage brightness, scoped to exactly the configured
  // perimeter screen GUID with an empty cabinet list (all cabinets on that
  // screen), as the UCenter UI does.
  async writeBrightness(percent) {
    const ratio = percentToFraction(percent);
    return this._writeTarget({ nitType: 0, ratioScale: 1, ratio, nit: 0 });
  }

  // Best-effort restore: write the exact snapshot ratio/ratioScale back so the
  // restored value is bit-for-bit the pre-write value, never a rounded one.
  async restoreBrightness(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      throw new Error("no brightness snapshot to restore");
    }
    return this._writeTarget({
      nitType: snapshot.nitType ?? 0,
      ratioScale: snapshot.ratioScale,
      ratio: snapshot.ratio,
      nit: snapshot.nit ?? 0,
    });
  }

  async _writeTarget(brightness) {
    const guid = this._requirePerimeterGuid();
    if (
      !Number.isFinite(brightness.ratio) ||
      !Number.isFinite(brightness.ratioScale) ||
      brightness.ratioScale <= 0
    ) {
      throw new Error("invalid brightness write target");
    }
    const data = await this._request(
      "POST",
      "/unico/v1/ucenter/cabinet/brightness",
      {
        authed: true,
        body: { brightness, list: [], guidList: [guid] },
      },
    );
    return data;
  }
}
