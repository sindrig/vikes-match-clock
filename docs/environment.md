# Environment and credential contract

Choose the access needed for the task. A checkout, worktree, frontend build,
or missing credential file does not authorize provisioning infrastructure or
accessing shared services. Paths below are relative to the current worktree
unless explicitly chosen by the operator.

| Task                                            | Credentials and loader                                                                                    | Boundary                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend generation, build, lint and unit tests | None; Node/pnpm read the committed OpenAPI schema                                                         | See [API preparation](api-client-preparation.md). Building does not log in; browser targets depend on [compiled mode and hostname](#firebase-selection). |
| Local Firebase emulator development/E2E         | None; pass `VITE_USE_EMULATOR=true` at Vite startup/build time or to Playwright                           | Uses the test Firebase project and local services. Fixtures create synthetic test accounts.                                                              |
| Shared staging browser login                    | Maintainer-provided staging account; browser tooling may read shell `TEST_CREDENTIALS` (`EMAIL;PASSWORD`) | Separate permission from AWS/API access. Coordinate venue and `listenPrefix` before authenticated actions.                                               |
| API schema export, health and mocked tests      | None; isolated Python environment                                                                         | Real match/weather requests require the API access described below.                                                                                      |
| Live API match/weather requests                 | AWS SDK credential chain with access to the required SSM parameters                                       | The API process fetches keys lazily from SSM; it does not load keys from dotenv.                                                                         |
| AWS staging upload/deployment                   | Approved AWS CLI credentials plus staging bucket/distribution metadata                                    | CI uses OIDC. A manual operator supplies an existing session/profile or approved credential file.                                                        |
| Gateway daemon/hardware                         | Operator-supplied Firebase service account, optional overlay SSH key and Vnnox credential                 | Separate host installation and hardware authorization; never required for frontend/emulator work.                                                        |

## Loaders and file formats

- **Shell:** Bash examples use `export NAME="value"` or a command-local
  `NAME=value command`. A sourced file is executable Bash; source only an
  operator-selected, trusted file. Quote values containing spaces or `;`.
- **direnv (optional):** the root `.envrc` adds worktree tool paths and calls
  `dotenv_if_exists .envrc-local`. Copy [the placeholder example](../.envrc-local.example)
  to the ignored `.envrc-local` in this worktree if needed, enable only the
  entries for the task, and use `direnv allow`. That file uses **dotenv**
  `NAME=value` syntax, not shell commands or `source`. Other worktrees' files
  are not discovered or loaded automatically. Without direnv, the root
  `.envrc` and `.envrc-local` are not loaded by these tools.
- **Vite:** inherits shell variables and automatically loads `.env` / `.env.local`
  and mode-specific dotenv files from `clock/`. `VITE_*` values are public
  browser build inputs; never put credentials there. Vite does not load the
  root `.envrc-local`. Mode and environment values are compiled into built
  assets. Restart the development server after changing selection; an existing
  tmux dev-server session retains its startup environment. Rebuild assets to
  change their compiled selection: `pnpm preview`, its `--mode` option, and
  environment variables set only at preview time do not rewrite the bundle.
- **AWS:** CLI and boto3 use their standard credential chains (for example
  `AWS_PROFILE` referring to an already configured profile, or approved
  exported session credentials). Terraform configuration is not a credential
  loader. No repository setup step performs an implicit AWS login.
- **Gateway:** systemd loads `/etc/perimeter-control/perimeter-control.env`
  through `EnvironmentFile=`. It uses `NAME=value` entries without `export`;
  this is systemd environment syntax, not executable Bash. The Node daemon
  inherits these variables and reads the configured credential files. It
  does not load `.envrc-local` or dotenv itself.

Keep credential-bearing files in ignored `.secrets/`, ignored `.envrc-local`,
or an operator-managed location outside the checkout. Do not print, commit,
or attach their contents. The examples contain placeholders only; retrieve
actual access through the project maintainer or the organization's existing
credential store. If access is unavailable, report the missing capability.

The previous `layout_python` and `aws-sso-login` integration remains available
for operators who already use it. It is disabled by default. Install/configure
the relevant helper in the direnv environment, then opt in with
`VIKES_USE_LAYOUT_PYTHON=1` and/or `VIKES_USE_AWS_SSO_LOGIN=1` in `.envrc-local`
or the invoking shell. SSO also requires an explicit approved `AWS_PROFILE`.
The SSO opt-in can initiate login when direnv evaluates `.envrc`; enable it
only when that action is intended. Portable tasks need neither helper.

## Credential-free frontend and emulator work

Use [API preparation](api-client-preparation.md) for dependency/tool setup;
Python and AWS are unnecessary for the frontend. No credential file or direnv
is required for generation/build/lint/unit tests.

### Firebase selection

[firebase.ts](../clock/src/firebase.ts) selects Firebase in this order:

| Compiled input                                         | Browser hostname                                          | Firebase target                            |
| ------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------ |
| `VITE_USE_EMULATOR` is exactly `true`                  | Any                                                       | Local emulators (`vikes-match-clock-test`) |
| Otherwise, Vite `MODE` is anything except `production` | Any                                                       | Shared staging                             |
| Otherwise, Vite `MODE` is `production`                 | `staging-klukka.irdn.is`                                  | Shared staging                             |
| Otherwise, Vite `MODE` is `production`                 | Any other hostname, including `localhost` and `127.0.0.1` | Production                                 |

The default `pnpm start` development server uses mode `development`, so it
targets shared staging unless emulator mode is enabled at startup. Default
`pnpm build` uses mode `production`: serving that build locally with
`pnpm preview` targets production Firebase unless emulator mode was compiled
in. Build with `VITE_USE_EMULATOR=true pnpm build` for an emulator preview;
setting the flag or changing `--mode` only when starting preview is too late.
The hostname check happens in the browser; the mode and emulator flag come
from development-server startup or the build, not the preview environment.

For Firebase emulator work, start the required local services with the test
project `vikes-match-clock-test`, then start Vite from `clock/`:

```bash
# Bash, working directory: clock/. Emulator services must already be running.
VITE_USE_EMULATOR=true PORT=4500 pnpm start
# Or, with services running, let Playwright start Vite on that port:
VITE_USE_EMULATOR=true PORT=4500 pnpm e2e
```

See [the emulator configuration](../firebase.json), [Docker service](../docker-compose.yml),
and [clock guidance](../clock/AGENTS.md#firebase-emulator). Auth (9099), Database
(9000), Storage (9199) and Functions (5001) are separate local services; start
those required by the feature. Neither a live staging login nor Firebase CLI
login is required for local emulators. E2E fixtures target local emulator
endpoints and seed their own users/data; `TEST_CREDENTIALS` is not their login
source. Never point those fixtures at shared Firebase.

`VITE_USE_EMULATOR` changes Firebase only. The match/weather API is selected
separately by [apiConfig.ts](../clock/src/apiConfig.ts): `localhost` and
`127.0.0.1` use `http://localhost:8000/`, the staging hostname uses the staging
API, and other hostnames use production. For isolated work, mock API requests
as the tests do, or run a deliberately configured local API. Firebase emulator
mode alone does not provide match/weather API data or isolate other network
requests. Use a different frontend port (for example 4500) when the API owns
8000; the workspace helper also defaults to 8000 unless given an explicit port.

## Shared staging login

Ask a project maintainer for an authorized staging account and the approved
retrieval location. Do not assume credentials exist in a main worktree or a
specific home directory. If browser automation expects `TEST_CREDENTIALS`,
load it explicitly into that runner's shell or via optional direnv, using the
quoted placeholder format in `.envrc-local.example`. Presence can be checked
in Bash without exposing the value:

```bash
: "${TEST_CREDENTIALS:?Retrieve staging browser access from a project maintainer.}"
```

This checks only that the variable is nonempty, not credential validity.
Use separate browser contexts/profiles for independent sessions; staging
subpaths share Firebase and same-origin storage. The default Vite development
server targets shared staging unless emulator mode is enabled at startup;
a production build previewed locally targets production unless emulator mode
was compiled in. Check [Firebase selection](#firebase-selection) before login.

## API secrets

The v3 API's [dependencies](../clock-api/v3/app/dependencies.py) read, with
decryption, `/vikes-match-clock/ksi-api-key/{team_id}` and
`/vikes-match-clock/weather-api` from AWS SSM in `eu-west-1` on the first live
request needing a key. Ask the maintainer for an approved AWS profile/session
with `ssm:GetParameter` on the necessary parameters and any required KMS
decrypt permission. Export/select that profile in the shell launching the
API. Arbitrary `KSI_API_KEY` or weather-key dotenv variables are not consumed.
Do not retrieve or print keys just to validate setup. Without access, use
mocked tests, schema export or health instead; see [API guidance](../clock-api/v3/AGENTS.md).

## Manual AWS staging operations

Ask the infrastructure maintainer for staging access and the current
`STAGING_BUCKET` / `CLOUDFRONT_DISTRIBUTION_ID` metadata. Use the existing
approved AWS session/profile workflow; access already exported in the shell
needs no file. If an operator chooses a file, this is a **Bash** example of
its format (replace placeholders before use):

```bash
# Trusted Bash file at an operator-chosen path, e.g. .secrets/staging-deploy.sh.
export AWS_PROFILE="REPLACE_WITH_APPROVED_PROFILE"
export AWS_DEFAULT_REGION="eu-west-1"
export STAGING_BUCKET="REPLACE_WITH_STAGING_BUCKET"
export CLOUDFRONT_DISTRIBUTION_ID="REPLACE_WITH_STAGING_DISTRIBUTION_ID"
```

The caller explicitly selects and loads it in the same shell as the AWS
commands. This does not log in or prove permission:

```bash
export VIKES_STAGING_ENV_FILE="$PWD/.secrets/staging-deploy.sh"
source "${VIKES_STAGING_ENV_FILE:?Choose a trusted staging Bash environment file.}" || { echo "Could not load the selected staging Bash file." >&2; exit 1; }
: "${STAGING_BUCKET:?Obtain the staging bucket from the infrastructure maintainer.}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?Obtain the staging distribution ID from the infrastructure maintainer.}"
```

Use [the staging skill](../.opencode/skills/deploy-staging/SKILL.md) only for
authorized uploads/deployments. Missing/expired credentials or denied access
mean stop the operation and obtain the correct access; they do not imply
`terraform apply` in any stack. CI's AWS deployment jobs use GitHub OIDC;
this does not describe all local credentials or Firebase authentication.

`infra/devpod-creds/` is a **legacy, specialized operator provisioning path**.
It creates an IAM user and static access key, writes a sensitive local Bash
file, and copies it over SSH to a specific Devpod host/user/path. It is kept
for existing authorized operators; ordinary checkouts and worktrees do not
need it. Applying it requires deliberate infrastructure authorization, AWS
IAM/state access and SSH access to that configured host. It is not an access
recovery or general bootstrap step. See [infrastructure guidance](../infra/AGENTS.md).

## Gateway access

Gateway credentials are independent of staging browser and AWS deploy access.
Ask the gateway/project maintainer for the approved Firebase service-account
file and, where used, overlay SSH key and current device login from the
existing credential store. Do not assume a vendor/default login or generate
replacement credentials as a missing-file fallback.

Follow [gateway installation/configuration](../perimeter-control/README.md#prerequisites)
only when host/service and hardware work is authorized. The installer takes
explicit credential file paths, installs them under `/etc/perimeter-control/`
and starts a daemon that can apply live state. For brightness, configure the
retrieved username and either `PERIMETER_VNNOX_PASSWORD_SOURCE=env` with
`PERIMETER_VNNOX_PASSWORD`, or `=file` with
`PERIMETER_VNNOX_PASSWORD_FILE` (first line read by the daemon). The systemd
environment example documents the remaining device identity requirements;
brightness stays disabled until opted in. Do not start the daemon to check
credential presence. Any credential previously exposed in documentation
needs a separate owner assessment; this contract does not rotate credentials.
