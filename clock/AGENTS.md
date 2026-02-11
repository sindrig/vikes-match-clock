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

| Context | Purpose |
| ------- | ------- |
| `FirebaseStateContext` | Shared state synced via Firebase (Match, Controller, View, Listeners) |
| `LocalStateContext` | Local app state (Auth, listen prefix) |

**Note**: Redux was fully removed from this codebase. All state is managed via React Context.

### Persistence

Local settings (auth, listen prefix) are stored in `localStorage` via `LocalStateContext`. Match state is synced from Firebase on connection.

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

## Build & Tooling

- **Bundler**: Vite (migrated from Create React App) - config in `vite.config.ts`
- **Testing**: Vitest for unit tests, Playwright for e2e
- **Linting**: ESLint (airbnb-style) + Prettier

**Important**: Always run `pnpm format` after making changes. CI runs format checks and will fail if code is not properly formatted. To format only specific files: `pnpm exec prettier --write path/to/file.tsx`

## Testing & Development

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
   - **Playwright e2e tests**: Use the Playwright test runner which can handle multiple browser contexts
   - **Single-session verification**: Test that actions dispatch correctly and state changes as expected, then rely on Firebase sync logic being correct

4. **What CAN be tested with Playwright MCP**:
   - Single-session UI flows (login, navigation, clicking buttons)
   - Verifying UI state after actions
   - Form interactions and validation
   - Visual snapshots of single pages

For testing Firebase sync between controller and display (e.g., "Hreinsa virkt overlay" clearing on remote), you'll need to either test manually or write Playwright tests that can manage multiple browser contexts.

## Related Systems

- **`clock-api/`**: Python lambdas for match reports and weather data
