## Purpose

Provides match-view shortcuts for the home team's frequent player and substitution operations without requiring operators to change controller tabs.

## ADDED Requirements

### Requirement: Home-team quick-action box
The match controller SHALL display a `Heimalið aðgerðir` box beneath all existing match-view controls, including the half-time countdown control. The box MUST provide `Skipting`, `Birta leikmann`, and `Maður leiksins` actions when a home-team roster is available.

#### Scenario: Quick actions follow the existing match controls
- **WHEN** the operator is viewing an active match with a home-team roster
- **THEN** the `Heimalið aðgerðir` box is displayed below the half-time countdown and contains all three actions

#### Scenario: No home-team roster is available
- **WHEN** no players have been loaded for the home team
- **THEN** the system MUST NOT offer a player or substitution selection that has no home-team players

### Requirement: Home-team substitution shortcut
The `Skipting` quick action SHALL open the same full-size substitution selection flow as the home team's `Skipting` action in the Lið tab. The first selection MUST contain only home-team players currently on the pitch, and the second selection MUST contain only eligible home-team players off the pitch. Completing both selections MUST update player on-pitch status and queue the substitution using the existing substitution behavior.

#### Scenario: Operator creates a home-team substitution
- **WHEN** the operator selects `Skipting`, selects an on-pitch home-team player, and then selects an eligible off-pitch home-team player
- **THEN** the system records the substitution, updates the two players' on-pitch statuses, and adds the substitution to the substitution queue

### Requirement: Home-team player-card shortcut
The `Birta leikmann` quick action SHALL open a full-size, large-button player-selection modal containing every home-team roster player. The selection MUST include players currently on the pitch and players who have been substituted off. Selecting a player MUST immediately display that player's standard player card.

#### Scenario: Operator displays a substituted-off player
- **WHEN** the operator opens `Birta leikmann` and selects a home-team player marked off the pitch
- **THEN** the system displays that player's player card

### Requirement: Home-team man-of-the-match shortcut
The `Maður leiksins` quick action SHALL open a full-size, large-button player-selection modal containing every home-team roster player. The selection MUST include players currently on the pitch and players who have been substituted off. Selecting a player MUST immediately display that player's man-of-the-match asset.

#### Scenario: Operator selects a substituted-off man of the match
- **WHEN** the operator opens `Maður leiksins` and selects a home-team player marked off the pitch
- **THEN** the system displays that player's man-of-the-match asset
