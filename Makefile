.PHONY: generate-api-spec generate-ts-client

PYTHON ?= .venv/bin/python
PNPM ?= pnpm
PYRIGHT_VERSION := 1.1.414

# Export the tracked contract before generating the ignored frontend client
generate-api-spec:
	cd clock-api/v3 && python export-openapi.py

# Generate TypeScript API client from OpenAPI spec
generate-ts-client:
	cd clock && pnpm run generate-api-client

.PHONY: api-check-python api-format-check api-typecheck

api-check-python:
	"$(PYTHON)" -c 'import sys; print(f"Python {sys.version.split()[0]}: {sys.executable}"); sys.exit(0 if sys.version_info[:2] == (3, 12) else "API tooling requires Python 3.12")'

api-format-check: api-check-python
	"$(PYTHON)" -m black --check --workers 1 --config clock-api/v3/pyproject.toml clock-api/v3/app clock-api/v3/tests clock-api/v3/export-openapi.py

api-typecheck: api-check-python
	$(PNPM) dlx pyright@$(PYRIGHT_VERSION) --threads 1 --project pyrightconfig.json --pythonpath "$(PYTHON)"
