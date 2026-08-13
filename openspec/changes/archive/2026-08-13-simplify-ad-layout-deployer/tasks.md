# Tasks: Simplify Ad-Layout to Content Deployer

## 1. Daemon — strip ad-layout.js

- [ ] Remove `connectClip`, `setClipLoop`, `setTransportDuration`,
      `getClipTransport` from `ResolumeAdClient`
- [ ] Remove `_columnTimer`, `_getColumnDuration`, `_playColumn`
- [ ] Remove `_executeFullLayout` — replaced by `_loadLayout`
- [ ] Remove generation tracking (`_generation`, `_wakeSleepers`,
      `_sleep`, `AdLayoutSupersededError`)
- [ ] Remove `_fallbackApplied`, `_stagedColumns`
- [ ] Remove `_retryOp` (replaced with simpler staging retry)
- [ ] Remove `STATIC_DURATION_MS`, `MAX_AD_DURATION_MS`
- [ ] Remove `activeColumn` and `activeColumn`-related references
      from `_publishStatus` and status payload
- [ ] Remove `PERIMETER_AD_LAYER_CLIP_SLOTS` config (default, env var
      parsing, all references)
- [ ] Keep all validation (`validateAdLayout`, `validateFileName`,
      `validateGcsSource`)
- [ ] Keep `AdAssetStager` — unchanged
- [ ] Keep lane discovery (`_discoverLanes`) — extended to also
      read `columnCount` from composition

## 2. Daemon — new load-all logic

- [ ] Add column mapping function: `mapLayoutToDeckColumns(layoutColumns,
      deckColumnCount)` → `[{colId, deckColumns: number[]}]`
- [ ] Add `_loadLayout(revision, columns)`:
  - Clear all ad slots on all lanes × deck columns
  - Stage files (reuse `AdAssetStager.stageAsset`)
  - Open files into mapped deck columns on each lane
  - Fetch thumbnails (once per unique ad file)
  - Publish status with column mapping
- [ ] Add `_clearAll()` — clears all ad clips on all lanes × deck columns,
      publishes idle status
- [ ] Update `attach()` snapshot processing: call `_loadLayout` or
      `_clearAll` based on desired doc
- [ ] Update `shutdown()` for new state

## 3. Daemon — index.js config cleanup

- [ ] Remove `DEFAULT_AD_LAYER_CLIP_SLOTS` constant
- [ ] Remove `PERIMETER_AD_LAYER_CLIP_SLOTS` from `loadConfig`
- [ ] Remove `PERIMETER_AD_LANE_IDS` default changed to `1,3`
- [ ] Remove `PERIMETER_AD_LAYER_CLIP_SLOTS` from
      `perimeter-control.env.example`
- [ ] Update `PERIMETER_AD_LANE_IDS` comment in env example to
      reference base layers (1,3)

## 4. Daemon — tests

- [ ] Remove tests for removed behavior:
  - Timer/cycling tests
  - Revision supersession/generation tests
  - Transport duration tests
  - `_playColumn`, `_executeFullLayout` integration tests
- [ ] Add column mapping tests:
  - N=3, M=15 → [[1-5],[6-10],[11-15]]
  - N=1, M=15 → [[1-15]]
  - N=5, M=7 → [[1-2],[3-4],[5],[6],[7]] or similar
  - N=15, M=15 → each gets 1
  - N=0 → empty array, no mapping
- [ ] Add `_loadLayout` tests:
  - stageAsset called per unique file
  - loadClip called for each deck column × lane pair
  - status `phase: "playing"` published with column mapping
- [ ] Add `_clearAll` tests:
  - clearClip called for each lane × deck column pair
  - status `phase: "idle"` published
- [ ] Add layout update tests:
  - Old revision loaded, new revision arrives → old slots cleared,
    new files loaded
- [ ] Add restart-reload test
- [ ] Add stage-failure → error-status test
- [ ] Verify no Resolume transport calls (mock + assertion on
      call list for connect/disconnect/transport/duration/loop)

## 5. Clock — type and parser updates

- [ ] Update `PerimeterAppliedAdLayout` in `types.ts`:
  - Remove `activeColumn: number`
  - Remove `transportDurationMs` from `PerimeterAppliedAdFile`
  - Add `deckColumns: number[]` to `PerimeterAppliedAdColumn`
  - Keep `id: string`, `files: Record<string, PerimeterAppliedAdFile>`,
    and `PerimeterAppliedAdFile`'s `name`, `thumbnail`
- [ ] Update `parsePerimeterAppliedAdLayout` in `firebaseParsers.ts`:
  - Parse `deckColumns` array per column (filter to valid integers)
  - Remove `activeColumn` parsing
  - Accept new phase set (`loading`, `playing`, `idle`, `error` —
    drop `staging`)
  - Remove `transportDurationMs` from `parseAppliedAdFile`
- [ ] Update `parsePerimeterAdLayout` (desired side) if schema
      changed — likely no change

## 6. Clock — UI updates

- [ ] Update `PerimeterControl.tsx`:
  - Remove "Virkur dálkur: N" line from status bar
  - Remove `PHASE_LABELS["staging"]` entry (if present)
  - Update `RevisionComparison` comments to match content-deployer model
  - `appliedColumnsMap` usage adapted for new `deckColumns` field
- [ ] Update tests:
  - `PerimeterControl.spec.tsx` — update expected UI strings and state
  - `firebaseParsers.spec.ts` — `parsePerimeterAppliedAdLayout` tests
- [ ] No UI structural changes required (same layout board, same
      add/delete/reorder, same FilePicker)

## 7. Documentation

- [ ] Update `clock/AGENTS.md` — new playback model, column-mapping
      description, layer separation diagram
- [ ] Update `perimeter-control/README.md` — removed slot config,
      new architecture, ad env vars
- [ ] Update `perimeter-control.env.example` — remove
      `PERIMETER_AD_LAYER_CLIP_SLOTS`, update `PERIMETER_AD_LANE_IDS`
      default to `1,3`, add comment about column mapping
