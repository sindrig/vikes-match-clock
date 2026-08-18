## Context

The existing `useAuditHistory` hook subscribes to a ten-record Firebase query
and the `AuditHistory` component maps that result to event cards. See
`proposal.md` for motivation and the modified `firebase-audit-trail`
specification for behavior.

## Goals / Non-Goals

**Goals:**

- Fetch audit events in small, timestamp-ordered batches without reading the
  full retained history.
- Append older events while preserving the visible newest-first sequence.
- Make fixed event metadata readily scannable in a semantic table.

**Non-Goals:**

- Direct page navigation, event search, filters, sorting controls, or changes
  to audit event storage, rules, or retention.
- Optimistic audit state or a client-side cache that outlives the selected
  venue.

## Decisions

### Use keyset pagination on event timestamps

The initial subscription remains limited to ten newest events. A request for
older history uses the current oldest event timestamp as an exclusive cursor,
fetches the next bounded batch, removes any cursor overlap, validates the
snapshot, and merges unique events into the displayed newest-first list.

This avoids offsets, which Firebase Realtime Database does not support
natively and which would require reading skipped history. Fetching the full
history and slicing in React was rejected because it violates bounded reads.

### Keep loaded events in hook state and reset by venue

The hook owns both the live newest batch and explicitly loaded older batches.
It resets pagination state when the selected venue or authorization context
changes. The live newest subscription updates the newest batch; previously
loaded older events remain only when they do not duplicate a live event.

This keeps Firebase authoritative while allowing an operator-triggered,
bounded read to accumulate history in the current view. Replacing the live
subscription with one large one-time request was rejected because new audit
events would no longer appear automatically.

### Render event metadata as a responsive semantic table

`AuditHistory` will render one row per event with columns for timestamp, user
ID, session ID, action, state area, and changed fields. The table container
will remain horizontally scrollable on narrow controller screens so values are
not truncated or rearranged into cards.

Keeping cards was rejected because comparison of identifiers and other stable
fields requires scanning repeated, vertically ordered labels.

## Risks / Trade-offs

- [Equal timestamps can make a timestamp-only cursor ambiguous] → Include the
  cursor record in the bounded query, then remove it by event ID before merging
  so it is neither duplicated nor skipped.
- [New live events can overlap a previously loaded batch] → Deduplicate merged
  events by their Firebase event ID and consistently sort newest first.
- [Wide values reduce mobile readability] → Preserve table semantics and allow
  horizontal scrolling rather than hiding required metadata.

## Migration Plan

1. Deploy the frontend with the new bounded query and table view; Firebase
   records and security rules remain compatible.
2. Roll back by deploying the previous frontend; no data migration is needed.
