# Web-only perimeter retirement: Phase 1 of #241

All venues use browser composition. This frontend phase removes Resolume
preview/applied-layout/overlay-status telemetry and scorer preparation,
geometry, readiness, retry, and callable paths. Published web mappings supply
ad lanes; thumbnails come from Storage. Missing or invalid mappings are
unconfigured web venues: main-screen scorer reveals and hardware brightness
remain available, without a legacy renderer fallback or inferred geometry.

Version-1 file overlays, version-2 scorers, named media pairs, configured goal
videos, compatibility keys, generation backfill, player/crest fallbacks,
main-screen-first submission, diagnostics, and media caches remain supported.
Queue, lifecycle, and freshness follow-ups (#242/#243/#244/#247) are separate.

## Deployment hold

This change does **not** complete #241. Keep `prepareGoalScorerMedia`, its
Functions export, backend tests, sharp dependency/lockfile, and RTDB/Storage
rules unchanged during Phase 1. Functions deploy independently of the frontend;
removing the export now could delete the service before older clients stop
calling it. This phase grants no deployment or remote-deletion authority.

The Phase 1 frontend retirement is merged, as is the brightness-only gateway
retirement. The original PR stack started from reviewed PR #274 at `02b2de47`;
that branch target is historical, not a current implementation instruction.
Merged code alone does not certify that older clients have been refreshed in
either environment. Phase 2 remains a separate release with the evidence below.

Current browser commands and retained media semantics live in
[perimeter media](clock/perimeter-media.md), mapping/client operations in
[perimeter operations](clock/perimeter-operations.md), and backend ownership in
[Functions guidance](../functions/AGENTS.md). Update this document when rollout
evidence or the Phase 2 hold changes; do not copy the removal checklist elsewhere.

## Separate Phase 2

1. Qualify and roll out the frontend in staging, then production, and refresh
   existing controller/display clients. Confirm retired subscriptions, request
   writes, and callable invocations have stopped in each environment.
2. In a separate change, remove the backend renderer/export/tests and sharp,
   using clean Functions output so stale compiled exports cannot survive.
   Preserve `onUserCreate`, `listUsers`, `adminWrite`, and `cleanupAuditLog`.
3. Separately authorize and verify deployed Function deletion and retained
   Function health in both environments. Review parent RTDB grants before
   claiming that old preparation writes are denied; removing child validation
   alone does not revoke parent-granted writes.

Leave generated files and RTDB records inert by default. Never bulk-delete
`perimeter-overlays/`: it also holds active named media pairs, and old generated
files can still be referenced by valid version-1 overlays.

Local emulator/browser checks establish software behavior only. They do not
qualify physical display mapping, LED hardware brightness, client rollout,
production permission state, deployed Function deletion, or retained cloud
Function health.
