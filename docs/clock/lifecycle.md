# Match lifecycle and time formats

Read the [command boundary](../session-mutation-boundary.md) before changing
any timer or match command, and [playback occurrences](../playback-occurrences.md)
for asset completion identity.

Code paths in backticks are relative to `clock/src/` unless qualified. Update
this reference when changing the behavior it describes; see the
[task index](../README.md).

A suspended/hidden/offline browser must never mutate authoritative state with
obsolete timer-derived commands. The following rules are mandatory:

## Read-only rendering

Rendering components are read-only. `Clock`, `TimeoutClock`,
`TwoMinClock`, and `Asset` may derive and display expired/zero state locally
but MUST NOT call shared-state mutation functions from interval, timeout,
mount, resume, or `visibilitychange` callbacks — those effects never
correspond to an authoritative change. Automatic progression (countdown
completion, half-stops, timeout/penalty expiry, timed asset completion) is
routed through the `MatchLifecycle` coordinator (`src/match/MatchLifecycle.tsx`)
— mounted once in `App.tsx` — which submits generation-conditional actions.

The single permitted renderer-initiated input is `Asset`'s **natural media-end
event** (video / YouTube `onEnded`): a stale renderer must not clear a newer
asset, so it is not a blind mutation. It submits the generation-conditional
`completeAssetIfCurrent` observation under [conditional transitions](#conditional-automatic-transitions), and the CAS
precondition rejects it unless the current asset/queue still matches.

## Freshness and command origin

The [session contract](../session-mutation-boundary.md) owns readiness, recovery
delivery order, the current Auth SDK UID and synchronous origin invalidation.
`/.info/connected` is the Firebase connectivity signal; `navigator.onLine` is not
a write gate. Hide/resume, venue/auth A → B → A and unmount permanently retire
retained commands. Stale attempts reject without replay. The recovery notice
and disabled controls explain eligibility; they do not replace the boundary.

## Conditional automatic transitions

Automatic lifecycle progression uses Firebase `runTransaction` to re-validate its
precondition against CURRENT authoritative state before committing. Precondition
identities use existing match fields and a dedicated playback occurrence: `started`+`countdown`+
`halftimeCountdown` (clock), `timeout` (timeout), penalty `key`+creation data
(penalty), `currentAsset.occurrenceId`+asset/queue context (asset). An obsolete or duplicate
attempt aborts the transaction and leaves state unchanged. Only the first
concurrent attempt commits; only the committed winner requests an audit
append (`firebaseDatabase.writeAuditOnly`). The append is separate and may fail;
see [audit limits](audit.md#limits). For media completion (video /
YouTube end), `Asset.tsx` submits a `TimedAssetCompletionObservation` whose
`activeQueueId`/`playing` come from the rendered controller's live values —
not hard-coded `null`/`false` — so completion during active autoplay satisfies
the queue precondition and advances the queue instead of being silently dropped.

Playback observations carry a captured occurrence ID, or explicit null for
legitimate legacy playback. Legacy completion matches only a truly absent raw
ID field plus the existing tuple; its successor always receives a fresh ID.
Malformed present IDs reject parsing and raw CAS validation, never fall back to
legacy. Readers never generate IDs. New selections/replays/advances mint IDs;
metadata and pause changes preserve them. `PlaybackAsset` remounts live media
by the deferred rendered occurrence, so old natural-end callbacks keep their
old identity. Existing rules cannot constrain old binaries: coordinate client
refresh and retain the documented mixed-writer limit. See
[the playback occurrence contract](../playback-occurrences.md).

`MatchLifecycle` is **commit-aware and retry-safe**, so a transition that is due
while the client is ineligible is never lost and never latched prematurely:

- An attempt is submitted only while `writeEligible`. While ineligible the
  coordinator **defers** (it does not latch), so when the freshness barrier
  clears — e.g. after a resume/resync — the due transition is retried and
  commits. This prevents an expired countdown/penalty/timeout/asset from
  staying stuck after resync.
- A **per-generation in-flight guard** prevents concurrent duplicate
  submissions while a conditional write is pending; the guard clears when the
  attempt settles.
- The per-generation latch is set **only after the conditional action reports a
  committed (`true`) result**. An obsolete or failed attempt leaves the
  transition unlatched so the next tick retries it; once committed, the latch
  suppresses further attempts.
- The timed-asset due time is anchored once per observed current-asset
  generation and preserved across resyncs, so an ineligible completion is
  retried after eligibility returns **without restarting the asset's timer**.

Timeout warning/expiry thresholds are derived from the **same remaining-time
calculation as `TimeoutClock`** (which displays one extra second, `+1000`): the
warning buzzer fires when the displayed time reaches `00:10` (`remaining <=
10000`) and the timeout is cleared/buzzed when it reaches `00:00` (`remaining
<= 0`) — one second later than the raw `TIMEOUT_LENGTH` boundary.

## Explicit controls

`startMatch` and `pauseMatch` submit the observed generation as a precondition and fail closed
if authoritative state advanced to a newer generation. Backward time
corrections (Tímastjórnun) are audited distinctly
(`match.correct-time-backward`). While the client is
ineligible, **every** mutating match control in `MatchActions` is disabled —
not just the primary clock buttons: Reset, Tímastjórnun entry and its
adjustment buttons, the injury-time input, the handball timeout buttons, red
cards (`RedCardManipulation`), and penalties (`PenaltiesManipulationBox`). This
also prevents confirmation dialogs (Reset's `window.confirm`) from opening for
blocked actions. The context boundary
still rejects any write that slips through; disabling the controls is operator
feedback, not the safety mechanism.

Do not reintroduce renderer-side mutations, optimistic expiry or offline replay
queues. See the [observer regression](testing.md#stale-session-regression-observations)
for separate session-origin and generation-CAS checks.

## Match Control (`src/match-controller/`)

The operational heart of the app.

| Component         | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `ControlButton`   | Standardized buttons for scores/match events                         |
| `TeamController`  | Per-team controls (names, logos, penalties)                          |
| `MatchController` | Main dashboard for clock start/stop, half-time/full-time transitions |

## Display Screens (`src/screens/`)

| Screen       | Purpose                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------- |
| `ScoreBoard` | Primary match interface - clock, scores, penalties. Designed for visibility from distance |
| `Idle`       | Pre/post match or breaks - club logos, weather, configurable sponsor ad                   |

### Idle Ad Image

The idle screen can display an optional sponsor ad image. The image is selected from Firebase Storage (`{listenPrefix}/largeAds/`) and stored as a filename string in `states/${listenPrefix}/view/idleAd`.

- **No hardcoded images** — if `idleAd` is null/unset, no ad renders
- **Selection**: Dropdown in the "Idle skjár" panel of the advanced theme editor tab
- **Storage path**: `{listenPrefix}/largeAds/{filename}` — download URL resolved at render time
- **Firebase field**: `states/${listenPrefix}/view/idleAd` (string filename or null)

## Specialized Logic

### Clock Management (`src/match/Clock.tsx`)

- Main match timer with "half stops" (auto-stop at 45:00/90:00)
- Injury time display modes (see **Injury Time Display Mode** below)
- **Render-only**: the clock component never mutates shared state. Countdown
  completion and half-stops are applied by `src/match/MatchLifecycle.tsx`
  through generation-conditional, freshness-gated actions
  (`completeCountdownIfCurrent`, `applyHalfStopIfCurrent`). `TimeoutClock` and
  `TwoMinClock` are likewise render-only; their expiry goes through
  `removeTimeoutIfCurrent` / `removePenaltyIfCurrent`.

### Penalties/Red Cards

- `RedCardManipulation.tsx`: Player discipline management
- `PenaltiesManipulationBox.tsx`: Timed power plays (handball/futsal style)

### HalfStops (`src/controller/HalfStops.tsx`)

Ensures the clock stops exactly at period end (e.g., 45:00) even if the controller doesn't click precisely.

### Injury Time Display Mode

The legacy boolean `showInjuryTime` was replaced by the typed
`injuryTimeDisplayMode` field on `Match`. The mode applies after **every**
half-stop (not just the final one), matching the old behavior.

| Mode      | Behavior at half-stop                                                          |
| --------- | ------------------------------------------------------------------------------ |
| `stop`    | Pause, force seconds to `00`, buzz once (legacy `false`).                      |
| `full`    | Continue counting elapsed minutes and seconds (legacy `true`).                 |
| `minutes` | Continue counting, but render whole minutes with `:00` seconds (e.g. `91:00`). |

**Migration**: `firebaseParsers.ts` derives the mode from a legacy
`showInjuryTime` snapshot when `injuryTimeDisplayMode` is absent
(`false → "stop"`, `true → "full"`). The legacy field is never retained in
application state and never written. Read-only displays derive the mode
without writing; authenticated controllers persist the new field on their
next write.

**Controller**: `HalfStops.tsx` renders a three-option selector and calls
`setHalfStops(halfStops, mode)`. `MatchActions.tsx` shows the
"Næsti hálfleikur" button only for a paused, eligible match — the elapsed
time has reached the current first remaining period boundary (including
injury time) and a later period boundary remains — and the mode is not
`stop`. The `startHalftimeCountdown()` action in `FirebaseStateContext.tsx`
re-validates the same paused/boundary/remaining-boundary invariant before
writing, so stale or direct requests from other controllers are rejected
without a state change.

## Global Shortcuts (`src/hooks/useGlobalShortcuts.ts`)

Maps physical keyboard keys to Context actions for fast operation (e.g., Space for start/stop).

## Data Formats & Storage

### halfStops Storage Format

The `halfStops` array stores period end times in **minutes** (not seconds or milliseconds):

```json
{ "halfStops": [45, 90, 105, 120] }
```

Do not store seconds (`2700`, `5400`, …) or milliseconds (`2700000`, …).

**Why**: The app converts to milliseconds internally (`halfStops[0] * 60 * 1000`), so Firebase stores the human-readable minute values.

**Default configurations**:

- Football: `[45, 90, 105, 120]` (45 min halves + 2x15 min extra time)
- Handball: `[30, 60, 65, 70]` (30 min halves + 2x5 min extra time)

**Source of truth**: `constants.ts` defines `DEFAULT_HALFSTOPS` and `HALFSTOPS` lookup tables.

**Related files**:

- `contexts/firebaseParsers.ts` - Parses halfStops from Firebase (no transformation)
- `contexts/FirebaseStateContext.tsx` - Converts minutes → milliseconds for `timeElapsed`
- `controller/HalfStops.tsx` - Renders input fields based on `halfStops.length`
- `e2e/fixtures/test-helpers.ts` - Must initialize test data with minute values
