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

### The `listenPrefix` System

The `listenPrefix` (e.g., `"vikinni"`, `"hasteinsvollur"`) determines which Firebase path the instance subscribes to:

- `states/${listenPrefix}/match` - Match state (scores, clock, etc.)
- `states/${listenPrefix}/controller` - Controller state (assets, view mode, etc.)
- `states/${listenPrefix}/view` - View settings (viewport, background, etc.)

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
| `Idle`       | Pre/post match or breaks - club logos, weather, rotating sponsor ads                      |

### 4. Specialized Logic

#### Clock Management (`src/match/Clock.tsx`)

- Main match timer with "half stops" (auto-stop at 45:00/90:00)
- Injury time logic

#### Penalties/Red Cards

- `RedCardManipulation.tsx`: Player discipline management
- `PenaltiesManipulationBox.tsx`: Timed power plays (handball/futsal style)

#### HalfStops (`src/controller/HalfStops.tsx`)

Ensures the clock stops exactly at period end (e.g., 45:00) even if the controller doesn't click precisely.

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

| Group | Properties | CSS Variables |
|-------|-----------|---------------|
| Score boxes | `scoreBoxBg`, `scoreBoxColor`, `scoreBoxBorder`, `scoreBoxFontSize`, `scoreBoxFontFamily`, `scoreBoxStroke`, `scoreTop`, `scoreHeight`, `scoreWidth` | `--theme-score-*` |
| Clock | `clockBg`, `clockColor`, `clockBorder`, `clockFontSizeMin`, `clockFontSizeMax`, `clockFontFamily`, `clockStroke`, `clockTop`, `clockLeft`, `clockWidth`, `clockHeight` | `--theme-clock-*` |
| Logos | `logoTop`, `logoHeight`, `logoWidth` | `--theme-logo-*` |
| Injury time | `injuryTimeColor`, `injuryTimeFontSize`, `injuryTimeStroke`, `injuryTimeTop`, `injuryTimeLeft` | `--theme-injury-*` |
| Team names | `teamNameColor`, `teamNameFontFamily` | `--theme-team-name-*` |
| Red cards | `redCardColor` | `--theme-red-card-color` |
| Penalties | `penaltyBg`, `penaltyColor`, `penaltyBorder` | `--theme-penalty-*` |
| Timeouts | `timeoutColor` | `--theme-timeout-color` |
| Ad image | `adTop`, `adLeft`, `adWidth`, `adHeight` | `--theme-ad-*` |
| Background | `backgroundImage` | `--theme-background-image` (conditional) |
| Idle screen | `idleTextColor`, `idleTextFontSize`, `idleLogoTop`, `idleLogoLeft`, `idleLogoWidth`, `idleTextTop` | `--theme-idle-*` |

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

| File | Role |
|------|------|
| `types.ts` | `ThemeConfig` and `CustomPreset` interface definitions |
| `constants.ts` | `DEFAULT_THEME`, `THEME_PRESETS`, and `BUILT_IN_PRESET_NAMES` |
| `hooks/useThemeCssVars.ts` | `useThemeCssVars()` hook (config → CSS vars), `resolveTheme()`, and `lookupPreset()` (custom → built-in fallback) |
| `contexts/firebaseParsers.ts` | `parseTheme()`, `parseCustomPresets()` validators for Firebase data |
| `contexts/FirebaseStateContext.tsx` | `setTheme()`, `setThemePreset()`, `saveCustomPreset()`, `deleteCustomPreset()` actions |
| `App.tsx` | Applies CSS vars to `.App` container (passes `customPresets` to `useThemeCssVars`) |
| `controller/theme/ThemeEditor.tsx` | `ThemeEditorModal` — rsuite Modal for preset management and theme editing |
| `controller/theme/ThemeEditor.css` | Theme editor modal styling |
| `controller/theme/VisualThemeEditor.tsx` | Visual (drag-and-drop) theme editor with background upload |
| `controller/theme/VisualThemeEditor.css` | Visual editor styles (upload indicator, clear button) |
| `screens/ScoreBoard.css` | Uses `var(--theme-*)` for score/clock/penalty display |
| `screens/Idle.css` | Uses `var(--theme-*)` for idle screen display |
| `match/RedCard.css` | Uses `var(--theme-red-card-color)` |
| `match/ClockBase.tsx` | Uses CSS var expressions for font size (with prop defaults as fallbacks) |

#### Adding a New Theme Property

1. Add the property to `ThemeConfig` in `types.ts`
2. Add default value in `DEFAULT_THEME` in `constants.ts`
3. Add CSS variable mapping in `themeToCssVars()` in `useThemeCssVars.ts`
4. Use `var(--theme-your-var, fallback)` in the relevant CSS file
5. Optionally add it to preset themes and the `ThemeEditor` UI

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

#### Viewport Variants Note

The `insidebig` and `insidesmall` CSS viewport variants (for indoor screens) still use hardcoded position overrides. Theme CSS vars apply to the default/outdoor layout. Converting indoor variants to use theme vars is a potential future enhancement.

#### ThemeEditor UI

The theme editor is a **full rsuite Modal** (`ThemeEditorModal`) launched from a "Klukku þema" / "Breyta" trigger row in the Controller settings. It does NOT expand inline — the Settings modal stays simple.

**Layout**:

- **Left section**: Preset list (built-in presets as `ButtonGroup`, custom presets as a list below with rename/delete controls)
- **Right section**: Theme property editor panels (collapsible rsuite `Panel` per property group)

**Preset management features**:

- Select any built-in or custom preset to activate it
- Editing a built-in preset auto-creates an independent copy named `"<preset> (breytt)"` — original stays untouched
- "Nýtt þema" button creates a blank custom preset from `DEFAULT_THEME`
- Custom preset names are editable via pencil (edit) icon button next to delete
- Custom presets can be deleted via `IconButton` with `TrashIcon`

**Editor panels** (extracted into `ThemeEditorPanels` sub-component):

- Color pickers, text inputs, font family selectors, percentage inputs
- Collapsible panels for each property group (Score boxes, Clock, Logos, etc.)

**Controller integration** (`Controller.tsx`):

- `themeOpen` boolean state controls modal visibility
- Trigger row shows current preset name + "Breyta" button
- `<ThemeEditorModal open={themeOpen} onClose={...} />`

All labels are in Icelandic, consistent with the rest of the controller UI.

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

For testing Firebase sync between controller and display (e.g., "Hreinsa virkt overlay" clearing on remote), you'll need to either test manually or write Playwright tests that can manage multiple browser contexts.

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
