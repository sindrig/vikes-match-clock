## Context

The proposal and `halftime-countdown-transition-safety` specification require a manually started next period and protection against invalid repeated halftime countdowns. Match state already distinguishes the relevant phases: before transition, `timeElapsed` is at or beyond `halfStops[0]`; after a countdown expires, it is set to the completed boundary while `halfStops` is advanced to the next boundary. Firebase remains the authoritative state across multiple controllers.

## Goals / Non-Goals

**Goals:**
- Derive transition eligibility from the current Firebase match state in both the controller and action layer.
- Keep countdown expiry behavior paused and retain the regular start action.
- Prevent invalid state writes from stale or directly invoked controller actions.

**Non-Goals:**
- Auto-start the next period after halftime.
- Add or synchronize an `isHalfTime` field.
- Change pre-match countdown behavior or injury-time display semantics.

## Decisions

### Use remaining-boundary state as the transition invariant

An action is eligible only when `!started`, `timeElapsed >= (halfStops[0] ?? Infinity)`, and `halfStops.length > 1`. The first condition matches paused operation, the comparison detects that the current period has ended (including injury time), and the length condition establishes that a following period exists.

`halfStops.length > 1` is the minimal reliable final-period check because the existing pause transition removes the completed boundary only when another one remains. A single remaining boundary therefore represents the final period boundary, and an empty list also cannot transition.

Alternative considered: persist an `isHalfTime` boolean. This would duplicate derivable state and require Firebase synchronization, parsing, reset, and lifecycle behavior, creating more ways for controllers to disagree.

### Enforce the invariant at both interaction and action boundaries

`MatchActions` uses the invariant to hide `Næsti hálfleikur`; `startHalftimeCountdown()` re-evaluates it against its current match state before preparing a Firebase write. The action-level check is authoritative for stale UI, multiple controllers, and direct invocations.

Alternative considered: UI-only protection. That prevents the common operator error but permits stale clients to mutate state incorrectly.

### Preserve existing expiry flow

The existing expiry path continues to clear countdown state, pause at the completed boundary, and advance the remaining boundaries when a next period exists. No new post-expiry state is introduced, so the standard `Byrja` action naturally remains visible and starts the next period.

Alternative considered: auto-start at expiry. It removes an operator action but changes established match-control behavior and makes inadvertent advancement harder to correct.

## Risks / Trade-offs

- [Boundary arrays can be customized] → Base eligibility only on their live order and length, not football-specific minute values.
- [Controller state can be stale] → Repeat validation inside the Firebase-writing action; normal last-write-wins semantics remain unchanged.
- [A caller could expect a result from a rejected void action] → Keep rejection as a no-op consistent with the existing action interface and verify no Firebase write occurs in unit tests.

## Migration Plan

Deploy as a frontend change with no persisted schema or Firebase data migration. Roll back by reverting the controller eligibility and action guard; existing match documents remain compatible.
