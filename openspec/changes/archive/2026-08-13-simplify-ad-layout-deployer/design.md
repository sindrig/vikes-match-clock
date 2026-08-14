# Design: Ad-Layout Content Deployer

## Layer Separation

Two independent systems on disjoint layer sets:

| System | Layers | Clip Slots | Code |
|--------|--------|------------|------|
| Goal overlays | 2, 4 ("Overlay") | `{"2":1,"4":1}` | overlay.js **(untouched)** |
| Ad layout | 1, 3 ("48 skjáir", "40 skjáir") | All deck columns 1..M | ad-layout.js **(rewritten)** |

The `assertNoSlotConflicts` check in index.js is trivially satisfied
since no layer appears in both slot maps.

## Architecture

### Data ownership (unchanged from previous design)

| Path | Writer | Purpose |
|------|--------|---------|
| `states/{location}/perimeter/adLayout` | Controller | Desired layout (columns of ad files) |
| `perimeter/{location}/adLayout` | Daemon | Applied status, lanes, column mapping, thumbnails |
| `{location}/perimeter/*` in Storage | Controller | Uploaded source assets |

### Playback model

```
Controller:  "play ads A, B, C on the perimeter"
             → writes desired layout to Firebase
Daemon:      stages files, distributes them across deck columns
             on lanes 1 and 3, reports status with thumbnails
Resolume:    autopilot cycles columns at its configured speed
             Resolume UI works normally (column count, autopilot
             speed, manual column selection)
```

### Column mapping

The daemon reads the composition's column count `M` at startup via
`compositionGrid(composition).columnCount`.  For `N` layout columns
and `M` deck columns, each layout column `i` (0-indexed) is loaded
into deck columns:

```
start_i  = i * floor(M / N) + min(i, M mod N)
length_i = floor(M / N) + (i < M mod N ? 1 : 0)
```

Deck columns `start_i + 1` through `start_i + length_i` receive the
ad file for layout column `i`, on every configured ad lane.

Examples (M = 15):

| Layout columns (N) | Per-ad deck columns |
|---|---|
| 3 | A in 1–5, B in 6–10, C in 11–15 (5 cols each) |
| 1 | Ad in all 15 columns |
| 0 (empty) | All ad slots cleared |

The algorithm naturally handles N > M (each layout column gets 1 deck
column, remainder deck columns are unused and left untouched).

### Phase model

| Phase | Meaning |
|-------|---------|
| `loading` | Daemon is staging files and opening them into deck columns |
| `playing` | All files loaded; autopilot is cycling normally |
| `idle` | No layout set; all ad deck slots are empty |
| `error` | Staging or load failed; `error` field contains details |

### Status payload

```json
{
  "lanes": [
    { "id": "1", "name": "48 skjáir" },
    { "id": "3", "name": "40 skjáir" }
  ],
  "revision": "uuid",
  "phase": "loading|playing|idle|error",
  "error": null,
  "updatedAt": 1723392000000,
  "columns": [
    {
      "id": "uuid",
      "deckColumns": [1, 2, 3, 4, 5],
      "files": {
        "1": { "name": "ad-48.png", "thumbnail": "data:image/png;base64,..." },
        "3": { "name": "ad-40.png", "thumbnail": "data:image/png;base64,..." }
      }
    }
  ]
}
```

- `deckColumns` lists which deck column indices contain this ad.
- Thumbnails are fetched once per unique ad file (not per deck column
  instance).

This payload is a **breaking change** from the previous applied-layout
shape.  The old `PerimeterAppliedAdLayout` type, parser, and UI rendering
must be updated to match.

### Layout update: clear-then-load

When a new revision arrives:

1. Cancel any in-progress staging (set flag, wait for current file
   operations to complete).
2. Clear all ad slots across lanes 1,3 and all deck columns 1..M.
3. Stage each ad file from GCS → local cache → SCP to Windows host.
4. `open` each file into its mapped deck columns on each lane.
5. Fetch thumbnails (once per unique ad file).
6. Publish status with phase `"playing"`, column mapping, and
   thumbnails.

A brief blank flash is expected during step 2–4.  Staged files are
pre-cached on the Windows host, so the `open` call in step 4 is
effectively instant.

### Clear behavior

When the desired layout is absent or has an empty `columns` array:

1. Clear all ad clips across all deck columns on layers 1,3.
2. Publish status with phase `"idle"`.

Slots are left empty — the daemon does not snapshot or restore the
original Efni content.  A "standby" layout (1 column with a single
image/video) can be set in Firebase to keep content on-screen when no
specific ad layout is active.

Alternatively, if you want to keep the existing Efni sponsor loop, you
can create a layout with one column that references that file.

### Restart safety

On daemon restart: read the desired revision from Firebase.  If it
exists and differs from the last applied, re-load it.  If absent,
publish idle status.  Do not create a new revision.

### What goes away from ad-layout.js (~60% reduction)

| Removed | Reason |
|---------|--------|
| `_columnTimer`, `_getColumnDuration`, `_playColumn` | Autopilot owns cycling |
| `connectClip`, `setClipLoop`, `setTransportDuration`, `getClipTransport` | No transport manipulation |
| `_executeFullLayout` staging+play loop | Replaced by flat load-all |
| Generation tracking, `AdLayoutSupersededError`, `_wakeSleepers`, `_sleep` | No async cycling to supersede |
| `_fallbackApplied`, `_stagedColumns` | No playback state to restore |
| `_retryOp` | Simplified to staging-only retry |
| `STATIC_DURATION_MS`, `MAX_AD_DURATION_MS` | No transport duration management |
| `activeColumn` from status payload | Not meaningful without own timer |
| `PERIMETER_AD_LAYER_CLIP_SLOTS` env config | Derived from composition at runtime |

### What stays

- Validation (`validateAdLayout`, `validateFileName`, `validateGcsSource`)
- File staging (`AdAssetStager` — GCS download, SCP copy, atomic rename)
- Lane discovery from composition (extended to also read `columnCount`)
- Status publish (slimmed payload)
- Goal overlay independence (overlay.js untouched)
- Empty layout = clear (R9)
- Restart safety (R10)
- Controller UI (FilePicker, column add/delete/reorder, lanes, thumbnails
  — no changes needed to the UI structure itself, though the data it renders
  changes shape)

### ResolumeAdClient — slimmed

```js
export class ResolumeAdClient {
  loadClip(layerId, clipSlot, filePath)  // open file into slot
  clearClip(layerId, clipSlot)           // clear a slot
  getClipInfo(layerId, clipSlot)         // read clip metadata
  getClipThumbnail(layerId, clipSlot)    // fetch thumbnail PNG
}
```

No `connectClip`, `setClipLoop`, `setTransportDuration`, `getClipTransport`.

### Env config

Removed: `PERIMETER_AD_LAYER_CLIP_SLOTS`.  Retained: `PERIMETER_AD_LANE_IDS`
(default `1,3` pointing at the base layers).  Column range is derived from
the composition at startup.

### UI impact (clock)

The `PerimeterControl.tsx` modal stays — same layout board, same add/delete/
reorder, same FilePicker.  Changes:

1. The applied-status type, parser, and rendering must handle the new
   payload shape: `columns[i].deckColumns` replaces `activeColumn`/`phase`
   as the source-of-truth for "which column plays which ad."
2. `PerformeditArea` removes "active column" and the phase badge showing
   which column is currently playing (that concept no longer exists).
3. The "Virkur dálkur: N" line goes away.
4. Thumbnails come from `columns[i].files[laneId].thumbnail` as before.
5. The PHASE_LABELS map may be cleaned up (removes "staging").

The `parsePerimeterAppliedAdLayout` parser must be updated for the
new shape.  The `PerimeterAppliedAdLayout` type in `types.ts` changes.
No UI structural changes are required beyond dropping the active-column
display.
