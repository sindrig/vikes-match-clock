## MODIFIED Requirements

### Requirement: Home roster perimeter media preparation
When a home roster is loaded for a location whose published perimeter renderer is `resolume`, the system SHALL request preparation of perimeter goal-scorer media for every home player with a valid player identifier and shirt number. The preparation result SHALL be associated with the roster that initiated it and SHALL not prevent the roster from becoming available to the controller. The system SHALL NOT request roster-wide generated scorer media for a location whose published perimeter renderer is `web`.

#### Scenario: Roster preparation begins in the background
- **WHEN** an operator loads a match report or selects a match with a home roster at a Resolume venue
- **THEN** the controller stores the roster and requests perimeter-media preparation without waiting for all players to finish

#### Scenario: A player has no valid identifier
- **WHEN** a home-roster player at a Resolume venue has no valid player identifier or shirt number
- **THEN** the system skips generated-media preparation for that player and continues preparing other eligible players

#### Scenario: Web roster becomes available
- **WHEN** an operator loads a home roster at a web perimeter venue
- **THEN** the controller stores the roster without creating a goal-scorer preparation job or generated perimeter files

### Requirement: Personalized and fallback scorer media
For each eligible home player at a Resolume venue, the system SHALL create one repeat-band image for each configured perimeter overlay target. The band SHALL display the player's name and shirt number repeatedly across the target width and SHALL use the player's celebration image when it exists. When no celebration image exists, the band SHALL use the standard club crest instead.

#### Scenario: Celebration image exists
- **WHEN** the player's configured celebration image is available during Resolume media preparation
- **THEN** the prepared media uses that image and reports a personalized celebration-image result

#### Scenario: Celebration image is absent
- **WHEN** the player's configured celebration image is unavailable during Resolume media preparation
- **THEN** the system prepares crest-backed media and reports a usable fallback result

#### Scenario: Target dimensions differ
- **WHEN** configured Resolume overlay targets have different native dimensions
- **THEN** the system creates a separate image that matches each target's published dimensions

### Requirement: Preparation status visibility
For a Resolume venue, the system SHALL publish a location-scoped preparation status containing an overall progress state and a per-player outcome. A player's outcome SHALL distinguish preparing, personalized ready, crest fallback ready, unavailable, and failed states. Ready outcomes SHALL provide the perimeter media sources needed to display that player. A web venue SHALL not require or present generated-media preparation status as scorer eligibility.

#### Scenario: Operator views current readiness
- **WHEN** the controller receives a preparation status update for a Resolume venue
- **THEN** it displays each home player's celebration-image and media-readiness outcome

#### Scenario: Preparation fails for one player
- **WHEN** media preparation fails for one player at a Resolume venue
- **THEN** the system publishes a safe error for that player and continues processing other eligible players

#### Scenario: Operator views scorer selection at a web venue
- **WHEN** the scorer-selection dialog opens for a web venue
- **THEN** it does not mark players unavailable merely because no generated-media preparation status exists

### Requirement: Goal scorer perimeter attribution
For a home goal, the system SHALL keep the existing generic perimeter goal overlay active while the operator selects the scorer. At a web venue, selecting a valid scorer SHALL replace the generic command with a semantic scorer command for browser composition. At a Resolume venue, selecting a scorer with ready personalized or fallback media SHALL replace the generic overlay with that player's prepared target pair. The selected scorer overlay SHALL remain active until the operator clears the active overlay.

#### Scenario: Operator selects a scorer at a web venue
- **WHEN** a home goal is active at a web venue and the operator selects a scorer with valid semantic display data
- **THEN** the main screen shows the scorer reveal and the perimeter receives a semantic scorer command without waiting for generated media

#### Scenario: Operator selects a prepared scorer
- **WHEN** a home goal is active at a Resolume venue and the operator selects a scorer with ready perimeter media
- **THEN** the main screen shows the scorer reveal and the perimeter replaces the generic goal overlay with the scorer's prepared repeat band

#### Scenario: Operator is selecting a scorer
- **WHEN** a home goal is active and no scorer has yet been selected
- **THEN** the generic perimeter goal overlay remains active

#### Scenario: Operator clears the celebration
- **WHEN** the operator clears the active overlay after a scorer has been selected
- **THEN** the system clears both the main-screen scorer reveal and the perimeter scorer overlay and restores rotating perimeter content

#### Scenario: Selected scorer media is not ready
- **WHEN** the operator selects a scorer at a Resolume venue whose perimeter media is preparing, unavailable, or failed
- **THEN** the main screen still shows the scorer reveal and the generic perimeter goal overlay remains active

### Requirement: Daemon-owned overlay geometry
The perimeter daemon SHALL publish the configured native dimensions for each Resolume overlay target in its read-only location status. Resolume media preparation SHALL use the published geometry for newly requested media and SHALL not require frontend hard-coded target dimensions. Web scorer composition SHALL use the venue's published web logical-screen mapping and SHALL not depend on daemon-owned overlay geometry.

#### Scenario: Daemon configuration changes target dimensions
- **WHEN** the daemon publishes changed Resolume overlay target dimensions
- **THEN** a subsequent Resolume preparation request renders media matching the new dimensions

#### Scenario: Web venue has no daemon geometry
- **WHEN** a web venue has a valid published logical-screen mapping but no daemon-owned overlay geometry
- **THEN** semantic scorer overlays remain available and are composed at the mapped logical-screen dimensions
