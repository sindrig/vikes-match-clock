# Agent Guidelines for vikes-match-clock

## Project Structure

- **clock/**: React app - match clock display and control interface
- **clock-api/**: Python lambdas for match reports and weather

## Build/Test Commands

- **Clock (React)**: `cd clock && pnpm start` (dev), `pnpm build` (build), `pnpm test` (all), `pnpm test:watch` (watch), `CI=true pnpm test -- path/to/file.spec.js` (single)
- **Lint**: `cd clock && pnpm lint` (ESLint), `pnpm format-check` (Prettier check), `pnpm format` (Prettier fix)

## Code Style

- **Package manager**: pnpm only (enforced by preinstall hook)
- **Formatting**: Prettier (2 spaces, semi, double quotes). Format before committing
- **Clock (JS/React)**: PropTypes required, Redux actions/reducers pattern, ESLint airbnb-style with Prettier
- **Python**: Black formatter (79 char line length, skip string normalization per pyproject.toml)
- **Imports**: Group by external packages, then internal modules; alphabetize within groups
- **Naming**: camelCase (JS/TS), PascalCase (components), snake_case (Python)
- **Error handling**: Use try/catch for async operations, validate Firebase responses
