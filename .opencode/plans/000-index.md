# Issue #135: Authz Management Portal -- Spec Index

## Overview

Build an authorization management portal inside the clock/ React app that lets admins:
1. Map users to screens (which locations each user can control)
2. Pre-invite users by email so they get screen access on signup
3. List all registered Firebase Auth users alongside their RTDB screen mappings

## Architecture decisions (confirmed with user)

| Decision | Choice |
|----------|--------|
| Portal location | Inside clock/ app with react-router-dom |
| Auth write strategy | Firebase rules with `admins` RTDB node |
| Invitation mechanism | Firebase Cloud Function (Auth onCreate trigger) |
| Cloud Function deployment | Firebase CLI deploy in CI (GitHub Actions) |
| Admin scope | Screen mappings + Firebase Auth user listing |
| Admin write path | Cloud Function (adminWrite) -- not client-side rules |
| User listing | Firebase Auth via Cloud Function (all registered users) |
| Invitation display | Separate section below active user mappings |
| Admin UI entry | Red button + admin badge |

## Spec files

| # | File | Summary |
|---|------|---------|
| 001 | [001-firebase-schema-changes.md](001-firebase-schema-changes.md) | New RTDB nodes: `admins/` and `invitations/` |
| 002 | [002-firebase-security-rules.md](002-firebase-security-rules.md) | Updated `firebase-rules.json` for admin read access |
| 003 | [003-firebase-cloud-functions.md](003-firebase-cloud-functions.md) | Three Cloud Functions: onUserCreate, listUsers, adminWrite |
| 004 | [004-react-router-integration.md](004-react-router-integration.md) | Add react-router-dom, `/admin` route |
| 005 | [005-admin-detection-context.md](005-admin-detection-context.md) | `isAdmin` state in LocalStateContext |
| 006 | [006-admin-portal-ui.md](006-admin-portal-ui.md) | Admin portal: user table, invitation table, modals |
| 007 | [007-cicd-cloud-functions.md](007-cicd-cloud-functions.md) | CI/CD for function + rules deployment |
| 008 | [008-testing-plan.md](008-testing-plan.md) | Unit, integration, and E2E test plan |

## Implementation order

1. **Spec 001 + 002**: Schema + rules (foundational, no code dependencies)
2. **Spec 003**: Cloud Functions (depends on schema)
3. **Spec 005**: Admin detection context (depends on schema)
4. **Spec 004**: Router integration (depends on admin detection)
5. **Spec 006**: Admin portal UI (depends on everything above)
6. **Spec 007**: CI/CD (can be done in parallel with 004-006)
7. **Spec 008**: Tests (runs throughout, finalized last)

## Key files modified (existing)

- `firebase-rules.json` -- security rules update
- `firebase.json` -- add functions config + emulator
- `.firebaserc` -- add project aliases
- `clock/package.json` -- add react-router-dom
- `clock/src/firebase.ts` -- export functions instance, connect emulator
- `clock/src/index.tsx` -- wrap in BrowserRouter, define routes
- `clock/src/contexts/LocalStateContext.tsx` -- add isAdmin state
- `clock/src/controller/Controller.tsx` -- add admin button
- `.github/workflows/build.yml` -- add function + rules deploy jobs
- `clock/e2e/fixtures/test-helpers.ts` -- add admin/invitation test helpers

## Key files created (new)

- `functions/` -- entire Cloud Functions directory
- `clock/src/admin/` -- entire admin portal directory
