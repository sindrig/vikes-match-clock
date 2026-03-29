# Spec 003: Firebase Cloud Functions

**Issue**: #135 - Authz management portal
**Type**: Backend -- three Cloud Functions for auth management

## Context

The project currently has zero Cloud Functions. All Firebase interactions are client-side reads or CI/CD CLI commands. The admin portal needs server-side operations for:

1. Resolving pending invitations when a new user signs up
2. Listing all Firebase Auth users (not available from client SDK)
3. Securely writing to `auth/` and `invitations/` nodes (protected by `.write: false`)

## New directory structure

```
functions/
  package.json
  tsconfig.json
  src/
    index.ts          # exports all functions
    onUserCreate.ts   # Auth onCreate trigger
    listUsers.ts      # HTTPS callable: list Firebase Auth users
    adminWrite.ts     # HTTPS callable: write auth/invitations data
  .eslintrc.js
```

## Function 1: `onUserCreate` (Auth trigger)

**Trigger**: `functions.auth.user().onCreate()`

**Purpose**: When a new user signs up, check if any pending invitations match their email. If so, copy the invitation's location mappings to `auth/{newUid}` and delete the invitation.

**Logic**:
1. Receive the newly created `UserRecord`
2. Normalize email to lowercase, trim whitespace
3. Query `invitations/` for entries where `email` matches
4. For each matching invitation:
   a. Write `auth/{newUid}/{locationKey}: true` for each location in the invitation
   b. Delete the invitation from `invitations/`
5. Log the operation for audit

**Edge cases**:
- Multiple invitations for the same email: merge all location grants
- User signs up with different email casing: normalize comparison
- No matching invitations: no-op (normal signup)

**Error handling**: If writing to `auth/` fails, do not delete the invitation (retry on next trigger or manual resolution).

## Function 2: `listUsers` (HTTPS Callable)

**Trigger**: `functions.https.onCall()`

**Purpose**: Return a list of all Firebase Auth users so the admin portal can display them alongside their RTDB screen mappings.

**Logic**:
1. Verify the caller is authenticated (`context.auth` exists)
2. Verify the caller is an admin: read `admins/{callerUid}` from RTDB, must be `true`
3. Use `admin.auth().listUsers()` to paginate through all users
4. Return array of `{ uid, email, displayName, createdAt, lastSignIn }`

**Response format**:
```typescript
interface ListUsersResponse {
  users: Array<{
    uid: string;
    email: string | undefined;
    displayName: string | undefined;
    createdAt: string;
    lastSignIn: string | undefined;
  }>;
}
```

**Security**: Rejects non-admin callers with `functions.https.HttpsError("permission-denied")`.

**Pagination**: Firebase `listUsers()` returns up to 1000 users per call. For this project's scale (likely < 50 users), a single call suffices. If needed, add `pageToken` support later.

## Function 3: `adminWrite` (HTTPS Callable)

**Trigger**: `functions.https.onCall()`

**Purpose**: Securely write authorization data on behalf of admins. Supports multiple operation types.

**Operations**:

### `setUserLocations`
Set a user's screen access. Replaces the entire `auth/{uid}` node.
```typescript
{
  action: "setUserLocations",
  targetUid: string,
  locations: Record<string, boolean>  // e.g. { vikinni: true, hasteinsvollur: true }
}
```

### `createInvitation`
Create a pending invitation for an email address.
```typescript
{
  action: "createInvitation",
  email: string,
  locations: Record<string, boolean>
}
```

### `deleteInvitation`
Remove a pending invitation.
```typescript
{
  action: "deleteInvitation",
  invitationId: string
}
```

### `updateInvitation`
Update locations on a pending invitation.
```typescript
{
  action: "updateInvitation",
  invitationId: string,
  locations: Record<string, boolean>
}
```

**Security for all operations**:
1. Verify `context.auth` exists
2. Read `admins/{callerUid}` from RTDB -- must be `true`
3. Reject with `permission-denied` if not admin

**Validation**:
- `targetUid` must be a non-empty string
- `email` must be a valid email format, normalized to lowercase
- `locations` must be a plain object with string keys and boolean values
- `invitationId` must be a non-empty string

## Dependencies

```json
{
  "dependencies": {
    "firebase-admin": "^12.x",
    "firebase-functions": "^5.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "firebase-functions-test": "^3.x"
  }
}
```

## Emulator support

Add `functions` to the emulator config in `firebase.json`:

```json
{
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  },
  "emulators": {
    "functions": {
      "port": 5001,
      "host": "0.0.0.0"
    }
    // ... existing emulators
  }
}
```

The clock app's `firebase.ts` will need to connect to the functions emulator when `VITE_USE_EMULATOR=true`:
```typescript
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
// ... in emulator setup block
connectFunctionsEmulator(functions, "127.0.0.1", 5001);
```

## Files affected

- `functions/` -- new directory (all files listed above)
- `firebase.json` -- add `functions` config and emulator port
- `clock/src/firebase.ts` -- initialize `getFunctions()`, connect emulator

## Testing

1. Unit tests for each function using `firebase-functions-test` (offline mode)
2. Emulator integration tests:
   - Create user in auth emulator -> verify invitation resolution
   - Call `listUsers` as admin -> verify response
   - Call `listUsers` as non-admin -> verify rejection
   - Call `adminWrite` with each action type -> verify RTDB writes
3. Test email normalization (uppercase, whitespace)

## Acceptance criteria

1. `onUserCreate` resolves matching invitations and grants location access
2. `listUsers` returns Firebase Auth user list to admins only
3. `adminWrite` supports all four operations with admin-only access
4. All functions work in the Firebase emulator
5. Non-admin calls to callable functions are rejected with permission-denied
