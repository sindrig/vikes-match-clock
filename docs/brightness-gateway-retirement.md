# Brightness gateway retirement (#240)

The implementation is stacked on reviewed open PR #272:
`audit/264-portable-environment` at
`7b110a5df3a697866f79fe9d6e18d15f6999d8fe`. Its future PR base is that branch,
not master. All venues are owner-confirmed web-only; Resolume is unsupported.

## Removal inventory

| Removed source                                                                            | Base lines |
| ----------------------------------------------------------------------------------------- | ---------: |
| `overlay.js`, `ad-layout.js`, `resolume-import.js`, `resolume-preview.js`, `geometry.js`  |      3,023 |
| Dedicated ad-layout, import and geometry tests                                            |      1,703 |
| Completed `vikuti-swap-to-web`, `vikuti-revert-to-resolume`, `virkid-swap-to-web` scripts |        749 |
| Total whole-file executor/test/migration removal                                          |      5,475 |

The entry point shrinks from 1,152 to 362 lines. Mixed entry-point/media tests
are replaced with gateway, installer and signal/drain coverage. The repository's
competing gateway npm lockfile (2,665 lines) is removed. Direct media dependencies
`@google-cloud/storage`, `jpeg-js` and `pngjs` are removed; Storage remains
transitive through Firebase Admin. Media enable/config flags, SSH/cache setup
and the systemd cache write allowance are retired.

The installer prunes only the five named installed media modules. It leaves
operator files, old keys/caches and unmanaged old lockfiles alone; pnpm manages
its own dependency tree. This does not delete live Firebase/Storage records,
media, compatibility keys or any telemetry subtree. Web CORS tooling, kiosk,
Vnnox connectivity, service identity and `/etc/perimeter-control/` paths remain.

## Retained behavior proof

`brightness.js`, `auto-brightness.js`, `weather.js`, `vnnox.js` and their four
existing test suites are byte-identical to the base. All **93 retained tests**
pass against the baseline and within the new **139-test** gateway suite.
The retained brightness/automatic/weather section of the gateway README is also
byte-identical, avoiding unnecessary overlap with open PR #270.

`perimeter-control/tests/compare-baseline.mjs` runs the original
`PERIMETER_RESOLUME_ENABLED=false` path and the new bootstrap's controllers with
the same fake Firebase inputs, fixed time/weather and scripted device responses.
The worker, scheduler and weather parser/cache are real implementations. It
compares ordered Firebase/device traces, verifies five retained-config cases,
and checks the eight unchanged runtime/test files by bytes. All eight scenarios
produce identical traces:

- Manual validation, newest pending request and the original status shape.
- Transient snapshot failure and bounded pre-write retry.
- Rejected pending status prevents every device operation.
- A dispatched write error restores the exact snapshot without retrying it.
- Verification mismatch restores the exact snapshot.
- Shutdown waits for an in-flight write to verify and drops the next request.
- Shutdown waits for verification failure and restoration.
- Automatic power gating/recompute, hysteresis/slew, weather stale fallback,
  manual override and calibration, plus status republishing without device replay.

Separate bootstrap tests execute the actual `main()` body with process and
Firebase doubles: repeat signals share one drain, rejection is handled, and a
stuck worker reaches the existing 30-second grace boundary. Runtime tests cover
periodic listener error recovery and prove that absent/true/false/invalid legacy
media flags cannot construct media controllers or create media refs. Conflicting
legacy lane/cache/SSH settings no longer obstruct brightness startup.

To reproduce the trace comparison, choose an empty isolated directory outside
this checkout and set `BASELINE_DIR` to it. From the repository root:

```bash
: "${BASELINE_DIR:?Choose an empty isolated baseline directory outside the checkout.}"
git archive 7b110a5d:perimeter-control | tar -x --exclude=package-lock.json -C "$BASELINE_DIR"
corepack pnpm --dir "$BASELINE_DIR" install --frozen-lockfile --ignore-scripts
node perimeter-control/tests/compare-baseline.mjs "$BASELINE_DIR"
```

Use Node >= 22 and the pinned pnpm 12.16.1. The baseline extraction includes
tracked code/test fixtures only. Do not use a deployed gateway directory or
supply operator secrets. The comparison suppresses routine logs and prints only
proof counts/hashes; external transports are blocked.

## Installer and package checks

**18 installer/package-policy tests** run the installer in temporary fixtures.
Only destination constants and the root-check input are substituted; user,
systemd and dependency commands are doubles. They cover:

- Rejecting selected service Node 18/20/21, missing Node/Corepack, missing
  source/lock/config/unit files, bad arguments and missing account path.
- Checking the resolved service executable even when a PATH shim advertises
  a newer Node version.
- Rejecting a mismatched pnpm or failed frozen dependency preparation before
  installation changes, including an existing installation.
- Exact validated Node executable in `ExecStart`, unchanged user/group and
  credential/environment paths, correct credential/config modes and frozen
  production/offline install arguments.
- Upgrade deletion of only the five retired module names, including safe
  unlinking of a symlink, while operator JS, environment, old key/cache and
  unmanaged lockfile bytes survive.
- The gateway's pnpm-only preinstall policy without invoking another manager.

A separate real production dependency fixture passes
`pnpm install --prod --frozen-lockfile --offline` and imports the retained
runtime under `/usr/local/bin/node` **v22.23.3**. A manifest-drift probe is rejected
by the frozen lock without changing lock bytes. No systemd service is installed.
Bash/JavaScript syntax, focused formatting and diff whitespace checks pass.

This completes only the **gateway portion of #239**: pinned pnpm, one repository
lockfile, frozen production installs and Node >= 22 validation. Functions,
global CLI installation and GitHub workflows are unchanged.

## Limits and qualification

**Hardware qualification: HOLD.** No actual service installation, SSH, Vnnox,
live Firebase, cloud/data/cache cleanup, deployment, push or PR is performed.
The actual venue service Node binary must still be checked during separately
authorized host qualification; the container binary/fixture unit is the only
executable qualified here.

The brightness arbitration/model work in #252/#253 is unchanged. Weather
request timeout/cancellation work in #254 / open PR #270 is **not in this base**;
provider stalls remain an existing limitation. Do not attribute its deadline
or cancellation behavior to this retirement. Frontend/Functions retirement
belongs to #241. Windows/physical output requires its own qualification record.
The coordinator verifies before PR publication, then a fresh independent review
follows. There is no merge authority.
