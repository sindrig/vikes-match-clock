## 1. Perimeter Geometry And State Contract

- [x] 1.1 Extend the perimeter daemon's read-only status with validated overlay target layer IDs, labels, native dimensions, and a geometry revision derived from configured clip canvases.
- [x] 1.2 Add strict frontend types and Firebase parsers for daemon-published geometry and goal-scorer preparation status.
- [x] 1.3 Add Firebase Realtime Database rules for the controller-owned preparation request and service-owned preparation result paths.
- [x] 1.4 Add daemon and frontend parser tests for valid, absent, malformed, and changed geometry.

## 2. Server-Side Media Preparation

- [x] 2.1 Add the server-side image-composition dependency and Firebase Function module for authenticated goal-scorer preparation requests.
- [x] 2.2 Validate caller location access, request IDs, home-player snapshots, and published geometry before beginning preparation.
- [x] 2.3 Implement celebration-image lookup and standard-club-crest fallback selection for each eligible player.
- [x] 2.4 Render native-size repeating PNG bands with player image or crest, shirt number, name, and spacing for every configured overlay target.
- [x] 2.5 Upload deterministic player-and-geometry-scoped output files and publish ready or fallback overlay file pairs.
- [x] 2.6 Publish job progress and per-player preparing, ready, fallback, unavailable, and failed results without allowing stale jobs to overwrite a newer request.
- [x] 2.7 Add unit tests for authorization, validation, personalized rendering, crest fallback, target-specific output, partial failure, and stale-job protection.

## 3. Controller Preparation Workflow

- [x] 3.1 Subscribe to and expose goal-scorer preparation status through the perimeter context using Firebase-synchronized state only.
- [x] 3.2 Request preparation after either match selection or match-report roster loading, while preserving immediate roster availability.
- [x] 3.3 Add a controller status view showing each home player's celebration-image source and prepared-media outcome, including an explicit retry action for incomplete preparation.
- [x] 3.4 Add component and context tests for background triggering, status rendering, retry behavior, and malformed service status.

## 4. Live Goal Attribution

- [x] 4.1 Preserve the existing generic home-goal perimeter overlay while the scorer-selection dialog is open.
- [x] 4.2 On scorer selection, retain the main-screen player reveal and replace the generic perimeter overlay only when the selected player's current preparation result supplies a ready or fallback target pair.
- [x] 4.3 Keep the generic perimeter overlay unchanged when selected-player media is preparing, unavailable, or failed, and communicate that state to the operator.
- [x] 4.4 Ensure the existing clear-overlay action clears both the selected player perimeter pair and main-screen reveal, restoring rotating perimeter content.
- [x] 4.5 Add unit and integration coverage for personalized scorer attribution, crest fallback attribution, not-ready behavior, and clearing.

## 5. Verification And Deployment

- [x] 5.1 Run formatting, linting, and test suites for `clock/`, `functions/`, and `perimeter-control/`.
- [ ] 5.2 Deploy and verify on staging with a roster containing both celebration-image and crest-fallback players, including physical Resolume 48 and 40 target playback.
- [ ] 5.3 Confirm generic-to-player overlay replacement, status visibility, and explicit clear behavior under live controller timing.
- [x] 5.4 Update project documentation for the preparation request/status paths, output storage convention, crest asset source, and daemon geometry publication.
