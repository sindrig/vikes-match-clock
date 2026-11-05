# Clock development and testing

Use the [local quickstart](../quickstart.md) for fresh-checkout setup and the
complete frontend/API/emulator journey, [API preparation](../api-client-preparation.md)
for SDK/schema ownership, and the [environment contract](../environment.md) for
credentials and target selection.
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

`contexts/subscriptionDomains.spec.tsx` exercises listener ownership, context
isolation and command identity, parent desired-state projection, full scope
and attempt reset, required cancellation/deadlines/retry, optional telemetry,
and same-venue lifecycle deadline retention. Keep synchronous SDK echoes and
creation acknowledgements separate in mocks. Do not add phantom desired-child
callbacks when adapting older fixtures to the sole parent subscription.

The emulator-only `e2e/subscription-domains.spec.ts` mounts the actual App with
Auth/RTDB/Storage SDKs and repository rules in namespace `vikes-match-clock-test`.
It verifies public/authenticated read boundaries, actionable initial and
post-load permission failures, unavailable initial reads, selector retry,
rendered brightness reset, rapid SDK echoes, queue acknowledgement barriers
and lifecycle fault/recovery. Core reads are public under repository rules:
the denial cases temporarily install an isolated emulator rules overlay,
read it back, then restore repository rules. A child denial cannot override
an ancestor read grant. The fixture is outside the production entrypoint and
must never run against shared Firebase.

These full-App scenarios require responsive Auth, Database and Storage. Install
the repository Storage rules and wait for HTTP readiness as well as the explicit
RTDB rules readback. The public case awaits the anonymous scoreboard-ad listing's
real 403, checks denied anonymous and allowed authenticated SDK listings, and
retains page-error assertions for both roles. A pending Storage request is not a
clean startup. These scenarios do not qualify Functions, physical telemetry or
unchanged-data automatic reconnect. Under
resource coordination, wrap the complete lifecycle once, use one browser
worker/zero retries and a static emulator-compiled bundle with explicit fixture
entrypoints. A successful assertion with a failed lifecycle/cleanup is not a
passing qualification. Compare acceptance probes with the exact source pin
and use small disposable mutations to prove their failure sensitivity.

`utils/AdImage.spec.tsx` covers optional listing/URL failures, authorized rotation,
scope masking and late completions after a venue/type change or unmount. The
full-App Storage case also covers the inherited anonymous optional-ad rejection;
handling that rejection does not change Storage authorization.

## Port Configuration

Both Vite and Playwright support a `PORT` environment variable for custom port assignment:

```bash
# Run dev server on custom port (defaults to 3000)
PORT=4600 VITE_USE_EMULATOR=true pnpm start --strictPort

# Run e2e tests on custom port (defaults to 3000)
PORT=4600 VITE_USE_EMULATOR=true pnpm e2e
```

**Why this matters**: If port 3000 is already in use (e.g., multiple developers, parallel projects), tests will fail with connection errors. Use a custom port to avoid conflicts.

**Implementation**:

- `vite.config.ts` reads `process.env.PORT` for server configuration
- `playwright.config.ts` calculates `baseURL` from `process.env.PORT` and passes it to the webServer config
- The current Clock CI uses port 3000 (no `PORT` set)

For a persistent workspace-owned server, use `bash scripts/dev-server.sh start 4600` from the repository root (default port **4600**, unlike plain `pnpm start`). The helper needs Bash/Git/Node/tmux and an already generated SDK; it runs the installed Vite CLI with an explicit port and `--strictPort`, and keeps logs in `.dev-server/<port>.log`. Use `status <port>` to identify its worktree/session/PID and `stop <port>` to close only that worktree/port's session. It preserves Vite's cache and does not own servers started by Playwright or other launchers. Stop it before moving/deleting a worktree. See the [server procedure](../../.opencode/skills/dev-server/SKILL.md) for preparation and HTTP/browser verification.
The helper inherits selection at startup: use `VITE_USE_EMULATOR=true` on its
start command for isolation. It invokes Vite directly rather than `pnpm start`.

## Firebase Emulator

Follow the [quickstart's full service setup](../quickstart.md#3-prepare-and-start-all-four-firebase-emulators)
for Java 21, Node 22, compiled Functions, the four ports, namespace rules and
independent readiness checks. Start fewer services only for a deliberately
limited test; Auth/Database alone do not verify uploads or callable Functions.
The credential-free synthetic browser journey is in that same guide.

Playwright needs Chromium and browser system libraries. From **`clock/`**,
download the matching browser with `corepack pnpm@10.34.9 exec playwright install chromium`.
On Linux, install the host libraries required by Playwright separately (its
`install-deps chromium` command needs host package-manager privileges). Reusing
a preinstalled browser/libraries is valid, but record it; it is not proof of
a fresh-machine bootstrap.

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
# Working directory: clock/, with SDK and the required emulators ready.
PORT=4600 VITE_USE_EMULATOR=true corepack pnpm@10.34.9 e2e --workers=1
```

The current Docker recipe installs Java/CLI and uses Functions `npm ci` inside
the container. That inherited workflow/toolchain mismatch is not repaired here;
prefer explicit local services for a controlled environment and do not count a
listed recipe as fresh-checkout validation.

Playwright starts a fresh server outside CI and refuses to reuse an existing
one. Choose a free owned port; do not stop another worktree's server. Passing
the emulator flag to the test process cannot change an already running server
or a compiled bundle. See [port configuration](#port-configuration).

## Test Credentials

The current `e2e/fixtures/test-helpers.ts` creates synthetic users in the local
Auth emulator and logs in with those fixture values. It does not read
`TEST_CREDENTIALS` or fall back to a staging account. Run E2E with the local
services and `VITE_USE_EMULATOR=true`; never use those fixtures against shared
Firebase.

### Shared fixture ownership and emulator guards

Playwright configuration requires `VITE_USE_EMULATOR=true` and creates an
execution token inherited by workers. The shared helper adds the worker index
and a fresh worker incarnation to its venue, synthetic account and invitation
identities. A restarted worker or another invocation cannot reuse those mutable
roots merely by choosing worker 0. `VIKES_E2E_EXECUTION` can supply an explicit
run token for an orchestrator; it must be a short alphanumeric/hyphen/underscore
identifier, not credentials. Keep test titles independent of the run token.

Before a shared-helper page logs in or mounts App, it loads the test-only
`emulator-target.html` probe and inspects the actual served Firebase project,
database URL, bucket and Auth emulator connection. Nonlocal network requests
are blocked during that probe. A process flag alone is insufficient; a stale
production/staging bundle fails before application mutations. Static emulator
test bundles must explicitly include this probe entry as well as the fixtures
used by their selected tests. The production entrypoint imports none of them.

Fixture REST requests use literal loopback endpoints, an explicit test namespace
and bucket, bounded requests, checked response shapes/statuses and no redirects.
Errors omit payloads, response bodies and tokens. Signup only handles the exact
expected `EMAIL_EXISTS` response by signing the owned account in; other errors
fail. The fixture registers pending email ownership before signup transport.
It rejects another signup for that email until the first outcome is resolved.
If signup commits but its response is lost or invalid, teardown looks up that
exact email through the checked local Auth API, validates the returned email
and UID, then removes its grants, admin flag and Auth account by UID. It retains
no password or ID token for cleanup and never resets global Auth. An absent or
invalid lookup cannot certify that an uncertain signup will never commit;
cleanup fails explicitly. Owner-token requests are trusted local setup/cleanup,
never evidence of client authorization. No Firebase runtime endpoint override
or relaxed rule is needed for these fixtures.

Repeated owned account removal accepts only HTTP 400 with the exact Auth error
`USER_NOT_FOUND` as already absent. Other errors and uncertain transports still
fail cleanup. UID ownership is retained after Auth deletion so a later cleanup
can retry a failed grant or admin-flag removal.

The shared login helper selects the owned venue's `Display 1` with an escaped,
anchored accessible name that permits only the optional numeric `tengd`
connection badge. Presence can change between visibility and click. Perimeter,
`Display 10` and other venues remain outside that locator; independent display
and controller contexts remain required.

`seedInvitations` writes only registered owned child keys. It never replaces or
clears the invitations collection. The real admin callable still creates its
own generated IDs; the fixture discovers those by its owned recipient and
creator identities. Admin tests use separate owned role emails, select the exact
venue key rendered by the current name-or-key admin model, and check the set of
persisted true grants with an unrelated venue ordered before it. Another
fixture's invitation and venue must survive setup and invitation teardown,
including test failure paths.

RTDB omits an empty invitation `locations` object on readback. The fixture
returns an empty grant map for that absent child, while malformed present values
still fail discovery and cleanup. Registered IDs still require an owned recipient;
discovered generated IDs require both an owned recipient and creator. Transport
controls model this empty-child omission for seeded and generated invitations,
including later valid siblings and preservation of foreign records.

Fixture writes and signup calls register producers before transport. Shared
helper pages also observe the actual SDK `adminWrite` submissions, without
replacing the real callable. Admin invitation teardown and page teardown wait
for those responses while the page is still open. After closing worker browser
contexts, final cleanup drains submitted producers before its owned invitation
discovery, so a late authorized handler's generated ID is included. A lost,
aborted or malformed callable response leaves completion uncertain and fails
cleanup; context closure or removal of an admin flag cannot prove that a
previously authorized handler has finished. New fixture writes are rejected
once final retirement starts. Each REST request is bounded to five seconds and
final cleanup, including producer completion, shares a twenty-second bound.
An unresolved producer or an exceeded bound is incomplete cleanup, even if
best-effort removal finds no records.

Worker teardown retires only its registered
venue/state/audit/telemetry/presence children, account grants/admin flags/Auth
users, invitation IDs and Storage object prefixes. Cleanup failures fail the
worker; they are not silently ignored. `clearEmulatorData` remains the legacy
name for resetting that worker's state and location baseline before a case; it
does not reset other data or provide per-test Storage isolation.

The scorer and player-band specs seed their original binary objects through
`LocalFixture.uploadStorage`, using the same owned venue ledger and completion
barrier. The helper accepts nonempty bytes only below an exact registered venue
root, with bounded ASCII filename segments (letters, digits, underscore, hyphen
and dot; no traversal or encoded separators). It snapshots the bytes, uploads
them as `application/octet-stream`, and validates the returned object name, test
bucket and decimal generation string without coercing absent or malformed data.
Invalid input fails before transport. Lost or invalid acknowledgements remain
uncertain producers: best-effort object deletion cannot certify cleanup.

These specs no longer initialize a rules-test environment or install Storage
rules during collection or hooks. The owned emulator launcher must install the
repository's canonical Storage rules before execution. Record the source and
installation acknowledgement and verify actual public/private authorization
controls; an owner upload or local source hash is not proof of active rules.
The specs never silently repair a missing or incorrect rules setup. Their
browser SDK reads, immutable generations, pixel/timing assertions and separate
controller/display contexts remain real integration boundaries.

This is the conservative fixture slice of #232. The bespoke session, queue,
playback, nested-state and subscription-domain fixtures still have fixed roots
and/or namespace-wide rule installs/overlays. Per-test media isolation, exclusive
overlay lifecycles and worker-crash recovery remain follow-up work.
One worker is the default everywhere. No two-worker safety, sharding/report
aggregation, repeated performance result or complete deployment gate is claimed.
Keep #232 open for that follow-up.

Focused fixture safety controls use a transport model and actual
`functions/src/adminWrite.ts` source with injected in-memory Firebase
dependencies and browser request events. They cover committed signup response
loss, repeated/partial cleanup and a held post-authorization invitation commit.
Selector controls execute the actual login function and `ScreenSelectorButton`
source with its stylesheet at zero, one and two connections, including badge
arrival between visibility and click and unrelated button decoys. These use a
native DOM and modeled Page/presence hook; they are not real browser integration.
Binary transport controls cover exact bytes/generations, foreign prefixes,
malformed metadata, held/lost responses and failed cleanup. Declaration controls
execute the actual perimeter spec sources with modeled Playwright/helper imports;
their negative initializer uses the real rules SDK behind blocked HTTP/socket
transports. They do not execute hooks, browsers or emulators. Real collection
without emulators is a separate check after these controls pass.
These source/model controls do not qualify real emulator behavior. From
`clock/`, with Node 22 and Clock dependencies prepared:

```bash
node --experimental-transform-types --test --test-concurrency=1 tests/local-fixture.test.mjs tests/fixture-cleanup-source.test.mjs tests/fixture-selector.test.mjs tests/storage-fixture-imports.test.mjs
```

These native controls and focused E2E typed lint remain manual checks, outside
the current CI gates. The E2E TypeScript project has existing diagnostics and
is not a passing whole-project type gate; check focused repairs without claiming
that unrelated E2E/source typing is clean.

Actual admin/callable and full-suite qualification needs owned Auth, Database,
Storage and Functions services, canonical rules in the app namespace, and the
real served App. Use `--workers=1 --retries=0` for those qualification runs.
Independent controller/display roles retain separate browser contexts; the
worker fixture does not merge their auth or local storage.

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
