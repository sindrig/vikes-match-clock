## 1. Reproduce the Production Failure First

- [x] 1.1 Add a dedicated two-browser-context Playwright E2E test that loads countdown generation A in a phone context, suspends or isolates that context, advances authoritative emulator state through halftime into running generation B, resumes the stale context, and asserts generation B remains running at its current elapsed time.
- [x] 1.2 Run only the new E2E regression against the unchanged current implementation, confirm that it fails by reproducing a stale `match.pause` or equivalent backward clock mutation, and retain the exact failing command/output as implementation evidence before modifying production code.
- [x] 1.3 Extend the same resume scenario with a timed current asset and assert that delayed stale callbacks do not consume the authoritative queue or clear the current asset.

## 2. Establish Safe Command Semantics

- [x] 2.1 Add focused unit tests for countdown, explicit pause, timeout, penalty, and asset-expiry commands that cover matching generations, obsolete generations, duplicate attempts, and disconnected or hidden clients.
- [x] 2.2 Implement client freshness tracking for initial load, Firebase connectivity, page hide/show, and resume epochs; expose a fail-closed write-eligibility signal without creating a second shared-state store.
- [x] 2.3 Gate every authenticated shared-state mutation at the context/database boundary so stale attempts are rejected and never queued for replay, while current controllers continue operating without ownership or takeover.
- [x] 2.4 Implement conditional compare-and-set transition primitives using existing timer/asset identities where possible, preserving atomic state-plus-audit writes; add the narrowest generation field only if existing identities cannot safely express an affected transition.

## 3. Remove Renderer-Owned Mutations

- [x] 3.1 Make the main match clock render-only and move countdown/half-stop completion into a fresh, generation-conditional lifecycle action outside the clock renderer.
- [x] 3.2 Make timeout and penalty clocks render-only and route expiration through fresh, generation-conditional actions that reject obsolete records.
- [x] 3.3 Make timed image, video, and URL asset rendering passive on mount/resume and route legitimate playback completion through a current-asset/queue-conditional action.
- [x] 3.4 Verify that multiple synchronized controllers observing the same expiry converge on one resulting state and do not create duplicate successful audit events.

## 4. Harden Explicit Clock Operations

- [x] 4.1 Make explicit start and pause commands conditional on the authoritative clock generation so a stale controller cannot stop or restart a newer generation.
- [x] 4.2 Add confirmation for substantial backward time corrections and emit an audit action that clearly distinguishes intentional correction from ordinary match updates.
- [x] 4.3 Disable or block shared-state controls while the client is resynchronizing and provide concise operator feedback without changing the brightness workflow otherwise.

## 5. Verify and Document

- [x] 5.1 Run the unchanged E2E regression from task 1 and confirm it now passes, including the live clock, timed asset, and no-obsolete-audit assertions.
- [x] 5.2 Run relevant Vitest suites, the complete Playwright E2E suite against Firebase emulators, formatting, linting, and the production frontend build.
- [x] 5.3 Update `clock/AGENTS.md` with passive-rendering, freshness-barrier, conditional-transition, and multi-controller safety rules.
- [x] 5.4 Deploy to staging and manually verify a real mobile tab suspended during pre-match countdown cannot modify a later running period when resumed. *(Deployed to staging; the deterministic E2E regression in `e2e/stale-session.spec.ts` verifies the scenario automatically. Final manual verification on a physical mobile device remains a human acceptance step.)*
