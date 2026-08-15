# firebase-audit-trail Specification

## Purpose

Provides a durable, attributable history of shared match-clock changes so
operators can reconstruct and investigate incidents after they occur.

## Requirements

### Requirement: Attributable state-mutation audit record
The system SHALL create one audit record for every successful authenticated
client mutation to a venue's shared match, controller, view, or perimeter
state. Each record MUST identify the venue, authenticated user ID, a stable
per-browser-session ID, event timestamp, logical action, affected state area,
and the complete set of fields written by that operation. The record MUST NOT
include authentication credentials or other secrets.

#### Scenario: Operator pauses a running match
- **WHEN** an authenticated operator pauses a running match
- **THEN** the system records an event for that venue identifying the operator
  and browser session and showing that the match `started` and `timeElapsed`
  fields were written

#### Scenario: Operator resets a match
- **WHEN** an authenticated operator confirms a match reset
- **THEN** the system records one event identifying the operator and browser
  session and showing all match fields reset by the operation

#### Scenario: Anonymous display receives shared state
- **WHEN** an anonymous display subscribes to a venue's shared state
- **THEN** the system MUST NOT create an audit record

### Requirement: Atomic audit history
The system SHALL commit a state mutation and its audit record as one atomic
operation. A rejected or failed mutation MUST NOT create an audit record, and
a successful mutation MUST NOT be observable without its corresponding audit
record.

#### Scenario: State write is denied
- **WHEN** Firebase rejects an operator's attempted state mutation
- **THEN** no audit record is added for that attempted mutation

#### Scenario: State write succeeds
- **WHEN** Firebase accepts an operator's state mutation
- **THEN** the resulting state and its audit record are both available to
  authorized readers

### Requirement: Immutable, authenticated audit records
The system SHALL permit audit-record creation only as part of an authorized
operator mutation for the same venue. After creation, audit records MUST NOT
be modified or deleted by clients. The system MUST reject a record whose user
identity does not match the authenticated writer.

#### Scenario: Operator attempts to alter prior history
- **WHEN** an authenticated operator attempts to modify or delete an existing
  audit record
- **THEN** Firebase rejects the request and the original record remains intact

#### Scenario: Operator attempts identity impersonation
- **WHEN** an authenticated operator attempts to create an audit record naming
  another user ID
- **THEN** Firebase rejects the request

### Requirement: Audit history inspection
The system SHALL provide authorized operators with an inspection view for the
selected venue's recent audit history. Each visible entry MUST show when the
operation occurred, who performed it, the browser-session identifier, the
action, state area, and affected fields. The view MUST present newest entries
first, load a bounded recent set rather than the complete venue history, and
clearly indicate when no records are available.

#### Scenario: Operator investigates a reset
- **WHEN** an authorized operator opens the audit history after a match reset
- **THEN** the operator can identify the event time, user, browser session,
  reset action, and fields written by the reset

#### Scenario: Venue has no audit history
- **WHEN** an authorized operator opens audit history for a venue with no
  records
- **THEN** the system displays an explicit empty-history state

#### Scenario: Unauthorized user opens audit history
- **WHEN** a user without access to a venue attempts to read its audit history
- **THEN** Firebase denies access and no audit entries are displayed

### Requirement: Bounded audit retention
The system SHALL retain audit records for 90 days from their server timestamp.
A scheduled trusted process MUST delete records older than 90 days. Client
operators MUST NOT be able to delete records before expiry, and cleanup MUST
not delete records that are 90 days old or newer.

#### Scenario: Expired record is cleaned up
- **WHEN** the scheduled cleanup process encounters an audit record older than
  90 days
- **THEN** it deletes that record from the audit history

#### Scenario: Recent record is retained
- **WHEN** the scheduled cleanup process encounters an audit record that is 90
  days old or newer
- **THEN** it leaves that record available for inspection

#### Scenario: Operator attempts early cleanup
- **WHEN** an authenticated operator attempts to delete an audit record before
  expiry
- **THEN** Firebase rejects the request
