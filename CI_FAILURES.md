# CI Test Failures Diagnosis

## Summary

There are two separate categories of test failures:

---

## 1. clock/ Unit Tests (7 test files failing)

### Error
```
TypeError: Cannot read properties of undefined (reading 'getProvider')
  ❯ _getProvider node_modules/.pnpm/@firebase+app@0.14.6/node_modules/@firebase/app/dist/esm/index.esm.js:272:10
  ❯ getFunctions node_modules/.pnpm/@firebase+functions@0.13.1_@firebase+app@0.14.6/node_modules/@firebase/functions/dist/esm/index.esm.js:923:31
  ❯ src/firebase.ts:75:30
```

### Affected Test Files
- `src/controller/Controller.spec.tsx`
- `src/controller/theme/VisualThemeEditor.spec.ts`
- `src/match/Clock.spec.tsx`
- `src/screens/ScoreBoard.spec.tsx`
- `src/contexts/__tests__/queueStateLogic.test.ts`
- `src/controller/theme/ThemeEditor.spec.ts`
- `src/match-controller/MatchController.spec.tsx`

### Root Cause

The file `clock/src/firebase.ts` initializes Firebase services at module load time (lines 72-76):

```typescript
const app: FirebaseApp = initializeApp(fbConfig);
const auth: Auth = getAuth(app);
const database: Database = getDatabase(app);
const functions: Functions = getFunctions(app);  // <-- line 75
const storage: FirebaseStorage = getStorage(app);
```

The test setup in `clock/src/setupTests.ts` mocks:
- `firebase/app`
- `firebase/auth`
- `firebase/database`
- `firebase/storage`

But it is **missing a mock for `firebase/functions`**!

When tests import components that depend on `firebase.ts` (like `FirebaseStateContext.tsx` which imports `functions` from `firebase.ts`), the real `getFunctions()` is invoked, which tries to access Firebase app internals that aren't initialized because the mock doesn't provide them.

### Fix

Add a mock for `firebase/functions` in `clock/src/setupTests.ts`:

```typescript
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  connectFunctionsEmulator: vi.fn(),
}));
```

---

## 2. functions/ Tests

### Error
```
Error: Vitest cannot be imported in a CommonJS module using require(). Please use "import" instead.
```

### Affected
- `lib/__tests__/adminWrite.test.js` (compiled from `src/__tests__/adminWrite.test.ts`)

### Root Cause

The `functions/` directory has a build step that compiles TypeScript to JavaScript. The test file `src/__tests__/adminWrite.test.ts` uses ESM imports (like `import { describe, it, expect, vi } from "vitest"`), but after compilation to CommonJS in `lib/`, something is causing Vitest to be required via CommonJS.

This is likely a configuration issue in either:
1. `functions/tsconfig.json` - may need `"type": "module"` 
2. `functions/package.json` - may need `"type": "module"`
3. The test is being run against compiled JS in `lib/` rather than the TypeScript source

### Fix

Check the build configuration to ensure ESM is preserved, or configure Vitest to run from source TypeScript files instead of compiled JS.
