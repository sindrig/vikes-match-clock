## Purpose

Prevent mounted, reconnected, or resumed browser sessions from applying obsolete timer-driven mutations to authoritative venue state while preserving safe multi-controller operation.

## ADDED Requirements

### Requirement: Passive state rendering
The system SHALL NOT mutate shared match, controller, view, or perimeter state merely because a display component mounts, rerenders, resumes, or calculates that locally displayed time has expired.

#### Scenario: Suspended match clock resumes
- **WHEN** a browser resumes with an expired local clock calculation while Firebase contains a newer running match state
- **THEN** rendering the clock does not pause, reset, or otherwise alter the newer match state

#### Scenario: Timed asset renderer resumes
- **WHEN** a browser resumes after one or more locally scheduled asset timers have elapsed
- **THEN** mounting or resuming the asset renderer does not consume queues or clear the current shared asset from stale local state

#### Scenario: Auxiliary timer renderer resumes
- **WHEN** a browser resumes with locally expired timeout or penalty calculations
- **THEN** rendering those calculations does not remove the current shared timeout or penalty from stale local state

### Requirement: Freshness barrier for authenticated mutations
The system MUST prevent an authenticated client from mutating shared venue state after the page has been suspended, hidden, or disconnected until the client has re-established connectivity and confirmed current Firebase state for the selected venue. Read-only rendering MAY continue while mutations are blocked.

#### Scenario: Hidden controller becomes visible
- **WHEN** a controller becomes visible after its Firebase state may have become stale
- **THEN** shared-state controls remain unable to write until current venue state has been confirmed

#### Scenario: Disconnected controller reconnects
- **WHEN** a controller loses connectivity and later reconnects
- **THEN** mutations attempted from pre-disconnection state are not queued or applied before current venue state is confirmed

#### Scenario: Continuously synchronized controller
- **WHEN** an authenticated controller remains connected and current
- **THEN** normal explicit operator actions remain available without acquiring an ownership lease

### Requirement: Conditional automatic transitions
An automatic shared-state transition MAY be attempted by any current authenticated controller, but it MUST be conditional on the authoritative match or controller state still matching the state generation that scheduled the transition. An obsolete or duplicate attempt MUST leave shared state unchanged.

#### Scenario: Current countdown expires
- **WHEN** a current controller observes the active countdown generation reach zero and authoritative state still identifies that countdown
- **THEN** the system applies the countdown completion transition exactly once in effect

#### Scenario: Obsolete countdown expires after another period started
- **WHEN** a resumed controller attempts to complete an older countdown after authoritative state has started a different clock generation
- **THEN** the system rejects the obsolete transition and leaves the running match unchanged

#### Scenario: Multiple current controllers observe the same expiry
- **WHEN** multiple synchronized controllers observe the same automatic transition become due
- **THEN** their attempts converge on one resulting state without requiring a designated owner

### Requirement: Explicit destructive time correction
The system SHALL preserve intentional operator controls for starting, pausing, resetting, and correcting match time, while distinguishing those actions from automatic expiry. An intentional backward correction of substantial match time MUST require explicit confirmation.

#### Scenario: Operator pauses a current running match
- **WHEN** an operator explicitly pauses a current running match
- **THEN** the system persists elapsed time calculated from the authoritative running state

#### Scenario: Operator substantially reduces elapsed time
- **WHEN** an operator requests a backward correction beyond the configured safety threshold
- **THEN** the system requires confirmation before applying the correction
