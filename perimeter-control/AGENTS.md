# Brightness gateway

Node service for **physical brightness only**: Vnnox/UCenter writes, sun/weather
prediction, status/calibration and Firebase listener recovery. All venues use
browser media. Resolume execution, geometry publication, media SSH/cache and
media telemetry are retired; old flags cannot enable an executor.

Read the [root instructions](../AGENTS.md) and [task index](../docs/README.md).
The [README](README.md) is canonical for installation, configuration, paths,
service lifecycle and local test recipes. Update it when those behaviors change.

## Commands and platform

From **`perimeter-control/`**, with **Node >= 22**, Corepack and the manifest's
pinned **pnpm 12.16.1**:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm test
# Weather-only work needs no dependency install:
node --test tests/weather.test.js
```

`pnpm test` runs Node tests with concurrency 1 and mocked transports/temporary
fixtures. The opt-in real-pnpm installer proof needs a second filesystem; see
[tests](README.md#tests). It is distinct from installing the service.

`corepack pnpm start` runs `node index.js` and may immediately consume live
intent. It is an **operator action**, not a health check. Host installation
requires Linux/systemd, Bash, privileged service/user setup, a stable system
Node executable outside protected homes, registry access for staged dependency
preparation, and explicitly approved Firebase/Vnnox access. The installer validates
the exact Node executable used in `ExecStart`. See
[prerequisites](README.md#prerequisites) and
[credential loaders](../docs/environment.md#gateway-access); no machine-specific
home, default device password, automatic login or replacement-key fallback exists.

## Critical boundaries and canonical references

- Firebase controller paths carry desired state; daemon-owned status reports
  verified device outcomes. A Firebase acknowledgement is not hardware success.
  The Admin SDK bypasses client rules; never use it to evade operator permissions.
- Keep serialized **snapshot → write → verify → restore**, one perimeter GUID,
  manual supersession, automatic admission checks and irreversible-write drain.
  Stop scheduling on shutdown and preserve the bounded drain. Read/update
  [arbitration](../docs/brightness-arbitration.md) for request ownership.
- [Auto-brightness design](../docs/auto-brightness-design.md) owns schema, model,
  SunCalc units, shared reference vectors, weather fallback and rollout phases.
  Do not duplicate formulas in this entrypoint. Weather deadline/cancellation
  behavior belongs in the README and `weather.js` tests.
- [Vnnox protocol](vnnox-brightness.md) and the single
  [authenticated smoke/exact-restoration procedure](BRIGHTNESS_SMOKE_TEST.md)
  own hardware operation. Integer intent cannot reproduce a fractional/raw
  device snapshot; retain its scale/nit fields and restore with the worker stopped.
- Preserve installed operator config/credentials, inert old caches/keys,
  Firebase media/telemetry, mapping compatibility keys and Storage generations.
  [Retirement evidence](../docs/brightness-gateway-retirement.md) is historical
  proof, not permission for data cleanup or a Resolume rollback.
- The [browser renderer](../docs/clock/perimeter-display.md),
  [mapping/physical qualification](WEB_RENDERER_QUALIFICATION.md), and
  [retained scorer Functions rollout](../docs/web-only-perimeter-rollout.md)
  have separate ownership. Gateway retirement does not complete #241 Phase 2.

**Physical qualification remains HOLD.** Mock, loopback and installation-fixture
tests do not qualify the venue's Node/systemd installation, Vnnox device or LED
output. Do not start/install/restart the daemon, mutate live Firebase, operate
hardware or clean shared data without task-specific authorization.
