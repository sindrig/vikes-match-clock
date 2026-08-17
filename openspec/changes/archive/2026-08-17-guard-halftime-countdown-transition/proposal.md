## Why

The current auto-start alternative makes the clock advance into the next period without an operator decision. Retaining the existing paused transition is safer and simpler, but the controller must prevent an operator or stale controller from initiating another halftime countdown after the prior one has completed.

## What Changes

- Offer `Næsti hálfleikur` only while a paused match has reached its current first period boundary and another period boundary remains.
- Enforce the same eligibility rule inside the halftime-countdown action so direct or stale multi-controller requests cannot start an invalid second countdown.
- Preserve the paused state after a halftime countdown expires, keeping `Byrja` available to begin the next period manually.
- Preserve pre-match countdown behavior and all injury-time display modes other than halftime-transition availability.
- Do not persist a separate halftime flag; eligibility is derived from the existing elapsed time and remaining period boundaries.

## Capabilities

### New Capabilities
- `halftime-countdown-transition-safety`: Safe, manually controlled halftime countdown transitions between match periods.

### Modified Capabilities
- None.

## Impact

- `clock/src/controller/MatchActions.tsx` will derive the visibility of `Næsti hálfleikur` from the paused match state and remaining boundaries.
- `clock/src/contexts/FirebaseStateContext.tsx` will reject invalid halftime-countdown action requests before writing Firebase state.
- Relevant controller and Firebase context unit tests will cover eligible, completed, final-period, and stale/direct-action paths.
