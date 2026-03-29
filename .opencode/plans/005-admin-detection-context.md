# Spec 005: Admin Detection and Context

**Issue**: #135 - Authz management portal
**Type**: Frontend state -- add admin status to auth context

## Context

Currently `LocalStateContext.tsx` manages auth state (`FirebaseAuthState`) and available locations. After login, it reads `auth/{uid}` to populate the `available` list. There is no admin detection.

## Changes

### Modified: `clock/src/contexts/LocalStateContext.tsx`

Add `isAdmin` state alongside existing auth state.

**New state**:
```typescript
const [isAdmin, setIsAdmin] = useState<boolean>(false);
```

**New effect** (after auth listener, similar pattern to the `available` locations listener):

When `auth.uid` is set, subscribe to `admins/{uid}` in RTDB:
```typescript
useEffect(() => {
  if (!auth.uid) {
    setIsAdmin(false);
    return;
  }
  const adminRef = ref(database, `admins/${auth.uid}`);
  const unsubscribe = onValue(adminRef, (snapshot) => {
    setIsAdmin(snapshot.val() === true);
  });
  return () => {
    unsubscribe();
    setIsAdmin(false);
  };
}, [auth.uid]);
```

**Update context type**:
Add `isAdmin: boolean` to `LocalStateContextType` interface.

**Update context value**:
Include `isAdmin` in the value object passed to the provider.

**New hook**:
```typescript
export function useIsAdmin() {
  const { isAdmin } = useLocalState();
  return isAdmin;
}
```

### Why a real-time subscription (not a one-time read)?

Using `onValue` instead of `get()` means admin status updates in real-time. If an admin is removed while using the app, `isAdmin` flips to `false` immediately. This is consistent with how `available` locations work.

### Existing hook updates

The `useAuth()` hook remains unchanged -- it only returns `auth` state. The new `useIsAdmin()` hook is separate so components can opt-in to admin awareness without re-rendering on auth changes.

## Files affected

- `clock/src/contexts/LocalStateContext.tsx` -- add `isAdmin` state, subscription, and hook

## Testing

1. Non-admin user: `isAdmin` is `false` after login
2. Admin user (has `admins/{uid}: true`): `isAdmin` is `true` after login
3. Admin status removed while logged in: `isAdmin` flips to `false` in real-time
4. Logout: `isAdmin` resets to `false`

## Acceptance criteria

1. `isAdmin` correctly reflects `admins/{uid}` in RTDB
2. Real-time subscription updates admin status without page reload
3. `useIsAdmin()` hook is available for components
4. No impact on existing auth or available locations behavior
