# Agent Guidelines for vikes-match-clock

## Project Structure

- **clock/**: React app - match clock display and control interface (see `clock/AGENTS.md` for details)
- **clock-api/**: Python lambdas for match reports and weather
- **admin/**: Nuxt.js admin interface for match control (newer alternative to clock's controller)
- **infra/**: Terraform infrastructure configuration

## Build/Test Commands

- **Clock (React)**: `cd clock && pnpm start` (dev), `pnpm build` (build), `pnpm test` (all), `pnpm test:watch` (watch), `CI=true pnpm test -- path/to/file.spec.js` (single)
- **Lint**: `cd clock && pnpm lint` (ESLint), `pnpm format-check` (Prettier check), `pnpm format` (Prettier fix)
- **Admin (Nuxt)**: `cd admin && pnpm dev` (dev), `pnpm build` (build), `pnpm test` (tests)

## Code Style

- **Package manager**: pnpm only (enforced by preinstall hook)
- **Formatting**: Prettier (2 spaces, semi, double quotes). Format before committing
- **Clock (TypeScript/React)**: React Context for state management, Firebase for sync. ESLint airbnb-style with Prettier
- **Python**: Black formatter (79 char line length, skip string normalization per pyproject.toml)
- **Imports**: Group by external packages, then internal modules; alphabetize within groups
- **Naming**: camelCase (JS/TS), PascalCase (components), snake_case (Python)
- **Error handling**: Use try/catch for async operations, validate Firebase responses

## Architecture Notes

### Firebase State Sync (clock/)
- **Single source of truth**: Firebase is authoritative for all synced state
- **Optimistic updates**: Update local state immediately, then sync to Firebase
- **Hydration guards**: Block writes until first Firebase snapshot received
- **Type-safe parsing**: All Firebase snapshots validated through `firebaseParsers.ts`

### Multi-Controller Support
- Multiple controllers can connect to the same `listenPrefix`
- Uses **last-write-wins** semantics (no conflict resolution)
- Coordinate with team to avoid simultaneous edits in production

## Testing Patterns

### Unit Tests
- Vitest for React component and utility tests
- Mock Firebase with `vi.mock("firebase/database", ...)`
- Use `@testing-library/react` for component testing

### E2E Tests
- Playwright for browser automation
- `TEST_CREDENTIALS` env var for authentication (format: `EMAIL;PASSWORD`)
- Multi-session testing requires manual testing or Cypress (Playwright MCP limitations)
