## 1. Halftime Transition Guard

- [x] 1.1 Update `clock/src/controller/MatchActions.tsx` to show `Næsti hálfleikur` only for a paused, eligible non-final period while retaining the existing injury-time mode restriction.
- [x] 1.2 Update `startHalftimeCountdown()` in `clock/src/contexts/FirebaseStateContext.tsx` to no-op unless the current match state satisfies the same elapsed-boundary and next-boundary eligibility invariant.
- [x] 1.3 Preserve the existing halftime expiry path so it leaves the next period paused and the normal `Byrja` action available.

## 2. Test Coverage

- [x] 2.1 Add or extend `MatchActions` tests for eligibility at 45:00 and injury time, unavailability after a completed countdown, and unavailability at the final period.
- [x] 2.2 Add or extend Firebase state context tests for valid halftime transitions and rejection of stale/direct requests after completion and at the final period without Firebase state writes.
- [x] 2.3 Verify pre-match countdown and existing injury-time display-mode coverage remain unchanged or add focused regression coverage where absent.

## 3. Verification

- [x] 3.1 Run the relevant Vitest controller and Firebase context test suites.
- [x] 3.2 Run the clock frontend lint and formatting checks required by the repository.
