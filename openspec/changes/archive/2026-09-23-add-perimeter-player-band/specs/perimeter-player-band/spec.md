# Perimeter Player Band

## Purpose

Mirrors the player currently displayed on the scoreboard (starting-lineup
cards, "Birta leikmann" show player, "Maður leiksins" man of the match) onto
web perimeter screens as an animated image/number/name band, layered beneath
goal overlays, with an operator-selectable presentation style.

## ADDED Requirements

### Requirement: Player band follows the scoreboard's current player asset

The web perimeter display SHALL render a player band across every configured
logical screen while the scoreboard's current asset is a player-like asset
(player card, player card without image, or man-of-the-match) and SHALL stop
rendering it when the current asset changes to any other kind or to nothing.
The band SHALL show the same player identity the scoreboard card shows: the
player's name, shirt number, and image. Away-team players SHALL be treated the
same as home-team players. Substitution assets SHALL NOT trigger the
single-player band in this capability; their two-player band is specified by
the `perimeter-substitution-band` capability of this change and shares this
channel.

#### Scenario: Starting lineup card is playing

- **WHEN** the scoreboard plays a starting-lineup queue whose current item is a
  player card with number, name, and team name
- **THEN** the perimeter renders the drifting band with that player's image,
  number, and name on every logical screen

#### Scenario: Player asset is replaced by a non-player asset

- **WHEN** the current asset changes from a player card to an advertisement or
  free-text asset
- **THEN** the band is dropped and the base ad deck shows through again

#### Scenario: Queue playback is stopped

- **WHEN** the operator stops the playing queue and the current asset becomes
  null
- **THEN** the band is dropped and the base ad deck shows through again

#### Scenario: Display connects mid-item

- **WHEN** a perimeter display (re)connects while a player card is the current
  asset
- **THEN** it derives the band from the current state without any new command
  and begins rendering it

### Requirement: Band image resolves like the scoreboard card

The band's image SHALL resolve from the current player asset's own image
reference first; when that is unusable, SHALL fall back to the team logo for
the asset's team name (club override logo, then the bundled club crest map),
and finally to the venue crest. An unresolvable image SHALL NOT leave a blank
band; the fallback chain always yields a drawable source before the band
activates, or the band stays on the previous state.

#### Scenario: Player card has a photo

- **WHEN** the current player card references an uploaded player photo that the
  perimeter display can fetch
- **THEN** the band uses that same photo next to the number and name

#### Scenario: Player card has no image

- **WHEN** the current asset is a player card without an image reference
- **THEN** the band uses the team logo from the asset's team name (or the venue
  crest when the team logo cannot be resolved)

#### Scenario: Away player without a photo

- **WHEN** the current asset is an away-team player card without an image
- **THEN** the band resolves that away team's logo, not the home team's crest

### Requirement: Band is layered below goal overlays

The player band SHALL render above the base ad deck and below the active
overlay channel. While an overlay command (goal-scorer overlay, named media
pair, goal video) is active, the band SHALL NOT be visible above it, and when
the overlay is cleared or replaced by a non-scorer state, the band SHALL return
while its player asset is still current. Powering the perimeter off SHALL black
the display out regardless of the band.

#### Scenario: Goal happens mid-lineup

- **WHEN** a goal-scorer overlay command is issued while a lineup player band
  is active
- **THEN** the goal overlay covers the band on every logical screen

#### Scenario: Goal overlay is cleared during the lineup

- **WHEN** the active overlay is cleared while the lineup player card is still
  the current asset
- **THEN** the player band returns without any controller action

### Requirement: Band presentation style is operator-configurable

The perimeter configuration SHALL provide a presentation-style selection for
the player band (distinct from the goal-scorer celebration style), restricted
to the defined style set with a defined default. Every style SHALL share the
band's unit layout (image, number, name beside each other) and SHALL drift the
repeated units slowly right-to-left at a style-defined speed faster than the
goal-scorer procession style. Style values SHALL be strictly validated;
invalid or absent values SHALL fall back to the default style.

#### Scenario: Operator picks a band style

- **WHEN** an authenticated operator selects a band style in the perimeter
  admin for a web venue
- **THEN** the style is persisted in the desired perimeter state, every band
  recomposes with the new style, and the write is recorded in the audit trail

#### Scenario: Invalid or absent style value

- **WHEN** the perimeter configuration contains no band style or an unknown one
- **THEN** the band renders with the default style and nothing is written

### Requirement: Player band stays read-only

Deriving and rendering the player band SHALL NOT create any new Firebase write
path, command token, or audit event: the display observes the public controller
subtree and the perimeter configuration that already exist, and no perimeter
telemetry or desired state is mutated by band behavior.

#### Scenario: Band activates during lineup playback

- **WHEN** the band activates as a queue auto-advances between lineup players
- **THEN** no perimeter desired-state or audit writes are produced by the
  display

### Requirement: Band media and style config are publicly readable

Firebase Storage SHALL permit anonymous reads of identifier-shaped player photo
objects under the location's `players/` prefix (in addition to the existing
celebration-image convention) and of the location's club override logo objects,
while all writes and unrelated objects remain authenticated-only. The
perimeter state subtree SHALL validate the band style field with the same
strictness as the goal-scorer celebration field.

#### Scenario: Anonymous perimeter fetches a player photo

- **WHEN** an unauthenticated perimeter display fetches a player photo named
  with a safe player identifier
- **THEN** the fetch succeeds without authentication

#### Scenario: Unrelated player media stays private

- **WHEN** an unauthenticated client requests another object under the
  location's `players/` prefix that does not match the identifier conventions
- **THEN** the read is denied

#### Scenario: Malformed band style in the database

- **WHEN** the band style field is written with a value outside the defined
  style set
- **THEN** the write is rejected by the database rules and any client parsing
  falls back to the default style
