## Why

Perimeter playback currently depends on a stadium-local Raspberry Pi, Resolume Arena, and a custom gateway, making a second installation difficult to deploy and operate. The existing Firebase playlist and overlay model is already suitable for direct browser playback, so the clock application can provide a simpler renderer while Víkin continues using Resolume during the initial rollout.

## What Changes

- Add a venue-level **Perimeter** option to the public display selector when that venue has a published web-perimeter configuration.
- Persist whether a browser is a scoreboard or perimeter display so reloads and remote screen restarts return to the same display type.
- Add a fullscreen WebGL perimeter renderer that composes all logical strips into one exact-size packed output canvas.
- Fully download and validate the active base-playlist revision before playback, keep media in persistent browser storage, and double-buffer decoded cue pairs so 20-second transitions do not show blank or partially loaded frames.
- Run paired media from one monotonic cue clock, rate-fitting supported videos to the 20-second cue duration without upload-time transcoding.
- Render the existing Firebase overlay command as an independent channel above the continuously advancing base playlist; overlay selection and media generation are unchanged.
- Honor the existing perimeter `on`/`off` state by preloading while off, rendering black while off, and starting the first cue when switched on.
- Add an admin mapping editor for versioned logical-screen, source-region, packed-canvas, and destination-region configuration stored with the venue in Firebase.
- Permit anonymous stadium displays to read perimeter media from the venue's approved Storage paths while retaining authenticated writes.
- Keep the existing Resolume integration available per venue so Víkin can remain on Resolume while the second stadium uses the web renderer.

## Capabilities

### New Capabilities

- `perimeter-web-display`: Public display selection, persistent preloading, synchronized base and overlay playback, power behavior, compatibility, and remote restart behavior for the browser perimeter renderer.
- `perimeter-output-mapping`: Versioned Firebase output geometry, validation, and the admin mapping editor used to compose logical perimeter strips into a packed fullscreen canvas.

### Modified Capabilities

None.

## Impact

- Affects the public display selector, local display identity, `App.tsx` display routing, Firebase location parsing, perimeter state subscriptions, screen presence, and restart handling in `clock/`.
- Adds a browser media-cache and WebGL playback subsystem, plus unit, component, and end-to-end coverage for atomic pair playback and restart recovery.
- Extends the admin location manager and public `locations/{location}` schema with published perimeter renderer configuration.
- Extends perimeter ad-layout media records with immutable Storage object identity needed for reliable caching and revision replacement.
- Changes Firebase Storage rules for read-only public access to approved perimeter media paths; authenticated upload behavior remains.
- Preserves the existing daemon, Resolume commands, Firebase desired-state paths, and overlay producers for Resolume venues.
