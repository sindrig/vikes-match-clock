## Context

See `proposal.md` for motivation. The current system already stores the desired perimeter power state, base ad layout, and active overlay below `states/{location}/perimeter`. Víkin's Node daemon translates those documents into Resolume layers and publishes lane/status metadata below `perimeter/{location}`.

The browser display path is anonymous and read-only. Its venue and screen identity are persisted locally as `listenPrefix` and `screenKey`, and `RefreshHandler` reloads it when `controller.refreshToken` changes. Firebase Storage currently requires authentication for reads, while perimeter layout records contain `gs://` object references.

Live capture establishes two logical screens (`4608x192` and `3840x192`), atomic paired cues, 20-second fit-to-cue playback, and one packed output framebuffer. The second stadium will likewise expose one packed Windows desktop to one Chromium kiosk process. The base playlist is expected to remain below roughly 2 GB, but the design does not impose a fixed playlist-size limit.

The current admin location editor reads known fields and replaces a complete location document. Any new location-owned configuration must therefore be included in its parser and save model to avoid being deleted by unrelated edits.

## Goals / Non-Goals

**Goals:**

- Run the second stadium's perimeter output in the existing clock web application with no Raspberry Pi, local gateway, or Resolume dependency.
- Guarantee that base cue transitions never expose unloaded media or a partial logical-screen pair.
- Keep desired perimeter state in the existing Firebase paths and preserve the Resolume deployment at Víkin.
- Make venue geometry explicit, versioned, visually editable, and reusable by both base and overlay channels.
- Support restart recovery and continued playback from locally cached immutable media.

**Non-Goals:**

- Deciding when an overlay should be shown or changing any overlay producer.
- Generating goal, player, or named overlay media.
- Replacing Vnnox hardware brightness control.
- Providing frame lock across multiple computers or browser processes.
- Replacing Resolume at Víkin in the initial rollout.
- Publishing trusted renderer health or applied-layout status from an anonymous browser in the first release.

## Decisions

### 1. Model the installation as a local display target

Local state will persist a discriminated display target:

```text
scoreboard(screenKey) | perimeter
```

`listenPrefix` remains the venue identity. Selecting Perimeter sets the venue and perimeter target; disconnect clears both. `App` routes an anonymous connected browser to either the existing scoreboard tree or the perimeter renderer. `RefreshHandler` and the existing controller subscription remain outside that branch so the same remote restart token reloads both display types.

This is preferable to adding a new synced Firebase view because display type identifies the physical browser installation, not match-wide shared state. A URL-only mode was rejected because ordinary reload and kiosk startup already rely on local persistence.

### 2. Store published output configuration with the public venue

`locations/{location}/perimeterDisplay` will be the canonical discovery and geometry document. It contains:

- schema version and immutable revision ID;
- renderer type (`web` or `resolume`);
- exact framebuffer dimensions and black background;
- logical screens keyed by stable IDs, with names and native dimensions;
- compatibility keys mapping existing numeric base and overlay lanes to logical IDs;
- source/destination regions and transform permissions;
- playback defaults, initially a 20-second cue and fit-to-cue video policy.

The selector already subscribes to public `locations`, so this avoids opening one state subscription per venue merely to discover perimeter support. Runtime commands remain below `states/{location}/perimeter`, preserving Firebase ownership and the existing daemon contract.

The old `states/{location}/perimeter/enabled` flag remains readable during rollout for the existing controller and daemon-related UI, but web-display discovery uses the published renderer configuration as its single source of truth. A later cleanup can migrate all feature gating after both modes have operated successfully.

### 3. Normalize Resolume keys at the adapter boundary

Existing ad layouts use base keys `1` and `3`; overlays use `2` and `4`. The venue configuration associates these keys with stable logical IDs such as `screen-48` and `screen-40`. The Firebase adapter normalizes documents before they enter cache, validation, playback, or editor code.

This keeps the existing daemon operational and avoids a risky coordinated data migration. New renderer and editor code never treats a Resolume layer number as a screen identity.

### 4. Use one WebGL canvas and one playback clock

One WebGL canvas will have backing dimensions exactly equal to the published framebuffer. CSS scales only the element's presentation; it does not define render resolution. Each logical asset is uploaded once as a texture, and configured regions sample source UV rectangles into destination vertices. The framebuffer naturally clips explicitly permitted negative or oversized destinations.

Base and overlay are separate channels using the same logical-screen geometry. Base renders first and overlay second. One renderer process and surface avoid cross-window synchronization and make paired visibility changes atomic.

Canvas 2D was considered, but WebGL gives explicit texture sampling, video frame updates, transforms, and stable handling of the `4608`-pixel logical texture. Separate DOM video/image strips were rejected because exact source slicing, packing, and atomic multi-strip transitions become browser-layout dependent.

### 5. Use an elapsed monotonic timeline, not chained timers

On each off-to-on transition, the renderer records `performance.now()` as cue origin. The current index is derived as:

```text
floor((now - origin) / cueDurationMs) modulo cueCount
```

Rendering runs from animation frames and media-frame callbacks. A delayed callback therefore catches up to the correct cue rather than extending the current cue or accumulating drift. Reloading while state is already on establishes a new origin after startup readiness and starts cue zero, matching the chosen restart behavior.

Both videos seek from the same cue-relative media time. When the browser supports the required rate, `playbackRate = decodedDuration / cueDuration` reproduces Resolume's fit-to-cue behavior without transcoding. If the rate is unsupported, natural playback loops short videos and the shared boundary cuts long videos. Images remain for the entire cue.

Audio is muted to satisfy kiosk autoplay policy and because perimeter content has no audio requirement.

### 6. Separate complete byte caching from decoder preparation

Preloading means every object in the active base revision is fully present in persistent browser storage before that revision can play. It does not mean every video remains actively decoded, which would exceed browser decoder and GPU limits.

The cache pipeline is:

```text
gs:// reference + immutable generation
  -> authorized HTTPS download URL
  -> persistent Cache Storage response
  -> validated media metadata
  -> current/next decoded pair
```

The renderer requests persistent storage, inspects available quota, and reports a readiness error if required content cannot be retained. Cache entries are keyed by bucket, object path, and Storage generation. Playlist media records gain that immutable generation during upload/selection; existing records are backfilled from Storage metadata before a web venue is enabled.

Only the current and next base pairs are attached to active media elements and GPU textures. Two pair slots are alternated: while one is visible, the other seeks, decodes its first frame, and becomes ready. At a cue boundary, logical-screen textures switch together, then the old slot prepares the following pair.

Relying on `<video preload="auto">` or the ordinary HTTP cache was rejected because neither guarantees a complete download or persistence across a remote restart. Holding every asset in a decoded element was rejected due to decoder limits. Cache Storage is preferred over an application memory-only blob map because the expected playlist can approach 2 GB and must survive reloads.

### 7. Stage revisions and overlays before visibility changes

Base revisions use a generation object containing normalized layout, cache handles, validation outcomes, and pair preparation state. A new Firebase revision is prepared independently while the last valid revision keeps playing. Once complete, it starts from cue zero at the next 20-second boundary. A failed revision never replaces the active generation.

Overlay commands use a separate two-slot channel. A new command ID prepares all assets needed for its first column while the old overlay remains visible. Once ready, both logical-screen textures switch atomically. Overlay column durations use their own monotonic origin; non-final columns advance atomically and the final column loops until clear or replacement. The base clock continues under every overlay.

Clearing an overlay removes the complete overlay channel in one frame. This removes Resolume's need to pause deck autopilot.

### 8. Publish geometry only after whole-document validation

The admin mapping editor works on a local draft and writes one complete `perimeterDisplay` document only after explicit Publish. Every publish creates a fresh revision ID. Validation uses integer rectangle geometry and checks:

- native logical dimensions and source bounds;
- exact source coverage, gaps, and duplicate coverage;
- positive dimensions and supported rotations;
- destination bounds unless clipping is explicit;
- source/destination size compatibility unless scaling is explicit;
- destination overlap unless overlap and z-order are explicit.

The editor provides linked source-strip and destination-canvas views, numeric controls, drag/resize operations, identity and horizontal-split templates, and a generated calibration preview. The renderer repeats validation and retains its last valid mapping if a malformed document bypasses the UI.

The admin location parser and save operation will preserve `perimeterDisplay` on unrelated edits. Publishing is deliberately separate from routine screen editing so an incomplete drag operation can never reach a stadium display.

### 9. Allow public reads only for approved perimeter media paths

Storage rules will permit unauthenticated reads below the venue perimeter base and overlay directories while continuing to require authentication for writes. This matches the public RTDB visibility of display commands and allows an anonymous kiosk to resolve `gs://` references through the Firebase Storage SDK.

Persisting tokenized HTTPS URLs in layout documents was rejected because tokens become another revocation and migration concern and do not provide immutable cache identity. Anonymous Firebase authentication was rejected because the application currently treats authenticated users as controllers and introducing kiosk credentials would expand provisioning and authorization scope.

### 10. Keep web and Resolume venue modes side by side

Víkin remains configured as `resolume`; its daemon continues consuming the existing paths and publishing applied status. The second stadium uses `web`; its ad editor derives lane definitions from published logical screens rather than daemon status and displays desired layout readiness without claiming daemon application.

The first release does not let the anonymous renderer publish trusted status. Local readiness/error diagnostics are visible on the kiosk, and controller-side desired-state editing remains authoritative. A separately authenticated status channel can be added later without changing playback semantics.

## Risks / Trade-offs

- [Windows/Chromium may not grant enough persistent quota for a near-2-GB playlist] -> Request persistence, inspect quota before activation, test the production Windows profile, and keep the last valid cached revision when a replacement exceeds quota.
- [Wide or unusually encoded videos may decode in Resolume but not Chromium] -> Validate decoded dimensions and codec support before a revision becomes active, document accepted production codecs, and run a hardware qualification playlist on the target PC.
- [Browser playback is synchronized but not hardware frame lock] -> Use one process, one canvas, one monotonic clock, and media-frame observations; verify long-running pair drift on the actual GPU.
- [Cache Storage implementations can evict non-persistent data] -> Require a successful persistence request for production readiness and surface storage state clearly; never discard the prior complete revision until its replacement is durable.
- [Public media reads expose sponsor and overlay files] -> Restrict public reads to named perimeter directories and keep all writes authenticated; no match-control or private administrative data is exposed.
- [Existing layout records lack immutable generations] -> Run a metadata backfill before enabling a venue for web rendering and reject web playback records that cannot identify immutable content.
- [Location-wide `set()` calls could erase geometry] -> Extend location types/parsers before introducing the new field and add regression tests proving unrelated edits preserve it.
- [Web venues have no daemon-owned applied-layout status] -> Derive editable lanes from published geometry and distinguish desired/readiness UI from hardware-applied status rather than fabricating daemon confirmation.
- [A malformed mapping could produce unusable physical output] -> Validate on publish and render, preserve the last valid revision, provide calibration output, and test physical pixels before match-day activation.

## Migration Plan

1. Extend location parsing and admin saves to preserve an optional perimeter display configuration without exposing a selector option yet.
2. Add the mapping editor and publish the captured Víkin mapping as `resolume` plus the measured second-stadium mapping as `web` only after validation.
3. Add immutable Storage generation metadata to uploads and backfill the second stadium's intended base playlist.
4. Deploy path-specific public Storage reads and verify anonymous download access while anonymous writes remain denied.
5. Deploy display-target selection, cache, playback, overlay compositing, power handling, and restart recovery behind the per-venue renderer type.
6. Qualify the production Windows/Chromium machine with calibration patterns, all intended codecs, a near-capacity cache, repeated remote restarts, network loss, and long-running paired video playback.
7. Enable the second stadium's `web` configuration. Keep Víkin on `resolume` and retain the current daemon unchanged.

Rollback is a venue configuration change: remove or change the second stadium's web-perimeter configuration so public selectors no longer offer it, then reconnect the physical output to its prior playback path. Existing Firebase desired state and Víkin's daemon remain compatible throughout.
