# Clock App Agent Guidelines

> **Note for Agents**: If you modify any component, pattern, or system described in this document, you MUST update this file to reflect your changes. Keeping this documentation accurate is critical for future development.

## Overview

The `clock/` application is a dual-purpose React system: it acts as both the **stadium display** (Scoreboard/Idle screens) and the **control interface**. It relies on real-time synchronization via Firebase.

## Core Architecture Patterns

### 100% Firebase Architecture

**Firebase is the single source of truth.** There is no local state fallback.

State is managed via React Context (`FirebaseStateContext`) which subscribes to Firebase Realtime Database:

- **Read path**: Firebase `onValue()` subscriptions → React state updates
- **Write path**: Actions call `set()`/`update()` on Firebase → Firebase triggers `onValue()` → React state updates
- State is **never** updated directly by action functions; all state changes flow through Firebase subscriptions

Key files:

- `FirebaseStateContext.tsx`: Main state provider with Firebase subscriptions and write operations
- `LocalStateContext.tsx`: Local settings (auth, listen prefix) with localStorage persistence
- `firebaseParsers.ts`: Type-safe runtime validators for Firebase snapshot data
- `firebase.ts`: Firebase initialization with emulator support
- `firebaseDatabase.ts`: Low-level Firebase write operations

### Why 100% Firebase?

This architecture eliminates several classes of bugs:

- ~~Optimistic update divergence~~ - No local state to diverge
- ~~Hydration race conditions~~ - No hydration guards needed
- ~~Stale ref issues~~ - Refs only used for computing from latest state during rapid operations
- ~~Complex rollback logic~~ - Firebase is authoritative; failures simply don't update state

### Write Operations

When an authenticated controller calls an action (e.g., `startMatch()`):

1. Action computes new state from current `ref.current`
2. Action writes to Firebase via `firebaseDatabase.syncState()`
3. Firebase triggers `onValue()` callback
4. React state updates from Firebase snapshot
5. UI re-renders with new state

**Important**: Unauthenticated clients are read-only. All write operations check `isAuthenticated` before proceeding.

### Multi-Controller Behavior

Multiple controllers can connect to the same `listenPrefix` simultaneously:

- All connected clients see the same state via Firebase subscriptions
- Uses **last-write-wins** semantics (no conflict resolution)
- For production use, coordinate with your team to avoid simultaneous edits

### Firebase Audit Trail (Breytingasaga)

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

**Write routing** — all writes flow through `writeAudited`:

- `applyMatchUpdate`/`applyControllerUpdate`/`applyViewUpdate` take a stable
  action string (e.g. `match.start`, `match.pause`, `match.reset`,
  `controller.select-view`, `view.set-theme`).
- `updateMatch` uses `match.update`; a dedicated `resetMatch()` context action
  emits `match.reset` (used by the Reset button in `MatchActions.tsx`).
- Perimeter actions use `perimeter.set-state`, `perimeter.set-overlay`,
  `perimeter.clear-overlay`, `perimeter.set-ad-layout`,
  `perimeter.create-media-pair`, `perimeter.delete-media-pair`.
- Club overrides use `clubOverrides.create|update|save|delete` (both the
  context actions and `ClubOverrideForm.tsx`, which builds its own audit
  payload).

**Identity** — `FirebaseStateProvider` accepts a `uid` prop (passed from
`index.tsx` as `auth.uid`) for the accountable operator. `getOrCreateSessionId()`
in `lib/sessionId.ts` returns one opaque UUID per browser session, stored in
`sessionStorage` (regenerated per session, survives reloads, never an identity
substitute). `makeAudit()` builds the payload and skips the write entirely when
the provider cannot write.

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
list) is removed by id after the fetch so it is neither duplicated nor
skipped, and the remaining validated batch is appended. The hook exposes
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

### Perimeter Control

The perimeter LED screens at the Víkin stadium are driven by a dedicated
Resolume Arena composition. Control flows through the **fourth** Firebase
state subtree, `states/${listenPrefix}/perimeter`:

```json
{
  "enabled": true,
  "state": "on"
}
```

- `enabled` is an admin-created UI feature flag: the controller only shows the
  perimeter control when `enabled === true`.
- `state` is the desired state, either `"on"` or `"off"`.

**Frontend** (`clock/`):

- `parsePerimeterState()` in `firebaseParsers.ts` preserves `enabled` only when
  boolean and `state` only when `"on"`/`"off"` (anything else falls back to
  disabled/off).
- `FirebaseStateContext.tsx` subscribes independently to
  `states/${listenPrefix}/perimeter` and exposes the parsed `perimeter` state
  plus the authenticated `setPerimeterState(state)` write action (writes only
  `{ state }`, never `enabled`).
- The daemon publishes a **preview snapshot** of the Resolume composition
  (columns, clips, filenames and bounded JPEG thumbnails) to the top-level
  `perimeter/${listenPrefix}` path (see **Preview snapshot** below).
  `FirebaseStateContext.tsx` subscribes to it independently and exposes it as
  `preview` through `usePerimeter()`. It is deliberately **not** part of app
  readiness: absent metadata must never block the controller.
- `PerimeterControl.tsx` renders a `Jaðarskjár` settings row (matching the
  other settings trigger rows) and self-hides when `perimeter.enabled !== true`.
  It is mounted inside the `Stillingar` dialog in `Controller.tsx`. There are
  **no manual on/off controls** — the perimeter turns on/off automatically on
  view transitions (see below). Clicking the row opens an editable **ad layout
  manager** modal for creating, reordering, and deleting ad columns across
  daemon-published lanes, with file upload and Storage browsing (see
  **Perimeter Ad Layout** below). The old composition preview snapshot is
  preserved for diagnostic use. Because rsuite renders the dialog in a portal,
  its styles are scoped to `.perimeter-preview-modal`, rather than
  `.controller`. The dialog handles loading, "no preview yet", error, daemon
  phase, revision comparison, empty-lanes, and empty-columns states; styles
  live in `PerimeterControl.css`.
- `FirebaseStateContext.tsx` **auto-toggles the perimeter on view transitions**:
  entering the match view (`controller.view` `idle` → `match`) writes
  `state: "on"`, and leaving any view for `idle` writes `state: "off"`. Both
  writes happen only when `perimeter.enabled === true`; other transitions
  (`match` ↔ `control`, `idle` → `control`) leave the perimeter unchanged. The
  transition is detected in a `useEffect` gated on `ready` (which also waits for
  the perimeter subscription, so `enabled` is known before any transition), so a
  reload or reconnect never replays a stale command (matching the daemon's
  behavior).
- Follows the 100% Firebase model: the UI writes to Firebase and updates only
  after the subscription receives the new value (no optimistic updates).

**Preview snapshot** (`perimeter/${listenPrefix}`, read-only for clients):

```json
{
  "updatedAt": 1723392000000,
  "columns": [
    {
      "id": 1,
      "name": "Column 1",
      "clips": [
        {
          "id": 12,
          "filename": "sponsor-loop.mp4",
          "thumbnail": "data:image/jpeg;base64,..."
        }
      ]
    }
  ]
}
```

- `updatedAt` is a Firebase **server timestamp** (set by the daemon with
  `ServerValue.TIMESTAMP`).
- `parsePerimeterPreview()` in `firebaseParsers.ts` strictly parses the
  snapshot: clips without a filename and columns without a name are dropped;
  missing ids become `null`; a `thumbnail` is optional.
- The path lives **outside** the writable `states/` subtree. `firebase-rules.json`
  denies all client writes and permits reads only when
  `auth/$uid/$location` is `true`. Only the daemon's service account can write
  (through the Admin SDK).

**Daemon** (`perimeter-control/` at repo root): a systemd-managed **Node.js**
service listens to `states/vikuti/perimeter/state` in Firebase Realtime
Database via the **Firebase Admin SDK** (`ref.on("value", ...)`) and applies
it to Resolume — `off` → `POST /api/v1/composition/disconnect-all` (global
stop), `on` → `POST /api/v1/composition/columns/1/connect`. It converges to
the current desired state: the first valid value observed is applied, and a
value that changed while the daemon was down is applied on the next delivery
(unchanged state is never re-applied). It deliberately uses Node because the
JS Admin SDK reads RTDB over its **WebSocket protocol** (same transport as
the clock apps) — the Python SDK's `listen()` is SSE-based and intermittently
stalled for minutes on this network. The listener is periodically reopened as
a safety net. It authenticates with a service-account credential file
(required by `install.sh`), and retries Resolume failures with bounded
exponential backoff, superseded by any newer Firebase value. It also publishes
the **preview snapshot** above to `perimeter/vikuti` once at startup and after
each successful `on` (non-blocking, never delaying the on/off retry behavior);
a failed Resolume query or an oversized payload leaves the last published
snapshot intact. The snapshot is written with `update()` (not `set()`) so the
sibling status paths `perimeter/{location}/adLayout` and
`perimeter/{location}/overlayStatus` are preserved — a `set()` on the preview
path would replace the whole subtree and silently delete them. All
Resolume-version-specific parsing is isolated in
`resolume-preview.js`; see `perimeter-control/README.md` for installation and
operation.

#### Perimeter Overlay (Goal-Triggered Video Sequences)

When a **home goal** is scored, a Firebase-controlled perimeter overlay
sequence is triggered. The overlay plays paired video columns on the perimeter
LED screens above the existing `Efni` advertisements, then loops the final
column until explicitly cleared.

**Firebase path**: `states/${listenPrefix}/perimeter/overlay`

```json
{
  "version": 1,
  "id": "uuid",
  "columns": [
    {
      "durationMs": 10000,
      "files": {
        "2": {
          "name": "goal-48.mp4",
          "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-48.mp4"
        },
        "4": {
          "name": "goal-40.mp4",
          "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/goal-40.mp4"
        }
      }
    }
  ]
}
```

- `overlay: null` clears the overlay (disconnects only overlay layers).
- Each column must include one file entry per configured Resolume overlay
  layer index. The keys are Resolume **layer indices** (not IDs): `2` is the
  overlay above the `48 skjáir` base layer (plays `goal-48.mp4`) and `4` is
  the overlay above the `40 skjáir` base layer (plays `goal-40.mp4`). They
  must match `PERIMETER_OVERLAY_LAYER_IDS` on the daemon.
- Earlier columns advance after `durationMs`; the final column loops forever.
- The overlay keeps looping **until cleared even though the base `Efni`
  content auto-advances through its ~20s deck columns** (composition autopilot
  = "Play Next Column"). The daemon **pauses the deck autopilot** for the
  duration of the goal celebration (restoring it on clear), loads the overlay
  file into the currently active deck column, and triggers the clip there — so
  the goal celebration never vanishes on an Efni transition. A goal placed in
  a single column without pausing the autopilot would disappear at the first
  transition.
- A new `id` replaces/restarts an active sequence. Replacing one overlay with
  another (a new `id` while one is playing) is **double-buffered**: the daemon
  loads the new overlay into a standby deck column while the old one keeps
  playing, then connects the standby column and clears the old slot — so the
  swap never shows the base ads in between. A clip crossfade (default 0.5s
  Dissolve, `PERIMETER_OVERLAY_TRANSITION_SECONDS`/`_BLEND`) softens the
  cutover. Because the standby column is connected, the deck ends up on that
  column after the swap; the ads simply resume from there once the overlay
  clears.
- Only files from the approved `gs://vikes-match-clock-firebase.appspot.com`
  bucket are accepted. The daemon copies them only into `C:/Content` on the
  Windows Resolume host.

**Daemon status**: Published to `perimeter/${listenPrefix}/overlayStatus` by
the daemon (read-only for clients). Contains `commandId`, `phase`
(`downloading`/`copying`/`loading`/`playing`/`error`), `activeColumn`, and
safe `error` text.

**Clearing**: The "Hreinsa virkt overlay" button in the controller UI clears
both the main screen overlay (`controller.currentAsset`) **and** the perimeter
overlay (`states/${listenPrefix}/perimeter/overlay`).

**Away goals** do not trigger a perimeter overlay — only home goals.

Types are defined in `types.ts`:

- `PerimeterOverlay` — overlay document
- `PerimeterOverlayColumn` — a column with duration and paired files
- `PerimeterOverlayFile` — filename + GCS source
- `PerimeterOverlayStatus` — daemon-published status
- `PerimeterOverlayPhase` — phase enum

Parsing is in `firebaseParsers.ts`:

- `parsePerimeterOverlay()` — strict validation (version, id, column count,
  duration bounds, paired targets, filename safety, approved bucket only).

Write actions are in `FirebaseStateContext.tsx`:

- `setPerimeterOverlay(overlay)` — writes overlay document
- `clearPerimeterOverlay()` — writes null to clear

These are exposed via `usePerimeter()` hook.

#### Named Perimeter Media Pairs (Manual Overlay Library)

An operator-curated library of **named overlay pairs** that share the same
active overlay channel as the home-goal overlay. Each pair binds a required
name to exactly two files: one for the 48-screen target (layer `"2"`) and one
for the 40-screen target (layer `"4"`). Files may be images or videos.

**Firebase path**: `states/${listenPrefix}/perimeter/mediaPairs/{pairId}`

```json
{
  "name": "Sindri",
  "files": {
    "2": {
      "name": "48-1723392000000-sindri.mp4",
      "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter-overlays/11111111-1111-4111-8111-111111111111/48/48-1723392000000-sindri.mp4"
    },
    "4": {
      "name": "40-1723392000000-sindri.png",
      "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter-overlays/11111111-1111-4111-8111-111111111111/40/40-1723392000000-sindri.png"
    }
  }
}
```

- `pairId` is a UUID generated before upload and used as both the map key and
  the source-path segment.
- `name` is required, trimmed, non-empty, and bounded (≤ 80 chars).
- Each pair has exactly the two targets `"2"` and `"4"`. Layer `"2"` files must
  live under `{location}/perimeter-overlays/{pairId}/48/`; layer `"4"` files
  under `.../40/`. A path/layer mismatch is rejected.
- Filenames are generated and must match the daemon's safe-filename rules; the
  two targets must have distinct filenames.
- Sources must use the approved Firebase bucket and the pair's own prefix, and
  the suffix after the target folder must be exactly one daemon-safe filename
  (no subdirectories and no `..`), matching the daemon's staging rules.

**Showing** a pair writes a fresh `PerimeterOverlay` to the existing command
path `states/${listenPrefix}/perimeter/overlay` with a new command `id` and a
single column (`durationMs: 10000`) holding the pair's two files. Because the
daemon holds the final column until clear, the pair loops until cleared. The
overlay channel is single-writer: showing a pair replaces a home-goal overlay
and a subsequent home goal replaces the pair (last command wins).

**Clearing** is available both in the new "Jaðarefni" media tab ("Hreinsa
jaðarskjá") and via the existing global "Hreinsa virkt overlay" button. Both
write `overlay: null`; either clears whichever overlay is active and restores
the rotating base ad deck.

Types in `types.ts`:

- `PerimeterMediaPair` — name + per-target `PerimeterOverlayFile` map.

Parsing in `firebaseParsers.ts`:

- `parsePerimeterMediaPairs()` — validates the pair library (pair ID, name,
  exact `"2"`/`"4"` key set, safe distinct filenames, target-specific paths,
  pair-ID/source consistency, approved bucket + location).

Context in `FirebaseStateContext.tsx`:

- Subscribes to `states/{listenPrefix}/perimeter/mediaPairs` and exposes
  `mediaPairs` through `usePerimeter()`.
- `createPerimeterMediaPair(pairId, pair)` — writes the library record (the
  UI uploads both files first, then writes the record).
- `deletePerimeterMediaPair(pairId)` — removes only the library record;
  Firebase Storage assets are left in place.

UI in `controller/media/PerimeterMediaPairs.tsx` (fifth "Jaðarefni" tab):

- Text-only cards (name + both filenames), no thumbnails and no Storage
  download-URL lookups.
- `Nýtt jaðarefni` modal: name + required 48/40 file pickers (`image/*,video/*`).
  Uploads both files (waiting for both to settle), then writes the library
  record; if an upload or the record write fails, any files that already
  landed in Storage are best-effort deleted so nothing is orphaned.
- Green **Sýna** action, red **Fjarlægja** (confirmation), tab-local
  **Hreinsa jaðarskjá**, and the daemon `overlayStatus` (phase + error).

This system is distinct from the rotating base ad-deck (`adLayout`) and never
becomes selectable base-ad content. The three perimeter systems are:

| System            | Storage                                          | Command path                           | Layers               |
| ----------------- | ------------------------------------------------ | -------------------------------------- | -------------------- |
| Base ad deck      | `{location}/perimeter/`                          | `states/{location}/perimeter/adLayout` | base lanes (1,3)     |
| Home-goal overlay | `{location}/perimeter/`                          | `states/{location}/perimeter/overlay`  | overlay layers (2,4) |
| Named media pairs | `{location}/perimeter-overlays/{pairId}/48\|40/` | `states/{location}/perimeter/overlay`  | overlay layers (2,4) |

#### Perimeter Ad Layout (Content Deployer on the Base Layers)

The controller writes a **desired layout** to `states/${listenPrefix}/perimeter/adLayout`,
defining columns of ad files across daemon-published lanes. The daemon reads
this path, validates, stages assets, and **deploys** the ad files into the
Resolume deck columns on the base layers, then publishes the **applied
layout** to `perimeter/${listenPrefix}/adLayout`.

The ad-layout is a **content deployer, not a playback driver**: it only opens
files into clip slots (and clears them). It never calls `connect`,
`disconnect`, `loop-*`, or `transport/*` endpoints and never touches the
composition autopilot. The deck autopilot cycles the columns exactly as it
cycles the Efni content, so the Resolume UI (column count, autopilot speed,
manual column selection) keeps working untouched.

**Data ownership**:

| Path                                   | Writer     | Purpose                                         |
| -------------------------------------- | ---------- | ----------------------------------------------- |
| `states/{location}/perimeter/adLayout` | Controller | Desired layout command                          |
| `perimeter/{location}/adLayout`        | Daemon     | Applied layout, lanes, column mapping, previews |
| `states/{location}/perimeter/import`   | Controller | One-shot deck import command (`from-resolume`)  |
| `perimeter/{location}/importStatus`    | Daemon     | Import result (phase, columnsImported, errors)  |
| `{location}/perimeter/*` in Storage    | Controller | Selectable/uploaded source assets               |

The daemon never writes to the desired path, eliminating a self-write
feedback loop. The single deliberate exception is the deck import command: it
writes a generated layout to `states/{location}/perimeter/adLayout` once per
explicit `{ commandId, command: "from-resolume" }` write to the separate
`states/{location}/perimeter/import` path (deduped by `commandId`), so it
cannot loop.

**Layer separation** — the ad layout and the goal overlay use **disjoint
layers** and never interfere:

| System       | Layers                                                        | Code         |
| ------------ | ------------------------------------------------------------- | ------------ |
| Ad layout    | base layers (`PERIMETER_AD_LANE_IDS`, default `1,3`)          | ad-layout.js |
| Goal overlay | overlay layers (`PERIMETER_OVERLAY_LAYER_IDS`, default `2,4`) | overlay.js   |

`assertNoSlotConflicts` in `perimeter-control/index.js` rejects any
overlapping lane configuration at daemon startup.

**Desired layout schema** (`states/${listenPrefix}/perimeter/adLayout`):

```json
{
  "version": 1,
  "revision": "uuid",
  "columns": [
    {
      "id": "uuid",
      "files": {
        "1": {
          "name": "ad-48.png",
          "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad-48.png"
        },
        "3": {
          "name": "ad-40.mp4",
          "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad-40.mp4"
        }
      }
    }
  ]
}
```

- `revision` is a UUID that changes for every edit (including reorder).
- `columns` is the complete intended order, not an incremental log.
- Each column must have exactly one valid file for every configured lane.
- An empty `columns` array is valid and clears the ad clips from all deck
  columns on the ad lanes.
- Source objects must belong to the approved bucket and the current
  location's `perimeter/` prefix.
- File names are basename-only; traversal and control characters are rejected.

**Column mapping** — each layout column maps **1:1** to a deck column: layout
column _i_ (0-based) loads into deck column _i+1_. Surplus deck columns stay
empty; the deck autopilot skips empty columns, so the deck cycles only through
the `N` ads (never a blank column). A layout with more columns than the deck is
refused with an `error` status (each ad needs its own deck column).

- 12 layout columns → deck columns 1–12 (trailing columns left empty).
- 1 layout column → deck column 1.
- Each ad file is loaded into its own deck column on **every** configured
  lane. The autopilot then cycles them naturally.

**Applied layout schema** (`perimeter/${listenPrefix}/adLayout`, daemon-published):

```json
{
  "lanes": [
    { "id": "1", "name": "48 skjair" },
    { "id": "3", "name": "40 skjair" }
  ],
  "revision": "uuid",
  "phase": "loading|playing|error|idle",
  "error": null,
  "updatedAt": 1723392000000,
  "columns": [
    {
      "id": "uuid",
      "deckColumns": [1, 2, 3, 4, 5],
      "files": {
        "1": {
          "name": "ad-48.png",
          "thumbnail": "data:image/png;base64,..."
        },
        "3": {
          "name": "ad-40.mp4",
          "thumbnail": "data:image/png;base64,..."
        }
      }
    }
  ]
}
```

**Key behaviors**:

- Lane metadata is daemon-owned from local Resolume configuration; the UI
  renders lanes dynamically and must not hard-code two lanes.
- The UI shows the applied layout, not merely the submitted request.
- `deckColumns` lists which deck column indices hold each ad; thumbnails are
  fetched once per unique ad file (not per deck column instance).
- The phase model is `loading` (staging/opening), `playing` (all files
  deployed, autopilot cycling), `error`, and `idle` (no layout).
- The deck autopilot is the ads' transport: every perimeter `on` asserts it to
  `PERIMETER_DECK_AUTOPILOT` (skipped while a goal overlay is freezing the
  deck), so a stale pause never leaves the deck stuck on a single ad.
- Layout changes are **clear-then-load**: the daemon empties all old ad slots
  across the deck, then stages and opens the new files. A brief blank flash
  is expected.
- On a staging/load failure the daemon publishes an `error` status and clears
  the slots it already emptied.
- An empty `columns` layout clears the ad clips from all deck columns on the
  ad lanes (never the whole layer) while preserving the submitted revision in
  the idle status.
- The same Storage object may be reused across lanes (identical name +
  source); a filename mapped to two different sources is rejected because
  staging copies lane files to a shared remote dir keyed by name.
- On daemon restart, the desired revision is read and restored; no new
  revision is created.
- The status publish is retried and re-published on the listener refresh, so
  a write lost right after restart self-heals.
- The goal overlay protocol remains separate and uses the disjoint overlay
  layers; overlapping lane configuration is rejected at daemon startup.

**UI operations**:

- **Add column**: Dialog with one file selector per lane. Lists existing files
  from `{listenPrefix}/perimeter/` in Storage, permits upload. Saves only when
  every lane has a selection. Sources are stored as `gs://` URIs. Adding is
  disabled once the layout reaches 20 columns (the daemon/parser limit).
- **Delete column**: Red X button with confirmation dialog
  (`Fjarlægja dálk? Skrárnar verða áfram í Firebase Storage.`). Removes only
  the layout reference, never deletes Storage objects.
- **Reorder columns**: `@dnd-kit` horizontal sortable pattern with dnd-kit's
  `closestCenter` collision detection (column IDs are raw UUIDs, so the
  queue-specific `typedCollisionDetection` — which only matches `col:`/`item:`
  IDs — would filter out every perimeter droppable). Produces one new
  full-layout revision with stable column UUIDs.
- Writes are serialized (queued) and every mutating control (add/delete/drag)
  is disabled while a write is pending; handlers always compute from the
  latest desired columns, so a rapid second edit can never clobber the first.
- A failed Firebase write keeps the board (and the add dialog) open and shows
  an actionable error in the status bar instead of pretending the revision was
  saved.
- Storage listings filter out names that fail the daemon filename rules, and
  uploads reject such names before they reach Storage.

**Revision comparison**:

If `adLayout.revision !== appliedAdLayout.revision`, the UI shows
"Uppfærslu beðið" (update pending). When they match, it shows "Lifandi" (live)
with the daemon phase.

Types are defined in `types.ts`:

- `PerimeterAdLayout` — desired layout
- `PerimeterAdLayoutColumn` — column with per-lane files
- `PerimeterAdLayoutFile` — filename + `gs://` source
- `PerimeterAdLane` — lane ID + display name
- `PerimeterAppliedAdLayout` — daemon-published applied layout
- `PerimeterAppliedAdColumn` — applied column with deck column mapping
- `PerimeterAppliedAdFile` — applied file with thumbnail
- `PerimeterAdPhase` — phase enum (`loading|playing|error|idle`)

Parsing is in `firebaseParsers.ts`:

- `parsePerimeterAdLayout()` — validates desired layout (version, revision,
  column count, lane set enforcement, filename/bucket safety, duplicate IDs)
- `parsePerimeterAppliedAdLayout()` — validates applied layout (lanes,
  revision, phase, columns with `deckColumns`, files)

Write actions are in `FirebaseStateContext.tsx`:

- `setPerimeterAdLayout(layout)` — writes complete desired layout to
  `states/${listenPrefix}/perimeter/adLayout`. Rejections propagate to the
  caller (never swallowed), so the controller can surface permission/network
  failures instead of treating the write as saved.

These are exposed via `usePerimeter()` hook (new fields):

- `adLayout` — desired `PerimeterAdLayout | null`
- `appliedAdLayout` — applied `PerimeterAppliedAdLayout | undefined`
- `appliedAdLayoutLoaded` — boolean (subscription delivered)
- `appliedAdLayoutError` — string | null; set when the applied-status
  subscription fails (denied/unavailable), so the modal shows a failure
  instead of an endless loader
- `setPerimeterAdLayout` — write action

#### Perimeter Brightness (Vnnox LED brightness)

Operators can set the brightness of the perimeter LED screen through the same
`Jaðarskjár` modal. The **controller writes the desired state**, the daemon
applies it to the Vnnox/UCenter-controlled screen, verifies the result, and
publishes the **daemon-owned outcome** — the controller never talks to Vnnox
directly and never treats a Firebase write confirmation as a hardware result.

**Data ownership:**

| Path                                     | Writer     | Purpose                                                             |
| ---------------------------------------- | ---------- | ------------------------------------------------------------------- |
| `states/{location}/perimeter/brightness` | Controller | Requested brightness as a whole integer percentage (0–100)          |
| `perimeter/{location}/brightnessStatus`  | Daemon     | `requestedPercent`, `appliedPercent`, `phase`, `error`, `updatedAt` |

- The requested value is a bare integer percentage. `null`/missing means "no
  command" and is inert; the daemon ignores anything that is not a whole
  percentage from 0 through 100.
- `brightnessStatus.phase` is `pending` (before hardware I/O), `applied` (the
  daemon verified the screen read within a small integer tolerance), or
  `failed` (with a safe error description). `appliedPercent` is present only
  after verification. `requestedPercent` is `null` only for a `failed` status
  caused by configuration (e.g. Vnnox enabled but misconfigured at daemon
  startup, published before any command was ever requested) — every other
  status, including a command-caused `failed`, always carries the requested
  percentage. `parsePerimeterBrightnessStatus()` enforces this: a `null`
  `requestedPercent` on `pending`/`applied` is malformed and rejects the whole
  document.
- The status path lives under `perimeter/{location}`, which the database rules
  make client-read-only; only the daemon's service account writes it.

**Context integration** (`usePerimeter()`):

- `brightness` — `number | null`; the Firebase-synchronized requested
  percentage (strictly parsed, so malformed values are `null`).
- `brightnessStatus` — `PerimeterBrightnessStatus | null`; daemon-published
  status (strictly parsed — an unknown phase or malformed value rejects the
  whole document).
- `setPerimeterBrightness(percent)` — authenticated write of the requested
  percentage to `states/{listenPrefix}/perimeter/brightness`. Rejects
  non-integer or out-of-range values locally without writing.

**Operator behavior** (`PerimeterControl.tsx`):

- The `Bjartleiki jaðarskjás` section renders above the ad-layout board and is
  gated by the same `perimeter.enabled` feature flag (the whole modal is hidden
  when disabled).
- It shows the Firebase-synchronized requested value, the daemon phase, the
  verified applied value, and any safe failure message.
- Submitting is an explicit `Vista` action; the input is client-validated to a
  whole percentage from 0 through 100 before any write. The `Vista` button is
  disabled while a submission is pending (until the `brightness` subscription
  reflects the submitted value) and while the daemon reports `pending` — there
  are **no optimistic local updates**. A `useEffect` clears the pending
  submission once the `brightness` subscription confirms it, so `Vista`
  re-enables for the next request instead of staying permanently disabled
  after the first submission.
- The input tracks three local draft states: untouched (`null`, displays the
  synced `brightness` value), explicitly cleared (`""`, displays blank — kept
  distinct from "untouched" so clearing the field never silently reverts to
  showing the last synced value), and an in-progress numeric edit. A cleared
  or non-integer/out-of-range draft is invalid and blocks `Vista`, so an
  emptied input can never be accidentally submitted as 0%.
- The input carries an accessible label (`aria-label="Bjartleiki jaðarskjás"`)
  matching the section title.

#### Goal-Scorer Perimeter Media Preparation

Before a home goal happens, the controller prepares player-specific repeating
perimeter media for every eligible home player so scorer selection can
attribute the goal reliably during live play. A Firebase Cloud Function
renders static PNG bands (see `functions/src/goalScorerPreparation.ts`) using
the daemon-published overlay geometry; the controller never renders media and
never infers readiness from Storage listings.

**Data ownership:**

| Path                                                         | Writer     | Purpose                                                            |
| ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------ |
| `states/{location}/perimeter/goalScorerPreparation`          | Controller | Desired preparation request (jobId + home-player snapshot)         |
| `perimeter/{location}/goalScorerPreparation`                 | Function   | Job progress + per-player ready/fallback/unavailable/failed result |
| `perimeter/{location}/overlayGeometry`                       | Daemon     | Configured overlay target geometry (native sizes, revision)        |
| `{location}/players/{playerId}-fagn.png` in Storage          | Operator   | Personalized celebration image (personal source)                   |
| `{location}/crest.png` in Storage                            | Operator   | Standard club crest (fallback source)                              |
| `{location}/perimeter-overlays/{jobId}/{48\|40}/` in Storage | Function   | Deterministic rendered PNG output                                  |

**Request schema** (`states/{location}/perimeter/goalScorerPreparation`):

```json
{
  "jobId": "uuid",
  "players": [{ "id": "123", "name": "Jón", "number": 7 }]
}
```

- `jobId` is a UUID; it scopes the output storage folder and keys the
  service-owned status (stale jobs cannot overwrite a newer request).
- `players` is a snapshot of the home roster at request time, so the job is
  tied to the requested roster rather than a later mutation.
- The RTDB rules validate the request shape (jobId string + players object);
  only authenticated controllers with location access may write it.

**Status schema** (`perimeter/{location}/goalScorerPreparation`):

```json
{
  "jobId": "uuid",
  "phase": "preparing|ready|failed",
  "readyCount": 2,
  "fallbackCount": 1,
  "unavailableCount": 0,
  "failedCount": 0,
  "total": 3,
  "updatedAt": 1723392000000,
  "error": null,
  "players": {
    "123": {
      "status": "ready|fallback|preparing|unavailable|failed",
      "error": null,
      "files": {
        "2": { "name": "123-<geomRev>-v1-48.png", "source": "gs://..." },
        "4": { "name": "123-<geomRev>-v1-40.png", "source": "gs://..." }
      }
    }
  }
}
```

- `ready` = personalized celebration image; `fallback` = crest-backed. Both
  carry the two `PerimeterOverlayFile` sources (one per overlay layer) usable
  directly as an overlay column.
- `unavailable` = player had no valid identifier; `failed` = a rendering or
  storage error (safe error text only).
- `phase: "ready"` means the job completed; per-player failures still show in
  the counts. `phase: "failed"` means the job itself could not run (e.g. no
  published geometry).

**Rendering:** the function renders one native-size repeating PNG band per
configured overlay target. The band repeats `[portrait-or-crest | number |
name | gap]` across the target width. Source resolution: try
`{location}/players/{playerId}-fagn.png`, else `{location}/crest.png`. Output
lives under `{location}/perimeter-overlays/{jobId}/{48|40}/` (the
daemon-validated media-pair family) so it is directly playable by the existing
overlay command. Filenames are `{playerId}-{geometryRevision}-v1-{targetFolder}.png`
(deterministic and geometry-scoped). The `v1` render version changes if the
renderer layout changes, forcing fresh files. Both the uploaded objects and the
returned `gs://` source URLs use the function's **active storage bucket**
(`admin.storage().bucket().name`), so staging output is never advertised under
the production bucket.

**Controller behavior:**

- `FirebaseStateContext.tsx` subscribes to the geometry and status paths and
  exposes them through `usePerimeter()` as `overlayGeometry` and
  `goalScorerPreparationStatus`, plus `requestGoalScorerPreparation()`.
- Preparation is requested in the background whenever the home roster gains
  eligible players (match selection or match-report roster loading). The write
  and the `prepareGoalScorerMedia` callable run fire-and-forget and never block
  the roster from becoming available. The request is gated on the venue having
  opted into the perimeter (`states/{location}/perimeter` `enabled: true`) AND
  a daemon having published overlay geometry (`perimeter/{location}/overlayGeometry`
  present) — a venue without either would only produce a job that must fail, so
  no request is issued for it. The explicit "Endurtaka undirbúning" retry below
  bypasses the gate.
- `GoalScorerPreparation.tsx` (rendered inside the `Jaðarskjár` modal) lists
  each home player's celebration-image source and prepared-media outcome with
  counts and an explicit "Endurtaka undirbúning" retry action.
- On scorer selection, `GoalScorerDialog.tsx` keeps the generic home-goal
  overlay until the selected player's preparation result is `ready`/`fallback`;
  only then does it replace the generic overlay with the player's prepared
  target pair. The dialog shows a per-player readiness label so the operator
  knows which players can be attributed. The generic overlay stays when the
  player is preparing/unavailable/failed.
- The existing clear action (`Hreinsa virkt overlay`) writes `overlay: null`,
  clearing both the main-screen reveal and the player perimeter pair and
  restoring the rotating perimeter content.

**Daemon geometry** (`perimeter/{location}/overlayGeometry`): the daemon
publishes validated overlay target geometry derived from its configured layer
IDs, target folders, and clip canvases, with a `revision` hash. The
preparation function reads this before rendering and fails safely when it is
absent or malformed instead of guessing sizes. Each daemon instance publishes
beneath its own venue's `perimeter/{location}/overlayGeometry` (configurable
via `PERIMETER_OVERLAY_GEOMETRY_PATH`), so a venue with no geometry has no
daemon and is skipped by preparation. See `perimeter-control/geometry.js`.

The overlay parsers (`parsePerimeterOverlay`, `parsePerimeterMediaPairs`,
`parsePerimeterAdLayout`) are scoped to the active environment's storage bucket
(`FIREBASE_STORAGE_BUCKET`), so a source from another environment's bucket is
rejected for the active deployment.

### The `listenPrefix` System

The `listenPrefix` (e.g., `"vikinni"`, `"hasteinsvollur"`) determines which Firebase path the instance subscribes to:

- `states/${listenPrefix}/match` - Match state (scores, clock, etc.)
- `states/${listenPrefix}/controller` - Controller state (assets, view mode, etc.)
- `states/${listenPrefix}/view` - View settings (viewport, background, etc.)
- `states/${listenPrefix}/perimeter` - Perimeter LED control (see **Perimeter Control** below)

Empty `listenPrefix` blocks all write operations (prevents invalid paths like `states//match`).

### State Management

| Context                | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `FirebaseStateContext` | Shared state synced via Firebase (Match, Controller, View, Listeners) |
| `LocalStateContext`    | Local app state (Auth, listen prefix)                                 |

**Note**: Redux was fully removed from this codebase. All state is managed via React Context.

### Persistence

Local settings (auth, listen prefix) are stored in `localStorage` via `LocalStateContext`. Match state is synced from Firebase on connection.

## Key Component Systems

### 1. The Asset System (`src/controller/asset/`)

The "Asset" system is a flexible overlay engine for non-match content.

**Intent**: Display advertisements, starting lineups, player cards, substitutions, or custom text/videos over the scoreboard or during idle time.

**Features**:

- **Multi-Queue**: Multiple independent named queues, each with its own autoplay, loop, and timing settings
- **Kanban Board**: Queues displayed as columns with drag-and-drop reordering (queues and items within them) via `@dnd-kit`
- **Types**: Images, YouTube videos, "Free Text" (announcements), and "Team Assets" (lineups)
- **Production Ready**: Designed for game-day operation where sponsors/announcements are prepared before kickoff

#### Multi-Queue Architecture

**Firebase schema** (`ControllerState`):

```typescript
{
  queues: Record<string, QueueState>,  // keyed by queue ID
  activeQueueId: string | null,        // currently playing queue
  playing: boolean,
  // ... other controller fields
}

interface QueueState {
  id: string;
  name: string;
  items: Asset[];
  autoPlay: boolean;     // auto-advance to next item
  imageSeconds: number;  // duration per item (when autoPlay)
  cycle: boolean;        // loop back to start when exhausted
  order: number;         // display ordering
}
```

**Key behaviors**:

- Playing a queue shifts its first item to `currentAsset` and sets `playing = queue.autoPlay`
- Empty non-cycling queues are auto-deleted via `maybeAutoDeleteQueue()`
- `computeControllerDiff()` writes per-queue nested paths (`queues/{id}/items`) to prevent multi-controller data loss
- `parseQueueMap()` in `firebaseParsers.ts` validates queue data and auto-repairs duplicate `order` values

**Component hierarchy**:
| Component | File | Purpose |
|-----------|------|---------|
| `AssetController` | `AssetController.tsx` | Root: tab switcher (URL/Free Text/Team/Media) + QueueBoard |
| `QueueBoard` | `queue/QueueBoard.tsx` | Kanban layout with `@dnd-kit` DnD context |
| `QueueColumn` | `queue/QueueColumn.tsx` | Per-queue column: play/stop, settings gear, rename, delete |
| `QueueItem` | `queue/QueueItem.tsx` | Individual asset in a queue |
| `QueuePicker` | `queue/QueuePicker.tsx` | Modal dialog for adding assets to queues (see **QueuePicker Auto-Add Logic** below) |
| `PlaybackBar` | `queue/PlaybackBar.tsx` | Appears below screen preview when a queue is active; shows queue name, remaining count, large Next/Stop buttons |
| `QueueSettingsPopover` | `queue/QueueSettingsPopover.tsx` | Per-queue Autoplay/Loop/Duration settings (rsuite Popover) |
| `ItemActionDialog` | `queue/ItemActionDialog.tsx` | Context menu for "Show Now" / delete on individual items |
| `dndUtils` | `queue/dndUtils.ts` | DnD ID namespacing + `typedCollisionDetection` (see **Drag-and-Drop Collision Detection** below) |

**State operations** (in `FirebaseStateContext.tsx`):
`createQueue`, `deleteQueue`, `renameQueue`, `reorderQueues`, `addItemsToQueue`, `removeItemFromQueue`, `reorderItemsInQueue`, `updateQueueSettings`, `playQueue`, `stopPlaying`, `showItemNow`

#### QueuePicker Behavior

`QueuePicker` is rendered as an rsuite `Modal` dialog. Every asset click (image, URL, etc.) opens QueuePicker, which offers two action types:

1. **"Sýna"** (green, large button at top) — shows the asset immediately via `showItemNow`
2. **Queue buttons** (ghost buttons below a divider) — adds the asset to a specific queue
3. **"Ný biðröð"** (primary button at bottom) — creates a new queue and adds the asset

Special case: **0 queues** → auto-creates "Biðröð 1" and adds the item (no dialog shown).

The old "Birta strax" / "Setja í biðröð" radio buttons in MediaManager were removed. `ImageList` no longer has a `displayNow` prop — it always calls `onAddAssets`, which opens QueuePicker.

#### Media Library Layout

`controller/media/ImageList.css` renders folders and media as responsive grids.
Media cards use 132px-high `object-fit: contain` thumbnails and truncate long
filenames, so original upload dimensions cannot expand the controller view.

#### Drag-and-Drop Collision Detection

`@dnd-kit`'s default `closestCenter` collision detection doesn't work correctly with nested `SortableContext`s (queue columns containing sortable items). When dragging a column, `closestCenter` may match item droppables inside other columns instead of adjacent column droppables.

**Solution**: `typedCollisionDetection` in `dndUtils.ts` filters droppable containers by ID prefix (`col:` for columns, `item:` for items) before delegating to `closestCenter`. This ensures column drags only snap to column targets and item drags only snap to item targets.

#### createQueue Options

`createQueue(name, options?)` accepts an optional `options` parameter:

```typescript
createQueue(name: string, options?: { cycle?: boolean })
```

- `cycle` defaults to `true` (loop by default for most queues)
- Team queues pass `{ cycle: false }` since lineup sequences shouldn't loop

#### Team Queue Integration

`TeamAssetController.tsx` renders a "Setja lið í biðröð" button above each team (home/away) separately. Clicking it creates a named queue (e.g., "Víkingur R") containing that team's starting lineup as player card assets. The queue is created with `cycle: false` since lineup presentations are one-shot sequences.

#### Manual Roster Creation (Resolve Roster)

When a team side has no players loaded, `TeamAssetController.tsx` shows a **"Búa til leikmannahóp"** button. This is a manual fallback for when the KSI API does not have lineup data (e.g., youth matches, friendlies, or pre-match).

**Flow**:

1. User clicks "Búa til leikmannahóp" for home or away side
2. `ResolveRosterModal` opens with two sections: **Byrjunarlið** (11 required number inputs) and **Varamenn** (12 optional number inputs)
3. Client-side validation enforces: all 11 starters filled, positive integers only, no duplicate numbers across both groups
4. On submit, sends `POST ${apiConfig.gateWayUrl}v3/{teamId}/resolve-roster` with body `{ starters: number[], substitutes: number[] }`
5. API returns `{ players: TeamPlayer[], officials: [] }` (TeamLineup shape) for the requested side
6. Response is transformed using the same `mapRole` semantics as `transformLineups()` in `lib/matchUtils.ts`
7. A preview shows player numbers, names, and roles grouped by starters/substitutes
8. On confirm, the generated roster merges into the existing roster via `setRoster({ ...roster, [side]: generatedPlayers })`

**Key files**:

- `controller/asset/team/ResolveRosterModal.tsx` — modal component with form, validation, API call, and preview
- `controller/asset/team/TeamAssetController.tsx` — integrates the modal and manages `resolveRosterSide` state
- `controller/asset/team/Team.css` — styles for the modal and preview

**Note**: Unresolved player placeholders from the API (no name match) display as `#number` and are still saved.

#### Shared Home-Team Player Actions & Match-View Quick Actions

Home-team substitution, player-card, and man-of-the-match operations are shared
between the Lið tab and a match-view shortcut box so both use the same
Firebase-backed behavior.

**Shared hook** (`controller/asset/team/useHomeTeamQuickActions.ts`):

- Owns the team-action modal state machine (`subOff` → `subOn`, `playerCard`,
  `motm`) and exposes `openSubModal(side)`, `openPlayerCardModal()`,
  `openMOTMModal()`, `handleModalSelect(player)`, `closeModal()`, plus the
  `showPlayerCard(player, teamKey)` and `showMOTM(player, teamKey)` operations.
- The substitution flow preserves the established sequence: on-pitch
  (`show: true`) players for the outgoing step, eligible off-pitch players
  (`!show && number != null`) for the incoming step, `editPlayer` roster status
  updates, trimming of last names on the generated assets, `Skiptingar` queue
  creation/append/activation, and the home-team reveal background on assets.
- Player-card and man-of-the-match pass the complete home roster (including
  substituted-off players) to `TeamPlayerSelectionModal`.

**Consumers**:

- `TeamAssetController.tsx` (Lið tab) uses the hook for both its home and away
  substitution modal and the list-click `Birta leikmann` / `Birta mann
leiksins` actions. The goal-scorer modal remains local to the controller.
- `HomeTeamQuickActions.tsx` (`controller/HomeTeamQuickActions.tsx`) renders a
  **`Heimalið aðgerðir`** box in the match view below `MatchCountdownDisplay`
  (`App.tsx`, gated on `showMatchControls`). It provides `Skipting`, `Birta
leikmann`, and `Maður leiksins` shortcuts scoped to the home team and is
  hidden entirely when the home roster has no players. Styling lives in
  `Controller.css` (`.home-team-quick-actions*`).

#### Tab ↔ assetView Sync Gotcha

`Controller.tsx` has three tabs: **Biðröð** (queue), **Lið** (teams), **Myndefni** (media). The first two map to Firebase's `controller.assetView` (`ASSET_VIEWS.assets` / `ASSET_VIEWS.teams`), but **Myndefni has no corresponding `assetView`** — it's purely local tab state.

A `useEffect` in `Controller.tsx` syncs the tab from `controller.assetView` (so that programmatic view changes, e.g., "Setja lið í biðröð" switching to queue view, are reflected in the tab header). However, this sync **must skip when the user is on the Myndefni tab**, otherwise it will yank them away:

```typescript
useEffect(() => {
  const mapped = assetViewToTab[controller.assetView];
  if (mapped) setTab((prev) => (prev === TABS.media ? prev : mapped));
}, [controller.assetView]);
```

**Key rule**: Never sync `tab` from `assetView` when `tab === TABS.media`. The Myndefni tab is a local-only concept with no Firebase representation.

### 2. Match Control (`src/match-controller/`)

The operational heart of the app.

| Component         | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `ControlButton`   | Standardized buttons for scores/match events                         |
| `TeamController`  | Per-team controls (names, logos, penalties)                          |
| `MatchController` | Main dashboard for clock start/stop, half-time/full-time transitions |

### 3. Display Screens (`src/screens/`)

| Screen       | Purpose                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------- |
| `ScoreBoard` | Primary match interface - clock, scores, penalties. Designed for visibility from distance |
| `Idle`       | Pre/post match or breaks - club logos, weather, configurable sponsor ad                   |

#### Idle Ad Image

The idle screen can display an optional sponsor ad image. The image is selected from Firebase Storage (`{listenPrefix}/largeAds/`) and stored as a filename string in `states/${listenPrefix}/view/idleAd`.

- **No hardcoded images** — if `idleAd` is null/unset, no ad renders
- **Selection**: Dropdown in the "Idle skjár" panel of the advanced theme editor tab
- **Storage path**: `{listenPrefix}/largeAds/{filename}` — download URL resolved at render time
- **Firebase field**: `states/${listenPrefix}/view/idleAd` (string filename or null)

### 4. Specialized Logic

#### Clock Management (`src/match/Clock.tsx`)

- Main match timer with "half stops" (auto-stop at 45:00/90:00)
- Injury time display modes (see **Injury Time Display Mode** below)

#### Penalties/Red Cards

- `RedCardManipulation.tsx`: Player discipline management
- `PenaltiesManipulationBox.tsx`: Timed power plays (handball/futsal style)

#### HalfStops (`src/controller/HalfStops.tsx`)

Ensures the clock stops exactly at period end (e.g., 45:00) even if the controller doesn't click precisely.

#### Injury Time Display Mode

The legacy boolean `showInjuryTime` was replaced by the typed
`injuryTimeDisplayMode` field on `Match`. The mode applies after **every**
half-stop (not just the final one), matching the old behavior.

| Mode      | Behavior at half-stop                                                          |
| --------- | ------------------------------------------------------------------------------ |
| `stop`    | Pause, force seconds to `00`, buzz once (legacy `false`).                      |
| `full`    | Continue counting elapsed minutes and seconds (legacy `true`).                 |
| `minutes` | Continue counting, but render whole minutes with `:00` seconds (e.g. `91:00`). |

**Migration**: `firebaseParsers.ts` derives the mode from a legacy
`showInjuryTime` snapshot when `injuryTimeDisplayMode` is absent
(`false → "stop"`, `true → "full"`). The legacy field is never retained in
application state and never written. Read-only displays derive the mode
without writing; authenticated controllers persist the new field on their
next write.

**Controller**: `HalfStops.tsx` renders a three-option selector and calls
`setHalfStops(halfStops, mode)`. `MatchActions.tsx` shows the
"Næsti hálfleikur" button only for a paused, eligible match — the elapsed
time has reached the current first remaining period boundary (including
injury time) and a later period boundary remains — and the mode is not
`stop`. The `startHalftimeCountdown()` action in `FirebaseStateContext.tsx`
re-validates the same paused/boundary/remaining-boundary invariant before
writing, so stale or direct requests from other controllers are rejected
without a state change.

### 5. Global Shortcuts (`src/hooks/useGlobalShortcuts.ts`)

Maps physical keyboard keys to Context actions for fast operation (e.g., Space for start/stop).

### 6. Theme System (CSS Custom Properties)

The display is styled via **CSS Custom Properties** (CSS variables) applied on the `.App` container element. Themes are stored in Firebase as part of `ViewState` and synced like all other state.

#### How It Works

1. `ViewState` has optional `theme?: ThemeConfig` (custom overrides), `themePreset?: string`, and `customPresets?: Record<string, CustomPreset>` fields
2. `useThemeCssVars()` hook in `App.tsx` resolves preset + overrides → CSS variable object, checking custom presets first then built-in
3. CSS variables are spread onto the `.App` container's `style` attribute alongside existing inline styles
4. All display CSS uses `var(--theme-*, fallback)` syntax so the display works with or without theme data

**Resolution order**: Look up preset by name/ID (custom presets first, then built-in) → apply `theme` overrides (shallow merge). If no preset is set, `DEFAULT_THEME` is used.

#### ThemeConfig Properties

All properties are CSS value strings. Grouped by display area:

| Group         | Properties                                                                                                                                                                                                                                     | CSS Variables                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Score boxes   | `scoreBoxBg`, `scoreBoxColor`, `scoreBoxBorder`, `scoreBoxFontSize`, `scoreBoxFontFamily`, `scoreBoxStroke`, `scoreTop`, `scoreHeight`, `scoreWidth`                                                                                           | `--theme-score-*`                                                                                                                  |
| Clock         | `clockBg`, `clockColor`, `clockBorder`, `clockFontSizeMin`, `clockFontSizeMax`, `clockFontFamily`, `clockStroke`, `clockTop`, `clockLeft`, `clockWidth`, `clockHeight`                                                                         | `--theme-clock-*`                                                                                                                  |
| Logos         | `logoTop`, `logoHeight`, `logoWidth`, `homeLogoScale`, `awayLogoScale`                                                                                                                                                                         | `--theme-logo-*`, `--theme-home-logo-scale`, `--theme-away-logo-scale`                                                             |
| Injury time   | `injuryTimeColor`, `injuryTimeFontSize`, `injuryTimeStroke`, `injuryTimeTop`, `injuryTimeLeft`                                                                                                                                                 | `--theme-injury-*`                                                                                                                 |
| Team names    | `teamNameColor`, `teamNameFontFamily`                                                                                                                                                                                                          | `--theme-team-name-*`                                                                                                              |
| Player assets | `playerNumberColor`, `playerNameColor`, `playerNumberFontFamily`, `playerNameFontFamily`                                                                                                                                                       | `--theme-player-number-color`, `--theme-player-name-color`, `--theme-player-number-font-family`, `--theme-player-name-font-family` |
| Red cards     | `redCardColor`                                                                                                                                                                                                                                 | `--theme-red-card-color`                                                                                                           |
| Penalties     | `penaltyBg`, `penaltyColor`, `penaltyBorder`                                                                                                                                                                                                   | `--theme-penalty-*`                                                                                                                |
| Timeouts      | `timeoutColor`                                                                                                                                                                                                                                 | `--theme-timeout-color`                                                                                                            |
| Ad image      | `adTop`, `adLeft`, `adWidth`, `adHeight`                                                                                                                                                                                                       | `--theme-ad-*`                                                                                                                     |
| Background    | `backgroundImage`                                                                                                                                                                                                                              | `--theme-background-image` (conditional)                                                                                           |
| Idle screen   | `idleTextColor`, `idleTextFontSize`, `idleLogoTop`, `idleLogoLeft`, `idleLogoWidth`, `idleTextTop`, `idleLogoHeight`, `idleClockTop`, `idleClockLeft`, `idleTempTop`, `idleTempLeft`, `idleAdTop`, `idleAdLeft`, `idleAdWidth`, `idleAdHeight` | `--theme-idle-*`                                                                                                                   |

#### Preset Themes

**Built-in presets** are defined in `constants.ts` as `THEME_PRESETS`. Their names are tracked in `BUILT_IN_PRESET_NAMES`:

- **Default** — Black boxes, white text, white borders (the original hardcoded look)
- **Vikes Dark** — Dark red boxes with Víkingur red borders
- **Vikes Light** — White semi-transparent boxes with dark text and red borders
- **Minimal** — Transparent backgrounds, no borders, larger score font
- **Blue Ice** — Dark blue boxes with ice-blue text and borders

**Custom presets** are stored per-`listenPrefix` in Firebase at `states/${listenPrefix}/view/customPresets`. Each custom preset has:

- `name: string` — Display name
- `theme: ThemeConfig` — Full theme configuration
- `basedOn?: string` — Name of the built-in preset this was derived from (for modified copies)

#### Custom Preset Behavior

- **A preset is always active** — there is no "no preset" state
- **Editing a built-in preset** auto-creates an independent copy named `"<preset> (breytt)"`. The built-in preset remains untouched and the copy has no link back to it
- **Editing a custom preset** updates it directly (no copy behavior)
- **Creating a new preset** creates a blank custom preset with `DEFAULT_THEME` values
- **Deleting** a custom preset removes it from Firebase; if it was active, falls back to Default
- **Renaming** custom presets is supported via double-click on the preset name

#### Key Files

| File                                         | Role                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                   | `ThemeConfig` and `CustomPreset` interface definitions                                                                                                        |
| `constants.ts`                               | `DEFAULT_THEME`, `THEME_PRESETS`, and `BUILT_IN_PRESET_NAMES`                                                                                                 |
| `hooks/useThemeCssVars.ts`                   | `useThemeCssVars()` hook (config → CSS vars), `resolveTheme()`, and `lookupPreset()` (custom → built-in fallback)                                             |
| `contexts/firebaseParsers.ts`                | `parseTheme()`, `parseCustomPresets()` validators for Firebase data                                                                                           |
| `contexts/FirebaseStateContext.tsx`          | `setTheme()`, `setThemePreset()`, `saveCustomPreset()`, `deleteCustomPreset()` actions                                                                        |
| `App.tsx`                                    | Applies CSS vars to `.App` container (passes `customPresets` to `useThemeCssVars`)                                                                            |
| `controller/theme/ThemeEditor.tsx`           | `ThemeEditorModal` — rsuite Modal for preset management and theme editing                                                                                     |
| `controller/theme/ThemeEditor.css`           | Theme editor modal styling                                                                                                                                    |
| `controller/theme/VisualEditorCore.tsx`      | Shared visual editor components: `ElementDef`, `ColorPopover`, `DraggableElement`, `PopoverState`, `OnColorClickFn`. Used by both scoreboard and idle editors |
| `controller/theme/VisualThemeEditor.tsx`     | Scoreboard visual editor — element definitions, background upload, uses shared components from `VisualEditorCore`                                             |
| `controller/theme/IdleVisualThemeEditor.tsx` | Idle screen visual editor — element definitions, simplified popover (text color only), uses shared components from `VisualEditorCore`                         |
| `controller/theme/VisualThemeEditor.css`     | Visual editor styles (upload indicator, clear button, popover controls)                                                                                       |
| `screens/ScoreBoard.css`                     | Uses `var(--theme-*)` for score/clock/penalty display                                                                                                         |
| `screens/Idle.css`                           | Uses `var(--theme-*)` for idle screen display                                                                                                                 |
| `match/RedCard.css`                          | Uses `var(--theme-red-card-color)`                                                                                                                            |
| `match/ClockBase.tsx`                        | Uses CSS var expressions for font size (with prop defaults as fallbacks)                                                                                      |

#### Adding a New Theme Property

1. Add the property to `ThemeConfig` in `types.ts`
2. Add default value in `DEFAULT_THEME` in `constants.ts`
3. Add CSS variable mapping in `themeToCssVars()` in `useThemeCssVars.ts`
4. Use `var(--theme-your-var, fallback)` in the relevant CSS file
5. Optionally add it to preset themes and the `ThemeEditor` UI

New `ThemeConfig` keys are picked up automatically: every preset spreads
`DEFAULT_THEME`, and `parseTheme()` in `firebaseParsers.ts` iterates
`DEFAULT_THEME` keys (falling back to the default for absent Firebase
values). This is how `playerNumberColor`/`playerNameColor` and
`playerNumberFontFamily`/`playerNameFontFamily` were added — they control
the color and font family of the player number/name assets (`Asset.css`,
auto-fit measurement in `PlayerCard.tsx`).

#### Background Image

Each theme can have a custom `backgroundImage` URL that overrides the default background. This is a **per-theme** property stored in `ThemeConfig`, so different presets can have different backgrounds.

**Upload flow** (Visual tab in ThemeEditor):

1. User clicks the canvas background area in `VisualThemeEditor`
2. A hidden `<input type="file">` opens for image selection
3. Image uploads to Firebase Storage at `${listenPrefix}/backgrounds/bg-${Date.now()}.${ext}`
4. On success, the download URL is saved as `theme.backgroundImage` via `onChange`
5. A "✕" button appears to clear the background

**Display** (`App.tsx`):

- When `effectiveTheme.backgroundImage` is set and the display is not blacked out, it overrides `getBackground()` with `backgroundImage: url(...)`, `backgroundSize: cover`, `backgroundPosition: center`
- The `--theme-background-image` CSS var is only emitted when the URL is non-empty

**Advanced tab** (`ThemeEditor.tsx`):

- "Bakgrunnsmynd" panel with a URL text input and "Fjarlægja mynd" clear button

#### Ad Image Positioning

The ad image (`img.ad` in `ScoreBoard.css`) uses theme CSS vars for all positioning:

- `adTop` (default `"73%"`), `adLeft` (default `"33.5%"`), `adWidth` (default `"33%"`), `adHeight` (default `"25%"`)
- In the Visual tab, the "AD" element is draggable like other elements (score boxes, clock, etc.)
- The Advanced tab has an "Auglýsing" panel with position/size percentage inputs

**Note**: The original CSS used `bottom: 2%` with `height: 25%`, which was converted to the equivalent `top: 73%` for consistency with the theme system's top-based positioning.

#### Per-Team Logo Scaling

Each team's logo can be independently scaled via `homeLogoScale` and `awayLogoScale` (percentage strings, e.g. `"100%"`). The scaling uses CSS `transform: scale()` with `transform-origin: center center` on `.img-wrapper`, so logos resize "middle out" — maintaining their center position and vertical alignment. The `themeToCssVars()` function converts the percentage to a unitless scale factor (e.g. `"100%"` → `"1"`, `"150%"` → `"1.5"`). Because `transform: scale()` is used (not width/height changes), aspect ratio is always preserved.

#### Viewport Variants Note

The `insidebig` and `insidesmall` CSS viewport variants (for indoor screens) still use hardcoded position overrides. Theme CSS vars apply to the default/outdoor layout. Converting indoor variants to use theme vars is a potential future enhancement.

#### Idle Screen Visual Editor

`IdleVisualThemeEditor.tsx` provides a drag-and-drop visual editor for positioning idle screen elements, following the same pattern as `VisualThemeEditor.tsx` (scoreboard editor).

**Four draggable elements**:

- **idle-logo**: Club logo — controls `idleLogoHeight` (resizable height)
- **idle-clock**: Clock display — controls `idleClockTop`, `idleClockLeft` (position), `idleTextFontSize`, `idleTextColor` (appearance)
- **idle-temp**: Temperature display — controls `idleTempTop`, `idleTempLeft` (position)
- **idle-ad**: Sponsor ad (husasmidjan) — controls `idleAdTop`, `idleAdLeft`, `idleAdWidth`, `idleAdHeight` (position + size)

**Differences from scoreboard visual editor**:

- No background image upload (idle screen background is controlled separately)
- Font size slider uses `px` units (range 10–120) vs scoreboard's `rem` units
- Simplified `ColorPopover` (no stroke field)

**Idle screen layout** (`Idle.tsx` / `Idle.css`):

- Clock and temperature are individually absolutely-positioned elements (not wrapped in a shared container)
- Each uses CSS vars: `--theme-idle-clock-top`, `--theme-idle-clock-left`, `--theme-idle-temp-top`, `--theme-idle-temp-left`
- The husasmidjan ad uses `--theme-idle-ad-top`, `--theme-idle-ad-left`, `--theme-idle-ad-width`, `--theme-idle-ad-height`
- The idle logo uses `--theme-idle-logo-height` for resizable height

#### ThemeEditor UI

The theme editor is a **full rsuite Modal** (`ThemeEditorModal`) launched from a "Klukku þema" / "Breyta" trigger row in the Controller settings. It does NOT expand inline — the Settings modal stays simple.

**Layout**:

- **Left section**: Preset list (built-in presets as `ButtonGroup`, custom presets as a list below with rename/delete controls)
- **Right section**: Three tabs — "Sjónrænt" (visual scoreboard editor), "Sjónrænt (idle)" (visual idle screen editor), and "Ítarlegt" (advanced property panels)

**Preset management features**:

- Select any built-in or custom preset to activate it
- Editing a built-in preset auto-creates an independent copy named `"<preset> (breytt)"` — original stays untouched
- "Nýtt þema" button creates a blank custom preset from `DEFAULT_THEME`
- Custom preset names are editable via pencil (edit) icon button next to delete
- Custom presets can be deleted via `IconButton` with `TrashIcon`

**Editor panels** (extracted into `ThemeEditorPanels` sub-component):

- Color pickers, text inputs, font family selectors, percentage inputs
- Collapsible panels for each property group (Score boxes, Clock, Logos, etc.)
- "Idle skjár" panel includes an `IdleAdPicker` dropdown for selecting the idle ad image from Firebase Storage

**Controller integration** (`Controller.tsx`):

- `themeOpen` boolean state controls modal visibility
- Trigger row shows current preset name + "Breyta" button
- `<ThemeEditorModal open={themeOpen} onClose={...} />`

All labels are in Icelandic, consistent with the rest of the controller UI.

#### Fonts

**Google Fonts** (loaded via CDN in `index.html`): Anton, Oswald, Bebas Neue, Orbitron, Russo One.

**Bundled fonts** (self-hosted via `@font-face` in `src/assets/fonts/`):

- **GT America** (Grilli Type) — Regular + Bold weights (`GT-America-Standard-Regular.otf`, `GT-America-Standard-Bold.otf`). Declared in `src/assets/fonts/gt-america.css`, imported in `src/index.tsx`.

The exported `FONT_OPTIONS` array in `ThemeEditor.tsx` defines the available fonts in the per-element font dropdowns in both the advanced ThemeEditor and the visual VisualThemeEditor (score box, clock, team name). To add a new font:

1. For Google Fonts: add the `<link>` to `index.html` and add the CSS `font-family` string to `FONT_OPTIONS`
2. For bundled fonts: place files in `src/assets/fonts/`, create a CSS file with `@font-face` declarations (use `format("opentype")` for `.otf`), import the CSS in `src/index.tsx`, and add to `FONT_OPTIONS`

## Build & Tooling

- **Bundler**: Vite (migrated from Create React App) - config in `vite.config.ts`
- **Testing**: Vitest for unit tests, Playwright for e2e
- **Linting**: ESLint (airbnb-style) + Prettier

### ESLint Policy (MANDATORY)

**DO NOT add `eslint-disable` comments** without explicit user approval. This project maintains strict linting standards.

If you encounter an ESLint error:

1. **Fix the code** - Most errors have proper TypeScript solutions
2. **Check patterns** - Look for similar code in codebase that passes lint
3. **Ask for help** - If genuinely stuck, stop and ask rather than suppressing

**Exception Policy**: If you believe a rule is a genuine false positive:

- Stop and explain the situation to the user
- Get explicit approval before adding eslint-disable
- Document the justification in a comment above the disable

**Example fixes**:

```typescript
// BAD: Type assertion with eslint-disable
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
const key = `${team}Score` as "homeScore" | "awayScore";

// GOOD: Lookup object pattern
const scoreKeys = { home: "homeScore", away: "awayScore" } as const;
const key = scoreKeys[team];
```

**For test mocks**, fix data shapes rather than casting:

```typescript
// BAD: Wrong type + eslint-disable
mockedHook.mockReturnValue({ match: { started: false } } as any);  // started should be number!

// GOOD: Correct types
mockedHook.mockReturnValue({ match: { started: 0 } });

// ACCEPTABLE (last resort): as unknown as Type (NOT as any)
mockedHook.mockReturnValue({ ... } as unknown as ReturnType<typeof useHook>);
```

**Important**: Always run `pnpm format` after making changes. CI runs format checks and will fail if code is not properly formatted. To format only specific files: `pnpm exec prettier --write path/to/file.tsx`

**Important**: Always run `pnpm lint` before pushing. CI runs ESLint and will fail on lint errors. Fix all errors in files you touched — do not add `eslint-disable` comments (see ESLint Policy above).

## Testing & Development

### Port Configuration

Both Vite and Playwright support a `PORT` environment variable for custom port assignment:

```bash
# Run dev server on custom port (defaults to 3000)
PORT=4500 pnpm start

# Run e2e tests on custom port (defaults to 3000)
PORT=4500 VITE_USE_EMULATOR=true pnpm e2e
```

**Why this matters**: If port 3000 is already in use (e.g., multiple developers, parallel projects), tests will fail with connection errors. Use a custom port to avoid conflicts.

**Implementation**:

- `vite.config.ts` reads `process.env.PORT` for server configuration
- `playwright.config.ts` calculates `baseURL` from `process.env.PORT` and passes it to the webServer config
- CI always uses default port 3000 (no env var set)

### Firebase Emulator

For isolated local development and CI, use Firebase Emulator:

```bash
# Start emulator (from project root)
firebase emulators:start --only auth,database --project vikes-match-clock-test

# Or use Docker
docker-compose up -d

# Run app with emulator
VITE_USE_EMULATOR=true pnpm start

# Run e2e tests with emulator
VITE_USE_EMULATOR=true pnpm e2e

# Run e2e tests with emulator on custom port
PORT=4500 VITE_USE_EMULATOR=true pnpm e2e
```

Emulator ports:

- Auth: 9099
- Database: 9000
- UI: 4000

### Test Credentials

E2E tests that require authentication use the `TEST_CREDENTIALS` environment variable.

**Format**: `EMAIL;PASSWORD` (semicolon-separated)

**Local development**:

```bash
pnpm e2e
```

If `TEST_CREDENTIALS` is not set, tests fall back to default staging credentials.

**GitHub Actions**: The `TEST_CREDENTIALS` secret must be configured in the repository settings. Format is the same: `EMAIL;PASSWORD`.

To log in manually (use playwright):

1. Navigate to `localhost:3000` (or custom port if using `PORT` env var)
2. Click **Stillingar** (Settings) tab
3. Enter credentials in the E-mail and Password fields
4. Click **Login**

Once logged in, you'll see your email displayed and have access to authenticated features like the "Myndefni" (Media) image uploads and remote control functionality.

### E2E Test Architecture

**Authentication Flow**: E2E tests rely on `window.__firebaseAuthUID` to verify successful login. This global is set by `LocalStateContext.tsx` when Firebase auth state changes:

```typescript
// In LocalStateContext.tsx onAuthStateChanged callback
if (typeof window !== "undefined") {
  (window as any).__firebaseAuthUID = authState.uid || null;
}
```

**Why this exists**: Playwright tests need to verify auth completed before proceeding with authenticated actions. The window global provides a reliable synchronization point between Firebase auth and test assertions.

**Test Data Initialization**: The `clearEmulatorData()` helper in `e2e/fixtures/test-helpers.ts` initializes Firebase with baseline state before each test. Key points:

- **halfStops format**: Stored in **minutes** (e.g., `[45, 90, 105, 120]`), not seconds or milliseconds
- **Default football config**: Use 4 values for overtime support: `[45, 90, 105, 120]`
- **matchType**: Must be `"football"` or `"handball"` to match `Sports` enum
- **homeTeamId/awayTeamId**: Numeric IDs matching KSI API (see Team ID System section)
- **Controller state**: Uses multi-queue format (`queues: {}`, `activeQueueId: null`) — NOT the old `selectedAssets` array

If tests fail with unexpected halfStops counts or values, check that test initialization data matches the format expected by `firebaseParsers.ts` and the default constants in `constants.ts`.

#### E2E Asset Test Patterns

The asset E2E tests (`e2e/assets.spec.ts`) use these selectors for the multi-queue UI:

- `.queue-column` — a queue column in the Kanban board
- `.queue-item` — an individual asset item within a queue
- `.queue-board-empty` / `"Engin biðröð"` — empty state when no queues exist
- `.queue-column-actions .rs-btn` — gear icon to open settings popover
- `.queue-settings-popover` — the settings popover element
- `getByLabel("Play Queue")` / `getByLabel("Stop Queue")` — play/stop buttons on queue columns
- `.playback-bar` — the playback bar shown below the screen preview when a queue is active
- `getByLabel("Next asset")` / `getByLabel("Stop playback")` — large buttons in the playback bar
- `"Hreinsa virkt overlay"` — clear button shown only when an overlay is active WITHOUT an active queue
- rsuite `Toggle` components use `data-checked="true"` attribute (NOT `rs-toggle-checked` class)

### Playwright MCP Limitations for Multi-Session Testing

This app requires testing scenarios with **two independent browser sessions** (e.g., controller + remote display). The Playwright MCP has limitations that make this difficult:

1. **Tabs share browser context**: Multiple tabs opened via `browser_tabs` share localStorage, cookies, and session state. Both tabs will have identical local state.

2. **Cannot control multiple contexts**: While you can create separate browser contexts via `browser_run_code`:

   ```javascript
   const newContext = await browser.newContext();
   const newPage = await newContext.newPage();
   ```

   The MCP only tracks/controls the original page. The new context's page cannot be interacted with via standard MCP tools (`browser_click`, `browser_snapshot`, etc.).

3. **Workarounds for multi-session testing**:
   - **Manual testing**: Open two separate browser windows (or one incognito) and test manually
   - **Playwright e2e tests**: Use the Playwright test runner which can handle multiple browser contexts
   - **Single-session verification**: Test that actions dispatch correctly and state changes as expected, then rely on Firebase sync logic being correct

4. **What CAN be tested with Playwright MCP**:
   - Single-session UI flows (login, navigation, clicking buttons)
   - Verifying UI state after actions
   - Form interactions and validation
   - Visual snapshots of single pages

For testing Firebase sync between controller and display (e.g., PlaybackBar stop clearing on remote), you'll need to either test manually or write Playwright tests that can manage multiple browser contexts.

## Related Systems

- **`clock-api/`**: Python Lambda API for match data and weather

## Team ID System & Match Data Pipeline

### How Team IDs Work

`club-ids.ts` is the canonical mapping of team display names to KSI Analyticom API IDs. These IDs were sourced from https://www.ksi.is/felagslid/adildarfelog/ (each team link has `felag?id=XXXX`).

**The full data flow when a user selects a match:**

1. User picks a team name in `TeamSelector.tsx` (dropdown from `club-ids.ts` keys)
2. `updateMatch()` in `FirebaseStateContext.tsx` resolves the team name → numeric ID via `lookupClubId()` and writes `homeTeamId`/`awayTeamId` to Firebase
3. "Sækja leiki í dag" fetches matches from the v3 API using the team's numeric ID
4. `fetchLineups()` returns players keyed by the API's team IDs: `{ [String(match.homeTeam.id)]: Player[] }`
5. `TeamAssetController.tsx` looks up players via `String(match.homeTeamId)` — the ID stored in Firebase **must match** the API's team ID, or lineup lookup silently returns nothing

### Name Normalization

The KSI API sometimes returns team names with trailing dots (e.g., "Víkingur R.") while `club-ids.ts` stores names without dots ("Víkingur R"). The `lookupClubId()` helper in `FirebaseStateContext.tsx` handles this by stripping trailing dots as a fallback:

```typescript
const lookupClubId = (name: string): string =>
  clubIdsMap[name] ?? clubIdsMap[name.replace(/\.+$/, "")] ?? "0";
```

### Special ID Values

- **`"-1"`**: Teams not found in KSI (combined teams, foreign clubs, national teams). Still selectable in the UI but won't match API data.
- **`"0"`**: Unknown/unrecognized team name (fallback when lookup fails).

### Custom Team Overrides In Selectors

Firebase `clubOverrides` entries with `isOverride: false` act as fully custom teams. They are merged into the `TeamSelector.tsx` dropdown alongside bundled `club-ids.ts` teams, and `updateMatch()` resolves their configured `clubId` from Firebase before falling back to bundled IDs. This allows custom teams like `Kjánaprik` to be selected in Stillingar and keep `clubId: "-1"` until a real KSI ID is added later.

### Key Files in the Pipeline

| File                                            | Role                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `club-ids.ts`                                   | Team name → KSI Analyticom ID mapping                                              |
| `FirebaseStateContext.tsx`                      | Resolves IDs on team selection, writes to Firebase                                 |
| `controller/TeamSelector.tsx`                   | Team dropdown UI, case-insensitive matching                                        |
| `lib/api.ts`                                    | Fetches matches/lineups from API, `transformLineups()` keys players by API team ID |
| `controller/asset/team/TeamAssetController.tsx` | Looks up players by `String(match.homeTeamId)` from the transformed lineups        |

## Data Formats & Storage

### halfStops Storage Format

The `halfStops` array stores period end times in **minutes** (not seconds or milliseconds):

```typescript
// CORRECT - stored in minutes
halfStops: [45, 90, 105, 120]  // Regular time + 2 extra time periods

// WRONG - do not use seconds or milliseconds
halfStops: [2700, 5400, 6300, 7200]  // ❌ seconds
halfStops: [2700000, 5400000, ...]   // ❌ milliseconds
```

**Why**: The app converts to milliseconds internally (`halfStops[0] * 60 * 1000`), so Firebase stores the human-readable minute values.

**Default configurations**:

- Football: `[45, 90, 105, 120]` (45 min halves + 2x15 min extra time)
- Handball: `[30, 60, 65, 70]` (30 min halves + 2x5 min extra time)

**Source of truth**: `constants.ts` defines `DEFAULT_HALFSTOPS` and `HALFSTOPS` lookup tables.

**Related files**:

- `contexts/firebaseParsers.ts` - Parses halfStops from Firebase (no transformation)
- `contexts/FirebaseStateContext.tsx` - Converts minutes → milliseconds for `timeElapsed`
- `controller/HalfStops.tsx` - Renders input fields based on `halfStops.length`
- `e2e/fixtures/test-helpers.ts` - Must initialize test data with minute values
