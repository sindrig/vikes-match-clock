# Assets, queues, rosters and team IDs

Structural schemas and raw roster child identity belong to the
[nested-state contract](../nested-state-boundary.md). Atomic queue intentions,
acknowledgement dependencies and asynchronous command ownership belong to the
[queue intent contract](../session-mutation-boundary.md#queue-intents-and-compound-callers-243).
This guide describes the UI and domain rationale.

Code paths in backticks are relative to `clock/src/` unless qualified. Update
this reference when changing the behavior it describes; see the
[task index](../README.md).

## The asset system (`controller/asset/`)

The "Asset" system is a flexible overlay engine for non-match content.

The seven discriminated asset variants live in `types.ts`;
`contexts/nestedParsers.ts` owns their ingestion. Do not persist filtered roster
indexes, repair raw data during reads, or mint playback IDs in parsers. Follow
the linked contracts for side replacement, append allocation and valid siblings.

**Intent**: Display advertisements, starting lineups, player cards, substitutions, or custom text/videos over the scoreboard or during idle time.

**Features**:

- **Multi-Queue**: Multiple independent named queues, each with its own autoplay, loop, and timing settings
- **Kanban Board**: Queues displayed as columns with drag-and-drop reordering (queues and items within them) via `@dnd-kit`
- **Types**: Images, YouTube videos, "Free Text" (announcements), and "Team Assets" (lineups)
- **Production Ready**: Designed for game-day operation where sponsors/announcements are prepared before kickoff

### Multi-Queue Architecture

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
- `computeControllerDiff()` writes changed queue leaves (`queues/{id}/items`,
  name, settings and order) to avoid restoring unrelated fields. Item arrays
  still have last-write-wins conflicts across controllers.
- `parseQueueMap()` in `firebaseParsers.ts` validates queue data and normalizes
  duplicate `order` values in the read projection only; it does not repair storage.
- `parseCurrentAsset()` validates playback envelopes and preserves legitimate legacy absence without generating IDs
- Storage library keys remain stable; existing queue duplicate rejection applies. Playback occurrence identity is separate from media identity/URL

**Component hierarchy** (paths relative to `controller/asset/`):

| Component              | File                             | Purpose                                                                                                         |
| ---------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `AssetController`      | `AssetController.tsx`            | Root: tab switcher (URL/Free Text/Team/Media) + QueueBoard                                                      |
| `QueueBoard`           | `queue/QueueBoard.tsx`           | Kanban layout with `@dnd-kit` DnD context                                                                       |
| `QueueColumn`          | `queue/QueueColumn.tsx`          | Per-queue column: play/stop, settings gear, rename, delete                                                      |
| `QueueItem`            | `queue/QueueItem.tsx`            | Individual asset in a queue                                                                                     |
| `QueuePicker`          | `queue/QueuePicker.tsx`          | Modal dialog for adding assets to queues (see **QueuePicker Behavior** below)                                   |
| `PlaybackBar`          | `queue/PlaybackBar.tsx`          | Appears below screen preview when a queue is active; shows queue name, remaining count, large Next/Stop buttons |
| `QueueSettingsPopover` | `queue/QueueSettingsPopover.tsx` | Per-queue Autoplay/Loop/Duration settings (rsuite Popover)                                                      |
| `ItemActionDialog`     | `queue/ItemActionDialog.tsx`     | Context menu for "Show Now" / delete on individual items                                                        |
| `dndUtils`             | `queue/dndUtils.ts`              | DnD ID namespacing + `typedCollisionDetection` (see **Drag-and-Drop Collision Detection** below)                |

**State operations** (in `FirebaseStateContext.tsx`):
`createQueue`, `replaceQueue`, `appendSubstitutionAndActivate`, `deleteQueue`, `renameQueue`, `reorderQueues`, `addItemsToQueue`, `removeItemFromQueue`, `reorderItemsInQueue`, `updateQueueSettings`, `playQueue`, `stopPlaying`, `showItemNow`

Pending queue creation and reentrant SDK echoes follow the acknowledgement
barrier in the queue intent contract. An SDK local echo is not durability, and
this barrier is not cross-controller conflict resolution.

### QueuePicker Behavior

`QueuePicker` is rendered as an rsuite `Modal` dialog. Every asset click (image, URL, etc.) opens QueuePicker, which offers three actions:

1. **"Sýna"** (green, large button at top) — shows the asset immediately via `showItemNow`
2. **Queue buttons** (ghost buttons below a divider) — adds the asset to a specific queue
3. **"Ný biðröð"** (primary button at bottom) — creates a new queue and adds the asset

Special case: **0 queues** → auto-creates "Biðröð 1" and adds the item (no dialog shown).

`useQueuePickerActions` owns each draft's media and the commands captured
before asynchronous preparation. Rerenders cannot give an old draft a newer
venue/session origin. Create-with-items and append are awaited; rejected
saves retain the draft and display an error. A failed automatic create on an
empty board opens the dialog for explicit retry. Each draft has a unique
`draftId`; `QueuePicker` keys its inner component by that ID so pending/error
feedback, the immediate submission guard and automatic-create tracking belong
only to that draft, including identical-assets A → B → A selections. An older
completion cannot close or unlock a newer draft or replace its error. A ready
draft remains usable while a newer selection prepares; once the newer media
is ready, an older preparation cannot replace that draft. Newer selections
and unmounting also retire obsolete preparation errors.

The old "Birta strax" / "Setja í biðröð" radio buttons in MediaManager were removed. `ImageList` no longer has a `displayNow` prop — it always calls `onAddAssets`, which opens QueuePicker.

### Media Library Layout

`MediaManager` is a full-width flex row and `.controller .image-list` uses a
specificity-matching CSS grid override (up to five 170px-wide cards). This is
required because `.controller .control-item` otherwise forces it into a column
flex layout.
Media cards use 132px-high `object-fit: contain` thumbnails and truncate long
filenames, so original upload dimensions cannot expand the controller view.

### Main-Screen MP4 Media

The **Myndefni → Myndir** library accepts JPG, PNG, GIF, and MP4 uploads.
The advertisement and player-photo tabs remain image-only because their
separate sponsor slots and player-card consumers render images, not video.
`UploadManager` accepts a single File, FileList, or File array, compresses
only non-GIF images when enabled, and uploads MP4 bytes unchanged with an
explicit `video/mp4` content type. It shows pending/error feedback and refreshes
the listing after all uploads settle, including partial failures.

`ImageList` recognizes `.mp4` case-insensitively, uses silent non-playing
`<video preload="metadata">` thumbnails with the same fixed bounds as images,
and adds `loop: true` to selected VIDEO assets. `VideoPlayer` uses this optional
asset flag for muted, inline autoplay and native looping. Looping videos and
thumbnails never submit natural-end completion observations. **Sýna** therefore
holds a video until cleared/replaced; autoplay queues still advance at their
configured duration through `MatchLifecycle` (a short video loops rather than
advancing early). No renderer timer or new Firebase mutation is introduced.
Legacy VIDEO assets without the flag, including goal celebrations, retain
their natural-end completion behavior; YouTube and perimeter are unchanged.
Only browser-compatible MP4 codecs are supported (H.264 recommended); there
is no transcoding.

### Drag-and-Drop Collision Detection

`@dnd-kit`'s default `closestCenter` collision detection doesn't work correctly with nested `SortableContext`s (queue columns containing sortable items). When dragging a column, `closestCenter` may match item droppables inside other columns instead of adjacent column droppables.

**Solution**: `typedCollisionDetection` in `dndUtils.ts` filters droppable containers by ID prefix (`col:` for columns, `item:` for items) before delegating to `closestCenter`. This ensures column drags only snap to column targets and item drags only snap to item targets.

### createQueue Options

`createQueue(name, items = [], options?)` creates all initial items in one
audited update and returns a `Promise<string>` that resolves to its ID only
after submission succeeds:

```typescript
createQueue(name: string, items?: Asset[], options?: { cycle?: boolean }): Promise<string>
```

- `cycle` defaults to `true` (loop by default for most queues)
- Team queues pass `{ cycle: false }` since lineup sequences shouldn't loop

Never chain create/append/activate to assemble an operator action. Use
`replaceQueue(name, items, options?)` for a named team replacement and
`appendSubstitutionAndActivate` for substitutions. These remain ordinary
current-origin commands, separate from generation-conditional playback CAS.

### Team Queue Integration

`TeamAssetController.tsx` renders a "Setja lið í biðröð" button above each team (home/away) separately. Clicking it creates a named queue (e.g., "Víkingur R") containing that team's starting lineup as player card assets. The queue is created with `cycle: false` since lineup presentations are one-shot sequences.

All player media is prepared first, then the retained `replaceQueue` command
creates/replaces the complete queue in one update. Preparation failure leaves
the old queue intact. Submission failure is shown without leaving the team
view. Replacement retains the old delete/create placement (new ID, after the
remaining queues) and clears playback only if the replaced queue was active.
Successful navigation runs directly after acknowledgement while the initiating
action still owns the team view, without a deferred navigation timer.

### Manual Roster Creation (Resolve Roster)

When a team side has no players loaded, `TeamAssetController.tsx` shows a **"Búa til leikmannahóp"** button. This is a manual fallback for when the KSI API does not have lineup data (e.g., youth matches, friendlies, or pre-match).

**Flow**:

1. User clicks "Búa til leikmannahóp" for home or away side
2. `ResolveRosterModal` opens with two sections: **Byrjunarlið** (11 required number inputs) and **Varamenn** (12 optional number inputs)
3. Client-side validation enforces: all 11 starters filled, positive integers only, no duplicate numbers across both groups
4. On submit, calls the generated `resolveRoster` SDK operation with `path: { teamId }` and body `{ starters: number[], substitutes: number[] }`, using `api/clientConfig.ts` for the gateway URL and `throwOnError: true` for request failures
5. API returns `{ players: TeamPlayer[], officials: [] }` (TeamLineup shape) for the requested side
6. Response is transformed with `transformSingleLineup()` in `lib/matchUtils.ts`, the same adapter used by `transformLineups()`: goalkeeper roles take precedence over captain, missing flags default to false, absent shirt numbers are omitted, and hidden coaches follow players
7. A preview shows player numbers, names, and roles grouped by starters/substitutes
8. On confirm, only the generated side is replaced via `setRoster({ [side]: generatedPlayers })`; the untouched raw side and roster-level metadata are preserved.

**Key files**:

- `controller/asset/team/ResolveRosterModal.tsx` — modal component with form, validation, API call, and preview
- `controller/asset/team/TeamAssetController.tsx` — integrates the modal and manages `resolveRosterSide` state
- `controller/asset/team/Team.css` — styles for the modal and preview

**Note**: Unresolved player placeholders from the API (no name match) display as `#number` and are still saved.

### Shared Home-Team Player Actions & Match-View Quick Actions

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
  (`!show && number != null`) for the incoming step, trimming of last names on
  the generated assets and the home-team reveal background. Both cards prepare
  before the retained `appendSubstitutionAndActivate` command submits the
  `Skiptingar` queue creation/append/activation and both roster status leaves
  together. At submission, both players are resolved from the current subscribed
  roster: outgoing must still have `show`, and incoming must still satisfy
  `!show && number != null`. An absent, identical or ineligible selection rejects
  the entire intent before any queue, roster or audit write. This also rejects
  overlapping preparations that reuse a player after another substitution's
  SDK echo, while independent and ordered substitutions remain eligible. The
  existing current asset and playing flag are preserved. Current substitution
  failures are shown in the team/shortcut box; player-card and MOTM failures
  are passed to the open selection modal's `error` prop so feedback stays
  visible above its backdrop and selection can be retried. The shared modal
  renders its alert in the fixed header outside the scrolling player list,
  keeping current feedback visible at lower roster rows without moving
  keyboard focus. Player-card and
  MOTM operations await their retained
  `renderAsset` command before reporting success. Each player selection owns its
  media and UI continuation: dismissal, replacement, a newer selection or
  unmounting retires it. Submitted acknowledgements can close or report errors
  only for that selection in its original mutation session (including venue or
  auth A → B → A). Already-submitted writes remain irrevocable. An origin
  rejection before submission still explains why the current draft could not
  save. The hook's `beginAction` is also used by the Lið tab's inline
  player/MOTM, lineup replacement and roster-fetch feedback. New actions,
  dismissal and unmounting retire older feedback across those callers;
  delayed substitution failures cannot overwrite a newer player error.
  Closed substitution actions report failures only within their original
  mutation session, including rejections after delayed media preparation.
  Retirement gates UI feedback only: an independent substitution or lineup
  replacement still reaches its retained command and current-roster/session
  validation. Roster-fetch loading has a separate request lifetime so its
  completion releases its spinner without clearing a newer action's error.
- **Corrected SUB field semantics**: `subIn` carries the player **coming
  on** and `subOut` the player **going off** (the persisted fields were
  previously inverted from their meaning). The creation site builds
  `subIn` from the incoming player; consumers re-pair so the main-screen
  visuals are unchanged — `Asset.tsx` `renderSub()` emits
  `[subOut, subIn]` (outgoing player left, red number; incoming right,
  green number), `SubstitutionInfo.tsx` labels read "Af velli: subOut" /
  "Inn á: subIn", and `Substitution.css` nth-of-type rules keep red left /
  green right. SUB assets already persisted in queues are transient
  match-night data and are **discarded, not migrated** (no marker exists
  to distinguish legacy shapes). The perimeter substitution band derives
  from the corrected shape only.
- Player-card and man-of-the-match pass the complete home roster (including
  substituted-off players) to `TeamPlayerSelectionModal`.
- `assetHelpers.ts` omits missing optional `number` and `role` fields from
  both photo and no-photo assets so coaches/officials can be shown without
  Firebase rejecting `undefined` values. Supplied numbers and roles are
  preserved; man-of-the-match assets inherit the same handling.

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

### Tab ↔ assetView Sync Gotcha

`Controller.tsx` has three tabs: **Biðröð** (queue), **Lið** (teams), **Myndefni** (media). The first two map to Firebase's `controller.assetView` (`ASSET_VIEWS.assets` / `ASSET_VIEWS.teams`), but **Myndefni has no corresponding `assetView`** — it's purely local tab state.

A `useEffect` in `Controller.tsx` syncs the tab from `controller.assetView` (so that programmatic view changes, e.g., "Setja lið í biðröð" switching to queue view, are reflected in the tab header). However, this sync **must skip when the user is on the Myndefni tab**, otherwise it will yank them away:

```typescript
useEffect(() => {
  const mapped = assetViewToTab[controller.assetView];
  if (mapped) setTab((prev) => (prev === TABS.media ? prev : mapped));
}, [controller.assetView]);
```

**Key rule**: Never sync `tab` from `assetView` when `tab === TABS.media`. The Myndefni tab is a local-only concept with no Firebase representation.

## Team ID System & Match Data Pipeline

### How Team IDs Work

`club-ids.ts` is the canonical mapping of team display names to KSI Analyticom API IDs. These IDs were sourced from https://www.ksi.is/felagslid/adildarfelog/ (each team link has `felag?id=XXXX`).

**Current v3 flow:**

1. `TeamSelector` offers bundled club names and fully custom Firebase teams.
2. `updateMatch()` normalizes names and resolves override-first numeric
   `homeTeamId`/`awayTeamId` into shared match state.
3. `TodaysMatches` and roster refetch use `getTeamId(venues, listenPrefix)`
   from `lib/matchUtils.ts`: validated venue `config.homeTeam`, with 2492 only
   as the historical missing/invalid-config fallback. This selects the API
   team scope/key independently of the two selected match teams.
4. Generated SDK operations (`getMatches`, `getMatchInfo`, `getLineups`) use
   `api/clientConfig.ts`. Match selection prefers a team's parent club name
   when supplied by KSI. The v3 lineup response is keyed by **home/away**;
   `transformLineups()` converts those sides to the shared roster, including
   hidden officials after players.

Keep IDs and normalized names consistent with KSI identities: incorrect IDs
can select the wrong upstream scope and make identity-based features silently
miss players. The old `fetchLineups()` / numeric-team-key lookup described in
the former guide is historical; it is not the current v3 adapter. Do not
recreate that removed client module or claim current sides are numeric-ID keys.

### Name Normalization

The KSI API sometimes returns team names with trailing dots (e.g., "Víkingur R.") while `club-ids.ts` stores names without dots ("Víkingur R"). The `lookupClubId()` helper in `FirebaseStateContext.tsx` handles this by stripping trailing dots as a fallback:

`normalizeClubKey(name)` strips trailing dots. Lookup first checks the current
Firebase override (also normalized), then the exact bundled name, then its
normalized key, and finally `"0"`. `updateMatch()` stores parsed numeric IDs;
the bundled map and override IDs are strings. Keep both selection and lookup
normalization aligned.

### Special ID Values

- **`"-1"`**: Teams not found in KSI (combined teams, foreign clubs, national teams). Still selectable in the UI but won't match API data.
- **`"0"`**: Unknown/unrecognized team name (fallback when lookup fails).

### Custom Team Overrides In Selectors

Firebase `clubOverrides` entries with `isOverride: false` act as fully custom teams. They are merged into the `TeamSelector.tsx` dropdown alongside bundled `club-ids.ts` teams, and `updateMatch()` resolves their configured `clubId` from Firebase before falling back to bundled IDs. This allows custom teams like `Kjánaprik` to be selected in Stillingar and keep `clubId: "-1"` until a real KSI ID is added later.

### Key Files in the Pipeline

| File                                            | Role                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `club-ids.ts`                                   | Bundled name → KSI ID strings                                       |
| `contexts/FirebaseStateContext.tsx`             | Override-first normalized lookup and numeric IDs in match state     |
| `controller/TeamSelector.tsx`                   | Bundled/custom team dropdown                                        |
| `controller/asset/team/TodaysMatches.tsx`       | Generated SDK match/report/lineup requests                          |
| `api/clientConfig.ts`, `lib/matchUtils.ts`      | API base URL configuration, venue team scope and home/away adapters |
| `controller/asset/team/TeamAssetController.tsx` | Refetch and render shared roster sides                              |
