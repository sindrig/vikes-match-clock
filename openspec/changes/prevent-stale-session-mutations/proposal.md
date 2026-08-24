## Why

A suspended authenticated browser resumed during a live match with stale pre-match countdown state and immediately paused the shared clock, moving the stadium display from approximately 83:32 back to 45:00. Rendering a clock or timed asset must not be able to mutate authoritative Firebase state merely because a tab mounts, resumes, or catches up delayed timers.

## What Changes

- Make match-clock, timeout, penalty, and asset rendering passive: elapsed timers may update presentation but may not issue shared-state mutations solely because time passed or a component resumed.
- Route automatic match lifecycle transitions through explicit, current-state-aware controller behavior rather than render callbacks.
- Introduce a client freshness barrier that blocks authenticated mutations after browser suspension or connectivity loss until Firebase has delivered current state.
- Preserve multi-controller operation without electing an authoritative controller or requiring an ownership lease.
- Add a two-session Firebase-emulator E2E regression that reproduces a suspended stale countdown session, first demonstrates the failure on the current implementation, and then proves resume cannot alter the live match clock.
- Cover delayed asset timers and other resume-time side effects so reopening a stale tab cannot consume queues, clear overlays, expire penalties, or stop a timeout.

## Capabilities

### New Capabilities
- `stale-session-mutation-safety`: Defines passive rendering and freshness requirements for authenticated clients that mount, reconnect, or resume after suspension.

### Modified Capabilities
- `halftime-countdown-transition-safety`: Requires countdown completion and halftime transitions to remain safe when another controller is stale or suspended.

## Impact

- Affects the React/Firebase state boundary in `FirebaseStateContext`, browser lifecycle handling, match and auxiliary clock components, and timed asset playback.
- Adds multi-context Playwright coverage using the Firebase emulators and may add focused Vitest coverage for extracted transition logic.
- Does not change the Firebase data model, introduce a server clock worker, or assign ownership to a controller.
- Automatic visual expiry remains possible locally, but shared-state progression must occur only from fresh, validated command paths.
