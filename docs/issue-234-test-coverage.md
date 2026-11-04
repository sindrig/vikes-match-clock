# Issue #234: bounded browser test consolidation

Base: reviewed/staging-qualified PR #278,
`ef2534cf8a1b02c8006ebfb62d0380666da0c0d4`.
Eventual PR base: `audit/242-session-mutation-boundary`.

Only tests and this document change. PR #281's files, runtime code, workflows,
timeouts, retries and skip policies remain untouched. The component replacement
passed before the five static browser cases were removed. It renders the real
`IdleVisualThemeEditor`, `DraggableElement` and `ColorPopover`, with only the
jsdom pointer-capture API supplied locally. It checks rendered controls and
their callbacks; existing helper tests are not counted as replacements.

## Removed case → replacement matrix

Paths in the first column are under `clock/e2e/`. Component replacements are
in `clock/src/controller/theme/IdleVisualThemeEditor.spec.tsx`.

| Removed case/assertions                                                                                | Replacement and retained integration coverage                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle-visual-editor`: `shows instructions text`                                                        | Component: `explains dragging and clicking alongside the four editable elements` checks the full instruction and four element labels/content. Browser four-element/modal journey retained.                                                |
| `idle-visual-editor`: static labels/fields/units inside `opens color popover when clicking an element` | Component: parameterized clock/temperature cases open the real popover, check exactly `Litur`, `Stærð`, both inputs and `px`, then verify color/size callbacks and field names. Browser opening interaction retained.                     |
| `idle-visual-editor`: `does not show stroke or font-family controls in idle popover`                   | Component: both text elements assert no stroke slider or font selector; exact label list also rejects extra fields.                                                                                                                       |
| `idle-visual-editor`: `popover does not show font size for elements without fontSizeField`             | Component: both logo and ad cases open the real popover and reject sliders, number inputs, font selector and size label.                                                                                                                  |
| `idle-visual-editor`: `font size slider uses px units and correct range`                               | Component: clock/temperature check min 10, max 120, step 1, delivered value, numeric value, unit and pixel-valued size callbacks.                                                                                                         |
| `idle-visual-editor`: `color swatch and transparent toggle are present`                                | Component: actual color input, visible checkbox, click to transparent, delivered theme rerender/indicator, keyboard toggle back and restored swatch.                                                                                      |
| `assets`: `shows Birta button when queue has items`                                                    | Retained `adds a URL asset, plays its queue, shows the playback bar and stops`: empty queue/no play button → add → one queue/item → visible play → real playback/overlay.                                                                 |
| `assets`: `shows playback bar when queue is active`                                                    | Same journey checks visible playback bar and absent non-queue clear button after playback.                                                                                                                                                |
| `assets`: `stops playback and clears overlay when stop button is clicked`                              | Same journey clicks Stop and checks both bar and overlay disappear. Separate multi-item, delete queue, autoplay/loop popover, show-now and validation journeys retained.                                                                  |
| `admin`: `admin sees Stjórnborð link on screen selector`                                               | Retained `create invitation shows in table` checks visible link and Admin badge, follows link and checks `/admin` URL before the real callable-backed mutation.                                                                           |
| `admin`: `non-admin does not see Stjórnborð link`                                                      | Retained non-admin route authorization journey checks absent link then direct `/admin` denial.                                                                                                                                            |
| `admin`: `navigate to /admin as admin shows portal`                                                    | Retained invitation creation checks portal heading, user-management and pending-invitation sections after actual link navigation. Delete journey still navigates directly to `/admin`.                                                    |
| `admin`: `admin portal shows pending invitations section`                                              | Same creation journey checks section, opens the actual invitation dialog, checks its title, submits and checks the resulting table entry. Delete/confirmation journey retained.                                                           |
| `match-flow`: `sets team logos and displays them on scoreboard`                                        | Verified duplicate: `basic-navigation` / `starts the clock and does some things` already sets away team to `fram` and asserts one image with `/Fram/` source. Its selector is now explicitly `.team.away img`, matching the deleted case. |
| `penalties`: `penalty button is disabled when match clock is running`                                  | First retained penalty lifecycle journey explicitly checks enabled before start, disabled while running, enabled after stop, then adds/resumes/expires a real penalty. Basic-navigation also retains its running-state gating assertion.  |

Fourteen complete browser cases are removed; one additional retained case loses
only its static control details. Five idle browser cases remain, including
popover opening/outside dismissal, modal tabs and real pointer dragging.
The drag journey now requires both coordinates to change, reads the saved
coordinates from the emulator and verifies both again after document reload.
Its initialization preserves browser storage across that reload.

All other browser specs remain in place, including uploads, independent display
contexts, queue semantics, stale sessions, clock/penalty lifecycle and real WebGL
pixel checks. No PR #281 queue-intent implementation or tests are imported.

## Verification and limits

Verification records, harnesses and machine-readable results are retained outside
`/tmp` at `/home/paseo/.local/share/vikes-audit-coordination/audit-234/`.
All install/test/lint/build commands and the complete owned emulator/browser
lifecycle run through the coordinator's `check.sh`, without nesting, with
`corepack pnpm@10.34.9` in `clock/`, Node heap capped at 1024 MiB, two unit workers
or one browser worker, within the host's 4-CPU/6-GiB cgroup. Java uses the supplied JDK 21;
Firebase CLI is 15.34.2. Chromium uses both supplied library directories and
`browser-deps/fonts.conf`. External browser traffic is blocked by an unreachable
proxy and local-only DNS resolution. No staging credentials or cloud/hardware
services are used.

The external readiness harness installs and reads back rules in the exact app
namespace `vikes-match-clock-test`, checks real SDK accepted/denied writes,
checks Storage HTTP readiness, and exercises actual Functions callables before
the browser suite. Verification-only mutation plugins transform served/in-memory
source; tracked runtime files are never edited for negative controls.

The final lifecycle also preloads a Node socket guard that permits loopback
connections and records/blocks external destinations. Firebase CLI 15.34.2's
proxy handling did not exempt its own emulator rules upload, so a blanket CLI
proxy was rejected during harness setup rather than bypassing that readiness
check. The supplied `pnpm` launcher uses a major-only version; the final build
uses an external launcher pinned to `pnpm@10.34.9` for nested package scripts.

Component negative controls each failed with actual test assertions, rather
than import/setup errors (`negative-component-summary.log` and individual JSON
reports):

| In-memory regression                                        | Failed component cases |
| ----------------------------------------------------------- | ---------------------: |
| Remove dragging instructions                                |                      1 |
| Replace the idle color field label                          |                      4 |
| Add scoreboard stroke/font-family controls to idle popovers |                      4 |
| Add a text-size control to the logo                         |                      1 |
| Change pixel slider maximum from 120 to 119                 |                      2 |
| Render `rem` instead of `px`                                |                      2 |
| Hide the transparency toggle                                |                      3 |
| Send the slider change to the wrong theme field             |                      2 |

Eight browser negative controls also failed at their intended assertions
(`negative-browser-summary.log`, individual JSON reports and traces):

| Served regression                                          | Replacement assertion that failed                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Hide the playback bar                                      | Consolidated queue journey: visible bar after Play (`assets.spec.ts:45`)                                                             |
| Make Stop do nothing                                       | Same journey: bar disappears after Stop (`assets.spec.ts:49`)                                                                        |
| Hide the admin selector link                               | Callable invitation journey: visible Stjórnborð link (`admin.spec.ts:81`)                                                            |
| Remove the pending-invitation heading                      | Same journey: visible Boð í bið section (`admin.spec.ts:90`)                                                                         |
| Replace team crest source                                  | Retained clock journey: away crest source matches Fram (`basic-navigation.spec.ts:58`)                                               |
| Enable penalty control while running                       | Retained penalty lifecycle: disabled control after Start (`penalties.spec.ts:48`)                                                    |
| Suppress the drag's save callback                          | Drag journey: emulator readback must contain both new coordinates (`idle-visual-editor.spec.ts:145`)                                 |
| Save normally, but render default coordinates after reload | Drag journey passes its database/movement checks, then fails the post-reload coordinate assertion (`idle-visual-editor.spec.ts:172`) |

An earlier admin-link mutation could not match its transform target and caused
an import error. The harness rejected that attempt because it did not fail at
the expected assertion; it is preserved in `rejected-negative-attempt/` and is
excluded from the sixteen successful negative controls. The corrected run
completed all eight browser controls with no retries or skips. In particular,
the reload-only control demonstrates that database readback alone cannot
satisfy the retained drag journey.

No base/head performance comparison is claimed. Head execution durations below
are check timings, not measured savings; the issue's estimated 20–35 seconds is
not an implementation result.

| Check                              | Result / measured scope                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replacement before E2E removal     | 6 rendered component tests passed; 2.49 s Vitest invocation (`component-before-removal.log`)                                                                                                                          |
| Full component/unit suite          | 1,934 tests in 89 files passed; 78.22 s (`unit-full.log`)                                                                                                                                                             |
| Full retained browser suite        | 65 passed, 0 failed/skipped/flaky, retries disabled; 245.701 s Playwright invocation, excluding emulator startup (`browser-qualified.json`)                                                                           |
| Lint and full `src e2e` formatting | Passed (`lint.log`, `format-check.log`)                                                                                                                                                                               |
| Production TypeScript/Vite build   | Passed (`build-final.log`); total build duration was not separately instrumented                                                                                                                                      |
| Rules / SDK / callable readiness   | Exact namespace rules readback; accepted state write and valid audit; unauthenticated, wrong-venue and otherwise-valid forged-UID denials; admin list denial/acceptance plus actual callable invitation create/delete |
| Negative controls                  | 8 component and 8 browser mutations caught by their intended replacement assertions                                                                                                                                   |
| Owned resource cleanup             | Lifecycle exited successfully; all seven owned service ports verified free (`cleanup-proof.json`)                                                                                                                     |

The first full browser run passed 64/65. Its added reload oracle compared
`80.0%` to the browser's equivalent serialized `80%`; the final oracle compares
numeric percentage coordinates while retaining the saved-state and visible
movement checks. That initial failure is retained in `browser-full.json` and
its trace; the clean result above is a separate full run, not a retry or a
base/head performance comparison.

Browser verification covers emulator state and local media. External fonts,
analytics and YouTube traffic are blocked; the separate local weather API is
not running. These checks do not qualify live external playback, cloud services
or physical stadium hardware.
