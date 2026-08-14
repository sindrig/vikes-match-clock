# Spec: Ad-Layout Content Deployer

## Requirements

### R1: Content-Only Operation
The daemon must never call Resolume transport-related endpoints
(connect, disconnect, loop-on/off, transport/duration).  It only opens
files into clip slots via the `open` endpoint and clears them via
`clear`.

### R2: Column Mapping
For N layout columns and M deck columns (read from the composition via
`compositionGrid`), each ad file is loaded into `floor(M/N)` consecutive
deck columns on each configured lane.  The remainder `M mod N` is
distributed — one extra deck column for each of the first `M mod N`
layout columns.  A single layout column (`N=1`) maps to all M deck
columns.  An empty layout clears all ad slots.

### R3: Desired/Applied Split
Controller writes the desired layout to `states/{location}/perimeter/adLayout`.
Daemon reads this path and publishes results to `perimeter/{location}/adLayout`.
The daemon never writes to the desired path.

### R4: Revision-Based Deduplication
Every controller write includes a new UUID `revision`.  The daemon processes
a new revision only when it differs from the last applied one.  No generation
tracking or supersession of in-flight work — a new revision waits for the
current load cycle to complete.

### R5: Lane and Column Discovery
The daemon reads the composition at startup to discover lane names and
column count.  Lane IDs come from `PERIMETER_AD_LANE_IDS` (default `1,3`).
The full deck column range (1..columnCount) on each lane is available
for ad file placement.

### R6: Source Validation
All source objects must belong to the approved bucket and the current
location's `perimeter/` prefix.  File names must be basename-only and
reject traversal/control characters.  (Unchanged from original design.)

### R7: Column Composition
Every column in a layout must contain exactly one valid file entry per
configured lane.  The controller rejects incomplete columns before
writing; the daemon repeats this validation.  (Unchanged from original
design.)

### R8: File Staging
Assets are downloaded from GCS to a local cache, validated against size
limits, and copied to the Windows Resolume host via SCP.  Atomic rename
prevents partial downloads from being used.  (Unchanged from original
design.)

### R9: Thumbnail Collection
After loading an ad file, the daemon fetches the clip thumbnail via the
Resolume API.  Thumbnails are fetched once per unique ad file (not per
deck column instance) and included in the published applied status.

### R10: Goal Overlay Independence
The existing goal overlay protocol remains separate and unchanged.
Ad-layout and overlay clip slot maps must not overlap on any layer.
(`assertNoSlotConflicts` in index.js enforces this; with ads on layers
1,3 and overlays on 2,4, no overlap exists.)

### R11: Empty Layout Clear
An empty `columns` array clears all ad clips on all configured lanes
across all deck columns.  The daemon publishes an `idle` status.

### R12: Layout Update (clear-then-load)
When a new revision arrives:

1. Cancel in-progress staging.
2. Clear all old ad slots on all lanes and deck columns.
3. Stage new files.
4. Open new files into their mapped deck columns.
5. Publish `playing` status.

A brief blank period between step 2 and step 4 is acceptable.

### R13: Restart Safety
On daemon restart, read the desired revision from Firebase.  If it
exists and differs from the last applied, re-load it.  If absent,
publish idle status.  Do not create a new revision or mutate the
requested document.

### R14: Status Payload
The daemon-published status conforms to:

```json
{
  "lanes": [{"id":"1","name":"48 skjáir"},{"id":"3","name":"40 skjáir"}],
  "revision": "uuid",
  "phase": "loading|playing|idle|error",
  "error": "error text or null",
  "updatedAt": 1723392000000,
  "columns": [
    {
      "id": "uuid",
      "deckColumns": [1, 2, 3, 4, 5],
      "files": {
        "1": {"name":"ad-48.png","thumbnail":"data:image/png;base64,..."},
        "3": {"name":"ad-40.mp4","thumbnail":"data:image/png;base64,..."}
      }
    }
  ]
}
```

The UI renders `lanes` dynamically, shows which deck columns each layout
column occupies, and displays per-lane file names and thumbnails.

## Verification Claims

| Claim | Evidence |
|-------|----------|
| No transport endpoints called during layout load | Mock asserts no connect/disconnect/transport/duration/loop calls |
| Column mapping: 3 layout cols × 15 deck cols → 5 cols each | Unit test with known column count |
| Column mapping: 1 layout col × 15 deck cols → all 15 cols | Unit test |
| Column mapping: empty layout → no load calls, status idle | Unit test |
| Thumbnail fetched once per unique file, not per deck column | Mock asserts call count equals unique ad file count |
| Layout update clears old slots then loads new ones | Test with existing layout → new revision → assert order of clear/load calls |
| Restart re-loads existing revision | Unit test: emit revision, attach, assert load calls |
| Overlay slots remain independent | overlay.js tests pass unchanged; assertNoSlotConflicts tests unchanged |
| Lane names discovered from composition | Test with mock composition returning named layers |
| Stage failure publishes error status | Controlled staging mock rejection |
