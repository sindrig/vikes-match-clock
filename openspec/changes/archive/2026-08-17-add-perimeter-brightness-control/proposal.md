## Why

Perimeter LED brightness is currently adjusted manually through the Vnnox/UCenter UI, which is slow and risks applying a setting to the wrong screen during match operations. The documented Vnnox protocol supports scoped, programmatic brightness changes, so operators need a safe controller workflow backed by the existing perimeter daemon.

## What Changes

- Add an authenticated controller brightness control for the enabled perimeter LED system.
- Store the controller's requested percentage in the existing Firebase perimeter desired-state subtree; publish daemon-owned applied status separately.
- Extend the perimeter daemon to authenticate with Vnnox, snapshot the live perimeter brightness, convert percentages to the Vnnox write scale, write only the perimeter screen, verify the result, and retry transient Vnnox failures.
- Restore the prior snapshot when a write or verification fails after the daemon has begun changing brightness.
- Add daemon configuration and operational documentation for the local Vnnox endpoint and perimeter screen identity without committing credentials.

## Capabilities

### New Capabilities
- `perimeter-brightness-control`: Safe, Firebase-coordinated controller and daemon control of the perimeter LED screen brightness.

### Modified Capabilities

- None.

## Impact

- `clock/`: perimeter Firebase types, parsing, context actions, controller settings UI, and tests.
- `perimeter-control/`: Firebase listener, Vnnox client, configuration, status publication, retry/restore behavior, tests, and operating documentation.
- `firebase-rules.json`: retains controller writes under `states/{location}/perimeter` and daemon-only published status under `perimeter/{location}`.
