## Why

After a halftime countdown finishes, the controller currently advances the
clock to the next period but leaves it paused. Both `Byrja` and `Næsti
hálfleikur` are then available, so an operator can accidentally begin another
halftime countdown and skip periods, as reported in issue #212.

## What Changes

- Start the next match period automatically when a halftime countdown reaches
  zero.
- Make the manual halftime-countdown action end the countdown early and start
  the next period immediately, with UI text that states this outcome.
- Retain the normal pre-match countdown behavior: its completion still waits
  for the operator to start the match.
- Add regression coverage for automatic and manual halftime transitions.
- Create a pull request for the implementation and apply the `sandbox-deploy`
  label to deploy the change to staging.

## Capabilities

### New Capabilities

- `halftime-countdown-transition`: Safely transition from a halftime countdown
  into the next active match period without an intermediate, error-prone
  controller state.

### Modified Capabilities

<!-- None. -->

## Impact

- Affects `clock/src/match/Clock.tsx`,
  `clock/src/contexts/FirebaseStateContext.tsx`, and
  `clock/src/controller/MatchActions.tsx`.
- Updates React/Vitest and potentially Playwright coverage for the clock
  control flow.
- Does not change Firebase schema, API contracts, or infrastructure.
