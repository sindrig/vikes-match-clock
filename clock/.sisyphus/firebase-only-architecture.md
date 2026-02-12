# Firebase-Only Architecture Migration Plan

## Problem Statement

The current app has a **dual source of truth** problem:
1. **Local state** (Redux + redux-persist in localStorage)
2. **Remote state** (Firebase Realtime Database)

When a new user logs in with "Fjarstjorn" enabled, their stale localStorage state gets pushed to Firebase, **overwriting the current controller's state**. This is catastrophic during live matches.

## Solution: Firebase as Single Source of Truth

Remove Redux entirely. Use React Context + Firebase real-time subscriptions for synced state (`match`, `controller`, `view`). Local-only preferences (`sync`, `listenPrefix`, `auth`) will use a separate Context with localStorage persistence.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        NEW ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────────────────────────────┐  │
│  │   Firebase   │◄───│  FirebaseStateProvider (Context)      │  │
│  │   Realtime   │    │  - match, controller, view state      │  │
│  │   Database   │────│  - Real-time subscriptions            │  │
│  │              │    │  - Mutation functions                  │  │
│  └──────────────┘    └──────────────────────────────────────┘  │
│        ▲                            ▲                           │
│        │                            │                           │
│  Writes only on       ┌─────────────┴────────────────┐         │
│  explicit actions     │        Components            │         │
│                       │  (use hooks, no connect())    │         │
│                       └──────────────────────────────┘         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  LocalStateProvider (Context + localStorage)              │  │
│  │  - auth (Firebase Auth state)                             │  │
│  │  - sync (boolean toggle)                                  │  │
│  │  - listenPrefix (string)                                  │  │
│  │  - listeners (available screens)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

### Phase 1: Create New Context Providers

#### Task 1.1: Create FirebaseStateContext
**File**: `src/contexts/FirebaseStateContext.tsx`

Create a React Context that:
- Subscribes to Firebase paths `states/{listenPrefix}/match`, `states/{listenPrefix}/controller`, `states/{listenPrefix}/view`
- Provides state via context
- Provides mutation functions that write directly to Firebase
- Falls back to local state when `sync=false`

**Key exports**:
- `FirebaseStateProvider` - wraps the app
- `useFirebaseState()` - full context access
- `useMatch()` - match state + match actions
- `useController()` - controller state + controller actions
- `useView()` - view state + view actions
- `useListeners()` - available screens

**Default states** (when Firebase has no data):
```typescript
const defaultMatch: Match = {
  homeScore: 0,
  awayScore: 0,
  started: 0,
  timeElapsed: 0,
  halfStops: DEFAULT_HALFSTOPS[Sports.Football],
  homeTeam: "Vikingur R",
  awayTeam: "",
  homeTeamId: 103,
  awayTeamId: 0,
  injuryTime: 0,
  matchType: Sports.Football,
  home2min: [],
  away2min: [],
  timeout: 0,
  homeTimeouts: 0,
  awayTimeouts: 0,
  buzzer: false,
  countdown: false,
  showInjuryTime: true,
};

const defaultController: ControllerState = {
  selectedAssets: [],
  cycle: false,
  imageSeconds: 3,
  autoPlay: false,
  playing: false,
  assetView: "assets",
  view: "idle",
  availableMatches: {},
  selectedMatch: null,
  currentAsset: null,
  refreshToken: "",
};

const defaultView: ViewState = {
  vp: { style: { height: 1080, width: 1920 }, name: "1080p", key: "viken" },
  background: "Default",
};
```

**Match actions to implement**:
- `updateMatch(updates: Partial<Match>)`
- `startMatch()`
- `pauseMatch(isHalfEnd?: boolean)`
- `addGoal(team: "home" | "away")`
- `addPenalty(team, key, penaltyLength)`
- `removePenalty(key)`
- `addToPenalty(key, toAdd)`
- `updateHalfLength(currentValue, newValue)`
- `setHalfStops(halfStops, showInjuryTime)`
- `matchTimeout(team)`
- `removeTimeout()`
- `buzz(on: boolean)`
- `countdown()`
- `updateRedCards(home, away)`

**Controller actions to implement**:
- `updateController(updates: Partial<ControllerState>)`
- `selectView(view: string)`
- `selectAssetView(assetView: string)`
- `setSelectedAssets(assets)`
- `addAssets(assets)`
- `removeAsset(asset)`
- `toggleCycle()`
- `setImageSeconds(seconds)`
- `toggleAutoPlay()`
- `setPlaying(playing)`
- `renderAsset(asset | null)`
- `showNextAsset()`
- `removeAssetAfterTimeout()`
- `remoteRefresh()`
- `setAvailableMatches(matches)`
- `selectMatch(matchId)`
- `editPlayer(teamId, idx, updatedPlayer)`
- `deletePlayer(teamId, idx)`
- `addPlayer(teamId)`
- `clearMatchPlayers()`
- `selectTab(tab)`

**View actions to implement**:
- `updateView(updates: Partial<ViewState>)`
- `setViewPort(vp)`
- `setBackground(background)`
- `setIdleImage(idleImage)`

#### Task 1.2: Create LocalStateContext
**File**: `src/contexts/LocalStateContext.tsx`

Create a React Context for local-only state:
- `auth` (Firebase Auth state - from `onAuthStateChanged`)
- `sync` (boolean - persisted to localStorage)
- `listenPrefix` (string - persisted to localStorage)
- `email` / `password` (for login form - NOT persisted)
- `listeners.available` (populated from Firebase `auth/{uid}` data)

**Key exports**:
- `LocalStateProvider`
- `useLocalState()`
- `useAuth()`
- `useRemoteSettings()`

### Phase 2: Update Entry Point

#### Task 2.1: Update index.tsx
**File**: `src/index.tsx`

Remove:
- Redux `Provider`
- `PersistGate`
- Redux store imports

Add:
- `LocalStateProvider`
- `FirebaseStateProvider` (nested, receives `sync`, `listenPrefix`, `isAuthenticated` from LocalState)

```tsx
// New structure
<LocalStateProvider>
  <AppWithProviders />
</LocalStateProvider>

// Where AppWithProviders uses useLocalState() to get sync/listenPrefix/isAuthenticated
// and wraps children in FirebaseStateProvider
```

### Phase 3: Migrate Components

#### Task 3.1: Migrate App.tsx
- Remove `useSelector` and `useDispatch` from react-redux
- Use `useFirebaseState()` and `useLocalState()` instead

#### Task 3.2: Migrate StateListener.tsx
- Remove Redux usage
- Simply use the contexts (FirebaseStateProvider already handles subscriptions)
- Can be simplified significantly or removed

#### Task 3.3: Migrate Screen Components
**Files**:
- `src/screens/ScoreBoard.tsx` - replace `connect()` with `useFirebaseState()`
- `src/screens/Idle.tsx` - replace `connect()` with `useFirebaseState()`

#### Task 3.4: Migrate Match Components
**Files**:
- `src/match/Clock.tsx` - use `useMatch()`
- `src/match/Team.tsx` - use `useMatch()`
- `src/match/TwoMinClock.tsx` - use `useMatch()`
- `src/match/TimeoutClock.tsx` - use `useMatch()`

#### Task 3.5: Migrate Controller Components
**Files**:
- `src/controller/Controller.tsx` - use `useController()`, `useMatch()`
- `src/controller/LoginPage.tsx` - use `useLocalState()`
- `src/controller/HalfStops.tsx` - use `useMatch()`
- `src/controller/MatchActions.tsx` - use `useMatch()`, `useController()`
- `src/controller/MatchActionSettings.tsx` - use `useMatch()`
- `src/controller/TeamSelector.tsx` - use `useMatch()`
- `src/controller/RedCardManipulation.tsx` - use `useMatch()`
- `src/controller/PenaltiesManipulationBox.tsx` - use `useMatch()`
- `src/controller/RefreshHandler.tsx` - use `useController()`

#### Task 3.6: Migrate Match Controller Components
**Files**:
- `src/match-controller/MatchController.tsx` - use `useMatch()`, `useController()`
- `src/match-controller/TeamController.tsx` - use `useMatch()`
- `src/match-controller/ControlButton.tsx` - (likely no Redux usage, verify)

#### Task 3.7: Migrate Asset Components
**Files**:
- `src/controller/asset/Asset.tsx` - use `useController()`
- `src/controller/asset/AssetController.tsx` - use `useController()`
- `src/controller/asset/AssetQueue.tsx` - use `useController()`
- `src/controller/asset/PlayerCard.tsx` - use `useController()`
- `src/controller/asset/Substitution.tsx` - use `useController()`
- `src/controller/asset/RemoveAssetDropzone.tsx` - use `useController()`
- `src/controller/asset/team/Team.tsx` - use `useController()`, `useMatch()`
- `src/controller/asset/team/TeamAssetController.tsx` - use `useController()`
- `src/controller/asset/team/MatchSelector.tsx` - use `useController()`
- `src/controller/asset/team/MatchesOnPitch.tsx` - use `useController()`

#### Task 3.8: Migrate Media Components
**Files**:
- `src/controller/media/ImageList.tsx` - use `useController()`
- `src/controller/media/MediaManager.tsx` - use `useController()`

#### Task 3.9: Migrate Utility Components
**Files**:
- `src/utils/AdImage.tsx` - use `useMatch()`

### Phase 4: Remove Redux

#### Task 4.1: Delete Redux Files
**Files to delete**:
- `src/store.ts`
- `src/reducers/reducer.ts`
- `src/reducers/match.ts`
- `src/reducers/controller.ts`
- `src/reducers/view.ts`
- `src/reducers/remote.ts`
- `src/reducers/auth.ts`
- `src/reducers/listeners.ts`
- `src/actions/match.ts`
- `src/actions/controller.ts`
- `src/actions/view.ts`
- `src/actions/remote.ts`
- `src/actions/global.ts`
- `src/hooks/useFirebaseSync.ts` (functionality moved to FirebaseStateContext)

#### Task 4.2: Update ActionTypes.ts
Keep only constants that might be used elsewhere, or delete if not needed.

#### Task 4.3: Remove Redux Dependencies
**Update package.json** - remove:
- `redux`
- `react-redux`
- `redux-persist`
- `redux-actions`
- `redux-thunk`
- `redux-promise-middleware`
- `@types/react-redux`
- `@types/redux-actions`
- `@types/redux-mock-store`
- `@types/redux-promise-middleware`
- `redux-mock-store`

Run `pnpm remove` for each.

### Phase 5: Update Tests

#### Task 5.1: Create Test Utilities
**File**: `src/test-utils.tsx`

Create a test wrapper that provides:
- `LocalStateProvider` with mock values
- `FirebaseStateProvider` with mock Firebase
- Helper functions to simulate Firebase updates

#### Task 5.2: Update Component Tests
All tests using `redux-mock-store` need to be updated to use the new test utilities:
- `src/App.spec.jsx`
- `src/hooks/useFirebaseSync.spec.tsx` (can be deleted or adapted)
- `src/match-controller/MatchController.spec.tsx`
- `src/match/Clock.spec.tsx`
- `src/screens/ScoreBoard.spec.tsx`
- `src/reducers/*.spec.ts` (delete these - no more reducers)

### Phase 6: Cleanup

#### Task 6.1: Update Types
**File**: `src/types.ts`

Remove `RootState` or update it. The new type structure should reflect the context-based approach.

#### Task 6.2: Update AGENTS.md
Update the documentation to reflect the new architecture.

#### Task 6.3: Update GlobalShortcut.ts
This file dispatches Redux actions. Update to use context actions instead.
May need to be refactored into a hook that uses the context.

#### Task 6.4: Format and Lint
Run `pnpm format` and `pnpm lint` to ensure code quality.

#### Task 6.5: Run Tests
Run `pnpm test` to verify all tests pass.

## Migration Pattern for Each Component

### Before (Redux with connect):
```tsx
import { connect } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";

const Component = ({ homeScore, addGoal }) => {
  return <button onClick={() => addGoal("home")}>{homeScore}</button>;
};

const mapStateToProps = (state: RootState) => ({
  homeScore: state.match.homeScore,
});

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators({ addGoal: matchActions.addGoal }, dispatch);

export default connect(mapStateToProps, mapDispatchToProps)(Component);
```

### After (Context with hooks):
```tsx
import { useMatch } from "../contexts/FirebaseStateContext";

const Component = () => {
  const { match, addGoal } = useMatch();
  
  return <button onClick={() => addGoal("home")}>{match.homeScore}</button>;
};

export default Component;
```

## Safety Improvements

### Why This Solves the Override Problem

1. **No initial push**: New users subscribing to Firebase only RECEIVE data, never push their initial state
2. **Explicit writes only**: State changes happen only when a user performs an action
3. **No localStorage race**: Firebase is the single source of truth - no stale localStorage to conflict
4. **Authenticated writes**: The `writeToFirebase` function checks `isAuthenticated` before writing

### Fallback Behavior (sync=false)

When `sync` is disabled:
- State is managed locally in React state
- No Firebase subscriptions or writes
- Useful for testing or offline mode

## Estimated Effort

- Phase 1 (Contexts): 2-3 hours
- Phase 2 (Entry Point): 30 minutes
- Phase 3 (Component Migration): 4-6 hours (30 files)
- Phase 4 (Redux Removal): 1 hour
- Phase 5 (Tests): 2-3 hours
- Phase 6 (Cleanup): 1 hour

**Total: ~12-15 hours**

## Rollback Plan

If issues are discovered:
1. Git revert to the commit before this migration
2. The old Redux-based architecture is fully preserved in git history

## Testing Strategy

1. **Manual testing**: Log in as two users, verify one doesn't override the other
2. **E2E tests**: Run existing Playwright tests
3. **Unit tests**: Ensure new context hooks work correctly
