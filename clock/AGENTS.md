# Clock App Agent Guidelines

> **Note for Agents**: If you modify any component, pattern, or system described in this document, you MUST update this file to reflect your changes. Keeping this documentation accurate is critical for future development.

## Overview

The `clock/` application is a dual-purpose React system: it acts as both the **stadium display** (Scoreboard/Idle screens) and the **legacy control interface**. It relies on real-time synchronization via Firebase.

## Core Architecture Patterns

### Bidirectional Firebase Sync

State is managed in Redux but mirrored to Firebase Realtime Database.

- `useFirebaseSync.ts`: Monitors Redux state and pushes changes to `states/{listenPrefix}/{stateType}`. It also listens for remote changes to update the local store.
- This allows a controller in the booth to update the display on the field instantly.
- The `listenPrefix` (usually a location name like `viken`) determines which match state the instance follows.

### Redux Slices

| Slice        | Purpose                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| `match`      | Source of truth for the game (clock time, scores, period, penalties, red cards) |
| `controller` | Admin UI state, including active Asset and asset queue                          |
| `view`       | Display settings (viewport scaling, background themes)                          |
| `remote`     | Firebase paths and sync toggles                                                 |
| `auth`       | Firebase authentication state                                                   |
| `listeners`  | Available screens/locations                                                     |

### Persistence

`redux-persist` ensures clock state survives page refreshes, which is critical during live matches.

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

### 5. Global Shortcuts (`src/GlobalShortcut.ts`)

Maps physical keyboard keys to Redux actions for fast operation (e.g., Space for start/stop).

## Remote vs Local State

The app handles "Controller" vs "Display" roles:

- **Display instance**: Has `sync` enabled, only _receives_ data
- **Controller instance**: _Pushes_ data to Firebase

## Build & Tooling

- **Bundler**: Vite (migrated from Create React App) - config in `vite.config.ts`
- **Testing**: Vitest + Cypress for e2e
- **Linting**: ESLint (airbnb-style) + Prettier

## Testing & Development

### Test Credentials (Staging/Development Only)

For local development and testing against the staging Firebase instance:

- **Email**: `fotbolti@vikingur.is`
- **Password**: `fotbolti`

To log in (use playwright):

1. Navigate to `localhost:3000`
2. Click **Stillingar** (Settings) tab
3. Enter credentials in the E-mail and Password fields
4. Click **Login**

Once logged in, you'll see your email displayed and have access to authenticated features like the "Myndefni" (Media) image uploads and remote control functionality.

### Playwright MCP Limitations for Multi-Session Testing

This app requires testing scenarios with **two independent browser sessions** (e.g., admin controller + remote display). The Playwright MCP has limitations that make this difficult:

1. **Tabs share browser context**: Multiple tabs opened via `browser_tabs` share localStorage, cookies, and session state. Since this app uses `redux-persist` with localStorage, both tabs will have identical Redux state.

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

For testing Firebase sync between admin and display (e.g., "Hreinsa virkt overlay" clearing on remote), you'll need to either test manually or write Cypress tests that can manage multiple browser contexts.

## Related Systems

- **`admin/`**: Modern Nuxt 3 admin interface (preferred for new features)
- **`clock-api/`**: Python lambdas for match reports and weather data
