## MODIFIED Requirements

### Requirement: Audit history inspection
The system SHALL provide authorized operators with an inspection view for the
selected venue's audit history. Each visible entry MUST show when the operation
occurred, who performed it, the browser-session identifier, the action, state
area, and affected fields in a table with consistent columns. The view MUST
present newest entries first, load a bounded newest set rather than the
complete venue history, and clearly indicate when no records are available.
When events older than the current oldest visible event are available, the view
MUST provide a control to append the next bounded older set without removing
already visible events. When no older events remain, the view MUST not offer
that control.

#### Scenario: Operator investigates a reset
- **WHEN** an authorized operator opens the audit history after a match reset
- **THEN** the operator can identify the event time, user, browser session,
  reset action, and fields written by the reset in the history table

#### Scenario: Operator loads older audit history
- **WHEN** an authorized operator requests older events from a history view
  whose oldest visible event is not the oldest retained event
- **THEN** the system appends the next bounded set of older events, preserves
  all currently visible events, and keeps the combined table newest first

#### Scenario: Audit history is exhausted
- **WHEN** the oldest visible audit event is also the oldest retained event
- **THEN** the system does not display a control to load older events

#### Scenario: Venue has no audit history
- **WHEN** an authorized operator opens audit history for a venue with no
  records
- **THEN** the system displays an explicit empty-history state

#### Scenario: Unauthorized user opens audit history
- **WHEN** a user without access to a venue attempts to read its audit history
- **THEN** Firebase denies access and no audit entries are displayed
