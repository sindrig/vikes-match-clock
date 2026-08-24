## MODIFIED Requirements

### Requirement: Operator-controlled next-period start
The system SHALL leave the match paused when a valid halftime countdown expires. Countdown completion MUST be conditional on authoritative state still identifying the same active halftime countdown, and an obsolete suspended-client completion MUST leave a newer match generation unchanged. The system MUST retain the normal `Byrja` control for manually starting the next period.

#### Scenario: Start remains manual after halftime countdown
- **WHEN** the currently active halftime countdown expires after the first period
- **THEN** the match is paused at the completed period boundary and the operator can use `Byrja` to start the next period

#### Scenario: Suspended countdown resumes after next period starts
- **WHEN** a suspended client resumes with an expired halftime countdown after an operator has already started the next period
- **THEN** the obsolete completion is rejected and the running next-period clock remains unchanged

### Requirement: Existing countdown and injury-time behavior
The system SHALL preserve pre-match countdown behavior and existing injury-time display modes, except where halftime-transition eligibility or stale-session safety suppresses or rejects a transition. Countdown displays SHALL reach zero locally without requiring a designated controller owner, while any resulting shared-state transition MUST use current authoritative state.

#### Scenario: Pre-match countdown remains available
- **WHEN** an operator configures and starts a pre-match countdown
- **THEN** all connected displays show the countdown and a current controller can complete it without an ownership lease

#### Scenario: Obsolete pre-match countdown cannot stop a live match
- **WHEN** a suspended client resumes an expired pre-match countdown after the live match has started
- **THEN** the obsolete countdown does not pause or modify the live match
