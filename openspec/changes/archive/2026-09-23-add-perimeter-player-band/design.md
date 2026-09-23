# Design: Perimeter Player Band

## Context

The web perimeter renderer (`PerimeterDisplay` + `PerimeterRuntime`) today has
two channels: the prepared base ad deck (`adLayout`) and the overlay channel
(version-1 file commands, version-2 goal-scorer compositions). The controller
subtree `states/{location}/controller` — including `currentAsset` — is
public-readable (`firebase-rules.json:27`) and the perimeter display's
`FirebaseStateProvider` already subscribes to it for every display kind, so the
band can be derived without any new subscription or write path. The goal-scorer
presentation system (`scorerPresentation.ts`, `scorerCompositor.ts`,
`ScorerSourceLoader`) already implements the exact unit layout the band needs
(portrait, number, fitted name) with capped 30 fps presentation animation.

See proposal.md for motivation and specs/perimeter-player-band/spec.md for the
behavior contract.

## Goals / Non-Goals

**Goals:**

- Band derives from `controller.currentAsset`; zero new Firebase writes or
  command paths.
- Reuse the scorer band unit layout and presentation machinery; the band is a
  calmer sibling of the "procession" scorer celebration, not a new visual
  system.
- Clean layering: base deck < player band < overlay commands.
- Operator-configurable presentation style, audited, web venues only.
- Substitution assets render a two-player band on the same channel, with
  their own style setting, matching the scoreboard's off-left / on-right
  layout and fixing the inverted `subIn`/`subOut` field semantics.

**Non-Goals:**

- No generated-media pipeline.
- No new speed knob — drift speed is defined per style.
- No changes to the goal-scorer overlay's requirements or the media-pair
  library.

## Decisions

### D1: Derive at the display, not a controller-written command

The perimeter display derives the band from `currentAsset` (same public
subtree the scoreboard display reads). A controller-side mirror write was
rejected: lineup playback auto-advances via timed CAS completions, so mirroring
would chase every advance (derived-state writes, double-writer races with
multiple controllers, added latency) and would fight the single-writer overlay
channel on goal replacement. Derivation gives reconnect-safety for free and
keeps the display read-only.

### D2: Identity derivation from the asset

`PerimeterDisplay` derives a `PlayerBandIdentity` when `currentAsset.asset`
is one of `PLAYER`, `NO_IMAGE_PLAYER`, `MOTM`:

- `name` — non-empty, bounded (≤ 80 chars)
- `number` — normalized to a digit-only string (≤ 4 digits)
- `teamName` — the asset's team name (drives the crest fallback)
- `imageRef` — `asset.key` (the card's download URL) for `PLAYER`/`MOTM`;
  absent for `NO_IMAGE_PLAYER`

Assets flagged `isGoalCelebration` are skipped (their perimeter twin is the
goal-scorer overlay itself, which would cover the band anyway — avoids
composing a doomed presentation). Any invalid identity (empty name, non-digit
number, no team) yields no band — the deck stays visible. Image, video,
free-text, and URL assets never trigger the band; `SUB` assets derive a
substitution identity instead (D8).

### D3: Image chain reuses and extends the scorer source loader

Chain: `asset.key` (download URL) → team logo via the same resolution the
scoreboard's `useClubLogo` performs (club override `logoUrl`, then bundled
`clubLogos[teamName]`) → `{location}/crest.png`. A new loader method
(`PlayerBandSourceLoader` or an extension of `ScorerSourceLoader`) performs:

1. `NO_IMAGE_PLAYER` or failed/unusable `asset.key` fetch → team-logo hop.
   Override logos and bundled crests are resolved through the same
   bundled-crest closure pattern PerimeterDisplay already wires
   (`homeTeamRef` becomes a per-team resolver driven by `asset.teamName`).
2. Final fallback: the existing venue-crest + bundled-home-crest chain already
   implemented in `ScorerSourceLoader`.

Bundled crests work for away teams because `clubLogos` is keyed by team name
for all KSI clubs — the current loader only hardwires the home team because
scorers are always home players.

Loading goes through the persistent media cache keyed by full download URL
(the scorer loader keys by gs path + generation; download URLs are immutable
per object version). CORS is already configured for the display origins
(`scripts/storage-cors.json`), so no bucket change beyond the rules.

### D3 alternative considered: derive the gs:// object path from the download URL

Parsing `firebasestorage.googleapis.com/.../o/{path}?token=...` back to an
object path would let the band reuse generation-keyed cache entries, but the
URL shape varies (encoded paths, legacy tokens) and is fragile. URL-keyed
caching is simpler; the staleness tradeoff is accepted below.

### D4: Third runtime channel with scorer-style generation lifecycle

`PerimeterRuntime` gains a "band" channel rendered above `base` and below
`overlay`, implemented like the scorer branch of `setOverlay`:

- `setPlayerBand(band | null, now)` where `band` is a discriminated request:
  `{ kind: "player", identity }` or `{ kind: "substitution", off, on }` —
  prepares band presentations per overlay logical screen via injected
  `playerBand` dependencies (`loadSource`, `compose`, mirroring
  `PerimeterOverlayScorerDependencies`), atomically activates the latest
  request, invalidates stale ones, releases superseded resources, and reports
  failures through the existing screen-error path (Skjáarvillur).
- Replacement drops the active band immediately (base shows through while the
  next player's band prepares) — mirroring the overlay replacement behavior.
- While an overlay generation is active, the renderer receives no band sources
  (band object stays resident so clearing the overlay restores it without
  re-preparation).
- `clearChannel` gains a `"band"` case; power-off blacks out everything as
  today.

The renderer's `PerimeterRenderSources` gains an optional `band` /
`bandDynamic` group; the WebGL renderer composites base, then band, then
overlay. `overlayDynamic`/`bandDynamic` are independent flags so band frames
alone can refresh textures while base videos keep their own cadence.

### D5: Style config parallels scorerCelebration

- `types.ts`: `PlayerBandStyle = "plain" | "glow" | "streamer"` and a
  `playerDisplayStyle?: PlayerBandStyle` field on `PerimeterState`.
- `firebaseParsers.ts`: strict parse mirroring `scorerCelebration` (absent or
  invalid → `undefined`; display applies `DEFAULT_PLAYER_BAND_STYLE`).
- `FirebaseStateContext.tsx`: `setPerimeterPlayerDisplayStyle(style)` — audited
  as `perimeter.set-player-display-style`, write-only `{ playerDisplayStyle }`,
  exposed via `usePerimeter()`.
- `firebase-rules.json`: `.validate` rule for the new child under
  `states/$location/perimeter`, same shape as `scorerCelebration`'s enum rule.
- Admin UI: style picker section in the standalone perimeter manager (web
  venues only), adjacent to the scorer-celebration section; labels "Default",
  "Glow", "Streamer".

### D6: Band presentation variants inside the scorer presentation system

New `playerBandPresentation.ts` (sibling of `scorerPresentation.ts`) reusing
`drawBandUnit`'s motion hook from `scorerCompositor.ts`:

| Style | Background | Extra animation | Drift speed |
|-------|-----------|-----------------|-------------|
| `plain` | near-black flat field | soft fade-in entrance | ~1.5× procession |
| `glow` | near-black flat field | soft portrait glow pulse behind units | ~1.5× procession |
| `streamer` | near-black flat field | thin speed lines behind the band | ~2× procession |

(Procession reference: `height * 0.00012 px/ms` in
`scorerPresentation.ts:433`.) No impact flash, no red celebration field, no
mark typography — the entrance is a plain alpha fade. The presentation
anchors elapsed time at first visible render, exactly like the scorer.

### D7: Storage rules additions

`storage.rules`:

- `{location}/players/{fileName}` read rule becomes
  `^[A-Za-z0-9_-]{1,64}(-fagn)?[.]png$` (celebration images keep working;
  bare `{id}.png` photos become public).
- New `{location}/club-logos/{allPaths=**}` block: public read, writes stay
  authenticated-only.

This also closes the pre-existing gap where anonymous scoreboard displays
cannot load custom override team logos (the catch-all currently denies them).

### D8: Substitution band derives from SUB assets on the same channel

When `currentAsset.asset.type` is `SUB`, the derivation produces a
`{ kind: "substitution", off, on }` band request instead of a single
identity:

- `off` is derived from the asset's `subOut` object and `on` from `subIn`
  (after the D10 naming fix the field names match their meaning). Each side
  uses the same identity rules as D2: bounded name, digit-only number, team
  name, and `imageRef` from the sub-object's `key` (absent for
  `NO_IMAGE_PLAYER` sides).
- **Both sides must be valid**, otherwise no band renders — a half
  substitution (e.g. only the incoming player resolved) would be confusing on
  a strip that tiles around the stadium, and the deck showing through is the
  honest state. This mirrors D2's invalid-identity rule.
- Each side resolves its image independently through the D3 chain (photo →
  team logo by that side's team name → venue crest), so substitutions of the
  away team (and of players without photos) work like any player band.
- The unit layout matches the scoreboard substitution card: **off player on
  the left, on player on the right**, each cluster `[direction arrow |
  portrait | number | name]` with a red down arrow for the outgoing player
  and a green up arrow for the incoming player, plus a swap arrow between
  the two clusters. Arrows are drawn as vector triangles on the canvas (not
  font glyphs — glyph availability on venue browsers is not guaranteed).
  Red reuses the scorer accent (`SCORER_PRESENTATION_COLORS.accent`); green
  is a new constant mirroring the green used on the main-screen substitution
  numbers.
- The band lives exactly while the SUB asset is current — the same
  derivation lifecycle as the player band, which is precisely the lifecycle
  operators want: punch in several substitutions, then step through the
  substitutions queue ("Skiptingar"); each announced sub lights the perimeter
  as it hits the scoreboard and clears itself when the next asset plays. No
  duration field, no clearing writes. Because the band channel sits below
  overlays (D4), a live goal overlay simply covers the substitution band and
  it returns when the overlay clears — no single-writer clobbering decision
  is needed.
- Names shown are the sub-object's own `name`/`fullName` (last names trimmed
  at creation), so the band matches what the scoreboard card shows.

### D9: Substitution style config (`substitutionStyle`)

Parallel to `playerDisplayStyle` (D5), but a separate field because the two
style vocabularies don't overlap: the player band is ambient (always drifts,
dressing variants), while a substitution is a momentary event (entrance
variants over the settled layout).

- `types.ts`: `SubstitutionBandStyle = "static" | "relay" | "flash"`,
  `DEFAULT_SUBSTITUTION_BAND_STYLE = "static"`, and
  `substitutionStyle?: SubstitutionBandStyle` on `PerimeterState`.
- `firebaseParsers.ts`: strict parse mirroring `scorerCelebration`; absent or
  invalid → `undefined`, display applies the default.
- `FirebaseStateContext.tsx`: `setPerimeterSubstitutionStyle(style)` —
  audited as `perimeter.set-substitution-style`, writes only
  `{ substitutionStyle }`, exposed via `usePerimeter()`.
- `firebase-rules.json`: `.validate` rule for the new child under
  `states/$location/perimeter`, same enum shape as the other style fields.
- Admin UI: second picker in the standalone perimeter manager (web venues
  only), adjacent to the player-band picker; labels "Static",
  "Relay", "Flash".

#### Presentation styles
New substitution presentation code (sibling of the player-band presentation)
composes the two clusters of D8 into one unit and repeats it across the
screen width, with the three styles sharing the settled unit layout:

| Style  | Entrance                                   | After entrance                |
|--------|--------------------------------------------|-------------------------------|
| static | alpha fade-in of both clusters             | holds in place (no drift)     |
| relay  | alpha fade-in                              | units drift right-to-left     |
| flash  | white impact flash + scale-down pop of both clusters, swap arrow stamps in last | holds in place |

The flash style deliberately brings an impact entrance onto the band
channel: D6's no-flash rule scopes the calm *player* band, and a
substitution is an event the same way a goal is. Drift speed for `relay`
matches the player band's default (defined per style, no separate knob, as
with D5/D6). The presentation anchors elapsed time at first visible render
like every scorer/band presentation.

### D10: Fix the inverted `subIn`/`subOut` field semantics

The persisted SUB asset fields are inverted from their meaning
(`useHomeTeamQuickActions.ts` builds `subIn` from the *off-going* player;
`SubstitutionInfo.tsx` compensates by labeling `subIn` "Af velli" (off
the pitch). New semantics: **`subIn` = the player coming on**, **`subOut` =
the player going off**.

- Pure internal rename: the main screen renders the outgoing player left
  with a red number and the incoming player right with a green number today,
  and must continue to — so the visual order is preserved by reordering the
  render (`renderSub` emits `[subOut, subIn]`) and re-pairing the
  `SubstitutionInfo` labels — "Af velli" (off the pitch): subOut, "Inn á"
  (on the pitch): subIn — and the `Substitution.css` nth-of-type rules.
- Touch points: the creation site (`useHomeTeamQuickActions.ts` — the
  `handleSubOnSelect` assignment), `SubstitutionInfo.tsx`, `Asset.tsx`
  `renderSub()`, `Substitution.css`, and e2e/unit fixtures seeding SUB
  assets.
- **No migration**: SUB assets already persisted in controller queues are
  transient match-night data; the change declares them discarded rather than
  heuristically swapped (there is no marker to distinguish legacy from new
  shapes, so migration is impossible without one). Display code derives from
  the *new* shape only.
- The perimeter substitution band (D8) is specified against the corrected
  semantics, so the fix is a prerequisite for it.

## Risks / Trade-offs

- [Identifier-shaped photo objects become publicly readable] → Accepted by the
  user: exposure is limited to `.png` files whose names match the safe
  identifier convention under `players/` (operators' arbitrary-named uploads in
  the same folder stay private). Scope matches the existing `-fagn.png`
  precedent.
- [Download-URL cache can serve a replaced photo] → Staleness window until the
  cache entry is evicted or the display restarts; photos are replaced rarely
  and the previous image is still a valid rendering of "the card". If this
  bites, the fix (generation backfill from URL-parsed metadata) is additive.
- [Band flicker between consecutive lineup players] → Replacement drops the
  active band before the next is ready (base shows through), mirroring overlay
  replacement; the next band is usually ready in well under a second since
  photos are pre-cached and fonts are already loaded after the first band.
- [Composition work on every queue advance] → Bounded: presentations are
  recreated per player at ≤30 fps capped animation; when an overlay is active
  no band is composed at all.
- [Override-logo rules change broadens public reads] → Club crests are the same
  public-media category as `crest.png`; writes remain authenticated-only.
- [Substitution band on the same channel] → The band channel was designed as
  a discriminated request (`player` / `substitution`) from the start, so no
  parallel channel or precedence rule is added; the substitution band simply
  lives and dies with the SUB asset's current-asset window like any player
  band.
- [Inverted-field fix discards queued SUB assets] → Accepted: the Skiptingar
  queue is transient match-night data; a mid-match deploy could strand
  already-punched subs in queues, whose cards would still render correctly
  only after the queue is rebuilt. Operator risk is limited to re-punching
  subs created before the deploy lands.
- [Legacy substitution assets in persisted state render with swapped
  identities on the perimeter] → Same accepted tradeoff: legacy SUB assets
  are discarded by convention; the derivation validates both identities, so
  a legacy-shaped asset would render the pair in the swapped order only if
  both identities still validate — acceptable for transient data.

## Migration Plan

1. Deploy Storage rules (`{id}.png`, `club-logos/*`) — no-op for old bundles.
2. Deploy RTDB rules (`playerDisplayStyle`, `substitutionStyle` validate
   rules) — old bundles ignore the fields.
3. Deploy the web display bundle; displays re-derive automatically, no remote
   restart required for correctness (restart via "Endurræsa skjá" — the
   restart-screen button — is optional hygiene). The controller bundle with
   the naming fix deploys with it; SUB assets punched before the deploy are
   discarded by convention (D10).
4. Rollback: redeploy the prior web bundle (band fields ignored, extra public
   reads are inert). Clearing band style preferences is unnecessary — a stale
   bundle simply never reads them. A rollback mid-match has the same
   transient-queued-sub caveat as step 3.

## Open Questions

None — style sets, speeds, image chain, layering, substitution unit layout,
the separate style knob, the naming fix, and the both-players-valid rule were
settled with the requester.
