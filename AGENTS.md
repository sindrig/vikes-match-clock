# Vikes Match Clock

A match clock application for Víkingur football club stadiums. Displays match information, time, and weather on stadium screens.

## Project Structure

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
| Staging | staging.irdn.is | clock-api-staging.irdn.is | PRs with `sandbox-deploy` label |

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
- **Clock (JS/React)**: PropTypes required, Redux actions/reducers pattern, ESLint airbnb-style with Prettier
- **Python**: Black formatter (79 char line length, skip string normalization per pyproject.toml)
- **Imports**: Group by external packages, then internal modules; alphabetize within groups
- **Naming**: camelCase (JS/TS), PascalCase (components), snake_case (Python)
- **Error handling**: Use try/catch for async operations, validate Firebase responses
