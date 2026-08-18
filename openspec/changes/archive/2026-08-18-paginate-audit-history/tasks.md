## 1. Bounded History Pagination

- [x] 1.1 Extend `useAuditHistory` to retain the live newest batch and append
  a validated, deduplicated bounded batch older than the current cursor.
- [x] 1.2 Expose older-history availability, loading, and retrieval state while
  resetting pagination whenever the active venue changes or inspection closes.
- [x] 1.3 Add hook tests for timestamp-cursor overlap removal, newest-first
  merged ordering, exhausted history, and venue resets.

## 2. Tabular Inspection View

- [x] 2.1 Replace audit-event cards with a semantic table showing timestamp,
  user ID, session ID, action, state area, and changed fields.
- [x] 2.2 Add a "show older events" control that invokes the hook, reflects an
  in-progress request, and is absent once history is exhausted.
- [x] 2.3 Update audit-history styles for readable fixed columns and horizontal
  scrolling on narrow controller screens.

## 3. Verification And Documentation

- [x] 3.1 Add or update component tests for table metadata, loading older
  events, and the exhausted-history state.
- [x] 3.2 Update `clock/AGENTS.md` with the paginated table inspection flow.
- [x] 3.3 Run the affected Vitest suite, `pnpm format`, and `pnpm lint` in
  `clock/`.
