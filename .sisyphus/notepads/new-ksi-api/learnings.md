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
