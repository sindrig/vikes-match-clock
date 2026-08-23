## Context

See proposal.md for motivation and `goal-scorer-perimeter-media` for the
behavior contract. Today the React controller starts fixed paired perimeter
goal videos when a home score is incremented. After the scorer is selected, it
only changes the main-screen player card. The perimeter daemon validates and
stages supplied Firebase Storage files but does not compose media. The daemon
already owns `PERIMETER_CLIP_CANVASES`, currently 4608x192 for the 48-screen
overlay and 3840x192 for the 40-screen overlay.

The roster is loaded asynchronously in the controller after a match selection
or match-report lookup. Firebase Realtime Database is the shared source of
truth, with controller intent under `states/{location}` and service-owned
outcomes under read-only top-level paths.

## Goals / Non-Goals

**Goals:**

- Render one static repeat-band PNG per home player and overlay target before
  the match requires it.
- Preserve the current generic-goal overlay as the immediate score response.
- Make every eligible player displayable through a standard-crest fallback.
- Show operators per-player image and rendering readiness.
- Derive rendering geometry from daemon-published target configuration.

**Non-Goals:**

- Generating GIFs or MP4s.
- Rendering at the instant a scorer is selected.
- Changing the Resolume daemon into a media compositor.
- Preparing away-team goal media.
- Automatically clearing a scorer overlay after a timeout.

## Decisions

### Firebase Functions renders the media

Use a new authenticated Firebase callable request to enqueue or start a
location-scoped preparation job. Cloud Functions has direct Admin SDK access to
the same Storage bucket and Realtime Database as player assets and status. Add
a server-side image compositor such as `sharp` to build PNGs.

The existing FastAPI Lambda is not used: it is an AWS-hosted KSI/weather API
with no Firebase credential or Storage responsibility. The perimeter daemon is
not used: its role remains safe validation, staging, playback, and hardware
status.

Alternative considered: compose in the browser. Rejected because preparation
depends on an open authenticated controller, cross-origin asset loading, and
browser performance. Alternative considered: render in the perimeter daemon.
Rejected because it couples Windows/Resolume operations to creative rendering.

### Store renderer outcome as daemon-style service status

The controller writes a preparation request under
`states/{location}/perimeter/goalScorerPreparation`. The Firebase Function
writes read-only result and per-player status under
`perimeter/{location}/goalScorerPreparation`. The request includes a generated
job identifier and a snapshot of eligible home players so work is tied to the
requested roster, not a later roster mutation.

The status contains job identity, overall phase and counts, plus per-player
`preparing`, `ready`, `fallback`, `unavailable`, or `failed` outcomes. Ready
and fallback entries contain the two validated `PerimeterOverlayFile` sources
used by the existing overlay command. The frontend only presents Firebase-
synchronized status and never infers readiness from Storage listings.

Alternative considered: have the function write directly to the existing
active overlay command. Rejected because preparation is pre-match work and
must not alter live playback.

### Static PNG repeat bands replace dynamic video

For each target, the compositor creates a native-size horizontal strip that
repeats a portrait-or-crest, number, name, and intentional gap. Resolume's
existing final-overlay-column loop repeats the static strip until clear, which
produces the desired continuous band without video encoding or transport
timing.

The personal source is `{location}/players/{playerId}-fagn.png`. If it cannot
be read, the renderer uses the standard club crest. Both routes are successful
display outcomes; only unexpected rendering or storage errors are failures.

### Publish native geometry from the daemon

The daemon adds overlay target geometry derived from its configured layer IDs,
target labels, and clip canvases to `perimeter/{location}`. The preparation
function reads this published geometry before rendering. It fails the request
safely if required target geometry is absent or malformed, rather than guessing
sizes.

Alternative considered: duplicate 4608x192 and 3840x192 in the function.
Rejected because a Resolume layout change would silently create invalid media.

### Preserve generic overlay until scorer attribution

The existing home-score action immediately sends the generic paired goal
overlay. The scorer-selection callback keeps the current main-screen player
reveal and, when the status provides a ready/fallback pair, replaces the
perimeter overlay with a fresh command ID. If the player is not ready, generic
media remains. The existing global clear command remains the only normal way to
end the player overlay.

## Risks / Trade-offs

- [Cloud Function native image dependency increases deployment size and cold
  start] → Use static PNG output, bounded input/output dimensions, and test the
  deployed Node runtime package.
- [A celebration image is corrupt or inaccessible] → Treat it as a crest
  fallback when absence/readability is expected; publish a safe failed outcome
  only when output cannot be produced.
- [A roster changes while a job is running] → Use request/job IDs and a roster
  snapshot; the controller only uses the current request's matching status.
- [Daemon geometry has not been published] → Keep roster setup usable, publish
  a visible preparation failure, and allow an explicit retry once the daemon is
  online.
- [Concurrent controller requests] → Last request wins for the desired job;
  status includes the job ID so stale function work cannot overwrite the newer
  request result.
- [Generated files accumulate] → Use deterministic paths scoped by location,
  player, geometry revision, and render version so repeated jobs can reuse or
  replace known assets; define cleanup separately if retention becomes costly.

## Migration Plan

1. Deploy the Cloud Function, data parsers, and UI while retaining the current
   fixed generic goal-media paths as the fallback.
2. Deploy the daemon geometry publisher and confirm the controller receives
   valid target data for staging.
3. Load a staging match roster, verify personalized and crest-fallback pairs,
   then verify generic-to-player replacement and clear behavior on hardware.
4. Roll back by disabling or removing preparation requests; the existing
   generic goal overlay remains operational and stored player media is inert.
