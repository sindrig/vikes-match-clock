## Context

See `proposal.md` and the `firebase-audit-trail` specification for motivation
and behavioral requirements. Shared state is currently written directly to
`states/{location}/{area}` from several actions in
`FirebaseStateContext.tsx`; some perimeter operations use direct `set` or
`remove` calls. Firebase rules authorize state at the location level but do
not retain writer identity or mutation history.

## Goals / Non-Goals

**Goals:**

- Make each successful shared-state mutation attributable to an authenticated
  Firebase user and a browser-session identifier.
- Ensure the operational write and audit event use one Realtime Database
  multi-location update.
- Keep audit history append-only and protected by Firebase rules.
- Make recent venue history inspectable from the existing authenticated UI.

**Non-Goals:**

- Preventing another authenticated operator from changing state; the existing
  last-write-wins model remains unchanged.
- Recording reads, Firebase connection state, authentication events, failed
  local form validation, or browser-only UI state.
- Auditing Firebase Admin SDK, deployment tooling, or direct console writes;
  these do not flow through the browser client write layer and need separate
  infrastructure-level logging if required.
- Export and a centralized cross-venue audit dashboard.

## Decisions

### Store append-only events beside venue state

Create records under `audit/{location}/{eventId}` rather than embedding them
inside `states/{location}`. Each event has a schema such as:

```ts
{
  timestamp: ServerValue.TIMESTAMP,
  uid: string,
  sessionId: string,
  action: string,
  stateArea: "match" | "controller" | "view" | "perimeter" | "clubOverrides",
  changes: Record<string, unknown>
}
```

The location is supplied by the path, avoiding duplicated or untrusted venue
data. `changes` records the exact update-path map sent to Firebase, including
`null` deletions, which is sufficient to reconstruct the command without
duplicating the entire pre-existing state. A server timestamp avoids relying
on a device clock.

Alternative considered: write a full before/after state snapshot. Rejected
because large controller queues and media configurations would inflate every
event and would expose unnecessary historical data. Alternative considered:
place events below the state tree. Rejected because state writes are broadly
authorized today and future state replacement could accidentally erase history.

### Route all auditable writes through one atomic helper

Add a typed Firebase database helper that accepts the venue, authenticated
identity, session ID, logical action, and a relative state-path update map. It
generates an event key and performs one root-level `update()` containing both
the state paths and the new audit path. Existing `syncState` and direct
perimeter/club-override writes will use this helper; the provider continues to
wait for Firebase subscriptions before updating UI state.

Actions use stable, human-meaningful names such as `match.start`,
`match.pause`, `match.reset`, `controller.select-view`, and
`perimeter.set-overlay`. Generic state helpers may accept an action supplied
by their caller, rather than inferring behavior from an arbitrary diff.

Alternative considered: issue the state update followed by a separate audit
write. Rejected because network loss or a rules failure could leave an
unaudited state mutation. Alternative considered: a Cloud Function trigger.
Rejected for this initial scope because it adds eventual consistency and does
not preserve a UI action name or browser session without an additional command
protocol.

### Use a persistent browser-session ID, not a device fingerprint

Generate an opaque UUID once per browser session and store it in
`sessionStorage`. It is regenerated when a new browser session starts and
survives reloads/restored tabs within that session. It is never presented as
an identity substitute; Firebase Auth's UID remains the accountable operator
identity.

Alternative considered: `localStorage`. Rejected because it would combine
unrelated browser sessions and weaken incident correlation. Alternative
considered: user-agent/IP metadata. Rejected because it is unreliable in the
browser and needlessly collects personal data.

### Restrict audit data with Firebase rules

Add `audit/{location}` rules that permit reads only to users authorized for
that location. Individual events permit creation only when the writer is
authorized for the same location, `uid === auth.uid`, and the required fields
have the expected primitive types. Updates and deletes are denied. The client
will always use atomic updates, while the rules independently protect existing
records from alteration and identity spoofing.

Realtime Database rules cannot prove that a user-created audit event was
paired with a particular sibling state mutation in the same root update. This
is acceptable because the same authorized user can already change that state;
the application helper provides the all-or-nothing operation for supported
clients. A tamper-resistant audit trail against privileged direct database
writes requires a trusted server-side writer and is explicitly out of scope.

### Display recent history in the authenticated controller

Subscribe to the selected venue's audit collection with a bounded recent-event
query ordered by timestamp, then render newest first in a dedicated
`Breytingasaga` view reachable from the controller settings. Show timestamp,
operator UID (or resolved label when safely available), shortened session ID,
action, state area, and formatted changed paths. The UI handles loading,
permission errors, and an empty collection; it does not offer mutation
controls.

Alternative considered: expose audit history in the unauthenticated display.
Rejected because audit identities and commands are operational information.

### Enforce 90-day retention with trusted scheduled cleanup

Every event uses its Firebase server timestamp as the retention reference. A
scheduled trusted job runs daily, queries audit records older than 90 days,
and deletes them with administrative credentials. It paginates through expired
records so one run remains bounded and retries safely; deleting an already
removed record is harmless. The client audit rules remain append-only, so an
operator cannot treat retention as an early-delete mechanism.

Alternative considered: leave data forever. Rejected because storage grows
without bound and old history increases accidental download cost. Alternative
considered: delete records from the client immediately after a match. Rejected
because it is not trustworthy, risks losing incident evidence, and depends on
an operator completing a cleanup action. Alternative considered: Firebase TTL.
Rejected because Realtime Database has no native TTL policy equivalent to
Firestore, so an explicit trusted cleanup job is required.

## Risks / Trade-offs

- [Audit records increase Realtime Database usage] → Store only command diffs,
  bound the inspection query, retain records for 90 days, and delete expired
  records daily through trusted scheduled cleanup.
- [Some existing direct writes bypass the new helper] → Inventory every client
  write path, replace them in the same change, and add tests that assert the
  helper's multi-path update shape.
- [A failed root update gives the operator little visible feedback] → Preserve
  existing error handling and ensure rejected operations create no event.
- [UIDs are technical identifiers] → Show them clearly for forensic use;
  optionally add a non-authoritative display label later without changing the
  event identity.
- [Old clients remain deployed temporarily] → They can still write state
  without events until refreshed; deploy the frontend and rules together and
  use the existing refresh mechanism to reload active clients.

## Migration Plan

1. Deploy rules that allow valid append-only audit events while retaining all
   existing state-write permissions, plus the scheduled trusted cleanup job.
2. Deploy the frontend that routes all supported shared-state writes through
   the atomic audit helper.
3. Trigger the existing screen-refresh mechanism so active controllers load
   the audited client version.
4. Verify a staging mutation produces exactly one state change and one
   inspectable event, verify a bounded recent-history query, and verify that
   only records older than 90 days are deleted by cleanup.
5. Repeat the production smoke test for start, pause, reset, view change, and
   perimeter operations.
6. Roll back by disabling the scheduled cleanup job and deploying the prior
   frontend and rules; existing audit records remain untouched and state
   behavior continues under the prior rules.

## Open Questions

- None.
