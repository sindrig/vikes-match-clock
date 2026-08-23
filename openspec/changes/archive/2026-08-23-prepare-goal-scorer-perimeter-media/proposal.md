## Why

The perimeter currently starts a generic home-goal video before the scorer is
known and cannot attribute the goal to the selected player. Preparing
player-specific perimeter media when a match roster is loaded makes scorer
selection reliable during live play while still giving every home player a
branded fallback when no celebration photo is available.

## What Changes

- Add a Firebase-hosted server-side preparation workflow that creates a
  repeating goal-scorer PNG pair for every home-team player after a roster is
  loaded.
- Use a player's existing celebration image when available; otherwise render
  the standard club crest with the player's name and number.
- Publish per-player celebration-image and media-preparation status so an
  operator can see whether personalized or fallback media is ready.
- Keep the existing generic home-goal perimeter loop active until a scorer is
  selected, then replace it with that player's prepared perimeter pair.
- Keep the selected player's perimeter media visible until the existing clear
  action restores the rotating perimeter content.
- Publish daemon-owned overlay target dimensions so renderer output follows the
  configured Resolume geometry rather than duplicated frontend dimensions.

## Capabilities

### New Capabilities
- `goal-scorer-perimeter-media`: Prepare and play personalized or crest-backed
  repeating perimeter media for selected home-team scorers.

### Modified Capabilities

- None.

## Impact

- `clock/`: roster-loading flow, Firebase state parsing, goal scorer selection,
  and perimeter operator status UI.
- `functions/`: authenticated Firebase callable or job workflow, Admin Storage
  rendering, and Realtime Database job status publication.
- `perimeter-control/`: publish configured overlay target geometry alongside
  existing daemon-owned perimeter status.
- Firebase Storage and Realtime Database schemas, Cloud Functions dependencies,
  and tests for rendering, status, and live goal behavior.
