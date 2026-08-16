## Context

See proposal.md for the motivation and
specs/halftime-countdown-transition/spec.md for the required behavior.

The public clock detects countdown expiry and currently calls the generic pause
action. That action recognizes halftime countdown state and moves the match to
the next period, but leaves `started` unset. The controller therefore renders
both the normal start control and `Næsti hálfleikur`, allowing another
countdown to skip the newly armed period.

## Goals / Non-Goals

**Goals:**

- Make both automatic expiry and explicit early start transition atomically to
  a running next period through Firebase.
- Keep pre-match countdown expiry paused.
- Make the manual halftime action unambiguous in Icelandic.

**Non-Goals:**

- Change halftime duration, period configuration, injury-time display modes,
  or pre-match countdown controls.
- Add persistent transition markers or alter the Firebase match schema.

## Decisions

### Add a dedicated next-period start action

Create a Firebase-backed action that clears halftime countdown state, sets
`timeElapsed` to the current next-period boundary, removes that boundary from
`halfStops` when another remains, and sets `started` to server-adjusted current
time in one write.

Countdown expiry will invoke this action only for a halftime countdown. The
manual halftime button invokes the same action, so early and natural expiry
cannot diverge. The displayed action will be renamed from `Stöðva
niðurtalningu` to wording that explicitly starts the next half.

Using the existing generic pause action was rejected because pause semantics
must leave ordinary elapsed time stopped. Adding an "armed" Firebase flag was
rejected because it creates a new persisted state solely to represent an
intermediate state that this design removes.

### Preserve pre-match countdown path

The countdown-expiry caller will branch on `halftimeCountdown`: halftime uses
the new transition action; pre-match retains the existing pause behavior. This
limits the behavioral change to issue #212's flow.

### Test state transitions at the context boundary

Context tests will assert the complete Firebase updates for early start and
the shared next-period action. Clock/component tests will prove that expiry
selects the correct action for halftime versus pre-match countdowns. A focused
controller test will verify the changed action label and absence of the next
half action while the period is running.

## Risks / Trade-offs

- [Countdown expiry can be observed by multiple display clients] → Firebase
  last-write-wins is already used; the action derives one identical next-period
  state, and tests will cover a single invocation path.
- [An operator might need to hold the next period after ending a countdown] →
  the defined manual action is an intentional early start; operators can pause
  the running clock immediately if needed.
- [Icelandic label ambiguity] → use a reviewable label that contains both
  `Byrja` and `næsta hálfleik` before staging deployment.

## Migration Plan

1. Deploy through the normal pull-request flow with the `sandbox-deploy` label.
2. Exercise pre-match countdown, natural halftime expiry, and manual early
   start on staging.
3. Merge after operator validation; production deploys from `master`.
4. Roll back by reverting the implementation commit if the revised transition
   behavior is unsuitable; no data migration is required.
