## Purpose

Render selected home-goal scorers directly on web perimeter displays from semantic player data without generating target-specific media files.

## ADDED Requirements

### Requirement: Semantic web scorer command
For a venue whose published perimeter renderer is `web`, selecting a valid home-team scorer SHALL replace the generic goal command with a location-scoped semantic scorer command. The command SHALL identify a fresh command instance and contain the player's identifier, display name, and shirt number without containing generated target-image references.

#### Scenario: Operator selects a scorer at a web venue
- **WHEN** a home goal is active at a web venue and the operator selects a player with a valid identifier, non-empty name, and shirt number
- **THEN** the system writes a fresh semantic scorer command and does not wait for or reference roster-prepared perimeter images

#### Scenario: Selected player lacks required display data
- **WHEN** the operator selects a player whose identifier, name, or shirt number is invalid for a semantic scorer command
- **THEN** the main-screen scorer reveal remains available but the system does not replace the generic perimeter goal command with a malformed scorer command

### Requirement: Browser-composed repeat band
The web perimeter display SHALL compose one repeat-band texture at the native dimensions of every configured overlay logical screen. Each band SHALL repeat the selected player's celebration image or fallback crest, shirt number, and name across the logical screen width without requiring daemon-published overlay geometry or uploaded generated media.

#### Scenario: Logical screens have different dimensions
- **WHEN** a semantic scorer command is received for a mapping with differently sized overlay logical screens
- **THEN** the display composes a complete band at each logical screen's published native width and height

#### Scenario: Text does not fit its nominal segment
- **WHEN** the player's name would overflow the available name area at the configured band height
- **THEN** the display reduces the name text size within a defined minimum and keeps the repeated units from overlapping

### Requirement: Celebration-image fallback
The web perimeter display SHALL first attempt to use the selected player's existing celebration image and SHALL use the venue crest when that image is absent or cannot be decoded. It MUST NOT activate a partial scorer overlay when neither source can be loaded.

#### Scenario: Celebration image is available
- **WHEN** the selected player's celebration image can be read and decoded
- **THEN** every composed target band uses that celebration image

#### Scenario: Celebration image is unavailable
- **WHEN** the selected player's celebration image is missing, unreadable, or undecodable and the venue crest is usable
- **THEN** every composed target band uses the venue crest and the scorer overlay remains usable

#### Scenario: No image source is usable
- **WHEN** neither the player's celebration image nor the venue crest can be loaded and decoded
- **THEN** the display retains its previously visible overlay, or leaves the base unobscured when no overlay was active, and reports a safe renderer error

### Requirement: Atomic scorer activation and replacement
The web perimeter display SHALL wait until fonts, image source, and every target texture for a semantic scorer command are ready before making that command visible. It SHALL replace all target textures in one rendered transition and retain the currently visible overlay while a replacement is preparing or if preparation fails.

#### Scenario: Scorer composition completes
- **WHEN** every target band for the current semantic command has been composed successfully
- **THEN** all target bands replace the visible overlay atomically above the continuously advancing base playlist

#### Scenario: A newer command supersedes composition
- **WHEN** a newer overlay command arrives before an earlier semantic scorer command finishes preparing
- **THEN** the earlier result is discarded and cannot replace the newer command

#### Scenario: Display reloads with an active scorer command
- **WHEN** a web perimeter display starts while a valid semantic scorer command is active
- **THEN** it composes and displays that scorer command after all target bands are ready

### Requirement: Shared overlay lifecycle
Semantic scorer overlays SHALL use the existing perimeter overlay channel and power behavior. Clearing the active overlay SHALL remove the scorer from every target atomically, and powering the perimeter off SHALL render black while retaining enough command state to restore the current scorer after power returns.

#### Scenario: Operator clears the scorer celebration
- **WHEN** the operator uses the existing clear-overlay action while a semantic scorer overlay is active
- **THEN** every scorer target is removed atomically and the advancing base playlist is visible

#### Scenario: Perimeter power is toggled
- **WHEN** the perimeter is turned off and then on while a semantic scorer command remains active
- **THEN** the display renders black while off and restores the composed scorer overlay above the restarted base playlist when powered on

### Requirement: Public read-only scorer source access
An unauthenticated web perimeter display SHALL be able to read only the venue crest and player celebration-image object shapes needed for scorer composition. Unauthenticated clients MUST NOT upload, replace, or delete those objects and MUST NOT gain read access to other player media through this capability.

#### Scenario: Public display reads an approved scorer source
- **WHEN** an unauthenticated perimeter display requests a venue crest or a player celebration image matching the approved object naming convention
- **THEN** Storage authorizes the read

#### Scenario: Public client requests unrelated player media
- **WHEN** an unauthenticated client requests another object from the venue player-media area
- **THEN** Storage denies the read

#### Scenario: Public client attempts to modify a scorer source
- **WHEN** an unauthenticated client attempts to create, replace, or delete a venue crest or player celebration image
- **THEN** Storage denies the request
