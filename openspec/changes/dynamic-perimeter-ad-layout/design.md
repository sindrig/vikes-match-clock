# Design: Dynamic Perimeter Ad Layout

## Data Ownership

| Path                                   | Writer     | Purpose                                                             |
| -------------------------------------- | ---------- | ------------------------------------------------------------------- |
| `states/{location}/perimeter/adLayout` | Controller | Desired layout command                                              |
| `perimeter/{location}/adLayout`        | Daemon     | Read-only capabilities, applied layout, preview, status, and errors |
| `{location}/perimeter/*` in Storage    | Controller | Selectable/uploaded source assets                                   |

The daemon must never write to `states/{location}/perimeter/adLayout`. It
listens only to that path and publishes exclusively below
`perimeter/{location}/adLayout`, eliminating a self-write feedback loop.

## Desired Layout Schema

```json
{
  "version": 1,
  "revision": "uuid",
  "columns": [
    {
      "id": "uuid",
      "files": {
        "2": {
          "name": "ad-48.png",
          "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad-48.png"
        },
        "4": {
          "name": "ad-40.mp4",
          "source": "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad-40.mp4"
        }
      }
    }
  ]
}
```

Rules:

- `revision` changes for every user edit, including reorder.
- `columns` is the complete intended order, not an incremental operation log.
- Each column must have exactly one valid file for every configured lane, and
  no extra lanes.
- Source objects must belong to the approved bucket and the current location's
  `perimeter/` prefix.
- File names must remain basename-only and reject traversal/control characters.
- The controller must reject incomplete columns before writing; the daemon
  repeats all validation and treats Firebase as untrusted input.
- An empty layout is valid and clears/stops only the ad-layout playback lanes.

## Daemon-Published Contract

```json
{
  "lanes": [
    { "id": "2", "name": "48 skjair" },
    { "id": "4", "name": "40 skjair" }
  ],
  "revision": "uuid",
  "phase": "staging|loading|playing|error|idle",
  "activeColumn": 1,
  "error": null,
  "updatedAt": 1723392000000,
  "columns": [
    {
      "id": "uuid",
      "files": {
        "2": {
          "name": "ad-48.png",
          "thumbnail": "data:image/png;base64,...",
          "transportDurationMs": 20000
        },
        "4": {
          "name": "ad-40.mp4",
          "thumbnail": "data:image/png;base64,...",
          "transportDurationMs": 15342
        }
      }
    }
  ]
}
```

- Lane metadata is daemon-owned, derived from the daemon's local Resolume
  configuration and composition layer names. The React UI must not hard-code
  two lanes.
- The preview shows the applied layout, not merely the submitted request.
- `transportDurationMs` is the actual duration the daemon configured/read
  from Resolume.
- If a revision is invalid or fails to stage/load, preserve the last
  successfully applied layout and publish the rejection/error against the
  new revision, then resume the previous layout's cycling timer so playback is
  never frozen on a stale column.
- An empty `columns` layout is a valid clear: it disconnects only the
  ad-layout clip slots (never the whole layer, preserving the goal overlay's
  independent clips) and publishes an `idle` status that keeps the submitted
  revision, so identical clears are deduplicated and the controller does not
  report a permanent pending state.
- The same Storage object may be used on multiple lanes (same filename +
  source). A filename mapped to two different sources is rejected because the
  daemon stages lane files to a shared remote directory keyed by filename.
- The daemon deduplicates by `revision`, not by serialized document identity.

## Playback Behavior

1. On a valid new revision, cancel the existing timer and invalidate
   in-flight work using a generation guard; a failed replacement restores the
   previous revision, its applied columns, and its cycling timer.
2. Stage all lane files for the first column.
3. Load each file into that lane's reserved Resolume clip slot.
4. For static images, set Resolume transport duration to exactly 20,000 ms.
5. For videos, obtain the effective clip duration from Resolume after load.
6. Disable per-clip looping.
7. Trigger every lane in the column together.
8. Advance after the column's effective duration.
9. After the final column, schedule column zero, rather than holding or
   looping only the final clip.
10. A newer revision supersedes all pending retries, timers, and callbacks
    from older revisions.
11. A daemon restart reads the desired revision and restores it; it must not
    create a new revision or mutate the requested document.

## Controller UX

- Render daemon-published lanes dynamically.
- Render columns horizontally, matching the current preview visual model.
- Add column dialog: one required selector per lane, list existing objects
  from `{listenPrefix}/perimeter/`, permit file upload.
- Save only when every lane has a selection.
- Delete column: red X action with confirmation dialog.
- Reorder: @dnd-kit horizontal sortable-column pattern from QueueBoard.
- Distinguish "requested update pending" from "applied revision."

## Validation and Safety

Daemon validation must enforce:

- Version, UUID-like revision, bounded column count, and unique column IDs.
- Exact configured lane set per column.
- Approved bucket and location-scoped `perimeter/` object path.
- Safe names and bounded field lengths.
- Bounded static duration: fixed at 20 seconds by daemon policy.
- Bounded video duration returned by Resolume before scheduling playback:
  non-finite values and durations above 15 minutes are ignored and fall back
  to the 20s static duration (an unbounded value could stall a column for days
  or overflow `setTimeout` into ~1ms rapid cycling).
- The ad-layout and goal-overlay clip slot maps must be disjoint; an overlap
  is rejected at daemon startup.
- Timer cancellation before applying a newer revision.
- No Firebase writes to the desired-layout path.
- No daemon-controlled filesystem path sourced from Firebase.
