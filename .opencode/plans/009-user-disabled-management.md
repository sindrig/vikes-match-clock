# Spec 009: User Enable/Disable Management

## Overview

Add ability to enable/disable Firebase Auth users from the admin portal. Include the `disabled` flag in the user list response, show enabled/disabled users in separate tabs, and allow toggling disabled status from the edit modal.

## Decisions (confirmed with user)

| Decision | Choice |
|----------|--------|
| Self-disable prevention | Admin cannot disable their own account |
| Save behavior | Single save button for locations + disabled status |
| Refresh after save | Pass `refreshUsers` callback; re-fetch after toggling disabled |
| Tab UI | "Virkir" (enabled) / "Óvirkir" (disabled) tabs, default to Virkir |
| Sorting | Users sorted by email (case-insensitive) in both tabs |
| Rename | `UserTable` → `ManageUsers` component |

## Changes

### 1. Backend: `functions/src/listUsers.ts`

Add `disabled: boolean` to `UserEntry` interface and response:

```diff
 interface UserEntry {
   uid: string;
   email: string | undefined;
   displayName: string | undefined;
   createdAt: string | undefined;
   lastSignIn: string | undefined;
+  disabled: boolean;
 }
```

In the loop:
```diff
       users.push({
         uid: userRecord.uid,
         email: userRecord.email,
         displayName: userRecord.displayName,
         createdAt: userRecord.metadata.creationTime,
         lastSignIn: userRecord.metadata.lastSignInTime,
+        disabled: userRecord.disabled,
       });
```

### 2. Backend: `functions/src/adminWrite.ts`

Add new action to `AdminWriteData` union:

```typescript
| {
    action: "setUserDisabled";
    targetUid: string;
    disabled: boolean;
  }
```

Add handler function:

```typescript
async function handleSetUserDisabled(
  data: { targetUid: unknown; disabled: unknown },
  callerUid: string,
): Promise<{ success: true }> {
  assertNonEmptyString(data.targetUid, "targetUid");
  if (typeof data.disabled !== "boolean") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "disabled must be a boolean",
    );
  }
  if (data.targetUid === callerUid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Cannot disable your own account",
    );
  }
  await admin.auth().updateUser(data.targetUid, { disabled: data.disabled });
  return { success: true };
}
```

Add case in switch:
```typescript
case "setUserDisabled":
  functions.logger.info("setUserDisabled", { callerUid });
  return handleSetUserDisabled(typedData, callerUid);
```

### 3. Backend tests: `functions/src/__tests__/listUsers.test.ts`

- Add `disabled: false` to mock user records
- Update assertions to expect `disabled` in response

### 4. Backend tests: `functions/src/__tests__/adminWrite.test.ts`

Add new describe block for `setUserDisabled`:
- Sets disabled flag when called by admin (mock `admin.auth().updateUser`)
- Rejects self-disable (callerUid === targetUid)
- Rejects non-boolean disabled value
- Rejects non-admin caller
- Add unauthenticated test case

Need to add `mockUpdateUser` to the firebase-admin mock alongside existing `mockGetUser`.

### 5. Frontend: `clock/src/admin/adminFunctions.ts`

Update `ListUsersResponse` type:
```diff
 interface ListUsersResponse {
   users: Array<{
     uid: string;
     email: string | undefined;
     displayName: string | undefined;
     createdAt: string;
     lastSignIn: string | undefined;
+    disabled: boolean;
   }>;
 }
```

Add new function:
```typescript
export async function setUserDisabled(
  targetUid: string,
  disabled: boolean,
): Promise<void> {
  const callable = httpsCallable(functions, "adminWrite");
  await callable({ action: "setUserDisabled", targetUid, disabled });
}
```

### 6. Frontend: `clock/src/admin/useAdminData.ts`

Update `AdminUser` interface:
```diff
 export interface AdminUser {
   uid: string;
   email: string | undefined;
   displayName: string | undefined;
   lastSignIn: string | undefined;
   createdAt: string;
   locations: Record<string, boolean>;
+  disabled: boolean;
 }
```

Update `authUsers` state type to include `disabled: boolean`.

Update merge logic:
```diff
 const users: AdminUser[] = authUsers.map((u) => ({
   uid: u.uid,
   email: u.email,
   displayName: u.displayName,
   lastSignIn: u.lastSignIn,
   createdAt: u.createdAt,
   locations: authMappings[u.uid] ?? {},
+  disabled: u.disabled,
 }));
```

### 7. Frontend: Rename `UserTable.tsx` → `ManageUsers.tsx`

New component structure:
- Props: `users: AdminUser[]`, `locations: LocationDef[]`, `onRefresh: () => void`
- Local state: `activeTab: "enabled" | "disabled"` (default: `"enabled"`)
- Filter users by `disabled` flag based on active tab
- Sort filtered users by email (case-insensitive): `users.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "", "is"))`
- Use rsuite `Nav` with `appearance="subtle"` for tab switching
- Pass `onRefresh` to `UserEditModal`

Tab labels: "Virkir" and "Óvirkir"

Empty states:
- Enabled tab: "Engir virkir notendur" 
- Disabled tab: "Engir óvirkir notendur"

### 8. Frontend: `UserEditModal.tsx`

Add props: `onRefresh: () => void`

Add state: `disabled: boolean` (initialized from `user.disabled`)

Add rsuite `Toggle` component:
```tsx
<div style={{ marginBottom: "1rem" }}>
  <p style={{ marginBottom: "0.5rem", fontWeight: 500 }}>Staða notanda:</p>
  <Toggle
    checked={disabled}
    onChange={setDisabled}
    checkedChildren="Óvirkur"
    unCheckedChildren="Virkur"
  />
</div>
```

Update `handleSave` to also call `setUserDisabled` if the disabled status changed:
```typescript
if (disabled !== user.disabled) {
  await setUserDisabled(user.uid, disabled);
}
await setUserLocations(user.uid, locationMap);
onRefresh();
```

Call `onRefresh()` after save so user moves between tabs.

### 9. Frontend: `AdminPortal.tsx`

- Update import from `UserTable` to `ManageUsers`
- Update Panel header from "Notendur og skjáaðgangur" to "Stjórna notendum"
- Pass `onRefresh={refreshUsers}` to `ManageUsers`

### 10. Tests: Rename `UserTable.spec.tsx` → `ManageUsers.spec.tsx`

- Update import from `UserTable` to `ManageUsers`
- Add `disabled: false` to `makeUser()` default
- Add `onRefresh` prop (vi.fn())
- Add tests for tab switching (Virkir/Óvirkir)
- Add test for email sorting
- Update empty state messages

### 11. Tests: `AdminPortal.spec.tsx`

- Update mock from `../UserTable` to `../ManageUsers`
- Rename mock component from `UserTable` to `ManageUsers`
- Update `data-testid` from `user-table` to `manage-users`
- Add `disabled: false` to test user data
- Update Panel header assertion if tested
- Add `onRefresh` to mock props

## Implementation Order

1. `listUsers.ts` + `listUsers.test.ts` (backend response)
2. `adminWrite.ts` + `adminWrite.test.ts` (backend action)
3. `adminFunctions.ts` + `useAdminData.ts` (frontend types/data)
4. Rename `UserTable.tsx` → `ManageUsers.tsx` (component + tabs)
5. `UserEditModal.tsx` (disabled toggle)
6. `AdminPortal.tsx` (wire up)
7. Rename `UserTable.spec.tsx` → `ManageUsers.spec.tsx` + update `AdminPortal.spec.tsx`

## Commit Strategy

Atomic commits:
1. `feat(functions): include disabled flag in listUsers response`
2. `feat(functions): add setUserDisabled action to adminWrite`
3. `feat(admin): add user enable/disable management UI`
   - All frontend changes: types, ManageUsers, UserEditModal, AdminPortal
   - All frontend test updates
