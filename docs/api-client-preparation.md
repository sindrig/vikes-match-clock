# API client preparation

The tracked contract is `clock-api/v3/openapi.json`. The TypeScript SDK in
`clock/src/api/client/` is ignored, generated code. Do not edit or commit it.

## Frontend checkout

Follow the [local quickstart](quickstart.md) for prerequisite installation order,
explicit working directories, distinct frontend/API ports and isolated Firebase.
For SDK preparation alone, with Clock dependencies installed, from **`clock/`**:

```bash
corepack pnpm@10.34.9 run generate-api-client
```

`start` and `build` also run `pnpm run generate-api-client` before
Vite/TypeScript. Generation requires no Python, AWS configuration, or running API.
Package installation may need the package registry; generation reads only the
committed schema. Standalone lint/tests/type checks should be preceded by
`pnpm run generate-api-client` on a fresh checkout.

CI retains `make generate-ts-client` before lint/tests and uses the same
generator command. The manual `scripts/deploy-prod.sh` path calls `pnpm build`,
so it also prepares the client. Its deployment prerequisites and side effects
are unchanged; do not run it merely to test a build.

## Contract changes

With a Python 3.12 virtual environment containing
`clock-api/v3/requirements-dev.txt` and the frontend dependencies installed:

```bash
cd clock-api/v3
python export-openapi.py
python -m pytest tests/ -v
cd ../../clock
pnpm run generate-api-client
pnpm build
```

Review and commit the schema diff along with the API change. CI exports the
schema and checks `git diff --exit-code clock-api/v3/openapi.json` before SDK
generation. Frontend builds consume the committed schema rather than exporting
it themselves.

The offline export test can be run alone:

```bash
cd clock-api/v3
python -m pytest tests/test_openapi.py -v
```

It launches a fresh interpreter without inherited credentials or AWS config,
blocks AWS client/resource construction and outbound socket connections/DNS,
exports into a temporary directory, checks health, and compares the exported
schema byte for byte with the tracked contract. No AWS service is contacted.
Dependency tests separately check regional client reuse, team/weather key
caches, and recovery after failed construction or parameter lookups.

## Python tooling

The API runtime boundary is `clock-api/v3/requirements.txt`; local tests and
Black use `clock-api/v3/requirements-dev.txt`, which includes it. Use **Python
3.12** and an owned virtual environment as in the [quickstart](quickstart.md#5-start-the-local-api-and-frontend-on-different-ports).
The API's `.python-version` selects 3.12 for tools that recognize it. Root and
API Black configurations both target that version, with 79 columns and string
normalization disabled. The root `pyproject.toml` contains formatting policy
only; it does not define an installable application.

With GNU Make installed, from the **repository root** after installing the API
development requirements:

```bash
make api-format-check PYTHON=.venv/bin/python
# Optional; requires Node 22.12+ and pnpm on PATH:
make api-typecheck PYTHON=.venv/bin/python
```

Pass `PYTHON="/absolute/path/to/python"` for another owned environment; quote
paths containing spaces. The targets print the interpreter and reject versions
other than 3.12. Pyright resolves dependencies through that selected interpreter,
including when a different root `.venv` exists. Install the API requirements in
the selected environment; a different populated `.venv` does not supply them.
The format check
covers API `app/`, `tests/` and the exporter. The typecheck uses the Makefile's
pinned Pyright through `pnpm dlx` with one worker; its first invocation may need
the package registry. Root `pyrightconfig.json` checks API runtime `app/` and
`export-openapi.py` in basic mode, with unused-symbol errors. API tests remain
covered by pytest and Black; utilities and kiosk release scripts are outside
this typecheck. API tests, schema export and health do not require Node/pnpm.
These local targets are separate from CI's existing schema/client generators.
CI does not invoke the new targets.

The former root `requirements.txt` was a mixed maintenance/API inventory and
has been replaced by explicit [optional tool groups](../utils/README.md#dependency-inventories).
Choose the API requirements above for API work. Frontend preparation needs
neither Python group. The former root `uv.lock` contained only Python metadata
and no resolved packages; it has been removed. The committed API requirements
pin their listed direct dependencies, not all transitives. There is no claimed
complete Python lock or supported root `uv sync` workflow. `uv venv`/`uv pip`
below remain optional ways to select an interpreter and install requirements.

## Isolated tooling when Python/pnpm are absent from PATH

This was verified with Node 22.23.3, Corepack 0.36.0, pnpm 10.34.9, and
uv 0.13.6 installing Python 3.12.16. These are verification versions, not a new
repository-wide toolchain policy.

Given Node/Corepack and a `uv` executable, run from the repository root.
Use an absolute path in place of `uv` if needed. The subshell keeps PATH
changes local; caches/interpreters/shims stay under ignored `node_modules/`
and the environment under ignored `.venv/`.

```bash
(
  repo_root="$PWD"
  tools_dir="$repo_root/node_modules/.cache/api-preparation"
  mkdir -p "$tools_dir/bin"
  export COREPACK_HOME="$tools_dir/corepack"
  export COREPACK_ENABLE_AUTO_PIN=0
  export npm_config_cache="$tools_dir/npm"
  export UV_CACHE_DIR="$tools_dir/uv"
  export UV_PYTHON_INSTALL_DIR="$tools_dir/python"

  corepack enable --install-directory "$tools_dir/bin" pnpm
  corepack install --global pnpm@10.34.9
  export PATH="$tools_dir/bin:$PATH"
  (cd clock && pnpm install --frozen-lockfile --store-dir "$tools_dir/pnpm")
  (cd clock && pnpm build)

  # Only required for API work:
  uv python install 3.12 --no-bin
  uv venv --python 3.12 .venv
  uv pip install --python .venv/bin/python -r clock-api/v3/requirements-dev.txt
  (cd clock-api/v3 && ../../.venv/bin/python -m pytest tests/ -v)
)
```

Here Corepack's `--global` selects the version only within the isolated
`COREPACK_HOME`; it does not install system shims or edit shell profiles.
Do not omit that environment variable. Initial tool/package downloads require
network access; schema export and SDK generation do not.
