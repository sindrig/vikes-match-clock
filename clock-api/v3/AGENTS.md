# clock-api/v3

FastAPI application wrapping the Analyticom KSI REST API for match data and weather. Deployed as a single Lambda behind API Gateway via Lambda Web Adapter (LWA) + uvicorn.

## Prerequisites and task navigation

Use **Python 3.12** in an isolated virtual environment, with pip and
`requirements-dev.txt` (which includes production dependencies). Frontend
Node/pnpm is needed for TypeScript SDK generation and the optional Pyright
command below; API tests, schema export and health need only Python. Docker is
needed for the Terraform Lambda packaging path, not mocked API tests or export.
No AWS login is needed for schema export, health or mocked tests. Live upstream
calls use the approved AWS credential chain and lazy SSM access described by the
[environment contract](../../docs/environment.md#api-secrets).

The [task index](../../docs/README.md) routes cross-project changes. Update this
guide for endpoints/setup, [KSI lifecycle](../../docs/ksi-roster-lifecycle.md) for
request ownership/budgets, and [API preparation](../../docs/api-client-preparation.md)
for schema/client rules. Team names/IDs must retain the frontend's
[normalization and API-scope contract](../../docs/clock/assets-and-rosters.md#team-id-system--match-data-pipeline).

## Architecture

```
clock-api/v3/
├── app/
│   ├── main.py            # FastAPI app + loop-owned KSI admission lifespan
│   ├── dependencies.py    # Lazy SSM caches, request-scoped KSI lifetime + budget
│   ├── models/
│   │   ├── matches.py     # Pydantic models for KSI match data
│   │   └── weather.py     # Pydantic model for weather response
│   ├── routers/
│   │   ├── matches.py     # Match, lineup, events, info endpoints
│   │   └── weather.py     # Weather endpoint
│   └── services/
│       ├── ksi.py         # Async httpx client for Analyticom API
│       └── weather.py     # OpenWeatherMap → vedur.is fallback
├── tests/
│   ├── conftest.py        # TestClient fixture, dependency overrides
│   ├── test_matches.py    # KSI client + match endpoint tests
│   ├── test_weather.py    # Weather service + endpoint tests
│   ├── test_integration.py # Cross-endpoint integration tests
│   ├── test_handler.py    # App config + LWA setup tests
│   ├── test_dependencies.py # Lazy SSM lifecycle, key caches, failure retries
│   ├── test_ksi_lifecycle.py # Real dependencies, budgets, cancellation + cleanup
│   ├── test_ssm_admission.py # Worker handoff, FIFO, independent budgets + shutdown
│   ├── test_roster_resolution.py # Baseline results, ordering + bounded lookups
│   └── test_openapi.py    # Offline export + health, byte-for-byte contract check
├── run.sh                 # uvicorn startup script for Lambda Web Adapter
├── export-openapi.py      # Generates openapi.json from app
├── requirements.txt       # Production deps
├── requirements-dev.txt   # Test + formatter deps (includes production)
├── .python-version        # Local Python 3.12 selector
└── pyproject.toml         # Black config
```

## API Endpoints

| Method | Path                                    | Description                                                                   |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/health`                               | Health check                                                                  |
| GET    | `/{team_id}/matches/{date}`             | Matches for a team on a date (YYYY-MM-DD). Optional `utc_offset` query param. |
| GET    | `/{team_id}/matches/{match_id}/lineups` | Lineups for a match                                                           |
| GET    | `/{team_id}/matches/{match_id}/events`  | Events (goals, cards, subs) for a match                                       |
| GET    | `/{team_id}/matches/{match_id}/info`    | Detailed match info                                                           |
| POST   | `/{teamId}/resolve-roster`              | Resolve shirt numbers to player names from recent match history               |
| GET    | `/weather?lat=&lon=`                    | Weather at coordinates (OpenWeatherMap with vedur.is fallback)                |

These paths are relative to the actual `APIRouter(prefix="/v3")`, not a
`root_path` mount. Both local and production routes include `/v3`, for example
`/v3/health`. The generated SDK includes that prefix in endpoint paths; configure
its base URL at the API origin (`http://localhost:8000/` locally), without a
second `/v3`. Frontend port 4600 and API port 8000 are distinct; Vite has no proxy.

## External APIs

**Analyticom KSI API** (`api-ksi.analyticom.de`):
REST API for Icelandic football data. Requires `API_KEY` header on all requests.

- Match list: `GET /api/live/matchList/{date}/{utcOffset}?teamIdFilter={teamId}`
- Past matches (paginated): `GET /api/live/team/{teamId}/matches/paginated/past/{utcOffset}?page=1&pageSize=10`
- Lineups: `GET /api/live/match/{matchId}/lineups`
- Events: `GET /api/live/match/{matchId}/events`
- Match info: `GET /api/live/match/{matchId}`
- Date format: `yyyyMMdd` (router converts from YYYY-MM-DD)
- API docs: `https://api-ksi.analyticom.de/v3/api-docs/live`

**Weather** — two-source fallback:

1. OpenWeatherMap — JSON API, uses lat/lon from request, requires API key
2. vedur.is (Icelandic Met Office) — XML API, station 1472, no auth needed

## Key Patterns

**SSM Parameter Store**: API keys cached with `@functools.cache`:

- `/vikes-match-clock/ksi-api-key/{team_id}` — one KSI API key per team
- `/vikes-match-clock/weather-api` — OpenWeatherMap API key
- `get_ssm_client()` lazily constructs and caches the eu-west-1 SSM client on the first key lookup. Its SDK configuration uses two-second connect/read timeouts and standard retries with two total attempts. Importing the app, exporting OpenAPI, and serving health do not construct AWS clients. Failed construction/key lookups are retried; successful keys retain their existing process lifetime caches. KSI HTTP clients remain request-scoped.

**Dependency Injection**: FastAPI `Depends()` for KSI client. The async generator owns one HTTP client per request and closes it on the request's event loop. One absolute 10-second work deadline includes admission, key lookup and all endpoint work; cleanup is shielded from request cancellation and capped at one additional second. Pending cancellation and expiry are checked before HTTP allocation. Tests can still override via `app.dependency_overrides`.

**KSI admission lifecycle**: `main.py` explicitly creates one `KsiKeyLookups` per application lifespan on its serving asyncio loop. Its `asyncio.BoundedSemaphore` has independent, fixed KSI capacity **C=40**. A queued child is cancelled when its caller leaves; Python 3.12 forwards notified reservations if that child is cancelled. An admitted child keeps capacity until its synchronous lookup finishes, using AnyIO worker offload with a private uncontended one-token limiter. Tasks are retained and late exceptions retrieved. Shutdown closes admission, cancels queued children and drains admitted owners on their loop, deferring even repeated native task cancellation until drain completes. Never replace an owner while its workers remain alive. Fixtures must enter the actual app lifespan; HTTPX's ASGI transport alone does not start it.

**Capacity contract**: KSI work does not borrow default AnyIO tokens; changing the default limit **G** does not resize **C**. Combined nominal admission is **C+G**, not a global thread bound. Default AnyIO limiter races remain outside this repair; weather's synchronous key getter is outside the KSI gate. Multiple loops, processes and Lambda instances multiply capacity. A permanently stuck synchronous call keeps its slot and can prevent graceful shutdown; process termination is the final boundary. SDK operation timeouts do not bound DNS, credential discovery or response trickling absolutely. Successful lazy key caches and failure retries are unchanged.

**Roster Resolution**: The ten-match history cache belongs to the request's `KsiClient`; no roster data is shared across requests. Resolve newest first, skip unrelated matches before fetching lineups, and stop when every requested starter and substitute number is found. Successful history exhaustion retains `#number` placeholders. Upstream status/transport failures return 502 and timeouts return 504 without partial rosters. See [KSI lifetime and regression evidence](../../docs/ksi-roster-lifecycle.md).

**Pydantic v2**: `X | None = None` for optional fields, `model_validate()` for JSON conversion. FastAPI auto-generates OpenAPI spec from models.

**Lambda Deployment**: Lambda Web Adapter (LWA) runs `run.sh` which starts uvicorn serving `app.main:app`. The LWA layer translates Lambda events to HTTP requests. No Mangum needed.

## Development

Schema export, health and mocked tests require no AWS credentials. Live
match/weather calls lazily retrieve API keys from SSM using boto3's AWS
credential chain; key values are not loaded from dotenv. See
[the environment contract](../../docs/environment.md#api-secrets) for access
requirements and credential-free alternatives.

Use the [local quickstart](../../docs/quickstart.md) for Python 3.12 selection,
an owned virtual environment, dependencies and combined frontend/emulator setup.
The following commands assume that environment's Python and **`clock-api/v3/`**.

For a deliberately configured local API, from this directory:

```bash
python -m uvicorn app.main:app --port 8000
```

This starts the app without fetching keys; match/weather requests may contact
live upstreams. Mock those requests for isolated frontend work. `run.sh` is the
Lambda environment launcher, not a credential/bootstrap script.

Running tests:

```bash
python -m pytest tests/ -v
```

Black is installed by `requirements-dev.txt`. Format changed Python files
before committing, using this directory's Python 3.12 configuration:

```bash
python -m black --workers 1 --config pyproject.toml path/to/changed_file.py
```

From the **repository root**, with the quickstart's `.venv`:

```bash
make api-format-check PYTHON=.venv/bin/python
make api-typecheck PYTHON=.venv/bin/python
```

The targets require GNU Make. Both print and validate the selected Python 3.12
interpreter. Pass `PYTHON="/absolute/path/to/python"` for another owned environment;
quote paths containing spaces. Pyright resolves dependencies through that
interpreter even if a different root `.venv` exists. Install the API requirements
in the selected environment. Formatting
checks `app/`, `tests/` and `export-openapi.py`. The optional typecheck needs
**Node 22.12+ and pnpm** and uses the pinned Pyright version in the Makefile
through `pnpm dlx`, with one worker. Its first run may download the tool.
`pyrightconfig.json` checks API runtime `app/` and the exporter in basic mode,
with unused-symbol errors. Tests are exercised by pytest and formatted by Black;
utility and kiosk Python have separate ownership and are outside this type gate.

The [API preparation guide](../../docs/api-client-preparation.md#python-tooling)
owns install boundaries and lockfile limitations. Optional maintenance tools
have separate [dependency inventories](../../utils/README.md); they are not
API setup prerequisites.

Generating OpenAPI spec:

```bash
python export-openapi.py
```

Generating the ignored TypeScript SDK (from `clock/` directory):

```bash
pnpm run generate-api-client
```

After API contract edits, export and commit `openapi.json` first, then
regenerate the SDK. CI checks schema freshness separately. Frontend
`pnpm start`/`pnpm build` generate from the committed schema without Python
or AWS. See [API client preparation](../../docs/api-client-preparation.md)
for isolated setup and the offline export regression test.

## Code Style

- No comments or docstrings. Code should be self-documenting through clear naming.
- No module-level docstrings, no function/class/method docstrings, no inline comments.
- `# type: ignore` is acceptable only when truly necessary.
- Prefer `return await X` over `y = await X; return y` — avoid unnecessary intermediate variables for return values.

## Testing Patterns

- httpx mocking: `respx` for async httpx calls
- Endpoint testing: `TestClient` with dependency overrides
- Weather mocking: Mock both OpenWeatherMap and vedur.is to test fallback chain
- App config testing: Verify FastAPI setup, CORS, `/v3` router prefix, run.sh existence

## Related

- Frontend: `clock/` consumes these endpoints via generated TypeScript types
- Infrastructure: `infra/modules/web/api.tf` defines the Lambda and API Gateway route
