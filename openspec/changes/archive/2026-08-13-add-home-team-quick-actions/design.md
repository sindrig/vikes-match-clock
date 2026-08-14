## Context

See proposal.md for motivation. The match view in `App.tsx` renders the screen preview, operational controls, `MatchActions`, and `MatchCountdownDisplay`. Home-team player operations currently live inside `TeamAssetController` on the Lið tab.

`TeamPlayerSelectionModal` already supplies the required full-screen, large-button presentation and divides a supplied roster into on-pitch and off-pitch groups. Existing substitution logic filters the first step to `show: true`, filters the replacement step to eligible off-pitch players, persists status changes through the controller context, and creates the same substitution queue asset used in the Lið tab.

## Goals / Non-Goals

**Goals:**
- Make the three high-frequency home-team operations accessible from the match view.
- Preserve the established asset generation, backgrounds, queue behavior, and Firebase-backed roster updates.
- Keep full-roster selection for player cards and man of the match.

**Non-Goals:**
- Add away-team shortcuts or change the Lið-tab workflow.
- Change roster data, substitution eligibility rules, queue naming, or asset rendering.
- Alter the layout of the screen preview or existing match controls.

## Decisions

### Add a dedicated match-view quick-actions component

Render a `HomeTeamQuickActions` component directly after `MatchCountdownDisplay` in `App.tsx`. It owns the `Heimalið aðgerðir` box and only renders actionable controls when the home roster has players. This gives the box the required visual placement without coupling it to settings or the tabbed asset controller.

Alternative considered: place the box in `MatchActions`. Rejected because `MatchActions` represents clock/match-state transitions, while these operations depend on controller roster and asset state.

### Reuse team-action behavior and the existing selection modal

Extract or share the home-team player-asset, man-of-the-match, and substitution operations currently implemented by `TeamAssetController`, then invoke them from the quick-actions component. Use `TeamPlayerSelectionModal` for each selection step so the quick actions keep the established full-screen grid rather than introducing a second picker.

The player-card and man-of-the-match entry points pass the complete home roster to the modal. The substitution entry point retains its two existing filters: on-pitch players for the player leaving and eligible off-pitch players for the player entering.

Alternative considered: duplicate the handlers in the new component. Rejected because duplicated queue, background, and Firebase-update behavior could diverge from the Lið tab.

### Preserve context-driven writes

Shared actions continue using the existing controller context APIs for `showItemNow`, `editPlayer`, and queue changes. The feature introduces no local mirror of roster or controller state; Firebase subscriptions remain authoritative after each write.

## Risks / Trade-offs

- [Refactoring shared handlers can regress existing Lið-tab controls] → Preserve their existing component tests and add tests for both entry points where behavior is shared.
- [A roster may be missing during match operation] → Hide or disable selections until a non-empty home roster is available, preventing empty modal workflows.
- [Substituted-off players are accidentally filtered from card/MOTM selection] → Test those actions using a `show: false` home player and pass the unfiltered roster only for those action types.

## Migration Plan

1. Release with the normal frontend deployment; no data migration is required.
2. If a critical regression appears, remove the match-view component import and render while leaving the established Lið-tab workflow unchanged.
