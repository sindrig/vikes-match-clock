## Purpose

Prepare reliable, repeating perimeter goal-scorer media for every home player
and use it to attribute a home goal after the operator selects its scorer.

## ADDED Requirements

### Requirement: Home roster perimeter media preparation
When a home roster is loaded for a location, the system SHALL request
preparation of perimeter goal-scorer media for every home player with a valid
player identifier. The preparation result SHALL be associated with the roster
that initiated it and SHALL not prevent the roster from becoming available to
the controller.

#### Scenario: Roster preparation begins in the background
- **WHEN** an operator loads a match report or selects a match with a home roster
- **THEN** the controller SHALL store the roster and request perimeter-media preparation without waiting for all players to finish

#### Scenario: A player has no valid identifier
- **WHEN** a home-roster player has no valid player identifier
- **THEN** the system SHALL report that player's preparation as unavailable and SHALL continue preparing other players

### Requirement: Personalized and fallback scorer media
For each eligible home player, the system SHALL create one repeat-band image
for each configured perimeter overlay target. The band SHALL display the
player's name and shirt number repeatedly across the target width and SHALL use
the player's celebration image when it exists. When no celebration image
exists, the band SHALL use the standard club crest instead.

#### Scenario: Celebration image exists
- **WHEN** the player's configured celebration image is available
- **THEN** the prepared media SHALL use that image and report a personalized celebration-image result

#### Scenario: Celebration image is absent
- **WHEN** the player's configured celebration image is unavailable
- **THEN** the system SHALL prepare crest-backed media and report a usable fallback result

#### Scenario: Target dimensions differ
- **WHEN** configured overlay targets have different native dimensions
- **THEN** the system SHALL create a separate image that matches each target's published dimensions

### Requirement: Preparation status visibility
The system SHALL publish a location-scoped preparation status containing an
overall progress state and a per-player outcome. A player's outcome SHALL
distinguish preparing, personalized ready, crest fallback ready, unavailable,
and failed states. Ready outcomes SHALL provide the two perimeter media sources
needed to display that player.

#### Scenario: Operator views current readiness
- **WHEN** the controller receives a preparation status update
- **THEN** it SHALL display each home player's celebration-image and media-readiness outcome

#### Scenario: Preparation fails for one player
- **WHEN** media preparation fails for one player
- **THEN** the system SHALL publish a safe error for that player and SHALL continue processing other eligible players

### Requirement: Goal scorer perimeter attribution
For a home goal, the system SHALL keep the existing generic perimeter goal
overlay active while the operator selects the scorer. When the selected scorer
has ready personalized or fallback media, the system SHALL replace the generic
overlay with that player's prepared target pair. The selected scorer overlay
SHALL remain active until the operator clears the active overlay.

#### Scenario: Operator selects a prepared scorer
- **WHEN** a home goal is active and the operator selects a scorer with ready perimeter media
- **THEN** the main screen SHALL show the scorer reveal and the perimeter SHALL replace the generic goal overlay with the scorer's prepared repeat band

#### Scenario: Operator is selecting a scorer
- **WHEN** a home goal is active and no scorer has yet been selected
- **THEN** the generic perimeter goal overlay SHALL remain active

#### Scenario: Operator clears the celebration
- **WHEN** the operator clears the active overlay after a scorer has been selected
- **THEN** the system SHALL clear both the main-screen scorer reveal and the perimeter scorer overlay and restore rotating perimeter content

#### Scenario: Selected scorer media is not ready
- **WHEN** the operator selects a scorer whose perimeter media is preparing, unavailable, or failed
- **THEN** the main screen SHALL still show the scorer reveal and the generic perimeter goal overlay SHALL remain active

### Requirement: Daemon-owned overlay geometry
The perimeter daemon SHALL publish the configured native dimensions for each
overlay target in its read-only location status. The preparation system SHALL
use the published geometry for newly requested media and SHALL not require
frontend hard-coded target dimensions.

#### Scenario: Daemon configuration changes target dimensions
- **WHEN** the daemon publishes changed overlay target dimensions
- **THEN** a subsequent preparation request SHALL render media matching the new dimensions
