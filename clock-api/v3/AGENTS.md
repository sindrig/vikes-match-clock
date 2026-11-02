# clock-api/v3

FastAPI application wrapping the Analyticom KSI REST API for match data and weather. Deployed as a single Lambda behind API Gateway via Lambda Web Adapter (LWA) + uvicorn.

## Architecture

```
clock-api/v3/
├── app/
│   ├── main.py            # FastAPI app
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
│   ├── test_roster_resolution.py # Baseline results, ordering + bounded lookups
│   └── test_openapi.py    # Offline export + health, byte-for-byte contract check
├── run.sh                 # uvicorn startup script for Lambda Web Adapter
├── export-openapi.py      # Generates openapi.json from app
├── requirements.txt       # Production deps
├── requirements-dev.txt   # Test deps (includes production)
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

Note: App is mounted at `root_path="/v3"`, so full production paths are `/v3/health`, `/v3/{team_id}/matches/...`, etc.

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

**Dependency Injection**: FastAPI `Depends()` for KSI client. The async generator owns one HTTP client per request and closes it on the request's event loop. Its shared 10-second work budget includes key lookup and all endpoint work; cleanup is shielded from request cancellation and capped at one additional second, leaving margin under API Gateway's 12-second integration timeout. Synchronous SSM lookup runs in an independently shielded task that owns a default AnyIO capacity token until its worker completes. Callers can time out or cancel promptly; cancellation while queued removes the lookup before worker submission. Completed task failures are retrieved, and late results cannot construct HTTP clients. Existing lazy key caches and event-loop responsiveness are preserved. Tests can still override via `app.dependency_overrides`.

**Roster Resolution**: The ten-match history cache belongs to the request's `KsiClient`; no roster data is shared across requests. Resolve newest first, skip unrelated matches before fetching lineups, and stop when every requested starter and substitute number is found. Successful history exhaustion retains `#number` placeholders. Upstream status/transport failures return 502 and timeouts return 504 without partial rosters. See [KSI lifetime and regression evidence](../../docs/ksi-roster-lifecycle.md).

**Pydantic v2**: `X | None = None` for optional fields, `model_validate()` for JSON conversion. FastAPI auto-generates OpenAPI spec from models.

**Lambda Deployment**: Lambda Web Adapter (LWA) runs `run.sh` which starts uvicorn serving `app.main:app`. The LWA layer translates Lambda events to HTTP requests. No Mangum needed.

## Development

Setup:

```bash
cd clock-api/v3
pip install -r requirements-dev.txt
```

Running tests:

```bash
python -m pytest tests/ -v
```

Formatting (always run before committing):

```bash
python -m black --line-length 79 --skip-string-normalization .
```

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
- App config testing: Verify FastAPI setup, CORS, root_path, run.sh existence

## Related

- Frontend: `clock/` consumes these endpoints via generated TypeScript types
- Infrastructure: `infra/modules/web/api.tf` defines the Lambda and API Gateway route
