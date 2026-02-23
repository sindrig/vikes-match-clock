# Vikes Match Clock

A match clock application for Víkingur football club stadiums. Displays match information, time, and weather on stadium screens.

## Project Structure

- **clock/**: React app - match clock display and control interface (see `clock/AGENTS.md` for details)
- **clock-api/**: Python Lambda API for match data and weather
- **admin/**: Nuxt.js admin interface for match control (newer alternative to clock's controller)
- **infra/**: Terraform infrastructure configuration
```
├── clock/              # React frontend application
├── clock-api/          # Python Lambda functions
│   └── v3/             # FastAPI API — match data + weather (see clock-api/v3/AGENTS.md)
├── infra/              # Terraform infrastructure (see infra/AGENTS.md)
└── .github/workflows/  # CI/CD pipelines
```

## Environments

| Environment | Frontend URL | API URL | Deployed From |
|-------------|--------------|---------|---------------|
| Production | klukka.irdn.is | clock-api.irdn.is | `master` branch |
| Staging | staging-klukka.irdn.is | clock-api-staging.irdn.is | PRs with `sandbox-deploy` label |

## Key Technologies

- **Frontend**: React (in `clock/` directory)
- **Backend**: Python 3.12 Lambda functions (FastAPI + Lambda Web Adapter)
- **Infrastructure**: Terraform with S3 backend
- **CI/CD**: GitHub Actions with OIDC authentication (no static AWS keys)
- **Real-time**: Firebase Realtime Database for screen state management

## Deployment

Deployments are automatic:

- Push to `master` → deploys to production
- Add `sandbox-deploy` label to PR → deploys to staging

The workflow uses OIDC to assume IAM roles, then fetches infrastructure details from Terraform outputs.

## Code Style

- **Package manager**: pnpm only (enforced by preinstall hook)
- **Formatting**: Prettier (2 spaces, semi, double quotes). Format before committing
- **Clock (TypeScript/React)**: React Context for state management, Firebase for sync. ESLint airbnb-style with Prettier
- **Python**: Black formatter (79 char line length, skip string normalization per pyproject.toml)
- **Imports**: Group by external packages, then internal modules; alphabetize within groups
- **Naming**: camelCase (JS/TS), PascalCase (components), snake_case (Python)
- **Error handling**: Use try/catch for async operations, validate Firebase responses

### ESLint Rules (CRITICAL)

**`eslint-disable` is not an acceptable fix.** Instead:
1. Fix the underlying code to satisfy the rule
2. If the rule is genuinely wrong for this codebase, discuss disabling it globally in eslint config
3. If you cannot fix without eslint-disable, STOP and ask for help

**Exception**: With explicit user approval AND documented justification, a one-off eslint-disable may be acceptable for genuine false positives. This should be rare.

Common fixable patterns:
- `@typescript-eslint/no-unnecessary-type-assertion` → Use lookup objects instead of template literal type assertions
- `@typescript-eslint/no-explicit-any` → Define proper types or use `unknown`
- `react-hooks/*` → Restructure effect dependencies properly

## Architecture Notes

### Firebase State Sync (clock/)
- **Single source of truth**: Firebase is authoritative for all synced state
- **No optimistic updates**: All state changes flow through Firebase subscriptions (write → Firebase → onValue → state)
- **No hydration guards**: 100% Firebase means no local state to hydrate
- **Type-safe parsing**: All Firebase snapshots validated through `firebaseParsers.ts`

### Team ID System (club-ids.ts ↔ KSI Analyticom API)

The match data pipeline depends on team IDs matching between the frontend and the KSI Analyticom API:

1. **`club-ids.ts`** maps team display names → KSI Analyticom IDs (e.g., `"Víkingur R": "2492"`)
2. **`updateMatch()`** in `FirebaseStateContext.tsx` resolves `homeTeamId`/`awayTeamId` from `club-ids.ts` when a team name is set
3. **`api.ts`** fetches lineups from the API, which returns players keyed by API team IDs: `{ [String(match.homeTeam.id)]: Player[], ... }`
4. **`TeamAssetController.tsx`** looks up players via `String(match.homeTeamId)` — if `club-ids.ts` has wrong IDs, this lookup silently returns nothing

**Name normalization**: The API sometimes returns team names with trailing dots (e.g., "Víkingur R.") while `club-ids.ts` stores them without. The `lookupClubId()` helper in `FirebaseStateContext.tsx` strips trailing dots as a fallback.

**Teams not in KSI** (combined teams, foreign clubs, national teams) have ID `"-1"` in `club-ids.ts`. They remain selectable but won't match API data.

**Authoritative source for IDs**: https://www.ksi.is/felagslid/adildarfelog/ — each team link contains `felag?id=XXXX`.

### Multi-Controller Support
- Multiple controllers can connect to the same `listenPrefix`
- Uses **last-write-wins** semantics (no conflict resolution)
- Coordinate with team to avoid simultaneous edits in production
- See `clock/AGENTS.md` for known limitations and edge cases

## Testing Patterns

### Unit Tests
- Vitest for React component and utility tests
- Mock Firebase with `vi.mock("firebase/database", ...)`
- Use `@testing-library/react` for component testing

### E2E Tests
- Playwright for browser automation
- `TEST_CREDENTIALS` env var for authentication (format: `EMAIL;PASSWORD`)
- Multi-session testing requires manual testing or Playwright test runner (Playwright MCP limitations)
