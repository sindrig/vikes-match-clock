## Why

The shared match-clock state can currently be changed by any authenticated
controller without an attributable history. When a clock is unexpectedly
stopped or reset, operators cannot determine which session performed the
action or reconstruct the state transition after the fact.

## What Changes

- Record an immutable audit event for every authenticated client mutation of
  shared Firebase match, controller, view, and perimeter state.
- Include the venue, authenticated operator identity, per-browser session
  identity, timestamp, action name, and the fields written in each event.
- Write the state mutation and its audit event atomically so successful
  operations cannot lack an audit record and failed operations create none.
- Add an authenticated inspection view that lets authorized operators review
  recent audit events for a venue after an incident.
- Protect audit records with Firebase rules so clients cannot alter or delete
  existing history and cannot write an event that claims another operator.
- Retain audit records for 90 days, then remove expired records through a
  scheduled trusted cleanup process so database storage remains bounded.

## Capabilities

### New Capabilities
- `firebase-audit-trail`: Captures, protects, and exposes attributable history
  for shared Firebase state mutations.

### Modified Capabilities

- None.

## Impact

- Affects `clock/src/contexts/FirebaseStateContext.tsx`, Firebase database
  write helpers, local session identity handling, controller/admin UI, and
  Firebase Realtime Database rules.
- Adds an audit-log subtree to Firebase Realtime Database and may require a
  server-clock timestamp source compatible with Firebase atomic updates and a
  scheduled Firebase/AWS trusted cleanup job.
- Requires Vitest coverage for audit event creation and Firebase Emulator
  coverage for audit write and immutability rules.
