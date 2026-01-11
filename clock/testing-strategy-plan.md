# Clock App Testing Strategy Plan

## Current State

- **Unit Tests**: Comprehensive coverage for reducers and utilities (181 tests passing)
- **E2E Tests**: Full Cypress suite with 23 tests covering match flow, penalties, assets, and basic navigation.
- **Coverage**: Phase 1, Phase 2, and Phase 3 complete. All reducer tests, utility tests, core component tests, and E2E tests implemented.

## Testing Philosophy

Following the **test triangle**:
- **Unit tests** (many): Pure functions, reducers, utilities
- **Integration tests** (some): Component + Redux interactions
- **E2E tests** (few): Critical user flows only

**Guiding Principle**: Avoid unnecessary tests. Focus on code with high complexity or high risk of regression.

---

## Phase 1: Unit Tests (Foundation) ✅ COMPLETE

### 1.1 Utility Functions ✅
- [x] `src/utils/timeUtils.spec.ts` (20 tests)
  - [x] `formatTime()` - standard inputs (0:00, 45:00, 90:00)
  - [x] `formatMillisAsTime()` - edge cases (0ms, negative, >60min)
  - [x] Padding behavior for single-digit values

### 1.2 Match Reducer (`src/reducers/match.spec.ts`) ✅ (48 tests)
Core game logic - highest priority.

- [x] **Clock State Transitions**
  - [x] startMatch - sets `started` timestamp
  - [x] pauseMatch - sets `started: 0`, accumulates `elapsed`
  - [x] pauseMatch with isHalfEnd - sets timeElapsed to halfStop
  
- [x] **Period Management**
  - [x] updateHalfLength - modifies half duration
  - [x] setHalfStops - configures period boundaries
  - [x] Period-specific half-stop times

- [x] **Scoring**
  - [x] addGoal for home/away
  - [x] Score accumulation via updateMatch

- [x] **Injury Time**
  - [x] Set injury time via updateMatch
  - [x] NaN handling

- [x] **Penalties (2-minute suspensions)**
  - [x] addPenalty - creates penalty with timestamp and duration
  - [x] removePenalty - removes specific penalty by key
  - [x] addToPenalty - extends penalty duration
  - [x] Multiple concurrent penalties

- [x] **Timeouts**
  - [x] matchTimeout - initiates team timeout
  - [x] removeTimeout - clears timeout
  - [x] Timeout cap at 4

- [x] **Red Cards**
  - [x] updateRedCards - sets red card counts

- [x] **Buzzer**
  - [x] buzz on/off

- [x] **Remote Data**
  - [x] receiveRemoteData - merges remote state

### 1.3 Controller Reducer (`src/reducers/controller.spec.ts`) ✅ (45 tests)
Asset and UI state management.

- [x] **Asset Queue Management**
  - [x] addAssets - adds to queue (validates type and key)
  - [x] removeAsset - removes by key
  - [x] setSelectedAssets - replaces queue
  - [x] renderAsset - sets current display asset
  - [x] Duplicate prevention

- [x] **Asset Auto-play**
  - [x] showNextAsset - cycles to next in queue
  - [x] Cycle behavior (re-adds to end)
  - [x] removeAssetAfterTimeout - duration-based advancement
  - [x] Auto-play timing

- [x] **Tab/View State**
  - [x] selectTab - switches between Settings/Home
  - [x] selectView - switches between idle/match/control
  - [x] selectAssetView - toggles asset type views

- [x] **Player Management**
  - [x] addPlayer - creates empty player
  - [x] editPlayer - updates player data
  - [x] deletePlayer - removes by index

- [x] **Match Selection**
  - [x] selectMatch - selects by ID
  - [x] clearMatchPlayers - clears selection
  - [x] setAvailableMatches - populates options

- [x] **Playback Controls**
  - [x] toggleCycle, toggleAutoPlay
  - [x] setImageSeconds, setPlaying

- [x] **Remote Data**
  - [x] receiveRemoteData - handles Firebase sync edge cases

### 1.4 View Reducer (`src/reducers/view.spec.ts`) ✅ (13 tests)
- [x] setBackground - theme selection
- [x] setIdleImage - idle screen image
- [x] setViewPort - viewport scaling
- [x] receiveRemoteData - preserves local vp
- [x] getBackground helper function
- [x] BACKGROUNDS constant validation

### 1.5 Remote Reducer (`src/reducers/remote.spec.ts`) ✅ (13 tests)
- [x] setEmail, setPassword - credential updates
- [x] setSync - enables/disables sync
- [x] setListenPrefix - Firebase path configuration (with reload)
- [x] receiveRemoteData for authData - sets available locations

---

## Phase 2: Component Tests (Integration) ✅ COMPLETE

### 2.1 Clock Component (`src/match/Clock.spec.tsx`) ✅ (10 tests)
- [x] Renders current time from Redux state
- [x] Renders with className
- [x] Displays elapsed time when paused
- [x] Updates time when match is running
- [x] Combines timeElapsed with running time
- [x] Half-stop behavior approaching boundaries
- [x] Injury time display (showInjuryTime)
- [x] Countdown mode display
- [x] Football and Handball match types

### 2.2 ScoreBoard Screen (`src/screens/ScoreBoard.spec.tsx`) ✅ (19 tests)
- [x] Renders without crashing
- [x] Correct match type classes (football/handball)
- [x] Displays home and away scores
- [x] Injury time indicator (+N)
- [x] Red card indicators
- [x] Penalty rendering for both teams
- [x] Timeout clock visibility
- [x] Team timeout indicators
- [x] Viewport styling

### 2.3 MatchController (`src/match-controller/MatchController.spec.tsx`) ✅ (11 tests)
- [x] Renders without crashing
- [x] Start/Stop button text based on state
- [x] Leiðrétta button renders
- [x] Dispatches startMatch action
- [x] Dispatches pauseMatch action
- [x] Dispatches selectView action
- [x] Button disabled during timeout
- [x] Renders home team controller
- [x] Renders away team controller

### 2.4 Asset Components
- [ ] `src/controller/asset/Asset.spec.tsx`
  - [ ] Image asset renders img element
  - [ ] YouTube asset renders player
  - [ ] Text asset renders content
  
- [ ] `src/controller/asset/AssetQueue.spec.tsx`
  - [ ] Renders list of queued assets
  - [ ] Active asset highlighted
  - [ ] Remove button dispatches REMOVE_ASSET

---

## Phase 3: E2E Tests (Critical Paths) ✅ COMPLETE

### 3.1 Existing Test Improvements (`cypress/e2e/spec.js`) ✅ (3 tests)
- [x] Basic navigation and clock operations
- [x] Simple control panel updates
- [x] Countdown functionality

### 3.2 Match Flow (`cypress/e2e/match-flow.cy.js`) ✅ (6 tests)
- [x] Complete football match simulation
  - [x] Set home and away teams
  - [x] Start first half, score goals
  - [x] Trigger half-time via "Næsti hálfleikur"
  - [x] Start second half
  - [x] Add injury time
  - [x] Verify final state (91:00, score 3-2)
- [x] Goal corrections with H -1 button
- [x] Handball match with period transitions
- [x] Time adjustment buttons (+5m, -5m)
- [x] Team logos on scoreboard
- [x] Leiðrétta button switches to advanced controls

### 3.3 Penalty System (`cypress/e2e/penalties.cy.js`) ✅ (5 tests)
- [x] Add 2-minute penalty and verify countdown when match resumes
- [x] Multiple concurrent penalties on same team
- [x] Penalties on both teams simultaneously
- [x] Penalty button disabled when match clock is running
- [x] Penalty countdown pauses when match is paused

### 3.4 Asset System (`cypress/e2e/assets.cy.js`) ✅ (9 tests)
- [x] Queue an image asset
- [x] Activate asset overlay on scoreboard
- [x] Clear asset overlay
- [x] Cycle mode re-queues assets
- [x] Auto-play advances after duration
- [x] YouTube asset queuing
- [x] Free text asset queuing
- [x] Multiple assets queue in order
- [x] Remove asset from queue

---

## Phase 4: Integration Tests (Firebase Sync)

### 4.1 Firebase Sync Hook (`src/hooks/useFirebaseSync.spec.ts`)
- [ ] Mock Firebase Realtime Database
- [ ] Local state change triggers Firebase write
- [ ] Remote Firebase change updates local Redux
- [ ] Sync toggle prevents writes when disabled
- [ ] Handles connection errors gracefully

---

## Implementation Order (Priority)

1. ~~**`timeUtils.spec.ts`** - Quick win, establishes patterns~~ ✅
2. ~~**`match.spec.ts`** - Highest value, most complex logic~~ ✅
3. ~~**`controller.spec.ts`** - Asset system is used heavily~~ ✅
4. ~~**`Clock.spec.tsx`** - Core display component~~ ✅
5. ~~**`MatchController.spec.tsx`** - Core control component~~ ✅
6. ~~**Cypress improvements** - Stabilize and extend E2E coverage~~ ✅
7. **Firebase sync tests** - Complex mocking, lower priority (Phase 4)

---

## Test Infrastructure Notes

### Existing Setup
- **Test Runner**: Vitest
- **React Testing**: @testing-library/react
- **Mock Store**: redux-mock-store
- **E2E**: Cypress 13.x

### Patterns to Follow (from `App.spec.jsx`)
```jsx
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import configureStore from "redux-mock-store";

const mockStore = configureStore([]);

const renderWithStore = (component, store) => {
  return render(<Provider store={store}>{component}</Provider>);
};
```

### Test File Naming
- Unit tests: `*.spec.ts` or `*.spec.tsx`
- E2E tests: `*.cy.js` (Cypress convention)

---

## Success Metrics

- [x] All reducers have >80% branch coverage
- [x] Core components (Clock, ScoreBoard, MatchController) have render tests
- [x] E2E tests cover the 3 critical paths (match flow, penalties, assets)
- [ ] CI pipeline runs all tests on PR
- [ ] No flaky tests in CI

---

## Test Summary (as of Phase 3 completion)

| Test File | Tests | Status |
|-----------|-------|--------|
| `timeUtils.spec.ts` | 20 | ✅ |
| `match.spec.ts` | 48 | ✅ |
| `controller.spec.ts` | 45 | ✅ |
| `view.spec.ts` | 13 | ✅ |
| `remote.spec.ts` | 13 | ✅ |
| `Clock.spec.tsx` | 10 | ✅ |
| `ScoreBoard.spec.tsx` | 19 | ✅ |
| `MatchController.spec.tsx` | 11 | ✅ |
| `App.spec.jsx` | 2 | ✅ |
| **Unit/Component Total** | **181** | **All Passing** |

### E2E Tests (Cypress)

| Test File | Tests | Status |
|-----------|-------|--------|
| `spec.js` | 3 | ✅ |
| `match-flow.cy.js` | 6 | ✅ |
| `penalties.cy.js` | 5 | ✅ |
| `assets.cy.js` | 9 | ✅ |
| **E2E Total** | **23** | **All Passing** |

### Grand Total: 204 tests passing
