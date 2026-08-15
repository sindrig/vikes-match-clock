## 1. Audit Data And Atomic Writes

- [x] 1.1 Define typed audit-event and state-area/action types, plus a
  session-storage helper that creates and returns one opaque browser-session
  ID.
- [x] 1.2 Add a Firebase root multi-location update helper that writes the
  requested state paths and an audit event atomically with a server timestamp.
- [x] 1.3 Route match, controller, view, and perimeter state actions through
  the audited helper with stable action names and exact changed-path maps.
- [x] 1.4 Route club-override and other remaining authenticated client writes
  through the audited helper, including creates, updates, and deletions.
- [x] 1.5 Preserve the existing subscription-driven UI model and ensure failed
  audited writes neither update local shared state nor create audit events.

## 2. Audit Access And Inspection

- [x] 2.1 Add Firebase Realtime Database rules for authorized venue reads,
  append-only audit-event creation, writer-UID validation, required event
  fields, and denied updates/deletes.
- [x] 2.2 Add safe audit-event parsing and a bounded Firebase subscription for
  recent events at the selected venue.
- [x] 2.3 Add an authenticated controller `Breytingasaga` inspection view with
  newest-first entries, event details, loading, empty, and permission-error
  states.
- [x] 2.4 Implement and deploy a daily trusted cleanup job that paginates audit
  records and deletes only records older than the 90-day retention period.

## 3. Verification And Rollout

- [x] 3.1 Add unit tests for session identity, audit-event construction,
  multi-location update paths, action attribution, and failure behavior.
- [x] 3.2 Add Firebase Emulator rules tests proving authorized creation,
  denied impersonation, denied audit modification/deletion, and denied
  unauthorized reads.
- [x] 3.3 Add component tests for audit-history ordering and empty/error
  rendering, including a reset event's visible details.
- [x] 3.4 Run `pnpm format`, `pnpm lint`, relevant Vitest suites, Firebase
  Emulator rules tests, and a staging smoke test covering start, pause, reset,
  view change, and perimeter mutation audit records.
- [x] 3.5 Test the scheduled cleanup with records on both sides of the 90-day
  boundary and verify pagination, retained recent records, and safe retries.
