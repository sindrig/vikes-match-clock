## Why

During a match, operators repeatedly need the home-team substitution, player-card, and man-of-the-match actions. Those actions currently require navigating to the Lið tab, slowing down time-sensitive game operation.

## What Changes

- Add a `Heimalið aðgerðir` quick-action box below all existing main-view control boxes, including the half-time countdown controls.
- Provide `Skipting`, `Birta leikmann`, and `Maður leiksins` actions scoped to the home team.
- Reuse the existing home-team substitution flow and full-size player-selection modal behavior.
- Include every home-team roster player in the player-card and man-of-the-match selections, including players whose `show` state is false after substitution.

## Capabilities

### New Capabilities
- `home-team-quick-actions`: Main-view shortcuts for the home team's high-frequency player and substitution actions.

### Modified Capabilities

None.

## Impact

- Affects the React match-control main view and the team asset controller/modal entry points in `clock/src/controller/`.
- Requires component tests for quick-action placement, modal launching, home-team scoping, and availability of substituted-off players.
- Does not change Firebase data contracts, APIs, or infrastructure.
