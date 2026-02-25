.PHONY: update-ksi-spec generate-ksi-client generate-api-spec generate-ts-client

# Download the KSI OpenAPI specification from the authoritative source
update-ksi-spec:
	curl -s -o ksi-openapi.json https://api-ksi.analyticom.de/v3/api-docs/live

# Stub target for future KSI client generation (e.g., Python OpenAPI generator)
generate-ksi-client:
	openapi-python-client generate --path ksi-openapi.json --output-path clock-api/v3/ksi_client --overwrite --config clock-api/v3/openapi-client-config.yml

# Stub target for future API spec generation (e.g., from Python source)
generate-api-spec:
	cd clock-api/v3 && python export-openapi.py

# Generate TypeScript API client from OpenAPI spec
generate-ts-client:
	cd clock && pnpm exec openapi-ts
