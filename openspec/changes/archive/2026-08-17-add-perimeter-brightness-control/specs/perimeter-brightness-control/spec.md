## Purpose

Enables authenticated match operators to set the perimeter LED brightness while
the system safely confines, applies, verifies, and reports each hardware change.

## ADDED Requirements

### Requirement: Authenticated perimeter brightness selection
When the perimeter feature is enabled, the controller SHALL provide an
authenticated operator control for selecting a perimeter brightness percentage.
The control MUST constrain submitted values to an inclusive 0 through 100
percent range, display the latest requested value from Firebase, and make no
local optimistic state change after submission.

#### Scenario: Operator submits a valid brightness
- **WHEN** an authenticated operator selects a valid brightness percentage and confirms it
- **THEN** the controller writes that requested percentage to the location's perimeter desired-state path and displays the Firebase-synchronized value

#### Scenario: Invalid brightness is entered
- **WHEN** an operator attempts to submit a non-numeric or out-of-range brightness value
- **THEN** the controller MUST reject the submission without writing a brightness command

### Requirement: Daemon-owned brightness application status
The perimeter service SHALL publish the latest brightness application status at
a daemon-owned, client-read-only perimeter status path. The status MUST identify
the requested percentage, the verified applied percentage when available, and
whether processing is pending, applied, or failed with a safe error message.

#### Scenario: Brightness request is pending
- **WHEN** the service observes a new valid requested brightness
- **THEN** it publishes a pending status for that requested percentage before reporting a terminal outcome

#### Scenario: Brightness request is applied
- **WHEN** the service verifies that the perimeter screen reflects the requested brightness
- **THEN** it publishes an applied status containing the requested and verified applied percentages

#### Scenario: Brightness request fails
- **WHEN** the service cannot safely complete or verify a brightness request
- **THEN** it publishes a failed status with the requested percentage and a safe error description

### Requirement: Scoped and verified Vnnox brightness change
For each valid brightness request, the perimeter service SHALL authenticate to
the configured Vnnox endpoint, snapshot the existing perimeter screen brightness,
and write only the configured perimeter screen identity. It MUST convert the
operator's percentage to the protocol's fraction scale, verify the post-write
screen brightness, and MUST NOT target any other screen.

#### Scenario: Verified scoped write
- **WHEN** the service receives a valid brightness request and Vnnox is available
- **THEN** it snapshots the current perimeter brightness, writes the converted requested value only to the configured perimeter screen, and reports applied only after verification matches the request

#### Scenario: Other Vnnox screen is present
- **WHEN** Vnnox reports multiple screens for the device
- **THEN** the service MUST use only the configured perimeter screen identity and MUST NOT include another screen in the brightness write

### Requirement: Failure recovery for brightness changes
The perimeter service SHALL use bounded retries for transient Vnnox failures.
If a write has started but cannot be completed or verified, it MUST attempt to
restore the pre-write perimeter brightness snapshot and report the request as
failed. A newer requested brightness MUST supersede retries for an older
request.

#### Scenario: Verification fails after a write
- **WHEN** a brightness write returns but subsequent verification fails or does not match the request
- **THEN** the service attempts to restore the snapshotted perimeter brightness and publishes a failed status

#### Scenario: Newer request arrives during retries
- **WHEN** a transient failure is being retried and a newer requested brightness is received
- **THEN** the service stops retrying the older request and processes the newer request instead

### Requirement: Configurable hardware connection without committed secrets
The perimeter service SHALL obtain the Vnnox endpoint, device connection
identity, perimeter screen identity, and credentials from runtime configuration.
The repository MUST provide documented non-secret configuration defaults or
examples and MUST NOT contain production credentials.

#### Scenario: Required Vnnox configuration is absent
- **WHEN** brightness control is enabled but required Vnnox configuration is missing or invalid
- **THEN** the service MUST not issue a brightness write and MUST publish a failed status that identifies configuration as the cause
