# Spec 008: Testing Plan

**Issue**: #135 - Authz management portal
**Type**: Quality -- unit tests, integration tests, and E2E tests

## Context

The project uses Vitest for unit tests and Playwright for E2E tests. Firebase emulator is used for isolated testing. The new admin portal introduces Cloud Functions, new RTDB nodes, updated security rules, and new React components -- all need testing.

## Test categories

### 1. Firebase Security Rules Tests

**Tool**: Firebase rules emulator tests (can use `@firebase/rules-unit-testing`)

**New test file**: `tests/rules.test.ts` (at project root or in a `tests/` directory)

Test cases:
- Unauthenticated user cannot read `admins/`, `auth/`, `invitations/`
- Non-admin user can read `admins/{ownUid}` only
- Non-admin user can read `auth/{ownUid}` only
- Admin user can read all of `auth/` (list operation)
- Admin user can read `invitations/`
- No client can write to `admins/`, `auth/`, or `invitations/`
- Existing `states/{location}` write rules still work for authorized users
- `locations` remains publicly readable

### 2. Cloud Function Unit Tests

**Tool**: `firebase-functions-test` (offline mode) + Vitest or Jest

**Test files**: `functions/src/__tests__/`

#### `onUserCreate.test.ts`
- New user with matching invitation -> locations copied to `auth/{uid}`, invitation deleted
- New user with multiple matching invitations -> all locations merged
- New user with no matching invitation -> no changes
- Email case normalization (uppercase email matches lowercase invitation)
- Partial failure: write to `auth/` fails -> invitation not deleted

#### `listUsers.test.ts`
- Admin caller -> returns user list
- Non-admin caller -> throws permission-denied
- Unauthenticated caller -> throws unauthenticated

#### `adminWrite.test.ts`
- `setUserLocations`: admin sets locations -> `auth/{uid}` updated
- `setUserLocations`: non-admin caller -> rejected
- `createInvitation`: valid email + locations -> invitation created in RTDB
- `createInvitation`: invalid email format -> rejected
- `deleteInvitation`: valid ID -> invitation removed
- `updateInvitation`: valid ID + locations -> invitation updated
- All actions: unauthenticated caller -> rejected

### 3. React Component Unit Tests

**Tool**: Vitest + `@testing-library/react`

**Test files**: `clock/src/admin/__tests__/`

#### `AdminRoute.test.tsx`
- Not authenticated -> shows login form
- Authenticated, not admin -> shows access denied
- Authenticated + admin -> renders AdminPortal

#### `useAdminData.test.ts`
- Hook fetches users from Cloud Function on mount
- Hook subscribes to `auth/` and `invitations/` in RTDB
- Merges Auth users with RTDB mappings correctly
- Handles loading and error states

#### `UserTable.test.tsx`
- Renders user rows with email, locations, last sign-in
- Edit button opens modal
- Empty state message when no users

#### `InvitationTable.test.tsx`
- Renders invitation rows
- Create button opens modal
- Delete button with confirmation
- Empty state message

#### `AdminPortal.test.tsx`
- Renders both sections (users + invitations)
- Loading spinner while data loads
- Error message on data fetch failure

### 4. E2E Tests (Playwright)

**Tool**: Playwright + Firebase emulator

**Test file**: `clock/e2e/admin.spec.ts`

#### Setup
- Seed Firebase emulator with:
  - Admin user in `admins/` node
  - Regular user (no admin access)
  - Locations in `locations/` node
  - Existing `auth/` mappings for some users
  - A pending invitation in `invitations/`

#### Test cases

**Admin access**:
- Admin user sees red "Stjornbord" button on screen selector
- Non-admin user does not see admin button
- Navigate to `/admin` as admin -> admin portal loads
- Navigate to `/admin` as non-admin -> access denied

**User management**:
- Admin portal shows list of registered users
- Click edit on a user -> modal opens with location checkboxes
- Toggle locations and save -> changes reflected in table
- Changes persist (reload page, mappings still correct)

**Invitation management**:
- Admin portal shows pending invitations section
- Click "Bja notanda" -> invitation modal opens
- Fill email + select locations -> invitation appears in table
- Delete invitation -> removed from table

**Invitation resolution** (if feasible with emulator):
- Create invitation for email
- Create new user with that email in auth emulator
- Verify `auth/{newUid}` has the invited locations
- Verify invitation is deleted

### 5. Integration with Existing Tests

- All existing E2E tests must continue to pass
- The main app route (`/`) behavior is completely unchanged
- Login flow tests should still work (no router interference)

## Test data helpers

Update `clock/e2e/fixtures/test-helpers.ts` to support:
- Seeding `admins/` node in emulator
- Seeding `invitations/` node in emulator
- Creating test users in auth emulator via REST API

## Files affected

- `tests/rules.test.ts` -- new Firebase rules tests
- `functions/src/__tests__/` -- new Cloud Function unit tests
- `clock/src/admin/__tests__/` -- new React component tests
- `clock/e2e/admin.spec.ts` -- new E2E tests
- `clock/e2e/fixtures/test-helpers.ts` -- updated test data helpers

## Acceptance criteria

1. Security rules tests cover all new rules and edge cases
2. Cloud Function unit tests cover all operations and error paths
3. React component tests cover rendering, interactions, and edge cases
4. E2E tests verify the full admin workflow end-to-end
5. All existing tests continue to pass without modification
6. Tests run in CI with Firebase emulator
