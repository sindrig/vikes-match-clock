# Spec 001: Firebase RTDB Schema Changes

**Issue**: #135 - Authz management portal
**Type**: Data layer -- new RTDB nodes for admin roles and invitations

## Context

The current Firebase RTDB has three root nodes: `auth/`, `locations/`, `states/`. There is no concept of admins or invitations. User-to-screen mappings in `auth/{uid}/{location}` can only be modified via Firebase Console or Admin SDK.

Current schema (from `firebase-rules.json`):
- `auth/{uid}/{location}: boolean` -- per-user screen access
- `locations/{key}` -- screen definitions (public read)
- `states/{location}` -- per-location match/controller/view state

## Changes

### New root node: `admins`

```
admins/
  {uid}: true
```

- Keys are Firebase Auth UIDs
- Values are `true` (boolean)
- Determines who can access the admin portal and manage authorization
- Read by the client to check admin status after authentication
- Initially populated manually via Firebase Console for the first admin(s)

### New root node: `invitations`

```
invitations/
  {invitationId}/
    email: "user@example.com"
    locations/
      {locationKey}: true
    createdBy: "{adminUid}"
    createdAt: {serverTimestamp}
```

- `{invitationId}` is a push-generated key
- `email` is the invited user's email address (lowercase, trimmed)
- `locations` maps location keys to `true`, same format as `auth/{uid}`
- `createdBy` records which admin created the invitation
- `createdAt` is a server timestamp for audit purposes

### Existing node changes: `auth/`

No structural changes to `auth/{uid}/{location}`. The data format remains `{locationKey}: true | false`. Writes to this node will now come from the `adminWrite` Cloud Function instead of being console-only.

## Migration

No data migration needed. The new nodes are additive. Existing `auth/` data remains valid.

## Files affected

- `firebase-rules.json` -- new rules for `admins` and `invitations` (see spec 002)
- `clock/src/contexts/LocalStateContext.tsx` -- read `admins/{uid}` to set `isAdmin` state (see spec 005)
- `functions/` -- new directory for Cloud Functions that read/write these nodes (see spec 003)

## Acceptance criteria

1. `admins/{uid}: true` correctly identifies admin users
2. `invitations/` stores pending invitations with email, locations, createdBy, createdAt
3. Existing `auth/`, `locations/`, `states/` nodes are unchanged
4. Firebase emulator seeds admin data for local development/testing
