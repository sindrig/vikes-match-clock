# TypeScript Conversion - Next Steps

## Current Status

The TypeScript conversion on the `typescript-convert` branch is **functionally complete** - the code compiles successfully and builds without errors. However, there are many ESLint warnings that should be addressed before merging.

**Last commit:** `56901556 - Typescript compiles!`

**Branch:** `typescript-convert`

**Modified files (not staged):**
- clock/.eslintrc.js
- clock/src/actions/*.ts (controller, global, match, remote, view)
- clock/src/controller/LoginPage.tsx
- clock/src/controller/asset/*.tsx (multiple files)
- clock/src/reducers/*.ts (controller, listeners, match, remote, view)
- clock/src/registerServiceWorker.ts
- clock/src/screens/Idle.tsx
- clock/src/store.ts
- clock/src/utils/AdImage.tsx
- clock/tsconfig.json

## Remaining Work

### High Priority ESLint Warnings to Fix

1. **`@typescript-eslint/no-explicit-any`** (~50+ occurrences)
   - Replace `any` types with proper TypeScript types
   - Most common in: actions files, controller components, asset components
   - Example locations:
     - `src/ActionTypes.ts:124`
     - `src/App.tsx:43, 60, 71`
     - `src/actions/*.ts` (multiple locations)

2. **`@typescript-eslint/no-unsafe-*`** (assignments, member-access, arguments, etc.)
   - Result of using `any` types - fixing #1 should resolve many of these
   - Particularly prevalent in:
     - `src/controller/asset/Asset.tsx`
     - `src/controller/asset/TeamAssetController.tsx`
     - `src/controller/asset/PlayerCard.tsx`

### Medium Priority ESLint Warnings

3. **`@typescript-eslint/unbound-method`** (~15 occurrences)
   - Methods passed without proper binding (e.g., as event handlers)
   - Need to either use arrow functions or explicit `.bind(this)`
   - Main locations:
     - `src/controller/asset/FreeTextController.tsx:49, 53`
     - `src/controller/asset/UrlController.tsx:58, 62`
     - `src/controller/asset/team/Team.tsx:166, 228`
     - `src/controller/asset/team/TeamAssetController.tsx` (multiple)

4. **`@typescript-eslint/no-floating-promises`** (~10 occurrences)
   - Promises not awaited or handled with `.catch()` or `.then()`
   - Add `void` operator or proper error handling
   - Main locations:
     - `src/controller/MatchActions.tsx:142`
     - `src/controller/asset/Ruv.tsx:75`
     - `src/controller/asset/team/TeamAssetController.tsx:253`
     - `src/controller/media/ImageList.tsx:73, 74`

5. **Other minor issues:**
   - `@typescript-eslint/prefer-promise-reject-errors` (1 occurrence)
   - `@typescript-eslint/no-misused-promises` (1 occurrence)

## Recommended Approach

### Option A: Fix All Warnings (Recommended)
1. Start with `no-explicit-any` - define proper types for Redux state, actions, and component props
2. Fix `unbound-method` - convert to arrow functions or add `.bind()`
3. Fix `no-floating-promises` - add proper async/await or void operators
4. Run tests: `cd clock && pnpm test`
5. Run build to verify: `cd clock && pnpm build`
6. Commit all changes

### Option B: Quick Path
1. Run tests to ensure functionality: `cd clock && pnpm test`
2. Commit current state with warnings
3. Create follow-up issues/tasks for ESLint cleanup

## Testing Commands

- **Run all tests:** `cd clock && pnpm test`
- **Run tests in watch mode:** `cd clock && pnpm test:watch`
- **Build:** `cd clock && pnpm build`
- **Lint check:** `cd clock && pnpm lint`
- **Format check:** `cd clock && pnpm format-check`

## Notes

- Build succeeds with warnings (not errors)
- TypeScript compilation is working correctly
- All changes are currently unstaged
- The conversion maintains backward compatibility
- May want to update `.eslintrc.js` to temporarily disable some rules if needed
