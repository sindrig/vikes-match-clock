# Local frontend, API and Firebase quickstart

Use this path in any fresh checkout or worktree for credential-free development.
The frontend, Python API and Firebase emulators are separate processes. Keep
their terminals open and stop only processes you started. No direnv, AWS login,
Firebase login, service account or staging account is needed.

For frontend SDK preparation, complete steps 1–2. Continue through steps 3–6
for the full browser journey. API health alone needs the Python setup/server
in step 5 and the health request in step 6.

Read the scoped [Clock](../clock/AGENTS.md), [API](../clock-api/v3/AGENTS.md)
and [Functions](../functions/AGENTS.md) guides for subsystem work. The
[environment contract](environment.md) owns target selection and credential
loaders; [API preparation](api-client-preparation.md) owns generated-code and
schema changes; [testing](clock/testing.md) owns test fixtures and isolation.

## 1. Check prerequisites and choose this checkout

Use Bash, Git, curl, **Node 22 (22.12 or newer)** and Corepack. Full emulator
work also needs **Java 21**, Firebase CLI (**15.34.2** was used for verification),
and native `sharp` support for this OS/architecture. API work needs **Python
3.12**, `venv` and pip. Set `PYTHON` to your Python 3.12 executable if it is not
named `python3.12`. Browser automation additionally needs Playwright Chromium
and its host libraries; tmux is needed only for the optional persistent helper.
Install those host prerequisites before continuing.

From the **repository root**:

```bash
export VIKES_REPO="$(git rev-parse --show-toplevel)"
node --version
corepack --version
java -version
firebase --version
export PYTHON="${PYTHON:-python3.12}"
"$PYTHON" --version
```

For frontend generation/build alone, omit the Java, Firebase and Python checks.
The versions above describe this recipe, not new package-manager pins. Clock
uses pnpm 10; Functions has no version pin and retains both lockfiles and
npm-based CI. Use pnpm locally; do not rewrite those locks or CI to follow this
guide. First-time installs require network/package registry access.

Use a separate terminal per service. In each terminal set `VIKES_REPO` to the
same absolute checkout path and repeat the following **repository-root** shell
setup (including before installations). It keeps Corepack shims and package
caches in this checkout and makes nested `pnpm` scripts work without system
shim changes:

```bash
cd "$VIKES_REPO"
export COREPACK_HOME="$VIKES_REPO/node_modules/.cache/quickstart/corepack"
export COREPACK_ENABLE_AUTO_PIN=0
export npm_config_cache="$VIKES_REPO/node_modules/.cache/quickstart/npm"
export PIP_CACHE_DIR="$VIKES_REPO/node_modules/.cache/quickstart/pip"
export XDG_CONFIG_HOME="$VIKES_REPO/node_modules/.cache/quickstart/config"
mkdir -p "$VIKES_REPO/node_modules/.cache/quickstart/bin"
corepack enable --install-directory "$VIKES_REPO/node_modules/.cache/quickstart/bin" pnpm
corepack install --global pnpm@10.34.9
export PATH="$VIKES_REPO/node_modules/.cache/quickstart/bin:$PATH"
```

Here `--global` selects pnpm within the explicitly isolated `COREPACK_HOME`.
It does not establish a Functions/repository-wide pin. Do not borrow another
worktree's `node_modules`, generated SDK or compiled Functions.

## 2. Install Clock and generate its SDK first

**Working directory: `clock/`**:

```bash
cd "$VIKES_REPO/clock"
corepack pnpm@10.34.9 install --frozen-lockfile --store-dir "$VIKES_REPO/node_modules/.cache/quickstart/pnpm"
corepack pnpm@10.34.9 run generate-api-client
test -f src/api/client/index.ts
```

Generation reads committed `clock-api/v3/openapi.json`; it needs neither
Python, AWS nor a running API. `start` and `build` also generate before
Vite/TypeScript, while standalone lint/tests/type checks need this preparation.
`clock/src/api/client/` is **ignored generated output: never edit or commit it**.
For API contract changes, follow [schema export order](api-client-preparation.md#contract-changes).

## 3. Prepare and start all four Firebase emulators

**Working directory: `functions/`**, Node 22:

```bash
cd "$VIKES_REPO/functions"
corepack pnpm@10.34.9 install --frozen-lockfile --store-dir "$VIKES_REPO/node_modules/.cache/quickstart/pnpm"
corepack pnpm@10.34.9 build
test -f lib/index.js
```

Functions loads compiled `functions/lib/index.js`, not TypeScript source.
Rebuild after editing Functions. Keep the retained scorer export, `sharp`,
rules and media under the [#241 rollout hold](web-only-perimeter-rollout.md).

In the **emulator terminal, repository root**:

```bash
cd "$VIKES_REPO"
unset FIREBASE_TOKEN GOOGLE_APPLICATION_CREDENTIALS
firebase emulators:start --only auth,database,storage,functions --project vikes-match-clock-test
```

No login is required. The CLI may download emulator runtimes/UI on first use.
Unauthenticated/Admin SDK configuration warnings can appear; use the readiness
checks and real callable below rather than logging in to silence them.
Auth/Database alone cannot qualify uploads or callables. Check that these ports
are available before starting; if another process owns one, coordinate with its
owner. The app's emulator endpoints are fixed, so changing only CLI ports will
not move the browser connections.

| Process                     | Port                   | Browser target / role                                    |
| --------------------------- | ---------------------- | -------------------------------------------------------- |
| Frontend                    | **4600**               | `http://localhost:4600/`                                 |
| Python API                  | **8000**               | `http://localhost:8000/v3/health`                        |
| Auth emulator               | **9099**               | `127.0.0.1`                                              |
| Realtime Database emulator  | **9000**               | `127.0.0.1`, namespace `vikes-match-clock-test`          |
| Storage emulator            | **9199**               | `127.0.0.1`, bucket `vikes-match-clock-test.appspot.com` |
| Functions emulator          | **5001**               | `127.0.0.1`, `us-central1`                               |
| Emulator UI / hub / logging | 4000 / 4400 / **4500** | Diagnostics / CLI discovery / CLI-reserved logging       |

In a **second terminal, repository root**, load the committed rules into the
namespace the app actually uses, then read them back. Do not assume rules in
the CLI's `*-default-rtdb` namespace also apply here. `Bearer owner` is the
local emulator's administrative bypass for this bootstrap, never a browser or
cloud credential. These commands deliberately use literal loopback URLs:

```bash
cd "$VIKES_REPO"
mkdir -p .dev-server
curl --fail --silent --show-error --max-time 10 -X PUT \
  -H 'Authorization: Bearer owner' -H 'Content-Type: application/json' \
  --data-binary @firebase-rules.json \
  'http://127.0.0.1:9000/.settings/rules.json?ns=vikes-match-clock-test'
curl --fail --silent --show-error --max-time 10 \
  -H 'Authorization: Bearer owner' \
  'http://127.0.0.1:9000/.settings/rules.json?ns=vikes-match-clock-test' \
  -o .dev-server/rules-readback.json
node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
assert.deepEqual(
  JSON.parse(readFileSync(".dev-server/rules-readback.json", "utf8")),
  JSON.parse(readFileSync("firebase-rules.json", "utf8")),
);
console.log("App namespace rules match the committed rules");
NODE
```

Check **each** service; a hub/UI banner alone is insufficient:

```bash
# Working directory: repository root. Auth: 200 and JSON configuration.
curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:9099/emulator/v1/projects/vikes-match-clock-test/config
# Database: 200 and a JSON value (null is valid before seeding).
curl --fail --silent --show-error --max-time 10 \
  'http://127.0.0.1:9000/locations.json?ns=vikes-match-clock-test'
# Storage: expect HTTP 403 for unauthenticated private object listing.
curl --silent --show-error --max-time 10 --write-out '\nHTTP %{http_code}\n' \
  http://127.0.0.1:9199/v0/b/vikes-match-clock-test.appspot.com/o
# Functions: expect HTTP 401 and JSON error status UNAUTHENTICATED.
curl --silent --show-error --max-time 60 --write-out '\nHTTP %{http_code}\n' \
  -H 'Content-Type: application/json' --data '{"data":{}}' \
  http://127.0.0.1:5001/vikes-match-clock-test/us-central1/listUsers
```

Wait/retry if a service is still starting. Unexpected status, a missing callable
or a Functions load error is a setup failure; inspect the emulator terminal.
The expected denials above establish readiness, not successful authenticated
operations or complete authorization coverage.

## 4. Seed a synthetic local operator and venue

With the four emulators ready, run from the **repository root**. This touches
only the named local account, grants and `quickstart-257` venue/state. It does
not clear the database. Re-running resets that fixture's state. Both team IDs
are `-1` (manual teams), and the initial view is Match, so this journey needs no
live match/weather lookup. Idle fetches weather automatically; leave it unselected
for this isolated journey.

```bash
cd "$VIKES_REPO"
node --input-type=module <<'NODE'
import assert from "node:assert/strict";
const account = {
  email: "quickstart@example.test",
  password: "local-test-only-257",
  returnSecureToken: true,
};
async function authCall(action) {
  return fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${action}?key=test-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account),
    signal: AbortSignal.timeout(10000),
  });
}
let response = await authCall("signUp");
let user = await response.json();
if (user.error?.message === "EMAIL_EXISTS") {
  response = await authCall("signInWithPassword");
  user = await response.json();
}
assert.ok(response.ok && typeof user.localId === "string", "Local Auth account setup failed");
async function put(path, value) {
  const response = await fetch(`http://127.0.0.1:9000/${path}.json?ns=vikes-match-clock-test`, {
    method: "PUT",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(10000),
  });
  assert.ok(response.ok, `Local seed failed: ${path} (${response.status})`);
}
await put(`admins/${user.localId}`, true);
await put(`auth/${user.localId}/quickstart-257`, true);
await put("locations/quickstart-257", {
  label: "Local quickstart",
  screens: [{ name: "Display 1" }],
});
await put("states/quickstart-257", {
  match: {
    homeScore: 0, awayScore: 0, started: 0, timeElapsed: 0,
    halfStops: [45, 90, 105, 120], homeTeam: "Local home", awayTeam: "Local away",
    homeTeamId: -1, awayTeamId: -1, injuryTime: 0, matchType: "football",
    home2min: [], away2min: [], timeout: 0, homeTimeouts: 0, awayTimeouts: 0,
    buzzer: false, countdown: false, injuryTimeDisplayMode: "full",
  },
  controller: {
    queues: {}, activeQueueId: null, playing: false, assetView: "assets",
    view: "match", roster: { home: [], away: [] }, currentAsset: null, refreshToken: "",
  },
  view: {
    vp: { style: { height: 1080, width: 1920 }, name: "1080p", key: "local" },
    background: "Default",
  },
});
console.log("Local operator ready:", user.localId);
NODE
```

## 5. Start the local API and frontend on different ports

Prepare an owned virtual environment from the **repository root**:

```bash
cd "$VIKES_REPO"
"$PYTHON" -m venv .venv
.venv/bin/python -m pip install -r clock-api/v3/requirements-dev.txt
```

In the **API terminal, `clock-api/v3/`**:

```bash
cd "$VIKES_REPO/clock-api/v3"
"$VIKES_REPO/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In the **frontend terminal, `clock/`**, with the shell setup from step 1:

```bash
cd "$VIKES_REPO/clock"
VITE_USE_EMULATOR=true PORT=4600 corepack pnpm@10.34.9 start --strictPort
```

`--strictPort` prevents silently switching ports. Plain Vite/Playwright still
default to 3000; this recipe and the persistent helper use **4600**, leaving
**8000** for the API and **4500** for Firebase CLI logging. There is no Vite API
proxy. The API uses an actual
`APIRouter(prefix="/v3")`, not a `root_path` mount; the SDK already includes
`/v3` in endpoint paths, so its configured base URL ends at port 8000 `/`.

Health does not access AWS. Live KSI/weather features may fetch SSM keys and
contact upstreams; they are outside this credential-free journey. Follow
[API access](environment.md#api-secrets) or use explicitly mocked API tests for
that separate work.

Before reusing a Vite process, inspect how it was started. **Stop/start your
own staging-connected server** with emulator selection; a new port or worktree
does not select Firebase. For the optional persistent helper, generate first,
then from the **repository root**:

```bash
cd "$VIKES_REPO"
bash scripts/dev-server.sh status 4600
# If this worktree/port is yours, stop it before changing its environment:
bash scripts/dev-server.sh stop 4600
VITE_USE_EMULATOR=true bash scripts/dev-server.sh start 4600
# After verification:
bash scripts/dev-server.sh stop 4600
```

`status` exits 1 when stopped. Do not start this alternative while the foreground
frontend already owns 4600. The helper owns only its physical worktree/port;
it cannot stop manually launched servers. See [dev-server skill](../.opencode/skills/dev-server/SKILL.md)
for lifecycle details. **Restart OpenCode after pulling skill changes.**

## 6. Verify rendered behavior, upload and a callable

From any terminal, check actual API JSON:

```bash
curl --fail --silent --show-error --max-time 10 http://localhost:8000/v3/health
```

Expect `{"status":"ok"}`, not the Vite HTML shell. In a fresh browser profile
at `http://localhost:4600/`:

1. Confirm the rendered screen selector and `Innskrá` form. Log in with
   `quickstart@example.test` / `local-test-only-257`; choose `Local quickstart`.
   Confirm the `Biðröð`/`Stillingar` controls, not just an HTML title.
2. Open `Myndefni` → `Myndir`. Upload a small PNG/JPG/GIF. Confirm its thumbnail
   and successful Storage request on port 9199; inspect the object under
   `quickstart-257/images/` in Emulator UI → Storage. This must transfer bytes,
   not merely open a file picker.
3. Navigate to `http://localhost:4600/admin`. Confirm the users table includes
   the synthetic account and a successful JSON `listUsers` callable response
   from port 5001. That checks Auth, the local admin grant and the real callable.
4. Inspect console errors and failed requests. No authenticated shared-staging
   action is part of this path. Record what actually passed; shell HTTP, mocked
   tests and static titles do not establish this browser journey.

The HTML also requests Google Fonts and optional Raven/Google API scripts.
An offline browser or a runner blocking external requests can report those
failures while the local journey works; record them separately from unexpected
module, Firebase or local API failures. Do not substitute responses for Auth,
Database, Storage or Functions when qualifying this flow.

The emulators' state is ephemeral unless you explicitly import/export it.
Stop foreground services with Ctrl-C in their own terminals. Stop helper-owned
Vite with its scoped `stop 4600` command; never kill by port/process name.

## Remote hosts, preview and other tasks

Read the authoritative [Firebase selection table](environment.md#firebase-selection)
and [API routing explanation](environment.md#credential-free-frontend-and-emulator-work)
before changing the URL/mode. Emulator mode switches **Firebase only**. All
emulator addresses are browser loopback `127.0.0.1`; for a remote dev machine,
forward the frontend, API and four emulator ports to the browser machine and
open `http://localhost:4600/`. A devpod/custom hostname chooses the **production
API**, even when Firebase uses emulators; `allowedHosts` is not a routing override.

Default development selects shared staging Firebase; a default production build
previewed on localhost selects production Firebase. For an isolated preview,
from **`clock/`**, build first with selection compiled in:

```bash
cd "$VIKES_REPO/clock"
VITE_USE_EMULATOR=true corepack pnpm@10.34.9 build
corepack pnpm@10.34.9 preview --host 127.0.0.1 --port 4600 --strictPort
```

Stop the existing frontend before binding preview to 4600. Preview-time
environment or `--mode` does not rewrite compiled selection; localhost still
selects the separate API on 8000. A preview verifies a built bundle, not Vite
development transforms. Use [Clock testing](clock/testing.md) for focused
checks/Chromium installation, [API preparation](api-client-preparation.md) for
offline schema tests, and [manual staging login](environment.md#shared-staging-login)
only with separate maintainer-approved access.
