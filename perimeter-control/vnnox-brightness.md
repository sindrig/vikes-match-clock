# Vnnox perimeter brightness — programmatic control notes

Reverse-engineering notes for the **Vnnox/UCenter** web UI behind
`http://localhost:81` (proxied via `vikin-gateway`'s nginx to
`10.182.45.40:19999`), which is how the perimeter LED screens' **brightness**
is edited by hand. Goal of this doc: capture whether we can read/set
brightness programmatically, how, and how safe that is. Everything below was
learned with **read-only probes only** — no brightness write was ever
executed.

## Topology

- `localhost:81` → nginx → **`10.182.45.40:19999`** = Nova **Vnnox / UCenter**
  service (SPA served at `/web/unico/unicos`, brand config "PixelFlow",
  v2.2.B1). It proxies every `/unico/v1/*` call to a target controller based
  on the `ip` / `port` / `protocol` headers the client sends.
- Managed devices (from `GET /unico/v1/ucenter/device-list`):
  - **"Perimeter Knattspyrna"** → `10.182.45.40:8088`, G4A, SN
    `26126A000018457` — this is our perimeter.
  - **"System 1"** → `10.182.45.50:8088`, G4A, SN `26126A000018386`.
- Screens on the perimeter device (from
  `GET /unico/v1/ucenter/screen/normal-screen?projectId=defaultProject-vx`
  - `sn` header):
  * **Perimeter** screen, guid `75f3072e-4940-4682-a91c-44edf697b1ca`,
    screenId 2.
  * **MVR** screen, guid `7a794be7-95b2-42d2-8f8b-2b0b5397b480`, screenId 1.

## Auth

No password is set on the box. Login uses the stock default:

```
POST http://localhost:81/unico/v1/system/auth/login
headers: Content-Type: application/json
         ip: 10.182.45.40
         port: 8088
         protocol: http            # NB: this is the *linkType* ("http"),
                                   # NOT the protocolType "G4A"
body: {"username":"admin","password":"<base64 of 123456>"}
```

`<base64 of 123456>` = `MTIzNDU2`. Response:
`{"code":0,"data":{"token":"<JWT>"}}`. Send that token as `Authorization`
on all subsequent calls.

Notes:

- Direct login to the device (`10.182.45.40:8088/unico/v1/system/auth/login`)
  also works with the same body.
- Each device has its own token (login is per `ip` header); `System 1` at
  `10.182.45.50` rejects the perimeter token with code `8273`.
- The `protocol` header must be `http` (the linkType). `G4A` returns
  `code:500 "failed"`.

## Brightness reads (read-only, verified)

### Screen-level brightness (what the toolbar slider edits)

```
GET http://localhost:81/unico/v1/ucenter/screen/normal-screen?projectId=defaultProject-vx
headers: Authorization: <token>
         sn: 26126A000018457
```

→ `data.list[].deviceList[].screenInfo.adjustment.brightness`:

```json
{ "ratio": 450, "ratioScale": 10000 }
```

Brightness percent = `ratio * 100 / ratioScale` → 4.5% currently. The MVR
screen reads `{ratio: 0, ratioScale: 0}` (off).

### Cabinet-level brightness (per sending unit)

```
GET http://localhost:81/unico/v1/cabinet/info-v2
headers: Authorization: <token>
         ip: 10.182.45.40
         port: 8088
         protocol: http
```

→ 40 cabinets, each with `cabinetDisplayParam.brightness` (currently all
`{ratio: 450, ratioScale: 10000}` = 4.5%, uniform). Also contains
`brightnessOverdrive`, `peakBrightness`, `colorTemperature`, `gamma`,
`displayMode`, `testPattern`, etc.

## Brightness write (reconstructed from the UI bundle + verified live)

Both the toolbar slider and the engineering/correction panel call the same
endpoint; only the `guidList` scope differs.

```
POST http://localhost:81/unico/v1/ucenter/cabinet/brightness
headers: Authorization: <token>
         ip: 10.182.45.40
         port: 8088
         protocol: http
body: {
  "brightness": {
    "nitType": 0,
    "ratioScale": 10000,
    "ratio": 3000,      // integer, same 10000 scale as reads (30% → 3000)
    "nit": 0
  },
  "list": [],                            // empty = all cabinets on the screen
  "guidList": ["75f3072e-4940-4682-a91c-44edf697b1ca"]  // screen GUID
}
```

**Scale is NOT asymmetric — writes take the same integer 10000 scale as reads.**
An earlier draft of this doc claimed writes take a `0--1` fraction with
`ratioScale: 1`; that was wrong. This device's firmware **rejects a
fractional float** — `ratio: 0.3` fails with
`{"code":500,"data":{"Field":"brightness.ratio","Value":"number 0.3"}}`. The
write endpoint's `ratio` field is an integer (read-scale, 10000). Verified live:
`ratio 3000 / ratioScale 10000` writes 30% and the readback confirms it.

## Safety assessment

**Deterministic: yes, with one serious footgun.**

- Writes are a well-defined JSON RPC; same input → same output (idempotent).
- **Scale**: writes and reads both use the **integer 10000 scale**
  (`ratio: 3000, ratioScale: 10000` = 30%). Never send a fractional float
  (`ratio: 0.3`) — the device rejects it with code 500. Percent
  × 100 = ratio at this scale.
- Snapshot-before-write is easy: read `cabinet/info-v2` (and/or
  `normal-screen`) first, then restore on failure.

**Risks:**

1. **No auth barrier** — stock `admin`/`123456`; any LAN host can read and
   write brightness via `localhost:81` or directly on `10.182.45.40:8088`.
2. **Immediate effect** — writes apply instantly, screen-wide (empty
   `list` = all 40 cabinets), no staging/confirmation. A buggy script
   instantly dims/brightens a live perimeter.
3. **Partial failure** — a mid-write failure could leave cabinets at
   mismatched brightness; verify after writing.
4. **Flaky box** — the UCenter (`:19999`) intermittently refused connections /
   returned empty responses / 502s during probing, then recovered. Retry
   logic and `Connection: close` help.
5. **Overrides** — today nothing overrides the set ratio
   (`brightnessOverdrive` off, `ambientLightCompensation` 0), so ratio →
   actual brightness is 1:1. If auto-brightness / overdrive gets enabled the
   mapping changes.
6. **Scope discipline** — the live perimeter screen must be targeted by its
   exact GUID; the MVR screen (0%) must not be clobbered.

**Safe pattern to implement later:** login → snapshot (`cabinet/info-v2` +
`normal-screen`) → convert pct→ratio → write to the whitelisted perimeter
GUID → poll/verify → restore from snapshot on any failure.

**Rollback:** a snapshot is read-scaled (`ratio` scaled by `ratioScale`, e.g.
`{ratio: 450, ratioScale: 10000}` for 4.5%), which is almost never an exact
whole integer percentage. The daemon's own `restoreBrightness()` re-applies
the snapshot bit-for-bit at its read scale (which is the same scale the write
endpoint accepts) — this is the only supported rollback path and is exactly
what the daemon already does automatically on a failed write. Do
**not** attempt to "reapply the snapshot percentage" by hand through the
`states/{location}/perimeter/brightness` command path: that path only accepts
whole integer percentages (see `parseBrightnessCommand`), so a fractional
snapshot (e.g. the 4.5% above) cannot be represented and rounding it would not
restore the exact pre-write value. A manual rollback of a _whole-percentage_
snapshot may go through the controller/command path; a manual rollback of a
_fractional_ snapshot must go through Vnnox/UCenter directly (the toolbar
slider or the raw `cabinet/brightness` write documented above).

## Operational gotchas

- The UCenter is only reachable through `localhost:81` (nginx) from this
  host; the device API is also reachable directly on `10.182.45.40:8088`.
- Token is a JWT with a far-future `exp`; no refresh observed within a
  session.
- During this exploration the UCenter process briefly stopped responding
  (connection refused on `:19999`) then recovered on its own — unrelated to
  any write (none were made), but treat it as a flaky endpoint.
