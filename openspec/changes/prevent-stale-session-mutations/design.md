## Context

See `proposal.md` for motivation. The incident audit establishes this sequence:

1. A phone session started a pre-match countdown, then remained suspended for more than two hours.
2. The primary controller completed the countdown, played the first half, advanced halftime, and started the second half.
3. When the phone resumed, multiple expired asset callbacks and the old countdown callback ran before Firebase resynchronized the tab.
4. The obsolete countdown callback called the generic pause action with stale `countdown: true` state, writing only `started: 0` and revealing the persisted 45:00 second-half base.

Firebase remains the authoritative store and controllers remain peer clients. The current problem is not last-write-wins by itself; it is that rendering components produce commands and those commands are computed from browser-local refs without proving freshness or command preconditions.

## Goals / Non-Goals

**Goals:**

- Make mounting and resuming all timer-bearing presentation components safe.
- Retain equal multi-controller access without controller ownership, leases, heartbeats, or manual takeover.
- Preserve automatic countdown/period behavior through idempotent, conditional transitions.
- Prevent stale explicit controls from writing until Firebase has delivered current venue state.
- Establish a deterministic two-browser E2E reproduction before changing behavior.

**Non-Goals:**

- Moving clock ticks or clock ownership to a backend service.
- Replacing Firebase Realtime Database or last-write-wins for unrelated edits.
- Adding offline mutation queues.
- Redesigning match controls or perimeter brightness UI beyond safety feedback needed while resynchronizing.

## Decisions

### 1. Reproduce suspension as a two-context E2E test before implementation

Add a dedicated Playwright test using two independent browser contexts against the Firebase emulators:

```text
stale phone context                 active operator context
       |                                      |
       | start/load countdown generation A    |
       | freeze timers/network                 |
       |                                      | finish countdown A
       |                                      | establish 45:00 base
       |                                      | start generation B
       | advance fake time past expiry        |
       | resume stale callbacks                |
       +--------------------X----------------->| generation B unchanged
```

The test will model the observed stale state deliberately rather than depend on Chromium's operating-system tab freezing heuristics. It will use independent contexts, fake time, and controlled network/subscription interruption or page lifecycle dispatch so the stale client retains countdown generation A while the emulator advances to generation B. Before implementation, the assertion that generation B remains running must fail on current `master`; the failure output is retained in the implementation notes or task completion evidence. After implementation, the same test must pass unchanged.

The test also seeds a timed current asset and verifies resume does not produce stale queue consumption. This mirrors the audit burst and protects the wider passive-rendering requirement.

Alternative considered: unit-test only by injecting stale objects. Rejected because the failure involved browser suspension, timers, Firebase synchronization, and two sessions; unit tests remain useful for transition details but cannot establish the integration safety property.

### 2. Rendering components are read-only

`Clock`, `TimeoutClock`, `TwoMinClock`, and `Asset` will no longer call shared-state mutation functions solely from interval, timeout, media-end, mount, or resume callbacks. They may derive and display zero/expired state locally.

Automatic shared progression will be moved to a lifecycle coordinator/action layer outside rendering. The coordinator does not own the clock. It observes due transitions and submits a command containing the generation it observed.

Alternative considered: retain component side effects and add `document.visibilityState` checks. Rejected because visibility checks cover only one stale path, remain vulnerable to reconnect races, and leave rendering unexpectedly authoritative.

### 3. Identify timer generations using existing authoritative fields

Clock commands will carry preconditions derived from existing state, primarily the observed `started` timestamp plus the relevant mode/record identity:

- countdown completion: expected `started`, `countdown`, and `halftimeCountdown` values;
- match pause: expected running `started` value;
- timeout completion: expected `timeout` timestamp;
- penalty completion: expected penalty key and creation data;
- timed asset completion: expected current asset identity and active queue generation.

No persistent owner field is added. The `started`/timeout timestamp or command identity already changes when a new generation begins, so it acts as a compare token.

Alternative considered: add a general numeric revision to every state area. Deferred because existing identities appear sufficient for the affected timer transitions and avoid a migration. If implementation reveals an asset lacks stable identity, add the narrowest command revision needed rather than a global owner.

### 4. Revalidate automatic commands against Firebase before writing

An automatic transition must read current authoritative state and apply only if its precondition still matches. A Firebase transaction is preferred where a transition modifies one state subtree and can be expressed atomically. If audit atomicity requires a root multi-location update that cannot be combined directly with a transaction, use a callable trusted function or a narrowly scoped conditional-command record processed transactionally; do not weaken the audit guarantee.

The first implementation spike must choose the smallest mechanism that provides both:

- compare-and-set semantics against current state;
- one atomic mutation plus audit record for successful commands.

Duplicate attempts from several current controllers are harmless: the first changes the generation/state and subsequent attempts fail their precondition without mutation or audit.

Alternative considered: fetch once with `get()` and then call the existing update. Rejected because another controller can change state between read and write.

### 5. Treat hidden or disconnected clients as stale until resynchronized

Track write eligibility separately from rendered Firebase values:

- initial venue load is ineligible until all authoritative subscriptions required by actions have delivered;
- `visibilitychange` to hidden, `pagehide`, offline, or Firebase disconnect marks the client ineligible;
- visibility/resume/reconnect triggers an explicit current-state refresh or waits for a post-resume subscription delivery;
- controls and command functions reject writes while ineligible;
- no writes are queued for replay after eligibility returns.

This is a freshness barrier, not a second state store or hydration guard. Firebase remains authoritative; the barrier only determines whether this browser is allowed to submit a command based on its current subscription epoch.

Alternative considered: reload the whole page on every `pageshow`. Rejected as disruptive and insufficient on its own because timers can run before reload handling, although a reload may remain a fallback for unsupported browser lifecycle cases.

### 6. Keep explicit current-state operations available

Explicit pause/start controls remain peer operations. They submit expected-generation preconditions and fail closed if stale. Large backward time corrections remain possible through `Tímastjórnun`, but require confirmation and use a dedicated audit action or metadata that distinguishes intentional correction from ordinary updates.

Brightness remains an independent perimeter command. Opening its modal is read-only; submitting brightness is permitted only after the same freshness barrier passes.

## Risks / Trade-offs

- **[Browser lifecycle events differ across mobile Safari and Chromium]** → Combine lifecycle events with Firebase connectivity/subscription epochs; rely on fail-closed command guards rather than any single browser event.
- **[Removing renderer-owned expiry could leave an expired item visible if no current controller coordinates progression]** → Keep local visual expiry and allow any fresh authenticated controller to submit the idempotent conditional transition; document behavior for venues with displays only.
- **[Transactions and atomic audit writes may conflict]** → Resolve this in an implementation spike before broad refactoring; preserve audit atomicity even if a small trusted callable is required.
- **[Two contexts may race nondeterministically in E2E]** → Expose deterministic test-only lifecycle hooks or use controlled emulator writes/network routing, never production test flags that alter behavior.
- **[Freshness barrier could briefly disable controls during normal reconnects]** → Surface a concise resynchronizing state and restore controls immediately after current snapshots arrive; never replay clicks made while blocked.
- **[Existing queued asset model lacks a universal generation token]** → Use current asset key plus active queue/current item identity where adequate; add a narrow revision only if the regression test demonstrates ambiguity.

## Migration Plan

1. Add the failing E2E regression and focused unit tests without changing production behavior.
2. Introduce freshness tracking and conditional transition primitives behind existing context APIs.
3. Move timer-driven shared mutations out of render components one subsystem at a time: match countdown, timeout/penalties, then assets.
4. Run unit, E2E, lint, format, and production build checks.
5. Deploy to staging and manually verify two-device resume behavior before production.

Rollback is a frontend redeploy because no broad data migration is planned. If a narrow generation field becomes necessary, it must be optional during rollout and ignored safely by the prior frontend.
