# Add Perimeter Player Band

## Why

The web perimeter renderer is live, but when the scoreboard displays the home
team's starting lineup before a match (or a player via the "Birta leikmann"
(show player) / "Maður leiksins" (man of the match) actions), the perimeter
screens keep showing the rotating ad deck. Operators
want the perimeter to mirror the player currently shown on the scoreboard: the
player's image with number and name beside it, drifting slowly around the
perimeter — a calmer variant of the "procession" goal-scorer presentation.

The same mirror logic should cover substitutions. Operators punch in several
substitutions at once and then announce them by stepping through the
substitutions queue ("Skiptingar"); when a substitution asset is the current
asset, the perimeter should show the same pair the scoreboard shows — the
outgoing player on the left, the incoming player on the right, each with a
directional arrow — so fans around the stadium can read the swap the moment
it is announced.

## What Changes

- The web perimeter display **derives** a player band from the already-public
  `states/{location}/controller` subtree: while `currentAsset` is a player-like
  asset (`PLAYER`, `NO_IMAGE_PLAYER`, `MOTM`), each logical screen renders an
  animated band of that player (image + shirt number + name, repeating,
  right-to-left drift). No new Firebase write paths, no command tokens; the
  perimeter display remains read-only.
- New runtime channel layered **above the base ad deck and below the overlay
  channel**: goal-scorer overlay commands and named media pairs cover the band,
  and when an overlay is cleared the band returns while the player asset is
  still current. Non-player assets (ads, free text, video) drop the band and
  restore the base deck.
- Band image chain: the card asset's own image (`asset.key` — the photo /
  fagn-portrait download URL the scoreboard card uses) → team logo resolved from
  `asset.teamName` (club override logo, then the bundled `clubLogos` crest —
  works for away teams) → venue `crest.png` fallback.
- **Storage rules**: anonymous reads extended to identifier-shaped
  `{location}/players/{safeId}.png` objects (alongside the existing
  `-fagn.png` convention) and to `{location}/club-logos/*` override logos —
  which also fixes the pre-existing gap where anonymous scoreboard displays
  fail to load custom override team logos.
- New `playerDisplayStyle` perimeter config field (parallel to
  `scorerCelebration`), selectable in the perimeter admin for web venues and
  audited as `perimeter.set-player-display-style`. Styles: **Default**
  (plain drift), **Glow** (drift + soft portrait glow pulse),
  **Streamer** (drift + thin speed lines), at ~1.5–2× the "procession"
  speed. Band styles and speeds are defined per style; no separate speed knob.
- Away players display the same way as home players (the band follows
  `currentAsset` regardless of side).
- **Substitution assets join the same band channel**: while `currentAsset` is
  a `SUB` asset, the band renders a two-player substitution unit — outgoing
  player with a red down arrow on the left, incoming player with a green up
  arrow on the right (matching the scoreboard's layout), with a swap arrow
  between them. Both players must yield a valid identity (bounded name,
  digit-only number) or no band renders. Each side resolves its image like
  the player band (photo → team logo → venue crest), so away substitutions
  work the same way.
- **Sub-in/sub-out naming fix**: the persisted SUB asset fields are inverted
  from their meaning today (`subIn` holds the outgoing player, `subOut` the
  incoming one). This change corrects the semantics: `subIn` is the player
  coming on, `subOut` the player going off. Main-screen visuals are
  unchanged; the fix touches the creation site, the SubstitutionInfo labels,
  the card ordering/CSS, and test fixtures. Substitution assets already
  persisted in queues are transient match-night data and are not migrated.
- New `substitutionStyle` perimeter config field (parallel to
  `scorerCelebration` and `playerDisplayStyle`), styles:
  **Static** (the band holds in place after its entrance), **Relay** (units
  drift right-to-left like the player band), **Flash** (impact entrance,
  then hold). Selectable in the perimeter admin for web venues and audited
  as `perimeter.set-substitution-style`.

## Capabilities

### New Capabilities

- `perimeter-player-band`: The web perimeter display mirrors the scoreboard's
  currently displayed player (starting-lineup cards, "Birta leikmann" show
  player, "Maður leiksins" man of the match) with an animated
  image/number/name band, layered under goal overlays, with an
  operator-selectable presentation style.
- `perimeter-substitution-band`: The web perimeter display mirrors the
  scoreboard's current substitution asset with a two-player band — outgoing
  player with a red down arrow, incoming player with a green up arrow —
  layered under goal overlays on the same band channel, with its own
  operator-selectable presentation style.

### Modified Capabilities

<!-- None: existing perimeter capabilities (base ad deck, goal-scorer media,
     brightness, audit trail) keep their requirement behavior. The new band is
     a new display channel and a new style config, not a change to their
     requirements. -->

## Impact

- `clock/src/storage.rules`-adjacent: `storage.rules` (public read additions),
  `firebase-rules.json` (validate rule for the new `playerDisplayStyle` child
  under `states/$location/perimeter`).
- `clock/src/types.ts` (`PerimeterState` fields + both band style types),
  `clock/src/contexts/firebaseParsers.ts` (strict parse of both style fields),
  `clock/src/contexts/FirebaseStateContext.tsx` (subscription passthrough +
  audited write actions).
- `clock/src/perimeter/`: new band presentation(s) beside
  `scorerPresentation.ts` (reusing the scorer band unit layout and ≤30 fps
  presentation machinery), `runtime.ts` (third channel + player generation
  lifecycle), `PerimeterDisplay.tsx` (derivation from `controller.currentAsset`,
  which is already subscribed), image loading via existing persistent cache
  infra.
- `clock/src/controller/` perimeter admin (style picker sections, web venues
  only) and `clock/src/audit` action naming.
- Sub-in/sub-out naming fix: `useHomeTeamQuickActions.ts` (creation site),
  `SubstitutionInfo.tsx` (labels), `Asset.tsx` `renderSub()` ordering,
  `Substitution.css` nth-of-type colors, and e2e fixtures seeding SUB assets.
- Tests: parser, presentation snapshot, runtime, and display spec updates;
  e2e coverage in the emulator perimeter specs (lineup band + substitution
  band).
