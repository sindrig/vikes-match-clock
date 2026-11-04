# Clock development and testing

Use [API preparation](../api-client-preparation.md) for generated SDK setup and
the [environment contract](../environment.md) for credentials and target selection.
The commands below are task recipes, not a record that they were executed.

Code paths in backticks are relative to `clock/src/` unless qualified. Update
this reference when changing the behavior it describes; see the
[task index](../README.md).

## Provider Unit Tests

Each top-level block in `contexts/FirebaseStateContext.spec.tsx` registers
the shared mock setup and cleanup. Setup resets implementations and pending
one-shot overrides before installing subscription deliveries, audited writes
and authoritative CAS behavior; cleanup unmounts consumers and restores spies
and document visibility. Blocks must pass with name filters and shuffled order.
Use `lib/venue.fixtures.ts`'s two-pixel mapping for unrelated metadata and
subscription tests; venue metadata integration tests clone it per test so mock
Firebase writes cannot mutate another test's geometry. Keep the real-size parser
acceptance, perimeter fixtures, mapping validation and WebGL geometry coverage.
Queue helper tests use required
imports so a missing export fails instead of silently skipping playback cases.

## Port Configuration

Both Vite and Playwright support a `PORT` environment variable for custom port assignment:

```bash
# Run dev server on custom port (defaults to 3000)
PORT=4500 pnpm start

# Run e2e tests on custom port (defaults to 3000)
PORT=4500 VITE_USE_EMULATOR=true pnpm e2e
```

**Why this matters**: If port 3000 is already in use (e.g., multiple developers, parallel projects), tests will fail with connection errors. Use a custom port to avoid conflicts.

**Implementation**:

- `vite.config.ts` reads `process.env.PORT` for server configuration
- `playwright.config.ts` calculates `baseURL` from `process.env.PORT` and passes it to the webServer config
- The current Clock CI uses port 3000 (no `PORT` set)

For a persistent workspace-owned server, use `bash scripts/dev-server.sh start 4500` from the repository root (default port 8000, unlike plain `pnpm start`). The helper needs Bash/Git/Node/tmux and an already generated SDK; it runs the installed Vite CLI with an explicit port and `--strictPort`, and keeps logs in `.dev-server/<port>.log`. Use `status <port>` to identify its worktree/session/PID and `stop <port>` to close only that worktree/port's session. It preserves Vite's cache and does not own servers started by Playwright or other launchers. Stop it before moving/deleting a worktree. See the [server procedure](../../.opencode/skills/dev-server/SKILL.md) for preparation and HTTP/browser verification.
The helper inherits selection at startup: use `VITE_USE_EMULATOR=true` on its
start command for isolation. It invokes Vite directly rather than `pnpm start`.

## Firebase Emulator

For isolated local development and CI, use Firebase Emulator. Install Firebase
CLI and Java 21, as in CI. Node 22 runs Functions; compile `functions/lib`
before including the Functions emulator. Playwright needs Chromium and browser
system libraries. These prerequisites do not require live credentials.

No live credentials or Firebase login are required. Pass `VITE_USE_EMULATOR=true`
explicitly at Vite startup/build time or to Playwright. The default development
server otherwise uses shared staging Firebase. A default production build
previewed on localhost uses production Firebase unless emulator mode was
compiled in; changing preview mode/environment cannot change that bundle.
See [Firebase selection](../environment.md#firebase-selection) for the
mode/hostname precedence and restart/rebuild boundary.
See [the environment contract](../environment.md) for loaders and the
separate match/weather API routing (the emulator flag changes Firebase only).

```bash
# Auth/Database-only work (from project root); add storage/functions when needed.
firebase emulators:start --only auth,database --project vikes-match-clock-test

# Alternative: the checked-in Docker Compose service (see limitation below).
docker compose up -d

# From clock/, run app with emulator
VITE_USE_EMULATOR=true pnpm start

# Run e2e tests with emulator
VITE_USE_EMULATOR=true pnpm e2e

# Run e2e tests with emulator on custom port
PORT=4500 VITE_USE_EMULATOR=true pnpm e2e
```

The current Docker recipe installs Java/CLI and uses Functions `npm ci` inside
the container. That inherited workflow/toolchain mismatch is not repaired here;
prefer explicit local services for a controlled environment and do not count a
listed recipe as fresh-checkout validation.

Emulator ports:

- Auth: 9099
- Database: 9000
- Storage: 9199
- Functions: 5001
- UI: 4000

## Test Credentials

The current `e2e/fixtures/test-helpers.ts` creates synthetic users in the local
Auth emulator and logs in with those fixture values. It does not read
`TEST_CREDENTIALS` or fall back to a staging account. Run E2E with the local
services and `VITE_USE_EMULATOR=true`; never use those fixtures against shared
Firebase.

For separately authorized staging browser checks, retrieve an account from a
project maintainer. Tooling that expects `TEST_CREDENTIALS` uses the format
`EMAIL;PASSWORD` (quoted because of the semicolon). Load it into that process's
shell explicitly or through optional direnv as described in
[the environment contract](../environment.md#shared-staging-login).
Do not assume credentials are present in another worktree, and do not print
their values. Missing access means obtain access or use the emulator.

For manual staging login, use the current selector/login UI (`Innskrá`) and
verify the chosen venue after authentication; shared staging actions require
separate authorization. No historical settings-tab login sequence is assumed.

## E2E Test Architecture

**Authentication Flow**: E2E tests rely on `window.__firebaseAuthUID` to verify successful login. This global is set by `LocalStateContext.tsx` when Firebase auth state changes:

`LocalStateContext` assigns the typed `window.__firebaseAuthUID` from the
Auth SDK callback (`uid` or null). Tests wait for that actual delivery.

**Why this exists**: Playwright tests need to verify auth completed before proceeding with authenticated actions. The window global provides a reliable synchronization point between Firebase auth and test assertions.

**Test Data Initialization**: The `clearEmulatorData()` helper in `e2e/fixtures/test-helpers.ts` initializes Firebase with baseline state before each test. Key points:

- **halfStops format**: Stored in **minutes** (e.g., `[45, 90, 105, 120]`), not seconds or milliseconds
- **Default football config**: Use 4 values for overtime support: `[45, 90, 105, 120]`
- **matchType**: Must be `"football"` or `"handball"` to match `Sports` enum
- **homeTeamId/awayTeamId**: Numeric IDs matching KSI API (see Team ID System section)
- **Controller state**: Uses multi-queue format (`queues: {}`, `activeQueueId: null`) — NOT the old `selectedAssets` array

If tests fail with unexpected halfStops counts or values, check that test initialization data matches the format expected by `firebaseParsers.ts` and the default constants in `constants.ts`.

### E2E Asset Test Patterns

The asset E2E tests (`e2e/assets.spec.ts`) use these selectors for the multi-queue UI:

- `.queue-column` — a queue column in the Kanban board
- `.queue-item` — an individual asset item within a queue
- `.queue-board-empty` / `"Engin biðröð"` — empty state when no queues exist
- `.queue-column-actions .rs-btn` — gear icon to open settings popover
- `.queue-settings-popover` — the settings popover element
- `getByLabel("Play Queue")` / `getByLabel("Stop Queue")` — play/stop buttons on queue columns
- `.playback-bar` — the playback bar shown below the screen preview when a queue is active
- `getByLabel("Next asset")` / `getByLabel("Stop playback")` — large buttons in the playback bar
- `"Hreinsa virkt overlay"` — clear button shown only when an overlay is active WITHOUT an active queue
- rsuite `Toggle` components use `data-checked="true"` attribute (NOT `rs-toggle-checked` class)

## Independent Browser Sessions

Controller/display tests may need two independent browser sessions. Tabs on the same origin within one context/profile share localStorage and Firebase auth persistence; opening another ordinary window in the same profile does not isolate them. Different staging URL subpaths also share these keys. Separate local ports have distinct origins; default Vite development servers on those ports still use the same staging Firebase project. Production builds previewed locally follow the [mode/hostname selection](../environment.md#firebase-selection) instead.

Use Playwright's test runner with a separate context per role:

```javascript
const controllerContext = await browser.newContext();
const displayContext = await browser.newContext();
try {
  const controller = await controllerContext.newPage();
  const display = await displayContext.newPage();
  // Navigate and interact with each page through its own context.
} finally {
  await controllerContext.close();
  await displayContext.close();
}
```

Browser tool capabilities differ. If a tool exposes code execution and context APIs, it can interact with those context-owned pages through code, even when click/snapshot tools track only their default page. Inspect the available APIs; do not assume all Playwright MCP or Paseo tools support or prohibit multiple contexts. If context APIs are unavailable, use the runner or separate browser profiles (for example normal plus incognito) and report the verification limit.

Separate contexts isolate browser storage, not Firebase data. Use the emulator for state-mutating tests and coordinate any authorized shared-staging tests by project and `listenPrefix`. A single-session check does not establish cross-client synchronization. An HTTP 200 or expected HTML title verifies only the shell; check rendered content, console errors and failed requests before claiming application startup works.

## Stale-session regression observations

The regression is `clock/e2e/stale-session.spec.ts`;
[the original proposal](../../openspec/changes/prevent-stale-session-mutations/)
remains historical design context. The current [session contract](../session-mutation-boundary.md)
and [lifecycle contract](lifecycle.md) own runtime behavior.

That browser regression mounts the real App through the emulator-only
`e2e/fixtures/stale-session.html` observer. It records actual 100 ms timer
callbacks, subscription eligibility and SDK sends/acknowledgements; no hooks
enter the production entrypoint. Fix Date before observation, process the
deadline while offline, seed distinct authoritative B, and require connected
core delivery plus eligibility before checking resync. An explicit core change
drives recovery; the test does not certify unchanged-data reconnect behavior.
Await retained-origin rejection and a current command with the captured A
observation separately, then an acknowledged fresh audited write before reading
backend B/queues. This keeps the generation CAS check meaningful behind the
session guard and avoids unchanged-state polling as a negative-write barrier.
The still-current case checks deferred completion/audit after resync, rebasing
only the remaining simulated deadline when the real SDK refreshes its offset.
