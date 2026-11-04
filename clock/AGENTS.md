# Clock App Agent Guidelines

React/Vite app for scoreboard/idle displays, match control, browser perimeter
and [React administration](src/admin/AGENTS.md). Read the root instructions and
[task index](../docs/README.md); update the relevant canonical reference when
changing behavior, rather than growing this entrypoint into a second manual.

## Build & Tooling

Use Node 22.12+ and pnpm for the frontend; CI uses Node 22 and pnpm 10.
`corepack pnpm@10.34.9` is the verified local preparation version, not a new
repository-wide pin. Commands below run from **`clock/`**:

```bash
corepack pnpm@10.34.9 install --frozen-lockfile
corepack pnpm@10.34.9 run generate-api-client
corepack pnpm@10.34.9 lint
corepack pnpm@10.34.9 test
corepack pnpm@10.34.9 build
# With local Firebase services running:
VITE_USE_EMULATOR=true PORT=4500 corepack pnpm@10.34.9 start
VITE_USE_EMULATOR=true PORT=4500 corepack pnpm@10.34.9 e2e --workers=1
```

`start`/`build` generate the SDK before Vite/TypeScript. On a fresh checkout,
generate before standalone lint/tests/type checks. `src/api/client/` is ignored:
**never edit or commit it**. Export and commit `clock-api/v3/openapi.json` for
contract changes before regenerating; frontend work needs no Python or AWS.
[API preparation](../docs/api-client-preparation.md) owns the full procedure.
Format touched files with `pnpm exec prettier --write <paths>`; the manifest's
`format`/`format-check` scripts cover `src` and `e2e`, not repository Markdown.

### ESLint Policy (MANDATORY)

No `eslint-disable` as a fix. Correct the types, lookup patterns and hook
dependencies; ask for help if stuck. A genuine false positive needs explicit
user approval and documented justification. Keep typed mocks accurate instead
of hiding invalid Firebase shapes with casts. Run lint for source changes.

## Firebase Emulator

The [environment contract](../docs/environment.md#firebase-selection) owns
mode/hostname precedence and credential loaders. Default development targets
**shared staging**; a default production build previewed on localhost targets
**production**. `VITE_USE_EMULATOR=true` must be set at startup/build; preview
flags cannot change compiled selection. API routing is separate: localhost
uses the API on port 8000, so use another frontend port or mock API requests.

For emulator work, install Firebase CLI and Java 21; Functions work also needs
its Node 22 dependencies and compiled `functions/lib`. Playwright needs Chromium
and the host's browser libraries. See [testing setup](../docs/clock/testing.md)
for service selection, ready checks, synthetic accounts and context isolation.
The persistent helper is `bash scripts/dev-server.sh start 4500` from the root
(Bash/Git/Node/tmux required); it invokes Vite directly, so generate the SDK first
and pass emulator selection to its start process. Stop only your own worktree/port.

## CRITICAL invariants

- **`halfStops` is stored in MINUTES**: football `[45, 90, 105, 120]`,
  handball `[30, 60, 65, 70]`. Clock converts to milliseconds internally.
- **Firebase is authoritative. No optimistic shared state, shadow refs or
  read-time repairs.** Writes flow through Firebase subscriptions. Local
  settings and unsaved drafts are separate from shared state.
- The [command boundary](../docs/session-mutation-boundary.md) checks the
  **current session and captured origin** before reading refs and at submission.
  Keep the gesture's command through async preparation. Current Auth SDK UID
  and freshness are required; hide/resume and venue/auth A → B → A retire old
  callbacks. Stale attempts reject without replay; submitted writes cannot be revoked.
- Renderers are read-only. `MatchLifecycle` owns timer progression with CAS,
  retry-safe commit latches and resync-retained deadlines. Natural media end
  is a conditional observation carrying the rendered playback occurrence.
  New selection/replay/advance mints an ID; reads and metadata edits do not.
  Malformed present IDs never become legacy absence. Old binaries remain a
  [mixed-writer limitation](../docs/playback-occurrences.md#compatibility-and-rollout).
- [Nested parsers](../docs/nested-state-boundary.md) own structural validation.
  Keep valid siblings, metadata, manual/foreign players and coaches. Roster
  leaf commands target **raw Firebase child keys**, including after filtering;
  append allocation considers rejected children. Side replacement is explicit.
- Keep team IDs/API scope and normalized names aligned with KSI identities.
  The v3 adapter uses home/away roster sides; preserve override-first lookup
  and trailing-dot normalization. `-1` means non-KSI and `0`
  unknown. See [the pipeline](../docs/clock/assets-and-rosters.md#team-id-system--match-data-pipeline).
- Keep v1 file/v2 semantic overlays, media pairs, mapping compatibility keys,
  Storage generation backfill and generation-keyed cache identity. Only valid
  web mappings activate perimeter playback. Resolume is retired.
- Retain the generated-scorer **Functions backend** for older clients during
  [#241 Phase 2](../docs/web-only-perimeter-rollout.md); frontend retirement is
  not backend deletion or proof of client rollout.
- Ordinary state/audit updates are atomic; CAS audit append is separate and
  can fail independently. Audits cannot prove pairing at the rules layer.
  Ordinary multi-controller edits remain **last-write-wins**; coordinate use.

## Task index

| Change                                            | Canonical reference to read and update                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| State ownership, local settings, venue metadata   | [State and venues](../docs/clock/state-and-venues.md)                                            |
| Command freshness, async saves, queue intents     | [Command boundary and inventory](../docs/session-mutation-boundary.md)                           |
| Assets/roster parsing and original child identity | [Nested-state boundary](../docs/nested-state-boundary.md)                                        |
| Completion identity, replay and legacy writers    | [Playback occurrences](../docs/playback-occurrences.md)                                          |
| Clock, halftime, timeout, penalties and units     | [Match lifecycle](../docs/clock/lifecycle.md)                                                    |
| Audit writes, history and retention               | [Audit](../docs/clock/audit.md), [Functions](../functions/AGENTS.md)                             |
| Queue/team/media UI and KSI IDs                   | [Assets and rosters](../docs/clock/assets-and-rosters.md)                                        |
| Themes, visual editors and fonts                  | [Themes](../docs/clock/themes.md)                                                                |
| Web renderer, bands and screen errors             | [Perimeter display](../docs/clock/perimeter-display.md)                                          |
| Overlay schemas, file pairs, scorer composition   | [Perimeter media](../docs/clock/perimeter-media.md)                                              |
| Brightness controller                             | [UI behavior](../docs/clock/perimeter-brightness.md), [model](../docs/auto-brightness-design.md) |
| Mapping, cache/CORS operations and rollout        | [Perimeter operations](../docs/clock/perimeter-operations.md)                                    |
| Provider mocks, emulator/E2E and browser sessions | [Testing](../docs/clock/testing.md)                                                              |
| Review captures                                   | [Screenshot procedure](../docs/screenshots.md): ignored `screenshots/`, no screenshot commits    |

## Previous section links

Stable anchors from the earlier guide remain below; each group points to the
current canonical reference. New detail belongs there.

<a id="overview"></a>
<a id="core-architecture-patterns"></a>

[Task index](../docs/README.md).

<a id="100-firebase-architecture"></a>
<a id="why-100-firebase"></a>
<a id="write-operations"></a>
<a id="multi-controller-behavior"></a>
<a id="venue-metadata"></a>
<a id="the-listenprefix-system"></a>
<a id="state-management"></a>
<a id="persistence"></a>
<a id="key-component-systems"></a>

[state and venues](../docs/clock/state-and-venues.md).

<a id="stale-session-mutation-safety-required-rules"></a>
<a id="2-match-control-srcmatch-controller"></a>
<a id="3-display-screens-srcscreens"></a>
<a id="idle-ad-image"></a>
<a id="4-specialized-logic"></a>
<a id="clock-management-srcmatchclocktsx"></a>
<a id="penaltiesred-cards"></a>
<a id="halfstops-srccontrollerhalfstopstsx"></a>
<a id="injury-time-display-mode"></a>
<a id="5-global-shortcuts-srchooksuseglobalshortcutsts"></a>
<a id="data-formats--storage"></a>
<a id="halfstops-storage-format"></a>

[lifecycle](../docs/clock/lifecycle.md).

<a id="firebase-audit-trail-breytingasaga"></a>

[audit](../docs/clock/audit.md).

<a id="perimeter-control"></a>
<a id="web-perimeter-display"></a>
<a id="idle-perimeter-clock-web-venues"></a>
<a id="perimeter-display-diagnostics-skjáarvillur"></a>
<a id="web-perimeter-player--substitution-band"></a>

[perimeter display](../docs/clock/perimeter-display.md).

<a id="perimeter-overlay-goal-triggered-video-sequences"></a>
<a id="named-perimeter-media-pairs-manual-overlay-library"></a>
<a id="perimeter-ad-layout-web-base-ads"></a>
<a id="goal-scorer-selection"></a>
<a id="web-goal-scorer-overlay-browser-composition"></a>

[perimeter media](../docs/clock/perimeter-media.md).

<a id="perimeter-brightness-vnnox-led-brightness"></a>
<a id="perimeter-automatic-brightness-sun--weather-prediction"></a>

[perimeter brightness](../docs/clock/perimeter-brightness.md).

<a id="1-the-asset-system-srccontrollerasset"></a>
<a id="multi-queue-architecture"></a>
<a id="queuepicker-behavior"></a>
<a id="media-library-layout"></a>
<a id="main-screen-mp4-media"></a>
<a id="drag-and-drop-collision-detection"></a>
<a id="createqueue-options"></a>
<a id="team-queue-integration"></a>
<a id="manual-roster-creation-resolve-roster"></a>
<a id="shared-home-team-player-actions--match-view-quick-actions"></a>
<a id="tab--assetview-sync-gotcha"></a>
<a id="team-id-system--match-data-pipeline"></a>
<a id="how-team-ids-work"></a>
<a id="name-normalization"></a>
<a id="special-id-values"></a>
<a id="custom-team-overrides-in-selectors"></a>
<a id="key-files-in-the-pipeline"></a>

[assets and rosters](../docs/clock/assets-and-rosters.md).

<a id="6-theme-system-css-custom-properties"></a>
<a id="how-it-works"></a>
<a id="themeconfig-properties"></a>
<a id="preset-themes"></a>
<a id="custom-preset-behavior"></a>
<a id="key-files"></a>
<a id="adding-a-new-theme-property"></a>
<a id="background-image"></a>
<a id="ad-image-positioning"></a>
<a id="per-team-logo-scaling"></a>
<a id="viewport-variants-note"></a>
<a id="idle-text-outline"></a>
<a id="idle-screen-visual-editor"></a>
<a id="themeeditor-ui"></a>
<a id="fonts"></a>

[themes](../docs/clock/themes.md).

<a id="testing--development"></a>
<a id="provider-unit-tests"></a>
<a id="port-configuration"></a>
<a id="test-credentials"></a>
<a id="e2e-test-architecture"></a>
<a id="e2e-asset-test-patterns"></a>
<a id="independent-browser-sessions"></a>

[testing](../docs/clock/testing.md).

<a id="related-systems"></a>
<a id="web-perimeter-rollout-runbook"></a>

[perimeter operations](../docs/clock/perimeter-operations.md).
