## Purpose

Ensure halftime countdowns enter the intended active period without leaving an
operator-facing state that can accidentally skip one or more match periods.

## ADDED Requirements

### Requirement: Halftime countdown starts the next period
The system SHALL advance to and start the next configured match period when a
halftime countdown reaches zero. The next period SHALL use its configured
start time, and the halftime countdown state SHALL be cleared.

#### Scenario: Halftime countdown expires
- **WHEN** an active halftime countdown reaches zero
- **THEN** the system advances to the next period and starts its elapsed clock

#### Scenario: Completed halftime countdown does not expose a second countdown
- **WHEN** a halftime countdown has advanced and started the next period
- **THEN** the controller does not offer an action to start another halftime countdown while that period is running

### Requirement: Operator can start the next period early
The system SHALL provide an explicit action to end an active halftime countdown
early and immediately advance to and start the next configured match period.
The action label SHALL communicate that it starts the next period rather than
only pausing the countdown.

#### Scenario: Operator starts next period before countdown expiry
- **WHEN** an operator selects the early-start action during an active halftime countdown
- **THEN** the system clears the countdown, advances to the next period, and starts its elapsed clock immediately

### Requirement: Pre-match countdown remains operator-started
The system SHALL retain the existing pre-match countdown behavior: when it
reaches zero, the match SHALL remain stopped until an operator starts it.

#### Scenario: Pre-match countdown expires
- **WHEN** a pre-match countdown reaches zero
- **THEN** the clock displays the match start state without starting elapsed match time
