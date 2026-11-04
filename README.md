# Vikes Match Clock

Match information, clocks, weather and media for Víkingur stadium screens.
The operator controller, administration and public displays share one React app.

## Project map

| Unit                 | What runs                                                                                            | Start here                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `clock/`             | React/Vite scoreboard, match controller and browser perimeter renderer                               | [Clock guide](clock/AGENTS.md)                               |
| `clock/src/admin/`   | React administration inside Clock: users, invitations, venues and mapping                            | [Admin guide](clock/src/admin/AGENTS.md)                     |
| `clock-api/v3/`      | Python 3.12 FastAPI match/weather API; one AWS Lambda with Web Adapter                               | [API guide](clock-api/v3/AGENTS.md)                          |
| `functions/`         | Node 22 Firebase Functions: admin, invitations, audit retention; scorer backend retained for rollout | [Functions guide](functions/AGENTS.md)                       |
| `perimeter-control/` | Node >= 22 brightness-only gateway; Vnnox worker and optional sun/weather scheduler                  | [Gateway guide](perimeter-control/AGENTS.md)                 |
| `kiosk/`             | Rust/Tauri Windows wrapper for the hosted Clock, monitor persistence and reconnect                   | [Kiosk guide](kiosk/AGENTS.md)                               |
| `infra/`             | Terraform access, production and staging stacks; specialized legacy credential provisioning          | [Infrastructure guide](infra/AGENTS.md)                      |
| Root tooling         | Firebase emulators/rules, workspace server, CORS/deploy helpers and asset utilities                  | [Task index](docs/README.md), [asset tools](utils/README.md) |

## Local frontend

With Node 22.12+ and Corepack, from the repository root (the verified reference
version is 22.23.3):

```bash
cd clock
corepack pnpm@10.34.9 install --frozen-lockfile
corepack pnpm@10.34.9 build
```

This build needs no Python, AWS or live login. It prepares the ignored SDK
from the committed OpenAPI schema. Follow [API preparation](docs/api-client-preparation.md)
for standalone checks and API contract changes.

Before starting a browser, read the [environment contract](docs/environment.md).
Default development uses shared staging Firebase; a default production build
previewed locally uses production. Emulator selection must be set at startup
or build time. [Clock testing](docs/clock/testing.md) covers isolated services.

## Environments

| Environment | Frontend                 | Match/weather API           | Deployment trigger             |
| ----------- | ------------------------ | --------------------------- | ------------------------------ |
| Production  | `klukka.irdn.is`         | `clock-api.irdn.is`         | Push to `master`               |
| Staging     | `staging-klukka.irdn.is` | `clock-api-staging.irdn.is` | PR with `sandbox-deploy` label |

Workflows also deploy rules/Functions; kiosk releases have a separate tag
workflow. Inspect the [deployment task](docs/README.md#operations-and-platforms)
before authorized release work. The web-only frontend/gateway retirement is
merged; [#241 backend removal remains pending](docs/web-only-perimeter-rollout.md).

Use the [task and documentation index](docs/README.md) for feature work,
contracts, runbooks and update obligations. [Repository instructions](AGENTS.md)
apply throughout. Review captures belong in ignored `screenshots/`; see
[screenshot handling](docs/screenshots.md).

<a id="structure"></a>
<a id="clock"></a>
<a id="clock-api"></a>
<a id="v3"></a>

Earlier structure links now lead to the [project map](#project-map).
