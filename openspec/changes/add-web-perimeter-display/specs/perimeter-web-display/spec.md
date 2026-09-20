## Purpose

Defines how a public stadium browser selects and runs a reliable perimeter display from Firebase-controlled paired media without requiring Resolume or a local gateway.

## ADDED Requirements

### Requirement: Venue-level perimeter display selection
The system SHALL show one Perimeter display option for each venue with a valid published web-perimeter configuration and SHALL NOT show that option for venues without such a configuration or venues configured to use Resolume.

#### Scenario: Web perimeter venue is selectable
- **WHEN** the public display selector loads a venue whose published perimeter renderer is `web`
- **THEN** it shows one Perimeter option in addition to that venue's scoreboard screens

#### Scenario: Resolume venue is not selectable as a web perimeter
- **WHEN** the public display selector loads a venue whose perimeter renderer is `resolume`
- **THEN** it does not show a Perimeter display option

### Requirement: Persistent display identity
The system SHALL persist the selected venue and display type locally so a perimeter display remains a perimeter display across ordinary reloads and remote restart commands.

#### Scenario: Perimeter display reloads
- **WHEN** a browser selected as a perimeter display reloads
- **THEN** it reconnects to the same venue and opens the perimeter renderer without returning to the selector or scoreboard

#### Scenario: Display disconnects
- **WHEN** an operator uses the display disconnect action
- **THEN** the system clears the persisted display identity and returns to the public display selector

### Requirement: Complete base revision preloading
The renderer MUST completely download and validate every media object referenced by the active base-playlist revision before beginning that revision, and MUST retain those objects in persistent local browser storage using immutable object identity.

#### Scenario: Initial playlist becomes ready
- **WHEN** every pair in the active base revision has been downloaded and passes media validation
- **THEN** the renderer marks the revision ready and may begin playback when the perimeter state is on

#### Scenario: A base asset is unavailable or invalid
- **WHEN** any referenced base asset cannot be downloaded, decoded, or validated as the configured logical screen
- **THEN** the renderer does not begin that playlist revision and exposes a loading or error state instead of displaying a partial pair

#### Scenario: Cached revision is loaded after restart
- **WHEN** the browser restarts and its persistent cache contains every immutable object required by the active revision
- **THEN** the renderer validates and reuses the cached objects without requiring them to be downloaded again

### Requirement: Atomic paired base playback
The renderer SHALL treat each playlist cue as one atomic media pair, display cues in configured order for a shared 20-second interval, loop from the final cue to the first, and never expose one member of a pair without the other.

#### Scenario: Cue boundary is reached
- **WHEN** the shared cue clock reaches a 20-second boundary and the next complete pair is decoded and ready
- **THEN** both logical-screen assets become visible in the same rendered transition without a blank frame

#### Scenario: Render work is delayed
- **WHEN** rendering resumes after missing one or more expected timer callbacks
- **THEN** the visible cue is derived from elapsed monotonic time rather than extending prior cues or accumulating timer drift

#### Scenario: Playlist is empty
- **WHEN** the active base-playlist revision contains no cues
- **THEN** the renderer displays black base content

### Requirement: Paired video timing
The renderer SHALL start paired videos from one shared cue clock. It SHALL use native browser playback-rate control to fit decodable videos to the 20-second cue when the required rate is supported; otherwise it SHALL play at the natural rate, loop a shorter video, and cut a longer video at the cue boundary.

#### Scenario: Rate fitting is supported
- **WHEN** a video's decoded duration can be fitted to 20 seconds using a supported playback rate
- **THEN** the renderer applies that rate and the video reaches its end at the shared cue boundary

#### Scenario: Rate fitting is not supported
- **WHEN** the required playback rate is not supported by the browser
- **THEN** a shorter video repeats as needed and a longer video stops being shown at the 20-second shared cue boundary

#### Scenario: Cue contains mixed media
- **WHEN** a cue pairs an image with a video
- **THEN** the image remains visible and the video follows the shared timing policy for the complete 20-second cue

### Requirement: Atomic playlist revision replacement
The renderer MUST keep the current valid base revision playing while it prepares a newer revision and SHALL replace it only after every pair in the newer revision is locally available and valid.

#### Scenario: New revision becomes ready
- **WHEN** a newer base revision has been completely downloaded and validated
- **THEN** the renderer starts that revision from its first cue at an atomic cue boundary

#### Scenario: New revision preparation fails
- **WHEN** a newer base revision contains an unavailable or invalid asset
- **THEN** the renderer continues playing the last valid revision and reports the replacement failure

### Requirement: Independent overlay channel
The renderer SHALL consume the existing perimeter overlay command as an independent channel above the base playlist, SHALL continue advancing the base playlist while an overlay is visible, and SHALL change overlay visibility only when the complete overlay pair is ready or explicitly cleared.

#### Scenario: Overlay is activated
- **WHEN** a new overlay command is received and every asset in its first pair is decoded and ready
- **THEN** both overlay assets become visible atomically above the base content

#### Scenario: Overlay is preparing
- **WHEN** a replacement overlay command is still downloading or decoding
- **THEN** the currently visible overlay remains visible, or the base remains unobscured if no overlay was active

#### Scenario: Overlay is cleared
- **WHEN** the overlay command is removed
- **THEN** both overlay assets are removed in one rendered transition and the currently advancing base cue remains visible

#### Scenario: Multi-column overlay advances
- **WHEN** a non-final overlay column reaches its declared duration
- **THEN** the complete next overlay pair replaces it atomically, while the final overlay column loops until cleared or replaced

### Requirement: Perimeter power state
The renderer SHALL preload content regardless of perimeter power state, render black while the state is off, and begin the base playlist at its first cue when the state changes to on.

#### Scenario: Renderer starts while off
- **WHEN** the renderer finishes preloading while the perimeter state is off
- **THEN** it remains black and ready without starting visible playback

#### Scenario: Perimeter turns on
- **WHEN** the authoritative perimeter state changes from off to on
- **THEN** the renderer starts the first base cue at time zero

#### Scenario: Perimeter turns off
- **WHEN** the authoritative perimeter state changes to off
- **THEN** the renderer atomically displays black and pauses visible media playback

### Requirement: Remote restart compatibility
The existing remote screen restart command SHALL reload perimeter displays as well as scoreboard displays without changing their selected display type.

#### Scenario: Remote restart token changes
- **WHEN** a perimeter display observes a new controller refresh token after its initial subscription value
- **THEN** it reloads the page and returns to the same venue's perimeter renderer

### Requirement: Resolume compatibility boundary
The system SHALL preserve the existing desired-state paths and numeric Resolume lane-key documents while allowing the web renderer to normalize those keys to configured logical-screen identifiers at its Firebase boundary.

#### Scenario: Existing numeric base layout is loaded
- **WHEN** a web venue receives a valid base layout using its configured legacy numeric lane keys
- **THEN** the renderer maps each key to the corresponding logical screen before validation and rendering

#### Scenario: Existing Resolume venue operates
- **WHEN** a venue remains configured with the Resolume renderer
- **THEN** its daemon and controller continue using the existing state and status paths without requiring the web renderer

### Requirement: Public read-only perimeter media access
An unauthenticated stadium display SHALL be able to read media referenced by the approved perimeter base and overlay paths, while unauthenticated clients MUST NOT upload, replace, or delete those objects.

#### Scenario: Public renderer downloads approved media
- **WHEN** an unauthenticated perimeter renderer requests an object from an approved venue perimeter media path
- **THEN** Storage authorizes the read

#### Scenario: Public client attempts to modify media
- **WHEN** an unauthenticated client attempts to create, replace, or delete a perimeter media object
- **THEN** Storage denies the request
