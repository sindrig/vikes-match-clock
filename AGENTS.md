# Vikes Match Clock

A match clock application for Víkingur football club stadiums. Displays match information, time, and weather on stadium screens.

## Project Structure

- **clock/**: React app - match clock display and control interface (see `clock/AGENTS.md` for details)
- **clock-api/**: Python lambdas for match reports and weather
- **admin/**: Nuxt.js admin interface for match control (newer alternative to clock's controller)
- **infra/**: Terraform infrastructure configuration
```
├── clock/              # React frontend application
├── clock-api/          # Python Lambda functions
│   ├── match-report/   # Fetches match data
│   ├── match-report-v2/# Updated match report API
│   └── weather/        # Weather forecast API
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
- **Backend**: Python 3.12 Lambda functions
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
