## Purpose

Ensure halftime countdowns only transition between valid match periods while preserving the operator-controlled start of each new period.

## ADDED Requirements

### Requirement: Eligible halftime transition control
The controller SHALL offer `Næsti hálfleikur` only when the match is paused, the elapsed time has reached or exceeded the current first remaining period boundary, the injury-time display mode permits the control, and at least one later period boundary remains.

#### Scenario: Countdown is offered at the period boundary
- **WHEN** a paused match is at 45:00 with remaining boundaries of 45 and 90 minutes
- **THEN** the controller offers `Næsti hálfleikur`

#### Scenario: Countdown is offered during injury time
- **WHEN** a paused match is at 46:30 with remaining boundaries of 45 and 90 minutes
- **THEN** the controller offers `Næsti hálfleikur`

#### Scenario: Countdown is unavailable after a completed transition
- **WHEN** a halftime countdown has completed and the paused match is at 45:00 with 90 minutes as its first remaining boundary
- **THEN** the controller does not offer `Næsti hálfleikur`

#### Scenario: Countdown is unavailable after the final period
- **WHEN** a paused match has reached its final remaining boundary and no later boundary remains
- **THEN** the controller does not offer `Næsti hálfleikur`

### Requirement: Validated halftime countdown transition
The system SHALL start a halftime countdown only when the match is paused, the elapsed time has reached or exceeded the current first remaining period boundary, and at least one later period boundary remains. The system MUST reject an ineligible action without changing match state.

#### Scenario: Direct stale action is rejected after halftime completion
- **WHEN** a stale or direct controller action requests a halftime countdown at 45:00 with 90 minutes as the first remaining boundary
- **THEN** the system leaves the match paused at 45:00 and does not start a new countdown

#### Scenario: Final-period action is rejected
- **WHEN** a controller action requests a halftime countdown after the final remaining boundary
- **THEN** the system leaves the match state unchanged

### Requirement: Operator-controlled next-period start
The system SHALL leave the match paused when a valid halftime countdown expires. It MUST retain the normal `Byrja` control for manually starting the next period.

#### Scenario: Start remains manual after halftime countdown
- **WHEN** a halftime countdown expires after the first period
- **THEN** the match is paused at the completed period boundary and the operator can use `Byrja` to start the next period

### Requirement: Existing countdown and injury-time behavior
The system SHALL preserve pre-match countdown behavior and existing injury-time display modes, except where the halftime-transition eligibility rule suppresses or rejects `Næsti hálfleikur`.

#### Scenario: Pre-match countdown remains available
- **WHEN** an operator configures and starts a pre-match countdown
- **THEN** the countdown behavior is unchanged by halftime-transition validation
