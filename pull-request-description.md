# Firebase State Hardening

## Summary

This PR hardens the Firebase-only state architecture following the Redux → Context migration. It addresses race conditions, type safety issues, and adds comprehensive guards to prevent state corruption in multi-controller scenarios.

## Problem

After migrating from Redux to React Context with Firebase as the single source of truth, several edge cases could still cause state corruption:

1. **Pre-hydration clobber**: A component triggering an update before receiving the first Firebase snapshot could overwrite remote state with default values
2. **Stale-ref write races**: Rapid sequential actions (e.g., clicking +1 goal twice quickly) could compute from stale refs and lose updates
3. **Empty listenPrefix writes**: Writing to `states//...` creates invalid Firebase paths
4. **Unsafe snapshot parsing**: 20+ lint errors from untyped Firebase data casting
5. **Multi-controller last-write-wins**: Undocumented behavior when multiple controllers connect

## Solution

### Phase 1: Critical Guards
- Added hydration tracking (`isMatchHydrated`, `isControllerHydrated`, `isViewHydrated`) to `FirebaseStateContext.tsx`
- Reset hydration on `listenPrefix` change
- Blocked all `apply*` functions when `listenPrefix` is empty
- Blocked Firebase writes until hydration complete

### Phase 2: Optimistic Updates
- Made writes optimistic: update `ref.current` AND local state immediately before Firebase sync
- Added `.catch(console.error)` to all Firebase sync calls for error visibility

### Phase 3: Type Safety
- Created `firebaseParsers.ts` with runtime-validated parsers for Match, Controller, View, and Locations data
- Replaced `JSON.parse(JSON.stringify(...))` with `structuredClone` in 3 places
- Added error callbacks to all `onValue` Firebase subscriptions
- **Result**: Reduced lint errors from 20 to 0

### Phase 4: Performance
- Wrapped context value in `useMemo` to prevent unnecessary re-renders

### Phase 5: Testing
- Created `FirebaseStateContext.spec.tsx` with 7 new unit tests covering:
  - Empty listenPrefix protection
  - Non-sync mode updates
  - Rapid sequential actions
  - Default state initialization

### Phase 6: Documentation
- Updated `clock/AGENTS.md` with:
  - Single source of truth explanation
  - Hydration guards documentation
  - Multi-controller behavior (last-write-wins semantics)

## Files Changed

### New Files
- `clock/src/contexts/firebaseParsers.ts` - Type-safe Firebase snapshot parsers
- `clock/src/contexts/FirebaseStateContext.spec.tsx` - Unit tests for state context

### Modified Files
- `clock/src/contexts/FirebaseStateContext.tsx` - Main implementation with guards, optimistic updates
- `clock/AGENTS.md` - Updated architecture documentation

### Supporting Files
- `.sisyphus/plans/firebase-hardening.md` - Completed plan
- `.sisyphus/notepads/firebase-hardening/learnings.md` - Learnings for future reference

## Verification

All acceptance criteria met:
- ✅ `pnpm build` passes
- ✅ `pnpm test` passes (125 tests)
- ✅ `pnpm lint` has 0 errors
- ✅ Joining a running match does NOT reset the match state
- ✅ Rapid button clicks (e.g., 2 goals quickly) are both recorded
- ✅ Empty listenPrefix does not create invalid Firebase paths

## Breaking Changes

None. All changes are backward compatible.

## Testing Notes

For manual testing of multi-controller sync:
1. Open the app in two browser windows
2. Connect both to the same `listenPrefix` (e.g., "viken")
3. Make changes in one window
4. Verify changes appear in the other window

The hydration guards ensure that a newly-connected controller won't overwrite the existing match state.
