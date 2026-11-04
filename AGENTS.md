# Vikes Match Clock

Match clock, stadium displays and operator tools for Víkingur. Start with the
[project map](README.md#project-map), then the scoped guide for the code being
changed. The [task index](docs/README.md) points to canonical contracts and the
document that must change with each subsystem.

## Project structure

- [Clock](clock/AGENTS.md): React scoreboard, controller, web perimeter and
  [React administration](clock/src/admin/AGENTS.md) in the same Vite app.
- [API v3](clock-api/v3/AGENTS.md): Python FastAPI match/weather Lambda.
- [Functions](functions/AGENTS.md): Firebase administration, audit retention and
  temporarily retained generated-scorer backend.
- [Brightness gateway](perimeter-control/AGENTS.md): Node service for Vnnox
  brightness, weather prediction and listener recovery. Browser media is web-only.
- [Kiosk](kiosk/AGENTS.md): Windows Rust/Tauri wrapper loading the hosted app.
- [Infrastructure](infra/AGENTS.md): Terraform AWS stacks. [Emulators](firebase.json),
  [workspace scripts](scripts/) and [asset utilities](utils/README.md) support these units.

## Commands and environment

Use **pnpm** for local JavaScript work. Clock CI uses pnpm 10; the gateway pins
12.16.1. Functions has no package-manager version pin and still has two lockfiles
and npm-based CI; do not infer alignment or rewrite them during unrelated work.
See each scoped guide for commands, prerequisites and that limitation.

Use the [local quickstart](docs/quickstart.md) for credential-free setup in any
checkout/worktree: SDK first, frontend **4600**, API **8000**, and the complete
Auth/Database/Storage/Functions flow with synthetic login, upload and callable
verification. Scoped guides own subsystem contracts and focused checks.

`start` and `build` generate the ignored SDK from committed
`clock-api/v3/openapi.json`. Standalone lint/tests/type checks need generation
first. Never hand-edit or commit `clock/src/api/client/`. API contract changes
must export and commit OpenAPI before regeneration; see
[API preparation](docs/api-client-preparation.md).

The [environment contract](docs/environment.md) is canonical for loaders,
credentials and selection. Default Vite development targets **shared staging**;
a default production build previewed on localhost targets **production**.
Compile/start with `VITE_USE_EMULATOR=true` for isolation. Preview-time variables
cannot change a built bundle. Match/weather API routing is separate from Firebase.
No home directory, automatic login or credential file is a checkout prerequisite.

## Critical invariants

- **`halfStops` stores MINUTES**, e.g. `[45, 90, 105, 120]`; conversion to
  milliseconds happens inside Clock. Fixtures must use the same units.
- **Firebase is authoritative; no optimistic shared-state or calculation-ref
  updates.** Reads are validated; parsers never repair persisted data.
- Commands require the **current session and original command origin**, a
  current Auth SDK UID and freshness eligibility. Retain that command through
  async work; stale commands reject without replay. Lifecycle changes use CAS;
  [playback occurrences](docs/playback-occurrences.md) distinguish replay from
  media identity. Already-submitted SDK writes cannot be revoked.
- [Nested parsing](docs/nested-state-boundary.md) preserves valid siblings,
  unknown metadata and **raw roster child identity**. Filtered indexes cannot
  replace raw keys. Keep manual/foreign players and coaches structurally valid.
- [Team IDs](docs/clock/assets-and-rosters.md#team-id-system--match-data-pipeline)
  must match KSI identities and the configured API team scope. Keep override-first
  lookup and trailing-dot name
  normalization; `-1` and `0` retain their distinct meanings.
- Preserve version-1 file/version-2 semantic perimeter commands, media pairs,
  mapping compatibility keys, generation backfill and immutable Storage
  generations. Resolume is retired; no missing-mapping media fallback exists.
- **#241 Phase 2 is pending:** retain `prepareGoalScorerMedia`, its export,
  tests, sharp and rules until client rollout/refresh and separately qualified
  removal. Follow the [rollout hold](docs/web-only-perimeter-rollout.md).
- Ordinary shared-state writes and audit are atomic; CAS state and its audit
  append are separate. [Audit limitations](docs/clock/audit.md) and ordinary
  multi-controller **last-write-wins** remain; coordinate shared venue edits.

## Code style

Prettier: 2 spaces, semicolons, double quotes. Python: Black, line length 79,
skip string normalization. External imports precede internal imports; alphabetize
within groups. Use camelCase (JS/TS), PascalCase (components), snake_case (Python).
Handle async failures and validate Firebase data at its ingestion boundary.

**CRITICAL: `eslint-disable` is not a fix.** Fix the code and types. If the rule
is wrong for the project, discuss the global configuration; if stuck, stop and
ask for help. A one-off suppression requires explicit user approval and a
comment documenting a genuine false positive. Use lookup objects instead of
unnecessary type assertions, proper types/`unknown` instead of `any`, and correct
hook dependencies. Format touched files; run checks appropriate to the change.

## Testing and screenshots

[Clock testing](docs/clock/testing.md) covers Vitest, Playwright, provider mocks
and independent browser contexts. Emulator fixtures create synthetic accounts;
never run them against shared Firebase. Live staging checks require separate
maintainer-approved access from the environment contract. HTTP shell success
alone does not verify rendered app behavior.

Capture review images under ignored **`screenshots/`**; never commit screenshots.
Intentional source artwork (club crests, fonts, kiosk installer assets) is a
separate reviewed input, not a captured proof image. Follow the canonical
[screenshot procedure](docs/screenshots.md) for environment checks and authorized
uploads. No shared state, deployment or hardware action is implied by a docs edit.

## Documentation updates

Update the canonical reference selected by the [task index](docs/README.md)
when behavior changes; update entrypoints only when navigation, commands or
critical invariants change. Keep historical evidence marked as such. Moving
material does not complete fresh-checkout verification (#257), OpenSpec
reconciliation (#259), client rollout, or physical qualification.

## Previous section links

Stable anchors from the earlier guide remain below; each group points to the
current canonical reference. New detail belongs there.

<a id="environments"></a>
<a id="key-technologies"></a>
<a id="deployment"></a>
<a id="environment-and-credentials"></a>
<a id="eslint-rules-critical"></a>
<a id="architecture-notes"></a>

[Task index](docs/README.md).

<a id="firebase-state-sync-clock"></a>
<a id="automatic-perimeter-brightness-controller--daemon"></a>

[session mutation boundary](docs/session-mutation-boundary.md).

<a id="team-id-system-club-idsts--ksi-analyticom-api"></a>
<a id="multi-controller-support"></a>

[assets and rosters](docs/clock/assets-and-rosters.md).

<a id="testing-patterns"></a>
<a id="unit-tests"></a>
<a id="e2e-tests"></a>

[testing](docs/clock/testing.md).

<a id="taking-screenshots-for-prs"></a>
<a id="workflow"></a>
<a id="important-notes"></a>

[screenshots](docs/screenshots.md).
