# Learnings — New KSI API

Conventions, patterns, and discoveries from implementation.

---

## Task 1: FastAPI v3 Scaffolding

### Completed ✅
- Created full FastAPI v3 project structure under `clock-api/v3/`
- Implemented `main.py` with:
  - FastAPI app with `root_path="/v3"`
  - CORSMiddleware allowing all origins/methods/headers
  - Health check endpoint at `GET /health` returning `{"status": "ok"}`
  - Mangum handler export as `handler` with `lifespan="off"`
- Implemented `dependencies.py` with SSM caching pattern using `@cache` decorator
- Set up test infrastructure with `conftest.py` (TestClient fixture, mock overrides)
- All dependencies installed successfully (fastapi, mangum, httpx, pydantic, boto3, pytest, respx, moto)

### Key Implementation Details
- **Pydantic Version**: Used 2.12.5 (not 2.5.0) due to Python 3.14 build compatibility with pydantic-core
- **Mangum Handler**: Works correctly with Starlette/FastAPI for AWS Lambda; lifespan="off" recommended
- **Health Check**: Returns JSON `{"status": "ok"}`, works via TestClient and responds with 200
- **SSM Pattern**: `@cache` decorator on `get_parameter()` calls (follows clock-api/weather/app.py pattern)
- **Async Handling**: Mangum handler needs event loop; TestClient better for local testing

### QA Results ✅
1. App import: Loads successfully, creates Mangum handler
2. Health check: TestClient returns 200 with correct JSON
3. Pytest: Runs successfully with 3 skipped placeholder tests (no errors)
4. Dependencies: All installed (pip install succeeds)

### Gotchas & Solutions
- Python 3.14 incompatibility with pydantic 2.5.0 → Resolved by using 2.12.5
- Mangum direct invocation needs proper event format (requestContext.http.sourceIp) → Use TestClient for local tests
- pyproject.toml: Black config correctly set to line-length=79, skip-string-normalization=true
- Import errors in LSP until dependencies installed → Normal, resolved after pip install

---

## Task F2: Code Quality Review (2026-02-16)

### Test Suite Results ✅
- **35 passed, 1 skipped** (test_integration.py::test_health_check — placeholder)
- Python 3.14.2, pytest-7.4.3
- 1368 deprecation warnings from asyncio.iscoroutinefunction (Python 3.16 removal, upstream library issue)
- Execution time: 0.95s

### Black Formatting ❌ FAIL
- **7 files need reformatting** — all are line-length violations (>79 chars)
- Files affected:
  - `app/services/ksi.py:27,36` — method signatures too long
  - `app/routers/matches.py:27` — `ksi_client.get_matches(...)` call too long
  - `tests/conftest.py:22` — dict literal too long
  - `tests/test_handler.py:28,46,109` — event dict literals too long
  - `tests/test_weather.py:11,68` — URL string and mock call too long
  - `tests/test_matches.py:253,275` — assert_called_once_with too long
  - `tests/test_integration.py:137` — assert_called_once_with too long
- All fixable with `python -m black --line-length 79 --skip-string-normalization .`

### Type Hint Review — ISSUES FOUND

#### Missing Return Type Hints (app/ files):
| File | Line | Function | Issue |
|------|------|----------|-------|
| `app/main.py` | 24 | `health_check()` | Missing `-> dict` return type |
| `app/services/ksi.py` | 11 | `__init__(self)` | Missing `-> None` (convention, minor) |
| `app/services/ksi.py` | 54 | `close(self)` | Missing `-> None` |
| `app/routers/matches.py` | 13 | `get_matches(...)` | Missing return type (has response_model, acceptable for FastAPI) |
| `app/routers/matches.py` | 35 | `get_lineups(...)` | Missing return type (has response_model, acceptable) |
| `app/routers/matches.py` | 50 | `get_events(...)` | Missing return type (has response_model, acceptable) |
| `app/routers/matches.py` | 62 | `get_match_info(...)` | Missing return type (has response_model, acceptable) |
| `app/routers/weather.py` | 13 | `get_weather_endpoint(...)` | Missing return type (has response_model, acceptable) |

**Verdict on router functions**: FastAPI routes with `response_model=` decorators don't strictly need `->` return types since FastAPI uses the response_model for validation/docs. However, adding them improves IDE experience. Minor issue.

**Real issues**: `health_check()` and `KsiClient.close()` genuinely need return types.

### Exception Handling Review

| File | Line | Pattern | Severity |
|------|------|---------|----------|
| `app/services/weather.py` | 27 | `except Exception: pass` | ⚠️ MODERATE — Broad catch with silent `pass`. Intentional for fallback chain, but swallows all errors including `KeyboardInterrupt` subclasses. Would be better as `except (httpx.HTTPError, xml.parsers.expat.ExpatError, IndexError, ValueError):` |
| `app/routers/weather.py` | 17 | `except Exception as e: raise HTTPException(...)` | ⚠️ MINOR — Broad catch but properly re-raises as HTTP 500. Acceptable for top-level endpoint error handling. |

No bare `except:` found (good).

### Security Review ✅
- **No hardcoded API keys** — all come from SSM Parameter Store via `get_ksi_api_key()` / `get_weather_api_key()`
- **No secrets in code** — grep for `api_key =`, `secret =`, `password =`, `token =` with string values: clean
- **No `Optional[]`** — uses modern `X | None` syntax throughout (good)
- Test files use dummy values like `"test-key"`, `"mock-key-{team_id}"` — appropriate

### Pydantic Usage Review ✅
- All models use `BaseModel` correctly
- `model_validate()` used for JSON→model conversion (ksi.py:25,34,43,52) — correct Pydantic v2
- `| None = None` for optional fields — correct modern syntax
- No `Field()` used — not needed since no custom validators/descriptions needed
- No `model_dump()` used — FastAPI handles serialization via response_model
- `WeatherResponse.main: dict` (weather.py:11) — typed as `dict` for legacy compat, acceptable

### AI Slop Check ✅ CLEAN
- **No excessive docstrings** — all docstrings are 1-line, appropriate
- **No over-abstraction** — direct service calls, no unnecessary base classes or factories
- **No generic variable names** — `matches`, `lineups`, `events`, `response`, `temp` all contextually appropriate
  - `data = r.json()` in weather.py:42 is fine — used once immediately after
  - `r` for response in weather service is concise but acceptable for short scope
- **No unnecessary comments** — comments in routers are minimal ("Convert YYYY-MM-DD...", "Get API key...", "Fetch from Analyticom")
  - `# Add CORS middleware` in main.py:14 is slightly redundant (obvious from the code) but not egregious
  - `# Mangum handler for AWS Lambda` in main.py:29 — same, minor
- **Module docstrings**: All __init__.py have 1-line docstrings — fine
- **Code is lean**: ~500 LOC across all app/ files. No bloat.

### LSP Diagnostics ✅
- All 6 app/ files: **no errors**

### File-by-File Summary

| File | Status | Issues |
|------|--------|--------|
| `app/__init__.py` | ✅ Clean | — |
| `app/main.py` | ⚠️ Minor | Missing `-> dict` on health_check (L24) |
| `app/dependencies.py` | ✅ Clean | All functions typed |
| `app/models/matches.py` | ✅ Clean | Proper Pydantic v2 |
| `app/models/weather.py` | ✅ Clean | Proper Pydantic v2 |
| `app/models/__init__.py` | ✅ Clean | — |
| `app/services/ksi.py` | ⚠️ Minor | Black formatting (L27,36); missing `-> None` on __init__, close |
| `app/services/weather.py` | ⚠️ Moderate | Broad `except Exception: pass` (L27) swallows all errors |
| `app/services/__init__.py` | ✅ Clean | — |
| `app/routers/matches.py` | ⚠️ Minor | Black formatting (L27) |
| `app/routers/weather.py` | ⚠️ Minor | Missing return type on endpoint (L13) |
| `app/routers/__init__.py` | ✅ Clean | — |
| `tests/__init__.py` | ✅ Clean | — |
| `tests/conftest.py` | ⚠️ Minor | Black formatting (L22); test fixtures lack return types (acceptable for tests) |
| `tests/test_matches.py` | ⚠️ Minor | Black formatting (L253,275) |
| `tests/test_weather.py` | ⚠️ Minor | Black formatting (L11,68) |
| `tests/test_integration.py` | ⚠️ Minor | Black formatting (L137) |
| `tests/test_handler.py` | ⚠️ Minor | Black formatting (L28,46,109) |
| `export-openapi.py` | ✅ Clean | `print()` at L17 is appropriate (CLI script output) |

### Summary

```
Tests: PASS (35/35 + 1 skipped)
Format: FAIL (7 files need Black reformatting — all line-length >79)
Files: 10 clean / 9 with issues (all minor except 1 moderate)
```

### Issues Requiring Fix Before Production

1. **MUST FIX**: Run `python -m black --line-length 79 --skip-string-normalization .` to fix all 7 formatting violations
2. **SHOULD FIX**: `app/services/weather.py:27` — narrow `except Exception` to specific exception types (`httpx.HTTPError`, `xml.parsers.expat.ExpatError`, `IndexError`, `ValueError`)
3. **NICE TO HAVE**: Add `-> dict` to `health_check()`, `-> None` to `KsiClient.__init__()` and `KsiClient.close()`

### VERDICT: CONDITIONAL APPROVE

Code quality is high. Architecture is clean, Pydantic v2 usage is correct, no secrets, no AI slop. The **only blocking issue is Black formatting** — a single command fixes it. The broad exception catch in weather.py is the only substantive code quality concern but is acceptable for a fallback chain pattern. Approve after running Black formatter.

---

## Task F3: Real QA — Full Test Suite + Handler Verification (2026-02-16)

### Clean Install ✅
- `pip install -r requirements.txt -r requirements-dev.txt` — all dependencies satisfied
- Python 3.14.2, pytest-7.4.3, respx-0.21.1, moto-4.2.9

### Full Test Suite ✅
- **35 passed, 1 skipped** (test_integration.py::test_health_check placeholder)
- 0 failures, 0 errors
- Execution time: 0.65s
- 1368 deprecation warnings (asyncio.iscoroutinefunction — upstream library issue for Python 3.16)

### QA Scenarios — All Tasks

#### Task 1: FastAPI Scaffolding (2/2 PASS)
| Scenario | Result | Notes |
|----------|--------|-------|
| App import + handler type | ✅ PASS | `<class 'mangum.adapter.Mangum'>` |
| Health check via Mangum handler | ✅ PASS | Returns `{"status":"ok"}` (needs `sourceIp` in event + event loop setup for Python 3.14) |

**Note**: Plan QA used `/v3/health` path — incorrect. App uses `root_path="/v3"` so internal routes are at `/health`. Handler tests in pytest handle this correctly. Direct invocation needs `asyncio.set_event_loop(asyncio.new_event_loop())` on Python 3.14.

#### Task 2: Pydantic Models + KSI Client (2/2 PASS)
| Scenario | Result | Notes |
|----------|--------|-------|
| Model validation | ✅ PASS | `Match.model_validate(data)` works. Plan data missing `competition` field (required) — added and passes. |
| KSI client error handling | ✅ PASS | `test_get_matches_http_error` passes |

**Note**: Plan QA data dict was incomplete (missing `competition` required field). This is a plan inaccuracy, not a code bug. Model correctly requires `competition`.

#### Task 3: Match List Endpoint (2/2 PASS)
| Scenario | Result | Notes |
|----------|--------|-------|
| Match list success | ✅ PASS | `test_get_matches_success` + `test_endpoint_get_matches_date_success` both pass |
| Match list empty | ✅ PASS | `test_get_matches_empty` + `test_endpoint_get_matches_date_empty` both pass |

#### Task 4: Match Lineups Endpoint (2/2 PASS)
| Scenario | Result | Notes |
|----------|--------|-------|
| Lineups success | ✅ PASS | `test_get_lineups_success` + `test_endpoint_get_lineups_success` both pass |
| Lineups empty | ✅ PASS | `test_endpoint_get_lineups_empty_lineups` passes |

#### Task 5: Match Events + Info Endpoints (2/2 PASS)
| Scenario | Result | Notes |
|----------|--------|-------|
| Events success | ✅ PASS | `test_get_events_success` passes |
| Match info | ✅ PASS | `test_get_match_info_success` + `test_get_match_info_not_found` pass |

#### Task 6: Weather Endpoint (3/3 PASS)
| Scenario | Result | Notes |
|----------|--------|-------|
| vedur.is success | ✅ PASS | `test_get_weather_vedur_success` passes |
| Fallback to OpenWeatherMap | ✅ PASS | `test_get_weather_vedur_fails_owm_fallback` passes |
| Both services fail | ✅ PASS | `test_get_weather_both_fail` + `test_weather_endpoint_both_fail_returns_500` pass |

#### Task 7: Terraform (2/2 PASS)
| Scenario | Result | Notes |
|----------|--------|-------|
| New resources exist | ✅ PASS | `module "clock-api-v3"`, `"ANY /v3/{proxy+}"`, SSM policy, `app.main.handler`, `python3.12` all present |
| No existing modifications | ✅ PASS | Only additions — no removed lines from existing config |

**Note**: `terraform validate` fails due to missing provider config (`aws.us`) in local environment — not related to our changes. Syntax verified via code inspection.

#### Task 8: Integration Tests + OpenAPI (3/3 PASS)
| Scenario | Result | Notes |
|----------|--------|-------|
| Full test suite | ✅ PASS | 35 passed, 1 skipped, 0 failures |
| OpenAPI spec complete | ✅ PASS | All 6 paths present, 16 schemas, spec dumped to evidence |
| Handler tests | ✅ PASS | 7/7 handler tests pass |

#### Task 9: OpenAPI → TypeScript (2/2 PASS)
| Scenario | Result | Notes |
|----------|--------|-------|
| OpenAPI export | ✅ PASS | `export-openapi.py` creates valid JSON with paths and components |
| TypeScript generation | ✅ PASS | `pnpm run generate-api-types` → 559 lines of TS types in `clock/src/generated/api-types.ts` |

### OpenAPI Spec Verification ✅
- **6 endpoints**: `/{team_id}/matches/{date}`, `/{team_id}/matches/{match_id}/lineups`, `/{team_id}/matches/{match_id}/events`, `/{team_id}/matches/{match_id}/info`, `/weather/`, `/health`
- **16 schemas**: Competition, Facility, HTTPValidationError, LineupsResponse, Match, MatchAndTeamOfficial, MatchEvent, MatchEventType, MatchPhase, Person, Result, Team, TeamLineup, TeamPlayer, ValidationError, WeatherResponse
- Valid JSON, `paths` and `components` sections present

### Mangum Handler Verification ✅
- **Via pytest**: 7/7 tests pass (health check, response structure, 404, POST, context param, import, Mangum instance)
- **Direct invocation**: 5/5 tests pass (health→200, nonexistent→404, weather no params→422, POST→405, response structure)
- Handler is `Mangum` instance, callable, returns proper Lambda response format

### TypeScript Generation ✅
- `export-openapi.py` → `openapi.json` (valid JSON)
- `pnpm run generate-api-types` → `clock/src/generated/api-types.ts` (559 lines)
- Contains all path types, component schemas, operation types

### Evidence Files (21 files)
All saved to `.sisyphus/evidence/final-qa/`:
- `task-1-app-import.txt`, `task-1-health-check.txt`
- `task-2-model-validation.txt`, `task-2-client-error-handling.txt`
- `task-3-match-list-success.txt`, `task-3-match-list-empty.txt`
- `task-4-lineups-success.txt`, `task-4-lineups-empty.txt`
- `task-5-events-success.txt`, `task-5-match-info.txt`
- `task-6-weather-veduris.txt`, `task-6-weather-fallback.txt`, `task-6-weather-both-fail.txt`
- `task-7-terraform-validate.txt`, `task-7-no-modifications.txt`
- `task-8-full-test-suite.txt`, `task-8-handler-tests.txt`, `task-8-openapi-spec.json`
- `task-9-openapi-export.txt`, `task-9-typescript-types.txt`
- `mangum-handler-direct.txt`

### Notes on Plan Inaccuracies (not code bugs)
1. **Plan QA Task 1**: Used `/v3/health` path — should be `/health` (root_path handles prefix in API Gateway, not app routes)
2. **Plan QA Task 1**: Missing `sourceIp` in Lambda event dict — required by Mangum's API Gateway v2 handler
3. **Plan QA Task 2**: Model validation data missing `competition` field — model correctly requires it

### VERDICT

```
Tests [35/36 pass (1 skip)] | QA Scenarios [20/20 pass] | Handler [PASS] | OpenAPI [PASS] | VERDICT: APPROVE
```
