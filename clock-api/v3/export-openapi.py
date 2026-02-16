"""Export FastAPI OpenAPI spec to JSON for TypeScript type generation.

Usage:
    python export-openapi.py

Generates openapi.json in the current directory.
This file is used by the frontend's generate-api-types script to create
TypeScript type definitions from the API schema.
"""

import json
from app.main import app

if __name__ == "__main__":
    with open("openapi.json", "w") as f:
        json.dump(app.openapi(), f, indent=2)
    print("OpenAPI spec exported to openapi.json")
