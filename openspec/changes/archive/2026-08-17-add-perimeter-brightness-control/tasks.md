## 1. Brightness protocol and daemon configuration

- [x] 1.1 Add validated brightness command/status models and Firebase paths, including explicit enable, Vnnox connection, perimeter GUID, timeout, retry, and password-source configuration.
- [x] 1.2 Implement an isolated Vnnox client that logs in, reads the configured screen and cabinet metadata, converts read/write brightness scales, and issues a write with exactly one configured `guidList` entry.
- [x] 1.3 Add unit tests for Vnnox request headers and payloads, scale conversions, invalid responses/scales, token handling, and multi-screen scoping.
- [x] 1.4 Document non-secret environment variables in `perimeter-control.env.example` and `README.md`; keep Vnnox brightness disabled unless explicitly configured.

## 2. Daemon brightness orchestration

- [x] 2.1 Add an independent Firebase listener and serialized latest-request worker for `states/{location}/perimeter/brightness`, accepting only whole percentages from 0 through 100.
- [x] 2.2 Publish daemon-owned `brightnessStatus` updates for pending, applied, and failed requests using Firebase server timestamps without replacing sibling perimeter data.
- [x] 2.3 Implement snapshot-before-write, verification polling with a documented tolerance, bounded transient retries, and newest-command supersession.
- [x] 2.4 Implement best-effort snapshot restoration after a started write cannot be completed or verified, preserving and reporting restore failures safely.
- [x] 2.5 Add daemon tests for successful verified application, invalid command rejection, transient retry, supersession, verification mismatch, restoration, and status publication.

## 3. Controller Firebase integration

- [x] 3.1 Add strict TypeScript types and Firebase parsers for requested brightness and daemon-published brightness status, rejecting malformed values and phases.
- [x] 3.2 Extend the perimeter context subscriptions and authenticated write action so requested brightness is read and written through Firebase without optimistic local state.
- [x] 3.3 Add unit tests for parsing, subscriptions, authenticated writes, invalid-value rejection, and no optimistic update behavior.

## 4. Controller operator interface

- [x] 4.1 Add a perimeter-settings brightness control that is gated by the existing perimeter feature flag and accepts only valid 0--100 percentage selections.
- [x] 4.2 Display the Firebase-synchronized requested value, daemon phase, verified applied value, and safe failure message; prevent duplicate local submissions while a write is pending.
- [x] 4.3 Add component tests for valid submission, client validation, pending/applied/error rendering, and hidden behavior when perimeter control is disabled.
- [x] 4.4 Update `clock/AGENTS.md` to document the brightness command/status ownership and operator behavior.

## 5. Verification and rollout readiness

- [x] 5.1 Run the perimeter-control test suite and clock unit/component test suite; run formatting and lint checks for touched projects.
- [x] 5.2 Validate the OpenSpec change with `openspec validate add-perimeter-brightness-control --strict`.
- [x] 5.3 Prepare and follow a gateway smoke-test checklist: confirm configured GUID, snapshot the current brightness, perform one low-risk change, verify published status and Vnnox readback, then confirm rollback by reapplying the snapshot percentage.
