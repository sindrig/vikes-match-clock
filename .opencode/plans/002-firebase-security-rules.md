# Spec 002: Firebase Security Rules Update

**Issue**: #135 - Authz management portal
**Type**: Security -- updated RTDB rules for admins, invitations, and auth writes

## Context

Current rules (`firebase-rules.json`):
- `auth/$user_id` -- read only by owning user, `.write: false` globally
- `locations` -- public read, no write
- `states/$location` -- public read, write if `auth/{uid}/{$location} == true`

The admin portal requires:
1. Admins to read the full `auth/` tree (not just their own UID)
2. Cloud Functions (via Admin SDK) to write `auth/`, `invitations/`, `admins/`
3. Users to read `admins/{uid}` to detect admin status
4. Admins to read `invitations/` to display pending invitations

## Updated rules

```json
{
  "rules": {
    "admins": {
      "$uid": {
        ".read": "$uid == auth.uid"
      },
      ".write": false
    },
    "auth": {
      "$user_id": {
        ".read": "$user_id == auth.uid || root.child('admins').child(auth.uid).val() == true"
      },
      ".read": "root.child('admins').child(auth.uid).val() == true",
      ".write": false
    },
    "invitations": {
      ".read": "root.child('admins').child(auth.uid).val() == true",
      ".write": false
    },
    "locations": {
      ".read": true,
      ".write": false
    },
    "states": {
      "$location": {
        ".write": "root.child('auth').child(auth.uid).child($location).val() == true",
        ".read": true
      }
    }
  }
}
```

### Rule explanations

- **`admins/$uid`**: Each user can only read their own admin status (`$uid == auth.uid`). No client writes -- only Admin SDK (Cloud Functions) can modify.
- **`auth/$user_id`**: A user can read their own record (existing behavior) OR an admin can read any user's record. The parent `auth` node has `.read` for admins so they can list all users. `.write: false` remains -- all writes go through the `adminWrite` Cloud Function using Admin SDK.
- **`invitations`**: Only admins can read. `.write: false` -- all writes go through Cloud Functions.
- **`locations`** and **`states`**: Unchanged.

### Security model

All mutation operations on `admins/`, `auth/`, and `invitations/` are `.write: false` at the client level. The Cloud Functions use the Firebase Admin SDK which bypasses security rules entirely. This means:

1. No client can directly write authorization data
2. The `adminWrite` Cloud Function validates that the caller is an admin before writing
3. The `onCreate` trigger writes invitation data when a new user signs up

## Files affected

- `firebase-rules.json` -- updated with new rules above

## Testing

1. Unauthenticated users cannot read `admins/`, `auth/`, or `invitations/`
2. Authenticated non-admin can read only `admins/{ownUid}` and `auth/{ownUid}`
3. Authenticated admin can read all of `auth/` and `invitations/`
4. No client (admin or not) can write to `admins/`, `auth/`, or `invitations/`
5. Existing `states/` write rules still work (user with `auth/{uid}/{location} == true` can write)
6. `locations` remain publicly readable

## Acceptance criteria

1. Rules pass Firebase rules emulator tests
2. Admin detection works: client reads `admins/{ownUid}` and gets `true` or `null`
3. Admin can list all users via reading `auth/` root
4. Non-admin cannot list other users or read invitations
5. All writes to admin-managed nodes are rejected at the client level
