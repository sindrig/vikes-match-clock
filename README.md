Match clock

See [the environment and credential contract](docs/environment.md) to choose
credential-free frontend/emulator work or explicitly configured staging, API,
AWS and gateway access. For frontend tooling, see [API client preparation](docs/api-client-preparation.md).

# Structure

## clock

This is the React "clock" application. It contains the match clock that should be displayed in the stadium.

It also includes the control interface for managing the match clock.

## clock-api

This contains the match clock API.

### v3

FastAPI application wrapping the Analyticom KSI REST API for match data and weather. Deployed as a single Lambda behind API Gateway.
