# Firebase audit trail (Breytingasaga)

This is the current audit implementation and its limits. Read the
[command boundary](../session-mutation-boundary.md#conditional-transitions-and-limits)
for current-session eligibility and CAS submission.

Code paths in backticks are relative to `clock/src/` unless qualified. Update
this reference when changing the behavior it describes; see the
[task index](../README.md).

Every authenticated client mutation of shared match, controller, view,
perimeter, or club-override state is recorded as an immutable, attributable
audit event so operators can reconstruct an incident after the fact.

**Data model** — events live under `audit/{location}/{eventId}` (outside
`states/`), one per mutation:

```json
{
  "timestamp": 1723392000000,
  "uid": "auth-uid",
  "sessionId": "uuid",
  "action": "match.start",
  "stateArea": "match",
  "changes": "{\"started\":1723392000000}"
}
```

- `changes` is the exact update-path map sent to Firebase (including `null`
  deletions), enough to reconstruct the command. It is stored as a **JSON
  string** because Realtime Database prunes null children on write: an object
  like `{ "overlay": null }` would collapse to an empty node, truncating the
  deletion record (and failing the `changes != null` rules validation).
  `writeAuditedState()` serializes it; `parseAuditEvent()` decodes it back.
- `timestamp` is a Firebase `serverTimestamp()`; never trust a device clock.
- `stateArea` is one of `match | controller | view | perimeter |
clubOverrides`.

**Atomicity** — state mutation and audit record are committed in **one root
`update()`** by `writeAuditedState()` in `firebaseDatabase.ts` (also exposed as
`firebaseDatabase.writeAudited`). Either both land or neither does: a failed
write creates no event and no state change. Diff keys (which include nested
paths like `queues/{id}`) are expanded into full leaf paths in the update map:
an `update()` value object cannot contain keys with `/`, so writing the diff as
a whole node value would be rejected or clobber sibling state.

**Conditional (CAS) transitions** — automatic lifecycle transitions
(`MatchLifecycle`) and generation-conditional explicit commands share current-session
eligibility (also checked on transaction retries) but do NOT use
`writeAudited`. They run a `runTransaction` on the state subtree to atomically
re-validate the observed generation precondition and commit the mutation, then
request one audit append via `firebaseDatabase.writeAuditOnly` (audit
only, no state). A transaction returning `undefined` aborts (obsolete/duplicate
attempt). The transaction applies only its audited diff to the raw authoritative
node, omitting undefined update values. Unchanged parsed/defaulted collections
and unknown metadata are not written back as an incidental migration.

**Retry-safe commit** — the CAS helpers (`applyMatchConditionalTransition`,
`applyControllerConditionalTransition` in `FirebaseStateContext.tsx`) treat the
transaction as committed **only** when the resolved result's `committed` flag
is `true`, and they reset the candidate diff at the start of every update-function
invocation. Firebase may re-run the update function when the node changes
concurrently; a retry can observe a newer generation and abort (`undefined`)
even though an earlier invocation would have passed. Because the helper trusts
the final `committed` result and discards each invocation's candidate diff,
such an aborted attempt returns `false` and writes **no** audit — a stale or
concurrently-obsoleted attempt never reports success or leaves a spurious
audit record.

**Write routing** — ordinary state writes flow through `writeAudited`; the
conditional actions described above use transactions:

- `applyMatchUpdate`/`applyControllerUpdate`/`applyViewUpdate` take a stable
  action string (e.g. `match.update`, `match.reset`,
  `controller.select-view`, `view.set-theme`).
- `updateMatch` uses `match.update`; a dedicated `resetMatch()` context action
  emits `match.reset` (used by the Reset button in `MatchActions.tsx`).
- Perimeter actions use `perimeter.set-state`, `perimeter.skip-cue`,
  `perimeter.set-overlay`,
  `perimeter.clear-overlay`, `perimeter.set-ad-layout`,
  `perimeter.set-goal-video`, `perimeter.create-media-pair`,
  `perimeter.delete-media-pair`, `perimeter.set-media-pair-main-screen`,
  `perimeter.set-scorer-celebration`,
  `perimeter.set-player-display-style`, `perimeter.set-substitution-style`.
- Club overrides use `clubOverrides.create|update|save|delete` (both the
  context actions and `ClubOverrideForm.tsx`, through `commitClubOverride`).
- Brightness/config use `perimeter.set-brightness` and
  `perimeter.set-brightness-auto`; auto config retains its server timestamp.

**Identity** — `FirebaseStateProvider` accepts a `uid` prop (passed from
`index.tsx` as `auth.uid`) for the accountable operator. `getOrCreateSessionId()`
in `lib/sessionId.ts` returns one opaque UUID per browser session, stored in
`sessionStorage` (regenerated per session, survives reloads, never an identity
substitute). `MutationSession.audit()` owns that identity and validates the
current command origin. `executeCommand` rejects obsolete/ineligible commands before any writer
call; save APIs propagate rejection and keep drafts open. Void button adapters
explicitly discard the centrally reported promise without unhandled rejections.

**Firebase rules** (`firebase-rules.json`) — `audit/{location}` reads require
venue authorization; event creation requires the same authorization, all
required fields with correct types, and `newData.child('uid').val() ==
auth.uid` (denies impersonation). Updates and deletes are denied (append-only).
Rules cannot prove an event was paired with a sibling state write, which is
accepted because the same authorized user can already change that state. The
location rule declares `.indexOn: ["timestamp"]` so the bounded
`orderByChild("timestamp")` inspection queries (newest batch and the
keyset-cursor older-batch request) are served without "Index not defined"
errors.

**Inspection** — `controller/audit/useAuditHistory.ts` subscribes to the
venue's recent events with a bounded `orderByChild("timestamp")` +
`limitToLast(RECENT_EVENT_LIMIT)` (50) query, newest first, only while the
modal is open. It keeps the live newest batch separate from explicitly loaded
older batches and merges them newest first, deduplicating by Firebase event id.
A "load older" request uses **keyset pagination**: the oldest visible event's
timestamp becomes an inclusive `endAt` cursor with the same `limitToLast`
bound; the cursor record (plus any same-timestamp peer still in the visible
list) is removed by id after the fetch so returned rows are not duplicated, and the remaining validated batch is
appended. This timestamp-only cursor has the limits below. The hook exposes
`hasOlder` (a short returned batch means history is exhausted), `loadingOlder`
(an in-progress request), and `loadOlder()`; pagination is reset whenever the
active venue changes or the modal closes. `controller/audit/AuditHistory.tsx`
renders the `Breytingasaga` modal (opened from a settings row in
`Controller.tsx`) as a semantic table with fixed columns for time, user id,
browser-session id, action, state area, and changed fields (horizontally
scrollable on narrow screens), a "Sýna eldri atvik" control that reflects an
in-progress request and is absent once history is exhausted, plus loading,
permission-error, and empty states. It never offers mutation controls.

**Retention** — events are kept 90 days from their server timestamp. The
scheduled trusted job `cleanupAuditLog` in `functions/src/cleanupAuditLog.ts`
runs daily, paginates `audit/{location}` in bounded batches, and deletes only
records strictly older than 90 days (a record exactly at the boundary is
retained).

## Limits

Ordinary state/audit updates are atomic; a committed CAS state change is followed
by a separate audit append that can fail independently. The failure is logged;
the state change is not rolled back or replayed. Rules enforce authorization,
identity and append-only events but cannot prove event/state pairing.

The history cursor is an inclusive timestamp with a fixed 50-row bound, not a
(timestamp, key) cursor: a full batch sharing one timestamp can prevent progress
to older events. Older-batch promises are not cancelled/versioned across venue
or modal changes. Do not claim lossless pagination or a complete incident
history from this UI.

Cleanup bounds each venue page and page count, but first reads the audit root
to discover locations; this is not a bounded root scan. Only the trusted job
may enforce retention. Venue metadata (`locations/`), presence/diagnostics, Auth
administration and Storage operations have separate ownership from this shared
state audit. Ordinary multi-controller writes remain last-write-wins.
