# Spec: Perimeter Ad Layout

## Requirements

### R1: Dynamic Lane Metadata
The daemon publishes its configured lanes (IDs and names) from local Resolume
configuration. The React UI renders lanes dynamically and must not hard-code
two lanes.

### R2: Desired/Applied Split
The controller writes the desired layout to `states/{location}/perimeter/adLayout`.
The daemon reads this path and publishes results to `perimeter/{location}/adLayout`.
The daemon never writes to the desired path.

### R3: Revision-Based Deduplication
Every controller write includes a new UUID `revision`. The daemon ignores
already-applied revisions and processes only the newest.

### R4: Column Composition
Every column in a layout must contain exactly one file entry per configured
lane. The controller rejects incomplete columns before writing; the daemon
repeats this validation.

### R5: Source Validation
All source objects must belong to the approved bucket and the current
location's `perimeter/` prefix. File names must be basename-only and reject
traversal/control characters.

### R6: Playback Timing
- Static images: exactly 20,000 ms transport duration set via Resolume API.
- Videos: Resolume-reported duration used.
- The daemon disables per-clip looping.
- The final column wraps back to column zero.

### R7: Revision Supersession
A newer revision supersedes all pending retries, timers, and callbacks from
older revisions. The daemon must cancel its timer before processing a new
revision.

### R8: Column Operations
- Add: Dialog with one required selector per lane, lists existing Storage
  objects, permits upload.
- Delete: Removes only the Firebase layout reference, never Storage objects.
  Confirmation required.
- Reorder: @dnd-kit horizontal sortable, complete new layout revision.

### R9: Empty Layout
An empty columns array is valid and causes the daemon to clear/stop only the
ad-layout playback lanes.

### R10: Restart Safety
On daemon restart, read the desired revision from Firebase and restore it.
Do not create a new revision or mutate the requested document.

### R11: Goal Overlay Independence
The existing goal overlay protocol remains separate and unchanged. Ad-layout
slots must not conflict with goal-overlay slots.

## Verification Claims

| Claim | Evidence |
|---|---|
| Controller cannot save incomplete columns | Component tests for missing lane selections and disabled save |
| Upload is immediately selectable | Storage-helper mock test and emulator/browser flow |
| Delete keeps Storage files | Verify only RTDB layout changes; no Storage delete call |
| Reorder persists exact order | Component test plus parser/subscription round-trip |
| UI is dynamic by lane metadata | Test two and three daemon-published lanes |
| Daemon rejects malicious/malformed layouts | Unit tests for version, lanes, paths, names, limits |
| New revision supersedes prior work | Controlled async staging/timer test |
| Static files hold for 20 seconds | Resolume-client contract test |
| Videos play their reported duration | Resolume-client contract test |
| Final column returns to first | Timer test with three columns |
| Invalid/new failed layout preserves running ads | Integration test |
