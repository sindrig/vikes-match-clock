.PHONY: generate-api-spec generate-ts-client

# Stub target for future API spec generation (e.g., from Python source)
generate-api-spec:
	cd clock-api/v3 && python export-openapi.py

# Generate TypeScript API client from OpenAPI spec
generate-ts-client:
	cd clock && pnpm exec openapi-ts
