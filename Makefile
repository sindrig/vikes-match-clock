.PHONY: generate-api-spec generate-ts-client

# Export the tracked contract before generating the ignored frontend client
generate-api-spec:
	cd clock-api/v3 && python export-openapi.py

# Generate TypeScript API client from OpenAPI spec
generate-ts-client:
	cd clock && pnpm run generate-api-client
