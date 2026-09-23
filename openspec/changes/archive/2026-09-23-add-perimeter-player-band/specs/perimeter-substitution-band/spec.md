# Perimeter Substitution Band

## Purpose

Mirrors the scoreboard's current substitution asset onto web perimeter screens
as a two-player band — the outgoing player on the left with a red down arrow,
the incoming player on the right with a green up arrow — on the same band
channel as the player band, layered beneath goal overlays, with its own
operator-selectable presentation style.

## ADDED Requirements

### Requirement: Substitution band follows the current substitution asset

The web perimeter display SHALL render a substitution band across every
configured logical screen while the scoreboard's current asset is a
substitution asset and SHALL stop rendering it when the current asset changes
to any other kind or to nothing. The band SHALL show the same pair the
scoreboard substitution card shows: the outgoing player on the left and the
incoming player on the right, each with the player's name, shirt number, and
image, with a red downward arrow accompanying the outgoing player and a green
upward arrow accompanying the incoming player. Both players SHALL yield a
valid identity (bounded non-empty name, digit-only shirt number, team name);
when either side fails to, the display SHALL render no substitution band and
the base ad deck SHALL show through.

#### Scenario: Announced substitution is playing

- **WHEN** the operator steps the substitutions queue ("Skiptingar") to a
  substitution asset whose two players both have names, numbers, and a team
  name
- **THEN** the perimeter renders the substitution band — outgoing player with
  a red down arrow on the left, incoming player with a green up arrow on the
  right — on every logical screen

#### Scenario: Substitution asset is missing one player's identity

- **WHEN** the current substitution asset references a player with an empty
  name or a missing or non-numeric shirt number
- **THEN** no substitution band renders and the base ad deck shows through

#### Scenario: Substitution asset is replaced

- **WHEN** the current asset changes from a substitution asset to any other
  asset kind or to nothing
- **THEN** the substitution band is dropped and the base ad deck shows
  through again

#### Scenario: Display connects mid-substitution

- **WHEN** a perimeter display (re)connects while a substitution asset is the
  current asset
- **THEN** it derives the substitution band from the current state without
  any command and begins rendering it

### Requirement: Substitution band image resolves like the player band

Each side of the substitution band SHALL resolve its image independently
through the player-band chain: the sub-object's own image reference first,
then the team logo for that side's team name (club override logo, then the
bundled club crest map), then the venue crest. Away-team substitutions SHALL
be treated the same as home-team substitutions.

#### Scenario: Both players have photos

- **WHEN** the current substitution asset references photos the perimeter
  display can fetch
- **THEN** the band shows each player's own photo beside their number and
  name

#### Scenario: One player has no photo

- **WHEN** one side of the current substitution asset has no image reference
  or an unusable one
- **THEN** that side resolves the team logo for the asset's team name (or the
  venue crest when the team logo cannot be resolved) while the other side
  keeps its photo

#### Scenario: Away-team substitution

- **WHEN** the current substitution asset belongs to the away team and a side
  has no photo
- **THEN** the band resolves that away team's logo, not the home team's crest

### Requirement: Substitution band is layered below goal overlays

The substitution band SHALL share the player band's channel layering: it
renders above the base ad deck and below the active overlay channel. While an
overlay command is active, the substitution band SHALL NOT be visible above
it, and when the overlay is cleared the substitution band SHALL return while
its substitution asset is still current. Powering the perimeter off SHALL
black the display out regardless of the band.

#### Scenario: Goal overlay is live when a substitution is announced

- **WHEN** a goal-scorer overlay command is active while a substitution asset
  is the current asset
- **THEN** the goal overlay covers the substitution band on every logical
  screen and no state is overwritten by either side

#### Scenario: Goal overlay is cleared during a substitution

- **WHEN** the active overlay is cleared while the substitution asset is
  still the current asset
- **THEN** the substitution band returns without any controller action

### Requirement: Substitution band style is operator-configurable

The perimeter configuration SHALL provide a substitution style selection
(distinct from the goal-scorer celebration and player-band style fields),
restricted to the styles `static`, `relay`, and `flash` with `static` as the
default. Every style SHALL share the settled two-player unit layout. The
`static` and `flash` styles SHALL hold the band in place after their
entrances; the `relay` style SHALL drift the repeated units slowly
right-to-left. Style values SHALL be strictly validated; invalid or absent
values SHALL fall back to the default style.

#### Scenario: Operator picks a substitution style

- **WHEN** an authenticated operator selects a substitution style in the
  perimeter admin for a web venue
- **THEN** the style is persisted in the desired perimeter state, any visible
  substitution band recomposes with the new style, and the write is recorded
  in the audit trail

#### Scenario: Invalid or absent substitution style value

- **WHEN** the perimeter configuration contains no substitution style or an
  unknown one
- **THEN** the band renders with the default style and nothing is written

### Requirement: Substitution band stays read-only

Deriving and rendering the substitution band SHALL NOT create any new Firebase
write path, command token, or audit event: the display observes the public
controller subtree and the perimeter configuration that already exist. The
only permitted writes are the operator's audited style selection and the
storage and database rules changes shared with the player band capability.

#### Scenario: Substitution band activates during queue playback

- **WHEN** the substitution band activates as the Skiptingar queue is stepped
  or auto-advances
- **THEN** no perimeter desired-state or audit writes are produced by the
  display

#### Scenario: Substitution media uses the shared public-read additions

- **WHEN** an unauthenticated perimeter display fetches a substitution
  player's photo or team logo under the conventions extended by the
  `perimeter-player-band` capability
- **THEN** the fetch succeeds without authentication and no additional rules
  beyond that capability's are required
