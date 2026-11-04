# Task and documentation index

Start at the [project map](../README.md#project-map) and the scoped `AGENTS.md`
for the code being changed. Each row below identifies the current reference
to read **and update when its behavior changes**. Update this index and the
entrypoints when ownership, commands, paths or critical invariants change.
Keep schemas, model formulas and operator procedures in their linked canonical
document; entrypoints carry short safety rules and navigation.

## Frontend and shared-state tasks

| Task                                                              | Read and update                                                                                  | Main source boundary                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend setup, generated SDK, API contract edits                 | [API preparation](api-client-preparation.md), [Clock guide](../clock/AGENTS.md)                  | [Clock manifest](../clock/package.json), [OpenAPI](../clock-api/v3/openapi.json), [Makefile](../Makefile)                                        |
| Environment, credentials, staging login or target selection       | [Environment contract](environment.md)                                                           | [Firebase selection](../clock/src/firebase.ts), [API routing](../clock/src/apiConfig.ts), [placeholder inputs](../.envrc-local.example)          |
| Shared/local state, venue metadata and admin mapping drafts       | [State and venues](clock/state-and-venues.md), [React admin guide](../clock/src/admin/AGENTS.md) | [Contexts](../clock/src/contexts/), [admin](../clock/src/admin/)                                                                                 |
| Current-session commands, async draft ownership and queue intents | [Command boundary and mutation inventory](session-mutation-boundary.md)                          | [Mutation session](../clock/src/lib/mutationSession.ts), [state provider](../clock/src/contexts/FirebaseStateContext.tsx)                        |
| Structural assets/rosters, valid siblings and raw roster keys     | [Nested-state boundary](nested-state-boundary.md)                                                | [Nested parsers](../clock/src/contexts/nestedParsers.ts), [composed parsers](../clock/src/contexts/firebaseParsers.ts)                           |
| Playback selection, replay, completion CAS or mixed clients       | [Playback occurrences](playback-occurrences.md)                                                  | [Lifecycle](../clock/src/match/MatchLifecycle.tsx), [live asset wrapper](../clock/src/controller/asset/Asset.tsx)                                |
| Clock, halfStops MINUTES, injury time, timeout or penalty expiry  | [Match lifecycle and formats](clock/lifecycle.md)                                                | [Constants](../clock/src/constants.ts), [match components](../clock/src/match/)                                                                  |
| Audit write routing, pagination or 90-day cleanup                 | [Audit contract and limits](clock/audit.md), [Functions guide](../functions/AGENTS.md)           | [Audited writer](../clock/src/firebaseDatabase.ts), [history UI](../clock/src/controller/audit/), [cleanup](../functions/src/cleanupAuditLog.ts) |
| Queue/media UI, MP4, rosters, substitutions or team IDs           | [Assets and rosters](clock/assets-and-rosters.md)                                                | [Asset controls](../clock/src/controller/asset/), [club IDs](../clock/src/club-ids.ts)                                                           |
| Theme properties, presets, fonts or visual editors                | [Theme guide](clock/themes.md)                                                                   | [Theme editors](../clock/src/controller/theme/), [CSS projection](../clock/src/hooks/useThemeCssVars.ts)                                         |
| Provider tests, E2E, real SDK or independent browser sessions     | [Clock testing](clock/testing.md)                                                                | [Playwright config](../clock/playwright.config.ts), [emulator fixtures](../clock/e2e/fixtures/)                                                  |

## Perimeter tasks

| Task                                                           | Read and update                                                                                           | Main source boundary                                                                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser display lifecycle, idle clock, bands or diagnostics    | [Perimeter display](clock/perimeter-display.md)                                                           | [Renderer/runtime](../clock/src/perimeter/), [display](../clock/src/perimeter/PerimeterDisplay.tsx)                                                                     |
| v1/v2 overlays, media pairs, goal video or ad layout           | [Perimeter media](clock/perimeter-media.md)                                                               | [Perimeter types](../clock/src/types.ts), [parsers](../clock/src/contexts/firebaseParsers.ts), [media UI](../clock/src/controller/media/)                               |
| Mapping editor, generation backfill, cache/CORS or web rollout | [Perimeter operations](clock/perimeter-operations.md)                                                     | [Mapping editor](../clock/src/admin/PerimeterMappingEditor.tsx), [mapping model](../clock/src/perimeter/perimeterMapping.ts)                                            |
| React manual/auto brightness controls                          | [Brightness UI](clock/perimeter-brightness.md)                                                            | [Perimeter control](../clock/src/controller/PerimeterControl.tsx)                                                                                                       |
| Sun/weather prediction, formula, vectors or auto schema        | [Automatic-brightness design](auto-brightness-design.md)                                                  | [Browser model](../clock/src/lib/autoBrightness.ts), [gateway model](../perimeter-control/auto-brightness.js), [shared vectors](fixtures/auto-brightness-contract.json) |
| Gateway request admission, supersession, drain or calibration  | [Arbitration contract](brightness-arbitration.md), [gateway guide](../perimeter-control/AGENTS.md)        | [Worker](../perimeter-control/brightness.js), [bootstrap](../perimeter-control/index.js)                                                                                |
| Retained generated-scorer backend and eventual removal         | [#241 rollout hold and Phase 2](web-only-perimeter-rollout.md), [Functions guide](../functions/AGENTS.md) | [Function export](../functions/src/index.ts), [retained service](../functions/src/goalScorerPreparation.ts)                                                             |

## Operations and platforms

These links describe procedures for separately authorized work. Reading or
editing them does not authorize deployment, state mutation or hardware I/O.

| Task                                                            | Canonical entrypoint / procedure                                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API match/roster/weather behavior                               | [API guide](../clock-api/v3/AGENTS.md), [KSI lifetime and budgets](ksi-roster-lifecycle.md)                                                               |
| Firebase admin callables, invitations, retention or rules tests | [Functions guide](../functions/AGENTS.md)                                                                                                                 |
| Gateway installation, service configuration or weather recovery | [Gateway README](../perimeter-control/README.md), [environment access](environment.md#gateway-access)                                                     |
| Vnnox protocol, smoke test and exact restoration                | [Protocol](../perimeter-control/vnnox-brightness.md), [single smoke/restoration procedure](../perimeter-control/BRIGHTNESS_SMOKE_TEST.md)                 |
| Physical output mapping and Windows/Chromium qualification      | [Measurement](../perimeter-control/WEB_MAPPING_MEASUREMENT.md), [qualification](../perimeter-control/WEB_RENDERER_QUALIFICATION.md)                       |
| Windows kiosk development, monitor/recovery behavior or release | [Kiosk guide](../kiosk/AGENTS.md), [operator and release README](../kiosk/README.md)                                                                      |
| AWS infrastructure or deployment                                | [Infrastructure guide](../infra/AGENTS.md), [environment access](environment.md#manual-aws-staging-operations), [actual workflows](../.github/workflows/) |
| Persistent local Vite server                                    | [Clock testing](clock/testing.md#port-configuration), [helper](../scripts/dev-server.sh)                                                                  |
| PR screenshots and source artwork distinction                   | [Screenshot handling](screenshots.md)                                                                                                                     |
| Asset maintenance utilities                                     | [Utility inventory](../utils/README.md)                                                                                                                   |

## Historical evidence and separate follow-ups

[Gateway retirement evidence](brightness-gateway-retirement.md),
[test coverage evidence](issue-234-test-coverage.md), the `pr-*-repair.md`
records, [old emulator investigation](../FIX_CI_EMULATOR.md) and
[TypeScript conversion notes](../NEXT_STEPS.md) retain historical context.
Their baseline counts, old paths and branch instructions are not current setup
contracts. Local proof locations in evidence records are provenance, not required
checkout directories or credential sources.

[OpenSpec specs and changes](../openspec/) retain proposal/archive history.
Reconcile their status and superseded contracts under **#259**, rather than
treating a moved paragraph as completed reconciliation. This documentation split
also does not establish **#257 fresh-checkout verification**, #241 backend
removal/client refresh, Windows/WebView2 or physical hardware qualification.
