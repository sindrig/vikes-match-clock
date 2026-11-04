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

Follow the [local quickstart](docs/quickstart.md) for prerequisites, ignored SDK
generation, frontend **4600**, API **8000**, and all four Firebase emulators
with synthetic login, uploads and callable Functions. Frontend generation/build
needs no Python, AWS or live login.

The [environment contract](docs/environment.md) owns target selection: default
development uses shared staging Firebase, and a default production preview on
localhost uses production. Set emulator selection at startup/build time.

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
