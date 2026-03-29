# Spec 006: Admin Portal UI

**Issue**: #135 - Authz management portal
**Type**: Frontend -- admin portal for user-screen mapping and invitation management

## Context

There is currently no admin UI. User-to-screen mappings are managed via Firebase Console. The admin portal will be a new React view at `/admin` (see spec 004 for routing).

## UI structure

The admin portal has two main sections displayed on a single page:

### Header bar
- App title: "Vikes Klukka -- Stjornborð" (admin dashboard)
- Admin badge: small label showing the admin's email
- "Til baka" (Back) link navigating to `/`
- "Utskra" (Logout) button

### Section 1: User-Screen Mappings

**Data sources**:
- User list from `listUsers` Cloud Function (Firebase Auth users)
- Screen mappings from RTDB `auth/` node (admin can read full tree per spec 002)
- Location definitions from RTDB `locations/` node (public read)

**Display**: Table with columns:
| Column | Source | Description |
|--------|--------|-------------|
| Email | Firebase Auth | User's email address |
| Display Name | Firebase Auth | User's display name (if set) |
| Screens | RTDB `auth/{uid}` | Checkboxes for each location from `locations/` |
| Last Sign-In | Firebase Auth | Last login timestamp |
| Actions | -- | Edit button to modify screen access |

**Interactions**:
- Click "Breyta" (Edit) on a user row -> opens a modal/drawer with checkbox list of all locations
- Toggle location checkboxes -> on save, calls `adminWrite` Cloud Function with `setUserLocations` action
- Changes appear in real-time because the admin is subscribed to `auth/` via `onValue`

**Empty state**: "Engir notendur skráðir" (No registered users) if the user list is empty.

### Section 2: Pending Invitations

**Data source**: RTDB `invitations/` node (admin can read per spec 002)

**Display**: Table with columns:
| Column | Source | Description |
|--------|--------|-------------|
| Email | `invitations/{id}/email` | Invited email address |
| Screens | `invitations/{id}/locations` | Location names (resolved from `locations/`) |
| Created By | `invitations/{id}/createdBy` | Admin who created the invitation |
| Created At | `invitations/{id}/createdAt` | Timestamp |
| Actions | -- | Edit / Delete buttons |

**Interactions**:
- "Bja notanda" (Invite user) button -> opens modal with email input + location checkboxes
- On submit, calls `adminWrite` Cloud Function with `createInvitation` action
- "Breyta" (Edit) on invitation row -> opens modal to modify locations
- "Eyda" (Delete) on invitation row -> confirmation dialog, then calls `adminWrite` with `deleteInvitation`
- Real-time updates via `onValue` subscription on `invitations/`

**Validation**:
- Email must be valid format
- At least one location must be selected
- Duplicate email warning if an invitation already exists for that email

## New files

```
clock/src/admin/
  AdminPortal.tsx       # Main admin portal page
  AdminRoute.tsx        # Route guard (auth + admin check)
  UserTable.tsx         # User-screen mapping table
  UserEditModal.tsx     # Modal for editing user screen access
  InvitationTable.tsx   # Pending invitations table
  InvitationModal.tsx   # Modal for creating/editing invitations
  useAdminData.ts       # Custom hook: fetches users (Cloud Function) + subscribes to auth/ and invitations/
  adminFunctions.ts     # Wrappers for calling Cloud Functions (httpsCallable)
  AdminPortal.css       # Styles
```

## Data flow

### `useAdminData` hook

Manages all admin portal data:

1. On mount, call `listUsers` Cloud Function to get Firebase Auth users
2. Subscribe to `auth/` in RTDB (real-time user-screen mappings)
3. Subscribe to `invitations/` in RTDB (real-time pending invitations)
4. Subscribe to `locations/` in RTDB (available location definitions)
5. Merge Auth users + RTDB mappings into a unified user list

Returns:
```typescript
{
  users: Array<{ uid, email, displayName, lastSignIn, locations: Record<string, boolean> }>,
  invitations: Array<{ id, email, locations: Record<string, boolean>, createdBy, createdAt }>,
  locations: Array<{ key: string, label: string }>,
  loading: boolean,
  error: string | null,
  refreshUsers: () => void  // re-fetch Auth users
}
```

### `adminFunctions.ts`

Thin wrappers around `httpsCallable`:
```typescript
export const setUserLocations = (targetUid: string, locations: Record<string, boolean>) => ...
export const createInvitation = (email: string, locations: Record<string, boolean>) => ...
export const deleteInvitation = (invitationId: string) => ...
export const updateInvitation = (invitationId: string, locations: Record<string, boolean>) => ...
export const fetchUsers = () => ...
```

## UI components

### AdminPortal.tsx
- Top-level layout component
- Renders header, UserTable, InvitationTable
- Uses `useAdminData` hook for all data

### UserTable.tsx
- Receives `users` and `locations` as props
- Renders the user table with location badges
- "Breyta" button per row opens `UserEditModal`

### UserEditModal.tsx
- rsuite `Modal` with checkbox group for locations
- "Vista" (Save) button calls `setUserLocations`
- Shows loading state while saving

### InvitationTable.tsx
- Receives `invitations` and `locations` as props
- "Bja notanda" button opens `InvitationModal` in create mode
- "Breyta" / "Eyda" buttons per row

### InvitationModal.tsx
- rsuite `Modal` with email input + checkbox group for locations
- Mode: create or edit
- Validates email format and at least one location selected

## Styling

Use rsuite components (Table, Modal, Button, Checkbox, CheckboxGroup, Input) consistent with the existing controller UI. Admin-specific styles in `AdminPortal.css`.

The admin portal does not use the match/scoreboard theme system -- it has its own simple styling.

## Files affected

- `clock/src/admin/` -- all new files listed above
- `clock/src/firebase.ts` -- export `functions` instance (see spec 003)
- `clock/src/controller/Controller.tsx` -- add red admin button (see spec 004)

## Admin button in Controller.tsx

When `isAuthenticated && !listenPrefix && isAdmin`, render above the screen selector buttons:

```tsx
<Link to="/admin" className="admin-portal-button">
  Stjornbord
</Link>
```

Styled as a red rsuite-like button. Plus an admin badge indicator (small "Admin" text label near the user's email/logout area).

## Testing

1. Admin portal renders for admin users at `/admin`
2. User table displays all Firebase Auth users with their screen mappings
3. Editing user locations calls Cloud Function and updates in real-time
4. Invitation table displays pending invitations
5. Creating an invitation calls Cloud Function and appears in table
6. Deleting an invitation removes it from the table
7. Email validation prevents invalid submissions
8. Non-admin access to `/admin` shows access denied

## Acceptance criteria

1. Admin can view all registered users and their screen mappings
2. Admin can modify any user's screen access via the UI
3. Admin can create, edit, and delete invitations for future users
4. All changes are reflected in real-time via Firebase subscriptions
5. UI is in Icelandic, consistent with the rest of the app
6. Red admin button + admin badge appear for admin users on the screen selector
