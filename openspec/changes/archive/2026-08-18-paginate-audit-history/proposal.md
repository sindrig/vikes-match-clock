## Why

The audit inspection view only shows the ten newest events, preventing
operators from investigating older changes. Its card layout also makes it hard
to compare stable fields such as operator user IDs across multiple events.

## What Changes

- Add an incremental "show older events" control that appends the next older
  audit-history batch to the currently visible events.
- Replace the audit-event card list with a compact, responsive table that
  exposes each event's fixed metadata in consistent columns.
- Retain newest-first ordering, bounded Firebase reads, and the existing empty
  and access-denied behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `firebase-audit-trail`: Allow authorized operators to load older bounded
  audit-history batches and inspect events in a tabular view.

## Impact

- Affects the React audit-history hook, audit-history controller component,
  and their Vitest coverage in `clock/src/controller/audit/`.
- Uses Firebase Realtime Database timestamp queries; no backend, schema, or
  dependency changes are expected.
