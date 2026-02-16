# New KSI API — FastAPI Backend

## TL;DR

> **Quick Summary**: Replace the fragile SOAP/HTML-scraping match-report Lambdas with a new FastAPI application that wraps the Analyticom KSI REST API, and consolidate weather into the same project. Deploy as a single Lambda behind API Gateway using existing Terraform patterns.
> 
> **Deliverables**:
> - New `clock-api/v3/` FastAPI project with match, lineup, events, and weather endpoints
> - Terraform additions for new Lambda + API Gateway catch-all route
> - Auto-generated OpenAPI spec for future frontend TypeScript type generation
> - Full test suite (TDD with pytest)
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 2 → Tasks 3-6 (parallel) → Task 7 → Task 8 → Task 9

---

## Context

### Original Request
User has access to a new KSI API at `api-ksi.analyticom.de` and wants to replace the current Lambda functions (which use SOAP + HTML scraping) with a new FastAPI project wrapping this REST API. Weather should also move into the new project. Shared API definition with the frontend is desired.

### Interview Summary
**Key Discussions**:
- **Backend approach**: FastAPI chosen for auto-generated OpenAPI spec and shared type generation
- **API scope**: Match list + lineups + events + match info (richer than current)
- **Player search**: Dropped — new lineup endpoint is sufficient
- **Weather**: Consolidated into new project, made location-aware
- **Frontend**: NOT updated in this plan — separate PR will migrate frontend and deprecate old APIs
- **Team vs Club**: `config.teamId` is the parent club ID; API returns all teams under that club
- **SSM prefix**: `/vikes-match-clock/` for consistency with existing weather key

**Research Findings**:
- Current system uses KSI SOAP API (`suds` client) + HTML scraping of ksi.is — both fragile
- New Analyticom API is proper REST with OpenAPI spec, `API_KEY` header auth
- Paradigm shift: old system discovers matches by pitch/venue ID, new system by team/club ID
- API Gateway HTTP API v2, Docker-built Lambdas via Terraform modules — well-established pattern
- Weather Lambda uses `functools.cache` for SSM — good pattern to follow

### Metis Review
**Identified Gaps** (addressed):
- Pitch→team paradigm shift: Validated — club ID returns all teams' matches, which is correct
- API Gateway catch-all route: Confirmed `{proxy+}` works with v2.2.2 module
- Weather location-awareness: User wants location-aware (lat/lon per request)
- SSM path convention: Aligned with existing `/vikes-match-clock/` prefix
- `build_in_docker` compatibility: Confirmed — works with `requirements.txt` in source directory
- No VPC needed: New Lambda only calls external APIs (Analyticom, vedur.is, OpenWeatherMap)

---

## Work Objectives

### Core Objective
Create a self-contained FastAPI application in `clock-api/v3/` that proxies the Analyticom KSI API for match data and consolidates weather, deployed as a Lambda behind API Gateway.

### Concrete Deliverables
- `clock-api/v3/` — FastAPI project with Mangum Lambda adapter
- 5 API endpoints: matches, lineups, events, match info, weather
- Pydantic models generating OpenAPI spec
- pytest test suite with full coverage
- Terraform additions in `infra/modules/web/api.tf`

### Definition of Done
- [ ] `cd clock-api/v3 && python -m pytest tests/ -v` → all tests pass
- [ ] FastAPI app generates valid OpenAPI spec via `app.openapi()`
- [ ] Terraform plan shows new Lambda + API Gateway route additions only (no modifications to existing resources)
- [ ] No changes to `clock/`, `clock-api/match-report/`, `clock-api/match-report-v2/`, or `clock-api/weather/`

### Must Have
- Pydantic v2 response models for all endpoints (enables OpenAPI spec generation)
- `API_KEY` header forwarded to Analyticom API, sourced from SSM per team
- `teamId` as a path parameter on match-related endpoints
- Weather endpoint accepting `lat` and `lon` query parameters
- Mangum adapter for Lambda deployment (NOT uvicorn in production)
- TDD test suite using FastAPI TestClient with dependency injection overrides
- CORS enabled (matching existing API Gateway CORS config)
- `functools.cache` on SSM lookups

### Must NOT Have (Guardrails)
- No changes to existing Lambda functions or their Terraform modules
- No changes to the frontend (`clock/` directory)
- No player search endpoint (explicitly dropped)
- No uvicorn as production dependency (Mangum replaces it)
- No custom middleware beyond FastAPI's built-in CORSMiddleware
- No retry/backoff logic on Analyticom API calls
- No response caching layer (no Redis, no in-memory cache beyond SSM)
- No logging framework (use `print()` — matches existing Lambdas)
- No OpenTelemetry/tracing (Lambda has built-in CloudWatch)
- No shared code with old Lambdas — fully self-contained in `clock-api/v3/`
- No over-abstraction (no repository pattern, no complex DI containers)
- No authentication/authorization on the API endpoints (current API has none)
- No commented-out code, no excessive docstrings, no `as any` equivalents

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (new project)
- **Automated tests**: TDD
- **Framework**: pytest + FastAPI TestClient
- **TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

| Deliverable Type | Verification Tool | Method |
|------------------|-------------------|--------|
| FastAPI endpoints | Bash (pytest) | Run test suite, verify pass/fail |
| OpenAPI spec | Bash (python) | Import app, dump schema, validate fields |
| Terraform | Bash (terraform) | `terraform validate` in infra directory |
| Lambda handler | Bash (python) | Invoke handler with mock Lambda event |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — sequential scaffolding):
├── Task 1: Project scaffolding + pytest setup [quick]
└── Task 2: Pydantic models + Analyticom API client [deep]

Wave 2 (Core endpoints — MAX PARALLEL after Wave 1):
├── Task 3: Match list endpoint (depends: 1, 2) [unspecified-high]
├── Task 4: Match lineups endpoint (depends: 1, 2) [unspecified-high]
├── Task 5: Match events + info endpoints (depends: 1, 2) [unspecified-high]
└── Task 6: Weather endpoint (depends: 1, 2) [unspecified-high]

Wave 3 (Infrastructure + integration):
├── Task 7: Terraform Lambda + API Gateway (depends: 1) [quick]
├── Task 8: Integration tests + OpenAPI validation (depends: 3-6) [deep]
└── Task 9: OpenAPI → TypeScript type generation script (depends: 8) [quick]

Wave FINAL (Verification — 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — run full test suite + handler verification (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 2 → Task 3 → Task 8 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 1 | — | 2, 3, 4, 5, 6, 7 | 1 |
| 2 | 1 | 3, 4, 5, 6 | 1 |
| 3 | 1, 2 | 8 | 2 |
| 4 | 1, 2 | 8 | 2 |
| 5 | 1, 2 | 8 | 2 |
| 6 | 1, 2 | 8 | 2 |
| 7 | 1 | — | 3 |
| 8 | 3, 4, 5, 6 | 9 | 3 |
| 9 | 8 | — | 3 |
| F1-F4 | ALL | — | FINAL |

### Agent Dispatch Summary

| Wave | # Parallel | Tasks → Agent Category |
|------|------------|----------------------|
| 1 | **1→1** | T1 → `quick`, T2 → `deep` |
| 2 | **4** | T3 → `unspecified-high`, T4 → `unspecified-high`, T5 → `unspecified-high`, T6 → `unspecified-high` |
| 3 | **3** | T7 → `quick`, T8 → `deep`, T9 → `quick` |
| FINAL | **4** | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

- [ ] 1. Project Scaffolding + Test Infrastructure

  **What to do**:
  - Create directory `clock-api/v3/` with the following structure:
    ```
    clock-api/v3/
    ├── app/
    │   ├── __init__.py
    │   ├── main.py          # FastAPI app + Mangum handler
    │   ├── dependencies.py  # Dependency injection (SSM API key lookup)
    │   ├── routers/
    │   │   ├── __init__.py
    │   │   ├── matches.py
    │   │   ├── weather.py
    │   ├── services/
    │   │   ├── __init__.py
    │   │   ├── ksi.py       # Analyticom API client
    │   │   ├── weather.py   # Weather service (vedur.is + OpenWeatherMap)
    │   ├── models/
    │   │   ├── __init__.py
    │   │   ├── matches.py   # Pydantic models for match data
    │   │   ├── weather.py   # Pydantic models for weather
    ├── tests/
    │   ├── __init__.py
    │   ├── conftest.py      # Shared fixtures, TestClient, dependency overrides
    │   ├── test_matches.py
    │   ├── test_weather.py
    │   ├── test_integration.py
    ├── requirements.txt     # Production dependencies
    ├── requirements-dev.txt # Dev/test dependencies
    └── pyproject.toml       # Black config (79 chars, skip string normalization)
    ```
  - `main.py`: Create FastAPI app with `root_path="/v3"`, CORSMiddleware (allow all origins/methods), health check at `/health`, and Mangum handler export
  - `requirements.txt`: fastapi, mangum, httpx, pydantic, boto3
  - `requirements-dev.txt`: pytest, httpx (for TestClient), respx (for mocking httpx), moto (for mocking SSM)
  - `pyproject.toml`: Configure Black (line-length=79, skip-string-normalization=true) matching repo root config
  - `conftest.py`: Set up TestClient fixture with FastAPI dependency overrides for SSM/API key

  **Must NOT do**:
  - Do not add uvicorn to requirements.txt
  - Do not create a Dockerfile (build_in_docker handles this)
  - Do not add logging framework

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File scaffolding with known patterns, no complex logic
  - **Skills**: []
    - No special skills needed — file creation only

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential — Task 2 depends on this)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `clock-api/weather/app.py:1-23` — SSM client setup and `functools.cache` pattern for API key lookup. Copy this pattern for `dependencies.py`.
  - `clock-api/weather/app.py:38-85` — Lambda handler structure (status code, body, headers). Understand what Mangum replaces.
  - `clock-api/match-report-v2/app.py:172-180` — Response helper with CORS headers. Mangum + FastAPI CORSMiddleware replaces this entirely.

  **API/Type References**:
  - `clock-api/match-report-v2/src/models.py` — Current dataclass models. New Pydantic models will replace these with richer types from Analyticom API.

  **External References**:
  - Mangum docs: `https://mangum.fastapiexpert.com/` — FastAPI Lambda adapter. Use `handler = Mangum(app, lifespan="off")`.
  - FastAPI TestClient: `https://fastapi.tiangolo.com/tutorial/testing/` — Uses httpx under the hood.

  **Acceptance Criteria**:

  - [ ] Directory `clock-api/v3/` exists with all files listed above
  - [ ] `cd clock-api/v3 && pip install -r requirements.txt -r requirements-dev.txt` succeeds
  - [ ] `cd clock-api/v3 && python -c "from app.main import app, handler; print(app.title)"` prints app title without errors
  - [ ] `cd clock-api/v3 && python -m pytest tests/ -v` runs (even if tests are placeholder/skipped)

  **QA Scenarios:**

  ```
  Scenario: FastAPI app imports and creates handler successfully
    Tool: Bash
    Preconditions: requirements installed
    Steps:
      1. cd clock-api/v3 && python -c "from app.main import app, handler; print(type(handler))"
      2. Assert output contains "function" or "Mangum"
    Expected Result: No import errors, handler is callable
    Failure Indicators: ImportError, ModuleNotFoundError
    Evidence: .sisyphus/evidence/task-1-app-import.txt

  Scenario: Health check responds via Mangum handler
    Tool: Bash
    Preconditions: app imports successfully
    Steps:
      1. cd clock-api/v3 && python -c "
         from app.main import handler
         event = {'version': '2.0', 'requestContext': {'http': {'method': 'GET', 'path': '/v3/health'}}, 'rawPath': '/v3/health', 'rawQueryString': '', 'headers': {}}
         result = handler(event, {})
         assert result['statusCode'] == 200, f'Expected 200, got {result[\"statusCode\"]}'
         print('PASS:', result['body'])
         "
    Expected Result: Status 200 with body containing "ok"
    Failure Indicators: statusCode != 200, KeyError, handler crash
    Evidence: .sisyphus/evidence/task-1-health-check.txt
  ```

  **Commit**: YES
  - Message: `feat(api): scaffold FastAPI v3 project with Mangum adapter`
  - Files: `clock-api/v3/**`
  - Pre-commit: `cd clock-api/v3 && python -c "from app.main import app, handler"`

---

- [ ] 2. Pydantic Models + Analyticom API Client

  **What to do**:
  - **TDD: Write tests FIRST**, then implement.
  - `app/models/matches.py`: Create Pydantic v2 models matching the Analyticom API response schemas:
    - `Team` (id, name, shortName, logo/imageUrl)
    - `Result` (regular, overtime, penalty — score fields)
    - `MatchPhase` (id, name — enum-like)
    - `Competition` (id, name, shortName)
    - `Facility` (id, name, city)
    - `Match` (id, homeTeam, awayTeam, homeTeamResult, awayTeamResult, homeTeamRedCards, awayTeamRedCards, liveStatus, minute, currentMinute, dateTimeUTC, round, status, statusDescription, currentMatchPhase, competition, facility, attendance, showEvents, allowDetail)
    - `TeamPlayer` (shirtNumber, captain, goalkeeper, startingLineup, person with id/name/firstName/lastName)
    - `MatchAndTeamOfficial` (person, role)
    - `TeamLineup` (players: list[TeamPlayer], officials: list[MatchAndTeamOfficial])
    - `LineupsResponse` (home: TeamLineup, away: TeamLineup)
    - `MatchEventType` (id, name)
    - `MatchEvent` (eventId, eventType, matchPhase, minute, minuteFull, stoppageTime, displayMinute, player, player2, club, homeTeam, orderNumber, commentary)
  - `app/models/weather.py`: Pydantic models for weather response:
    - `WeatherResponse` (temp: float, service: str, main: dict with temp_max for legacy compat)
  - `app/services/ksi.py`: Analyticom API client class:
    - Use `httpx.AsyncClient` for HTTP calls
    - Base URL: `https://api-ksi.analyticom.de`
    - Methods: `get_matches(date, utc_offset, team_id, api_key)`, `get_lineups(match_id, api_key)`, `get_events(match_id, api_key)`, `get_match_info(match_id, api_key)`
    - All methods pass `API_KEY` header and optional `teamIdFilter` query param
    - Return parsed Pydantic models
  - `app/dependencies.py`: FastAPI dependency functions:
    - `get_ksi_api_key(team_id: int) -> str` — Reads from SSM at `/vikes-match-clock/ksi-api-key/{team_id}` with `functools.cache`
    - `get_weather_api_key() -> str` — Reads from SSM at `/vikes-match-clock/weather-api` with `functools.cache`
    - `get_ksi_client() -> KsiClient` — Returns singleton client instance
  - `tests/test_matches.py`: Tests for KSI client with mocked httpx responses (use `respx`)
  - Update `tests/conftest.py`: Add fixtures for mock API key dependency override, sample Analyticom API response data

  **Must NOT do**:
  - Do not add retry/backoff logic
  - Do not transform/rename Analyticom API fields unless absolutely necessary — keep Pydantic models close to upstream schema
  - Do not add response caching

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core data modeling requiring careful mapping from Analyticom API schemas. TDD requires thoughtful test-first design.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `clock-api/weather/app.py:15-22` — SSM client setup with `functools.cache`. Follow this exact pattern in `dependencies.py`.
  - `clock-api/match-report-v2/src/models.py` — Current dataclass models. Shows the data shape the frontend currently expects (important for understanding the migration path, though new models should match Analyticom's schema).

  **API/Type References**:
  - The Analyticom API OpenAPI spec defines these schemas (from our research):
    - `Match` schema: id (int64), homeTeam/awayTeam (Team), homeTeamResult/awayTeamResult (Result), liveStatus (enum: SCHEDULED|CANCELED|POSTPONED|RUNNING|PLAYED), minute (int64), currentMinute (string like "45+3"), dateTimeUTC (datetime), competition (Competition), facility (Facility), attendance (int32), showEvents (bool), allowDetail (bool)
    - `TeamPlayer` schema: shirtNumber, captain (bool), goalkeeper (bool), startingLineup (bool), person (object with id, name fields)
    - `TeamLineup`: players (TeamPlayer[]), officials (MatchAndTeamOfficial[])
    - `MatchEvent`: eventId (int64), eventType (MatchEventType), matchPhase (MatchPhase), minute (int32), minuteFull (int32), stoppageTime (int32), displayMinute (string), player/player2 (TeamPlayer), club (Team), homeTeam (bool)
  - Auth: `API_KEY` header (string, required on all endpoints)
  - Filtering: `teamIdFilter` query param (integer, optional) on all endpoints

  **External References**:
  - Pydantic v2: `https://docs.pydantic.dev/latest/` — Use `model_validator`, `Field(alias=...)` if Analyticom uses camelCase
  - httpx: `https://www.python-httpx.org/` — Async HTTP client. Use `httpx.AsyncClient` with base_url.
  - respx: `https://lundberg.github.io/respx/` — Mock httpx requests in tests.

  **Acceptance Criteria**:

  - [ ] All Pydantic models defined and importable: `from app.models.matches import Match, TeamPlayer, TeamLineup, MatchEvent`
  - [ ] KSI client class instantiable: `from app.services.ksi import KsiClient`
  - [ ] Dependencies importable: `from app.dependencies import get_ksi_api_key`
  - [ ] `cd clock-api/v3 && python -m pytest tests/test_matches.py -v` → all tests pass (≥5 tests covering client methods with mocked responses)

  **QA Scenarios:**

  ```
  Scenario: Pydantic models parse sample Analyticom API response
    Tool: Bash
    Preconditions: Models implemented
    Steps:
      1. cd clock-api/v3 && python -c "
         from app.models.matches import Match
         data = {'id': 12345, 'homeTeam': {'id': 1, 'name': 'Víkingur'}, 'awayTeam': {'id': 2, 'name': 'KR'}, 'dateTimeUTC': '2025-06-15T14:00:00Z', 'status': 'SCHEDULED', 'liveStatus': 'SCHEDULED'}
         m = Match.model_validate(data)
         assert m.id == 12345
         assert m.homeTeam.name == 'Víkingur'
         print('PASS: Match model validates correctly')
         "
    Expected Result: Model validates without error, fields accessible
    Failure Indicators: ValidationError, AttributeError
    Evidence: .sisyphus/evidence/task-2-model-validation.txt

  Scenario: KSI client raises on HTTP error
    Tool: Bash (pytest)
    Preconditions: Tests written with respx mocks
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_matches.py -v -k "error" --tb=short
    Expected Result: Tests pass showing proper error propagation
    Failure Indicators: Test failures
    Evidence: .sisyphus/evidence/task-2-client-error-handling.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add Pydantic models and KSI API client with tests`
  - Files: `clock-api/v3/app/models/`, `clock-api/v3/app/services/ksi.py`, `clock-api/v3/app/dependencies.py`, `clock-api/v3/tests/`
  - Pre-commit: `cd clock-api/v3 && python -m pytest tests/test_matches.py -v`

---

- [ ] 3. Match List Endpoint

  **What to do**:
  - **TDD: Write tests FIRST**, then implement.
  - `app/routers/matches.py`: Add `GET /{team_id}/matches/{date}` endpoint:
    - Path params: `team_id` (int), `date` (string, YYYY-MM-DD format)
    - Query params: `utc_offset` (int, default 0)
    - Dependency: `api_key = Depends(get_ksi_api_key)` using `team_id`
    - Calls `ksi_client.get_matches(date, utc_offset, team_id, api_key)`
    - Converts date from YYYY-MM-DD to yyyyMMdd for Analyticom API
    - Passes `teamIdFilter=team_id` to Analyticom API
    - Returns `list[Match]`
    - Response model annotation for OpenAPI spec generation
  - `app/main.py`: Include the matches router with prefix
  - `tests/test_matches.py`: Add endpoint tests using TestClient with mocked KSI client dependency

  **Must NOT do**:
  - Do not add pagination (Analyticom's matchList is not paginated — it returns all for that day)
  - Do not filter/transform the response — return what Analyticom gives us

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Endpoint implementation requiring proper FastAPI patterns (dependency injection, response models, path params)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `clock-api/match-report-v2/app.py:63-126` — Current `get_matches` function. Shows the data the frontend currently expects (date, time, competition, home/away team names+ids, match_id). New endpoint returns richer Analyticom data but should include these fields.
  - `clock/src/controller/asset/team/MatchesOnPitch.tsx:82-111` — Frontend consumption of match list. Shows the `MatchData` interface (match_id, date, time, competition, home.name, away.name). This is the CURRENT shape — new API will differ but should be at least as informative.

  **API/Type References**:
  - Analyticom endpoint: `GET /api/live/matchList/{date}/{utcOffset}` with `teamIdFilter` query param
  - Date format: yyyyMMdd (e.g., "20250615")
  - Response: Array of Match objects (see Task 2 models)
  - `API_KEY` header required

  **Acceptance Criteria**:

  - [ ] `cd clock-api/v3 && python -m pytest tests/test_matches.py -v -k "match_list"` → all tests pass
  - [ ] Endpoint appears in OpenAPI spec: `python -c "from app.main import app; assert any('matches' in p for p in app.openapi()['paths']); print('PASS')"`

  **QA Scenarios:**

  ```
  Scenario: Match list endpoint returns matches for a team and date
    Tool: Bash (pytest)
    Preconditions: KSI client mocked to return sample match data
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_matches.py -v -k "test_get_matches_success" --tb=short
    Expected Result: Test passes — 200 status, response contains match list with expected fields
    Failure Indicators: 422 (validation error), 500 (server error), missing fields in response
    Evidence: .sisyphus/evidence/task-3-match-list-success.txt

  Scenario: Match list endpoint returns 200 with empty list when no matches
    Tool: Bash (pytest)
    Preconditions: KSI client mocked to return empty array
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_matches.py -v -k "test_get_matches_empty" --tb=short
    Expected Result: Test passes — 200 status, response is empty array []
    Failure Indicators: Non-200 status, null response
    Evidence: .sisyphus/evidence/task-3-match-list-empty.txt
  ```

  **Commit**: YES (groups with Tasks 4, 5, 6)
  - Message: `feat(api): add match list endpoint with tests`
  - Files: `clock-api/v3/app/routers/matches.py`, `clock-api/v3/tests/test_matches.py`
  - Pre-commit: `cd clock-api/v3 && python -m pytest tests/test_matches.py -v`

---

- [ ] 4. Match Lineups Endpoint

  **What to do**:
  - **TDD: Write tests FIRST**, then implement.
  - `app/routers/matches.py`: Add `GET /{team_id}/matches/{match_id}/lineups` endpoint:
    - Path params: `team_id` (int — for API key lookup), `match_id` (int)
    - Dependency: `api_key = Depends(get_ksi_api_key)` using `team_id`
    - Calls `ksi_client.get_lineups(match_id, api_key)`
    - Returns `LineupsResponse` (home + away TeamLineup)
    - Response model annotation for OpenAPI spec
  - `tests/test_matches.py`: Add lineup endpoint tests with mocked KSI client

  **Must NOT do**:
  - Do not filter players (starters vs subs) — return all, let frontend decide
  - Do not add player search functionality

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Similar pattern to Task 3, endpoint implementation with dependency injection
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `clock-api/match-report-v2/src/client.py:109-133` — Current `get_players` method. Returns `dict[int, list[Player]]` keyed by club ID. New API returns structured `home`/`away` TeamLineup — cleaner.
  - `clock/src/controller/asset/team/MatchesOnPitch.tsx:114-145` — Frontend `fetchMatchReport`. Expects `{players: Record<string, Player[]>, group?, sex?}`. The new lineups response will have a different shape (home/away split), which the frontend migration PR will handle.

  **API/Type References**:
  - Analyticom endpoint: `GET /api/live/match/{matchId}/lineups`
  - Response: `{home: TeamLineup, away: TeamLineup}` where TeamLineup has `players[]` and `officials[]`
  - Each TeamPlayer: shirtNumber, captain (bool), goalkeeper (bool), startingLineup (bool), person (id, name)

  **Acceptance Criteria**:

  - [ ] `cd clock-api/v3 && python -m pytest tests/test_matches.py -v -k "lineup"` → all tests pass
  - [ ] Lineup endpoint in OpenAPI spec: `python -c "from app.main import app; paths = app.openapi()['paths']; assert any('lineups' in p for p in paths); print('PASS')"`

  **QA Scenarios:**

  ```
  Scenario: Lineups endpoint returns home and away squads
    Tool: Bash (pytest)
    Preconditions: KSI client mocked with sample lineup data (home: 11 starters + 7 subs, away: similar)
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_matches.py -v -k "test_get_lineups_success" --tb=short
    Expected Result: 200 status, response has home.players and away.players arrays
    Failure Indicators: Missing home/away keys, empty player arrays when data exists
    Evidence: .sisyphus/evidence/task-4-lineups-success.txt

  Scenario: Lineups endpoint handles match with no lineup data
    Tool: Bash (pytest)
    Preconditions: KSI client mocked to return empty lineups
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_matches.py -v -k "test_get_lineups_empty" --tb=short
    Expected Result: 200 status with empty player arrays (not 404/500)
    Failure Indicators: Server error, crash on empty data
    Evidence: .sisyphus/evidence/task-4-lineups-empty.txt
  ```

  **Commit**: YES (groups with Tasks 3, 5, 6)
  - Message: `feat(api): add match lineups endpoint with tests`
  - Files: `clock-api/v3/app/routers/matches.py`, `clock-api/v3/tests/test_matches.py`
  - Pre-commit: `cd clock-api/v3 && python -m pytest tests/test_matches.py -v`

---

- [ ] 5. Match Events + Match Info Endpoints

  **What to do**:
  - **TDD: Write tests FIRST**, then implement.
  - `app/routers/matches.py`: Add two endpoints:
    - `GET /{team_id}/matches/{match_id}/events`:
      - Path params: `team_id` (int), `match_id` (int)
      - Calls `ksi_client.get_events(match_id, api_key)`
      - Returns `list[MatchEvent]`
    - `GET /{team_id}/matches/{match_id}/info`:
      - Path params: `team_id` (int), `match_id` (int)
      - Calls `ksi_client.get_match_info(match_id, api_key)`
      - Returns `Match` (single match detail)
  - `tests/test_matches.py`: Add tests for both endpoints with mocked responses

  **Must NOT do**:
  - Do not filter events by type — return all events
  - Do not add WebSocket/SSE for live updates (polling is fine for this use case)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Two related endpoints following established patterns from Tasks 3-4
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **API/Type References**:
  - Analyticom events endpoint: `GET /api/live/match/{matchId}/events` — Returns array of MatchEvent
  - Analyticom match info endpoint: `GET /api/live/match/{matchId}` — Returns single Match object
  - MatchEvent fields: eventId, eventType (GOAL, YELLOW_CARD, RED_CARD, SUBSTITUTION etc.), matchPhase, minute, displayMinute, player, player2, club, homeTeam (bool)
  - These endpoints don't exist in the current system — they're new functionality

  **Acceptance Criteria**:

  - [ ] `cd clock-api/v3 && python -m pytest tests/test_matches.py -v -k "events or match_info"` → all tests pass
  - [ ] Both endpoints in OpenAPI spec

  **QA Scenarios:**

  ```
  Scenario: Events endpoint returns match events
    Tool: Bash (pytest)
    Preconditions: KSI client mocked with sample events (goal, yellow card, substitution)
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_matches.py -v -k "test_get_events" --tb=short
    Expected Result: 200 status, array of events with correct eventType values
    Failure Indicators: Empty response when events exist, incorrect event types
    Evidence: .sisyphus/evidence/task-5-events-success.txt

  Scenario: Match info endpoint returns single match detail
    Tool: Bash (pytest)
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_matches.py -v -k "test_get_match_info" --tb=short
    Expected Result: 200 status, single Match object with all expected fields
    Failure Indicators: Array instead of object, missing fields
    Evidence: .sisyphus/evidence/task-5-match-info.txt
  ```

  **Commit**: YES (groups with Tasks 3, 4, 6)
  - Message: `feat(api): add match events and info endpoints with tests`
  - Files: `clock-api/v3/app/routers/matches.py`, `clock-api/v3/tests/test_matches.py`
  - Pre-commit: `cd clock-api/v3 && python -m pytest tests/ -v`

---

- [ ] 6. Weather Endpoint (Location-Aware)

  **What to do**:
  - **TDD: Write tests FIRST**, then implement.
  - `app/services/weather.py`: Weather service:
    - `get_weather(lat: float, lon: float, api_key: str) -> WeatherResponse`
    - Try vedur.is first (if lat/lon is in Iceland range): `https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids=1472`
    - Fall back to OpenWeatherMap: `https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={key}&units=metric`
    - Return `WeatherResponse(temp, service, main={temp_max: formatted_temp})` for legacy compatibility
    - Note: vedur.is station ID (1472) is hardcoded for now. The location-aware part means the CALLER provides lat/lon, which is used for the OpenWeatherMap fallback. vedur.is could be extended later with station lookup.
  - `app/routers/weather.py`: Add `GET /weather` endpoint:
    - Query params: `lat` (float), `lon` (float)
    - Dependency: `api_key = Depends(get_weather_api_key)` for OpenWeatherMap
    - Returns `WeatherResponse`
    - Response model annotation for OpenAPI spec
  - `app/main.py`: Include weather router
  - `tests/test_weather.py`: Tests for weather service and endpoint with mocked HTTP responses

  **Must NOT do**:
  - Do not remove the vedur.is → OpenWeatherMap fallback chain
  - Do not change the response shape (legacy compatibility for `main.temp_max`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Porting existing weather logic with modifications (location-aware). Needs careful handling of the vedur.is XML parsing and fallback chain.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `clock-api/weather/app.py:38-85` — **PRIMARY REFERENCE**. The entire weather Lambda logic. This is being ported into the new project. Follow the same vedur.is → OpenWeatherMap fallback chain. Key details:
    - vedur.is URL: `https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=is&view=xml&ids=1472`
    - XML parsing: `minidom.parseString(r.text)`, `getElementsByTagName("T")`, `firstChild.data`
    - OpenWeatherMap: `https://api.openweathermap.org/data/2.5/weather` with lat/lon/appid/units=metric
    - Legacy response shape: `{temp: float, service: str, main: {temp_max: "formatted_float"}}`
  - `clock-api/weather/app.py:15-22` — SSM key retrieval pattern at `/vikes-match-clock/weather-api`

  **API/Type References**:
  - `clock/src/lib/weather.ts` — Frontend weather consumption. Shows expected response shape.

  **Acceptance Criteria**:

  - [ ] `cd clock-api/v3 && python -m pytest tests/test_weather.py -v` → all tests pass
  - [ ] Weather endpoint in OpenAPI spec
  - [ ] Response includes legacy `main.temp_max` field

  **QA Scenarios:**

  ```
  Scenario: Weather endpoint returns temperature with vedur.is
    Tool: Bash (pytest)
    Preconditions: vedur.is mocked to return valid XML with temperature
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_weather.py -v -k "test_weather_veduris" --tb=short
    Expected Result: 200 status, temp is float, service is "vedur.is", main.temp_max is formatted string
    Failure Indicators: Wrong service name, missing temp_max, XML parse error
    Evidence: .sisyphus/evidence/task-6-weather-veduris.txt

  Scenario: Weather endpoint falls back to OpenWeatherMap when vedur.is fails
    Tool: Bash (pytest)
    Preconditions: vedur.is mocked to return error, OpenWeatherMap mocked to return valid JSON
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_weather.py -v -k "test_weather_fallback" --tb=short
    Expected Result: 200 status, service is "openweathermap", temp from OpenWeatherMap response
    Failure Indicators: 500 error, no fallback attempted
    Evidence: .sisyphus/evidence/task-6-weather-fallback.txt

  Scenario: Weather endpoint returns error when both services fail
    Tool: Bash (pytest)
    Preconditions: Both vedur.is and OpenWeatherMap mocked to fail
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_weather.py -v -k "test_weather_both_fail" --tb=short
    Expected Result: 500 status with error message
    Failure Indicators: 200 with no data, unhandled exception
    Evidence: .sisyphus/evidence/task-6-weather-both-fail.txt
  ```

  **Commit**: YES (groups with Tasks 3, 4, 5)
  - Message: `feat(api): add location-aware weather endpoint with tests`
  - Files: `clock-api/v3/app/routers/weather.py`, `clock-api/v3/app/services/weather.py`, `clock-api/v3/app/models/weather.py`, `clock-api/v3/tests/test_weather.py`
  - Pre-commit: `cd clock-api/v3 && python -m pytest tests/test_weather.py -v`

---

- [ ] 7. Terraform — Lambda + API Gateway Route

  **What to do**:
  - Add new Lambda module block in `infra/modules/web/api.tf` following the weather Lambda pattern (no VPC):
    ```hcl
    module "clock-api-v3" {
      source  = "terraform-aws-modules/lambda/aws"
      version = "8.5.0"

      function_name = "${random_pet.this.id}${var.name_suffix}-clock-api-v3"
      description   = "Clock API v3 - FastAPI (${var.stage})"
      handler       = "app.main.handler"
      runtime       = "python3.12"

      publish = true
      timeout = 20

      build_in_docker = true
      source_path     = "${path.module}/../../../clock-api/v3"

      attach_policy_json = true
      policy_json = jsonencode({
        Version = "2012-10-17"
        Statement = [{
          Effect   = "Allow"
          Action   = ["ssm:GetParameter"]
          Resource = "arn:aws:ssm:*:*:parameter/vikes-match-clock/*"
        }]
      })

      allowed_triggers = {
        AllowExecutionFromAPIGateway = {
          service    = "apigateway"
          source_arn = "${module.api_gateway.apigatewayv2_api_execution_arn}/*/*"
        }
      }
    }
    ```
  - Add API Gateway catch-all integration in the `integrations` block:
    ```hcl
    "ANY /v3/{proxy+}" = {
      lambda_arn             = module.clock-api-v3.lambda_function_arn
      payload_format_version = "2.0"
      timeout_milliseconds   = 12000
    }
    ```
  - The handler path is `app.main.handler` (Mangum handler exported from `app/main.py`)

  **Must NOT do**:
  - Do not modify existing Lambda modules or API Gateway routes
  - Do not add VPC config (not needed for external API calls)
  - Do not modify variables.tf or outputs.tf unless strictly necessary
  - Do not remove the `$default` route or change existing integrations

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, well-defined Terraform addition following established patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent of endpoint implementation)
  - **Parallel Group**: Wave 3 (can start as soon as Task 1 establishes directory structure)
  - **Blocks**: None (infra is applied separately)
  - **Blocked By**: Task 1 (needs to know the directory name)

  **References**:

  **Pattern References**:
  - `infra/modules/web/api.tf:118-138` — Weather Lambda module (no VPC). **Copy this pattern exactly**, changing: function_name, description, handler (`app.main.handler` instead of `app.lambda_handler`), source_path (`clock-api/v3`), and adding SSM IAM policy.
  - `infra/modules/web/api.tf:47-69` — API Gateway integrations block. Add the new `"ANY /v3/{proxy+}"` entry here.
  - `infra/modules/web/api.tf:89-116` — Match-report Lambda with VPC. Shows the VPC pattern we DON'T need for the new Lambda.

  **Acceptance Criteria**:

  - [ ] `cd infra/modules/web && terraform validate` succeeds (or verify syntax is correct via review)
  - [ ] New module block named `clock-api-v3` exists in `api.tf`
  - [ ] New integration `"ANY /v3/{proxy+}"` exists in API Gateway integrations
  - [ ] SSM IAM policy attached with resource `arn:aws:ssm:*:*:parameter/vikes-match-clock/*`
  - [ ] No modifications to existing Lambda modules (match-report, match-report-v2, weather)

  **QA Scenarios:**

  ```
  Scenario: Terraform validates with new resources
    Tool: Bash
    Preconditions: Terraform installed, infra directory exists
    Steps:
      1. cd infra/modules/web && terraform init -backend=false 2>&1 | tail -5
      2. cd infra/modules/web && terraform validate
    Expected Result: "Success! The configuration is valid."
    Failure Indicators: Syntax errors, unknown module references
    Evidence: .sisyphus/evidence/task-7-terraform-validate.txt

  Scenario: No existing resources modified
    Tool: Bash
    Preconditions: Changes committed
    Steps:
      1. git diff HEAD~1 infra/modules/web/api.tf | grep "^-" | grep -v "^---" | wc -l
    Expected Result: 0 lines removed (only additions)
    Failure Indicators: Any removed lines from existing config
    Evidence: .sisyphus/evidence/task-7-no-modifications.txt
  ```

  **Commit**: YES
  - Message: `infra: add Lambda and API Gateway route for FastAPI v3`
  - Files: `infra/modules/web/api.tf`
  - Pre-commit: `cd infra/modules/web && terraform validate` (if terraform available)

---

- [ ] 8. Integration Tests + OpenAPI Spec Validation

  **What to do**:
  - `tests/test_integration.py`: End-to-end tests that exercise the full request path:
    - Test each endpoint through TestClient with all dependencies mocked
    - Verify response shapes match Pydantic models
    - Test error propagation (Analyticom API returns 500 → our API returns appropriate error)
    - Test invalid `team_id` → appropriate error response
    - Test invalid date format → 422 validation error
    - Test that `API_KEY` header is correctly forwarded to Analyticom API (verify via mock)
  - Verify OpenAPI spec completeness:
    - All 5 endpoint groups present in generated spec
    - Response schemas reference correct Pydantic models
    - Path parameters correctly documented
  - `tests/test_handler.py`: Test Mangum handler directly with Lambda event payloads:
    - Construct API Gateway v2 payload format events
    - Verify handler returns proper Lambda response structure (statusCode, body, headers)
  - Ensure ALL tests pass together: `python -m pytest tests/ -v`

  **Must NOT do**:
  - Do not make real HTTP calls to Analyticom API
  - Do not require deployed infrastructure

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Integration testing requires understanding all components together. OpenAPI validation needs careful schema inspection.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after all endpoints complete)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 4, 5, 6

  **References**:

  **Pattern References**:
  - All endpoint implementations from Tasks 3-6
  - `clock-api/match-report-v2/app.py:183-193` — Current Lambda handler. Shows the Lambda event structure (queryStringParameters). The new Mangum handler uses API Gateway v2 payload format which is different.

  **External References**:
  - API Gateway v2 payload format: `https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html` — Event structure for `payload_format_version = "2.0"`

  **Acceptance Criteria**:

  - [ ] `cd clock-api/v3 && python -m pytest tests/ -v` → ALL tests pass (unit + integration)
  - [ ] `cd clock-api/v3 && python -c "from app.main import app; import json; schema = app.openapi(); paths = list(schema['paths'].keys()); assert len(paths) >= 5, f'Only {len(paths)} paths'; print('OpenAPI paths:', paths)"` shows all endpoints

  **QA Scenarios:**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All endpoint tasks complete
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/ -v --tb=short 2>&1
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-8-full-test-suite.txt

  Scenario: OpenAPI spec contains all endpoints with correct schemas
    Tool: Bash
    Preconditions: App fully assembled
    Steps:
      1. cd clock-api/v3 && python -c "
         from app.main import app
         import json
         schema = app.openapi()
         paths = list(schema['paths'].keys())
         print('Paths:', json.dumps(paths, indent=2))
         # Verify key paths exist
         assert any('matches' in p and 'lineups' not in p and 'events' not in p and 'info' not in p for p in paths), 'Missing match list path'
         assert any('lineups' in p for p in paths), 'Missing lineups path'
         assert any('events' in p for p in paths), 'Missing events path'
         assert any('weather' in p for p in paths), 'Missing weather path'
         print('PASS: All expected paths present')
         # Dump spec for inspection
         with open('.sisyphus/evidence/task-8-openapi-spec.json', 'w') as f:
           json.dump(schema, f, indent=2)
         "
    Expected Result: All expected paths present, spec dumped to evidence
    Failure Indicators: Missing paths, schema validation errors
    Evidence: .sisyphus/evidence/task-8-openapi-spec.json

  Scenario: Mangum handler processes Lambda event correctly
    Tool: Bash
    Preconditions: Handler tests written
    Steps:
      1. cd clock-api/v3 && python -m pytest tests/test_handler.py -v --tb=short
    Expected Result: All handler tests pass
    Failure Indicators: Handler doesn't understand API Gateway v2 event format
    Evidence: .sisyphus/evidence/task-8-handler-tests.txt
  ```

  **Commit**: YES
  - Message: `test(api): add integration tests and OpenAPI spec validation`
  - Files: `clock-api/v3/tests/test_integration.py`, `clock-api/v3/tests/test_handler.py`
  - Pre-commit: `cd clock-api/v3 && python -m pytest tests/ -v`

---

- [ ] 9. OpenAPI → TypeScript Type Generation Script

  **What to do**:
  - Add a script/command to generate TypeScript types from the FastAPI OpenAPI spec
  - `clock-api/v3/export-openapi.py`: Simple script that dumps the OpenAPI spec to JSON:
    ```python
    import json
    from app.main import app
    
    with open("openapi.json", "w") as f:
        json.dump(app.openapi(), f, indent=2)
    ```
  - `clock/package.json`: Add a script entry:
    ```json
    "generate-api-types": "cd ../clock-api/v3 && python export-openapi.py && cd ../../clock && npx openapi-typescript ../clock-api/v3/openapi.json -o src/generated/api-types.ts"
    ```
  - Create `clock/src/generated/.gitkeep` to establish the directory
  - Add `clock-api/v3/openapi.json` to `.gitignore` (generated artifact)
  - Document the generation workflow in a brief comment in the script

  **Must NOT do**:
  - Do not run the generation as part of CI/CD yet (that's for the frontend migration PR)
  - Do not create actual TypeScript types (the script generates them on demand)
  - Do not modify any existing frontend code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility script + package.json entry
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 8 validates OpenAPI spec)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `clock/package.json` — Existing npm scripts. Add `generate-api-types` following the same pattern.

  **External References**:
  - openapi-typescript: `https://openapi-ts.dev/` — Generates TypeScript types from OpenAPI 3.x specs.

  **Acceptance Criteria**:

  - [ ] `cd clock-api/v3 && python export-openapi.py && cat openapi.json | python -m json.tool > /dev/null` — generates valid JSON
  - [ ] `cd clock && pnpm run generate-api-types` — runs without errors and produces `src/generated/api-types.ts`
  - [ ] Generated TypeScript file contains type definitions (not empty)

  **QA Scenarios:**

  ```
  Scenario: OpenAPI spec exports to JSON file
    Tool: Bash
    Preconditions: FastAPI app fully assembled
    Steps:
      1. cd clock-api/v3 && python export-openapi.py
      2. python -c "import json; json.load(open('openapi.json')); print('PASS: Valid JSON')"
      3. python -c "import json; d = json.load(open('openapi.json')); assert 'paths' in d; assert 'components' in d; print('PASS: Has paths and components')"
    Expected Result: openapi.json created with valid OpenAPI structure
    Failure Indicators: File not created, invalid JSON, missing paths/components
    Evidence: .sisyphus/evidence/task-9-openapi-export.txt

  Scenario: TypeScript types generate from OpenAPI spec
    Tool: Bash
    Preconditions: openapi.json exists, pnpm available
    Steps:
      1. cd clock && pnpm run generate-api-types
      2. wc -l src/generated/api-types.ts
      3. head -20 src/generated/api-types.ts
    Expected Result: api-types.ts created with >50 lines of type definitions
    Failure Indicators: Empty file, npx errors, missing types
    Evidence: .sisyphus/evidence/task-9-typescript-types.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add OpenAPI to TypeScript type generation script`
  - Files: `clock-api/v3/export-openapi.py`, `clock/package.json`, `clock/src/generated/.gitkeep`, `.gitignore`
  - Pre-commit: `cd clock-api/v3 && python export-openapi.py`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run full test suite (`cd clock-api/v3 && python -m pytest tests/ -v`). Review all files in `clock-api/v3/` for: type hints on all functions, no bare `except:`, no `print` used as error handling (print for logging is fine), no hardcoded API keys/secrets, proper Pydantic model usage. Check Black formatting: `cd clock-api/v3 && python -m black --check --line-length 79 --skip-string-normalization .`. Check for AI slop: excessive comments, over-abstraction, generic variable names.
  Output: `Tests [PASS/FAIL] | Format [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real QA — Full Test Suite + Handler Verification** — `unspecified-high`
  Start from clean state. Install deps: `cd clock-api/v3 && pip install -r requirements.txt -r requirements-dev.txt`. Run ALL tests: `python -m pytest tests/ -v --tb=long`. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Verify OpenAPI spec generation end-to-end. Test Mangum handler with Lambda events. Save all to `.sisyphus/evidence/final-qa/`.
  Output: `Tests [N/N pass] | QA Scenarios [N/N pass] | Handler [PASS/FAIL] | OpenAPI [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", verify actual implementation matches 1:1. Check "Must NOT do" compliance across all tasks. Verify NO changes to: `clock/` (except package.json script + generated dir), `clock-api/match-report/`, `clock-api/match-report-v2/`, `clock-api/weather/`. Check Terraform changes are additions only (no modifications to existing modules). Flag any unaccounted files.
  Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task(s) | Message | Key Files | Verification |
|----------------|---------|-----------|--------------|
| 1 | `feat(api): scaffold FastAPI v3 project with Mangum adapter` | `clock-api/v3/**` | `python -c "from app.main import app, handler"` |
| 2 | `feat(api): add Pydantic models and KSI API client with tests` | `app/models/`, `app/services/`, `app/dependencies.py` | `pytest tests/test_matches.py` |
| 3, 4, 5, 6 | `feat(api): add match, lineup, events, and weather endpoints` | `app/routers/`, `tests/` | `pytest tests/ -v` |
| 7 | `infra: add Lambda and API Gateway route for FastAPI v3` | `infra/modules/web/api.tf` | `terraform validate` |
| 8 | `test(api): add integration tests and OpenAPI validation` | `tests/test_integration.py`, `tests/test_handler.py` | `pytest tests/ -v` |
| 9 | `feat(api): add OpenAPI to TypeScript type generation script` | `export-openapi.py`, `clock/package.json` | `python export-openapi.py` |

---

## Success Criteria

### Verification Commands
```bash
# Full test suite
cd clock-api/v3 && python -m pytest tests/ -v  # Expected: all pass

# OpenAPI spec valid
cd clock-api/v3 && python -c "from app.main import app; print(len(app.openapi()['paths']), 'paths')"  # Expected: ≥5 paths

# Mangum handler works
cd clock-api/v3 && python -c "
from app.main import handler
event = {'version': '2.0', 'requestContext': {'http': {'method': 'GET', 'path': '/v3/health'}}, 'rawPath': '/v3/health', 'rawQueryString': '', 'headers': {}}
r = handler(event, {})
assert r['statusCode'] == 200
print('Handler OK')
"

# Black formatting
cd clock-api/v3 && python -m black --check --line-length 79 --skip-string-normalization .  # Expected: no reformatting needed

# Terraform valid
cd infra/modules/web && terraform validate  # Expected: valid

# No changes to existing code
git diff HEAD -- clock/ clock-api/match-report/ clock-api/match-report-v2/ clock-api/weather/ | wc -l  # Expected: 0 (except clock/package.json)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] OpenAPI spec generates with all endpoints
- [ ] TypeScript type generation script works
- [ ] Terraform validates
- [ ] No modifications to existing Lambdas
- [ ] No frontend changes (except type gen script in package.json)
