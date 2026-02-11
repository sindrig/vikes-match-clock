# Clock App Agent Guidelines

> **Note for Agents**: If you modify any component, pattern, or system described in this document, you MUST update this file to reflect your changes. Keeping this documentation accurate is critical for future development.

## Overview

The `clock/` application is a dual-purpose React system: it acts as both the **stadium display** (Scoreboard/Idle screens) and the **legacy control interface**. It relies on real-time synchronization via Firebase.

## Core Architecture Patterns

### Bidirectional Firebase Sync

State is managed via React Context (`FirebaseStateContext`) and mirrored to Firebase Realtime Database.

- `FirebaseStateContext.tsx`: Manages state (Match, Controller, View, Listeners) and handles synchronization.
- `LocalStateContext.tsx`: Manages local settings (auth, sync toggle, listen prefix).
- `firebaseParsers.ts`: Type-safe runtime validators for Firebase snapshot data.
- This allows a controller in the booth to update the display on the field instantly.
- The `listenPrefix` (usually a location name like `viken`) determines which match state the instance follows.

#### Single Source of Truth

**Firebase is the authoritative source** for all synced state. The architecture follows these principles:

1. **Optimistic Updates**: When a controller makes a change, it updates local state immediately AND syncs to Firebase. This prevents UI lag and stale-ref race conditions.

2. **Hydration Guards**: Before a client can write to Firebase, it must first receive the initial snapshot (hydration). This prevents a newly-connected controller from overwriting remote state with default values. Tracked via `isMatchHydrated`, `isControllerHydrated`, `isViewHydrated` state.

3. **Empty Prefix Protection**: All write operations are blocked if `listenPrefix` is empty, preventing invalid Firebase paths like `states//match`.

4. **Type-Safe Parsing**: All Firebase snapshots are validated through `firebaseParsers.ts` before being applied to state. This provides runtime type checking for data from the database.

#### Multi-Controller Behavior

Multiple controllers can connect to the same `listenPrefix` simultaneously. The system uses **last-write-wins** semantics:

- All connected clients see the same state via Firebase subscriptions
- If two controllers make conflicting changes, the last write to reach Firebase wins
- There is no conflict resolution or operational transform
- For production use, coordinate with your team to avoid simultaneous edits

**Known limitation**: If Controller A goes offline, makes changes, then reconnects while Controller B has also made changes, Controller A's stale changes may overwrite Controller B's newer state. For high-stakes matches, designate a single primary controller.

#### Known Limitations

1. **Optimistic Update Failure**: If a Firebase write fails (network issue, permission denied), local state remains "updated" while remote state didn't change. Errors are logged to console but no automatic rollback occurs.

2. **listenPrefix Switch Race**: When switching `listenPrefix`, there's a brief window where stale callbacks from the old prefix subscription could theoretically affect state before the new subscription is established. In practice, hydration guards mitigate this.

### State Management

| Context | Purpose |
| ------- | ------- |
| `FirebaseStateContext` | Shared state synced via Firebase (Match, Controller, View, Listeners) |
| `LocalStateContext` | Local app state (Auth, Sync settings) |

**Note**: Redux was fully removed from this codebase. All state is managed via React Context.

### Key Files

| File | Purpose |
| ---- | ------- |
| `contexts/FirebaseStateContext.tsx` | Main state provider with Firebase sync, hydration guards, optimistic updates |
| `contexts/LocalStateContext.tsx` | Local settings (auth, sync toggle, listen prefix) with localStorage persistence |
| `contexts/firebaseParsers.ts` | Type-safe parsers for Firebase snapshots (parseMatch, parseController, parseView, parseLocations) |
| `firebaseDatabase.ts` | Low-level Firebase write operations |

### Persistence

Local settings (auth, sync toggle, listen prefix) are stored in `localStorage` via `LocalStateContext`. Match state is synced from Firebase on connection.

## Key Component Systems

### 1. The Asset System (`src/controller/asset/`)

The "Asset" system is a flexible overlay engine for non-match content.

**Intent**: Display advertisements, starting lineups, player cards, substitutions, or custom text/videos over the scoreboard or during idle time.

**Features**:

- **Queue**: Assets can be queued, looped, or set to auto-play with specific durations
- **Types**: Images, YouTube videos, "Free Text" (announcements), and "Team Assets" (lineups)
- **Production Ready**: Designed for game-day operation where sponsors/announcements are prepared before kickoff

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

## Remote vs Local State

The app handles "Controller" vs "Display" roles:

- **Display instance**: Has `sync` enabled, only _receives_ data
- **Controller instance**: _Pushes_ data to Firebase

## Build & Tooling

- **Bundler**: Vite (migrated from Create React App) - config in `vite.config.ts`
- **Testing**: Vitest + Cypress for e2e
- **Linting**: ESLint (airbnb-style) + Prettier

**Important**: Always run `pnpm format` after making changes. CI runs format checks and will fail if code is not properly formatted. To format only specific files: `pnpm exec prettier --write path/to/file.tsx`

## Testing & Development

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

1. Navigate to `localhost:3000`
2. Click **Stillingar** (Settings) tab
3. Enter credentials in the E-mail and Password fields
4. Click **Login**

Once logged in, you'll see your email displayed and have access to authenticated features like the "Myndefni" (Media) image uploads and remote control functionality.

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
   - **Cypress e2e tests**: Use the existing Cypress setup in `cypress/` which can handle multiple browser contexts
   - **Single-session verification**: Test that actions dispatch correctly and state changes as expected, then rely on Firebase sync logic being correct

4. **What CAN be tested with Playwright MCP**:
   - Single-session UI flows (login, navigation, clicking buttons)
   - Verifying UI state after actions
   - Form interactions and validation
   - Visual snapshots of single pages

For testing Firebase sync between controller and display (e.g., "Hreinsa virkt overlay" clearing on remote), you'll need to either test manually or write Cypress tests that can manage multiple browser contexts.

## Related Systems

- **`clock-api/`**: Python lambdas for match reports and weather data
