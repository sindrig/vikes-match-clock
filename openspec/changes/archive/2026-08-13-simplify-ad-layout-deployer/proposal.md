# Simplify Perimeter Ad-Layout to Content Deployer

**Change ID:** `simplify-ad-layout-deployer`

## Proposal

Replace the ad-layout controller's playback-driver architecture — own
timer, column cycling, connect/disconnect, transport manipulation — with
a content-deployer model: the daemon stages and loads ad files into deck
columns on the base layers, but **never touches transport, connect, or
column advancement**.  The composition's existing autopilot does all
cycling, and Resolume's UI operates normally throughout.

Why:

- The current ad-layout controller fights the deck autopilot (two clocks
  driving the same output).  The original design never addressed this — it
  works only incidentally when the autopilot happens to be on the right
  column.
- Freezing the autopilot (the overlay's approach) breaks the Resolume UI
  and puts column-management burden on the daemon — neither is acceptable
  for the stadium workflow.
- By letting Resolume own cycling and the daemon own content, each system
  does what it does best.  The daemon shrinks ~60% while the
  operator-facing UI (FilePicker, column drag, lanes, thumbnails) is
  unchanged.

Key changes from the current design:

- No `connect`, `transport/*`, `loop-on/off`, `transport/duration` API calls.
- No internal column-cycling timer or playback state machine.
- No autopilot freeze/restore (the goal overlay keeps its existing one —
  overlay.js is untouched).
- Ad files are distributed across the full Resolume deck column range on
  the base layers (1,3).
- `PERIMETER_AD_LAYER_CLIP_SLOTS` env var is removed; the daemon derives
  the full column range from the composition at startup.
