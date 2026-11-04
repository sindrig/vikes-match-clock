# Retained brightness arbitration (#252)

This follow-up stacks on PR #273 (`audit/240-brightness-only-gateway`) at
`198e43ebe47914eb3efece71d3baf7f089b03bc1`. The
[automatic brightness design](auto-brightness-design.md) remains authoritative
for the model and Firebase schema. Neither those contracts nor the Vnnox
transport, weather implementation (#254/PR #270), frontend, installer or
service unit change here. Physical gateway, systemd and Vnnox qualification
remain on HOLD.

## Request and dispatch invariants

- One serialized worker retains the latest accepted request. Manual events
  always have distinct identities: manual 65% supersedes undispatched auto
  65%, and a fresh manual 65% supersedes an older manual 65% snapshot.
- Automatic ticks submit the raw target and captured prediction to the worker.
  Equal bounded percentages from the same automatic generation and slew setting
  coalesce with outstanding automatic work, preserving progress through slow
  snapshots. Before dispatch, coalescing refreshes the target and calibration
  context. After dispatch, the sequence retains its original context.
- The worker applies the existing hysteresis/slew/clamp decision at admission
  and again when it picks up queued automatic work after the prior sequence
  drains. A config refresh during an irreversible 50% → 65% write therefore
  moves toward a new 22% target via 50%, rather than a stale 35% decision made
  against the old 50% baseline. A post-drain decision within hysteresis is
  dropped. Only verified successes advance the retained applied baseline;
  failed attempts finish their restoration sequence before queued work is examined.
- Every enabled tick submits its target, including targets within hysteresis.
  Such a target withdraws obsolete undispatched automatic work; it cannot
  interrupt an already-dispatched sequence or replace manual work.
- Automatic ticks capture a worker-owned generation before predicting. A valid
  manual command or effective normalized automatic config change invalidates
  suspended ticks and undispatched auto requests. Timestamp-only config echoes
  and invalid/missing brightness commands do not invalidate valid work.
- Manual intent suppresses auto synchronously, before the asynchronous Firebase
  `enabled: false` update. Rejection or delayed acknowledgment cannot revive the
  suspended tick. A later explicit enable can admit fresh automatic work after
  manual processing; auto admission cannot displace pending or active manual
  work, including while its snapshot is suspended.
- The worker rechecks request identity, generation and stopping state after
  pending-status persistence, at snapshot retry boundaries, and after a
  successful awaited screen/cabinet snapshot immediately before invoking
  `client.writeBrightness`. No await separates that last check from dispatch.
- Invocation of `writeBrightness` remains the conservative irreversible
  boundary. A response error may mean the hardware already changed. Once
  invoked, supersession, disable and shutdown cannot interrupt verification or
  exact snapshot restoration, and dispatch is never retried. The next request
  starts only after the previous terminal sequence completes.
- Pending-status persistence is still required before hardware I/O. Only
  pre-write snapshot failures retry, with the existing bounds/backoff. Screen
  verification attempts/tolerance, optional cabinet diagnostics, exact
  ratio/ratioScale/nit restoration, terminal-status recovery and calibration
  semantics remain intact. Shutdown drops undispatched requests and drains an
  already-dispatched sequence under the existing caller's shutdown grace limit.

Refreshes during a suspended scheduler tick coalesce into one follow-up tick.
It uses the latest config; the old tick must still pass generation admission.
Ticks never overlap. Hysteresis, slew, clamping and all prediction formulas are
unchanged; model changes belong to #253.

## Deterministic startup

With the automatic feature enabled, the first brightness and automatic-config
subscription callbacks are retained state. Neither callback arrival order
selects the mode:

| Retained mode              | Initial valid brightness | Startup behavior                                               |
| -------------------------- | ------------------------ | -------------------------------------------------------------- |
| Automatic enabled          | Any                      | Preserve automatic mode; ignore the retained manual percentage |
| Automatic disabled/missing | Integer 0–100            | Process that manual value once                                 |
| Automatic disabled/missing | Missing/invalid          | No hardware request                                            |

Automatic scheduling waits for both initial callbacks and completion of the
prior-status baseline read. Predictions cannot replace that persisted status
before the baseline is read. A failed read logs the existing warning and uses
the existing unknown-baseline behavior. A late read cannot overwrite a value
verified by this process.

Subsequent valid brightness callbacks are new manual intent, including ones
that arrive before the first automatic-config callback. Such intent wins over
the initial retained enabled config and can process without waiting for the
baseline. A value subscription cannot distinguish a historical value from a
change already incorporated into its first snapshot; that first snapshot is
consistently treated as retained state. With the automatic feature disabled,
manual startup and the legacy status payload are unchanged.

## Local regression proof

`perimeter-control/tests/arbitration.test.js` exercises the real
`PerimeterController` → `BrightnessController` → `AutoBrightnessScheduler`
integration. Only Firebase, weather input and device transport are simulated;
unexpected fetches fail. Deferred transport promises control the race boundaries
without timing sleeps. Every owned gate is released before test cleanup drains
the worker and detaches listeners.

| Controlled sequence                                                                                             | PR #273 base                     | After this fix                          |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------- |
| Old manual 60% snapshot suspended; new manual 20%; successful snapshot resumes                                  | Writes 60%, then 20%             | Writes only 20%                         |
| Auto target 65% suspended publishing prediction; manual 20% pending; tick resumes before disable acknowledgment | Auto replaces manual; writes 65% | Writes only manual 20%                  |
| Undispatched auto 65%; manual 65% during snapshot                                                               | Both identities can write        | One manual write and manual calibration |

Tests also cover both startup orders and modes, delayed baseline reads,
disable/re-enable/config changes at prediction and snapshot awaits, equivalent
config echoes, invalid commands, refresh coalescing, rejected prediction/disable
updates, snapshot errors, scheduler stop and gateway shutdown. Dispatched-write cases
cover success, ambiguous write errors, verification read errors, exhausted
verification mismatches and restore errors, each with newer manual intent and
with shutdown. Raw restoration uses 12.34% (`ratio: 1234`, `ratioScale: 10000`)
to catch accidental whole-percent conversion. A separate deferred restoration
case proves shutdown also waits at that await.

The follow-up regressions run the actual periodic scheduler at one-second
intervals with successful 1.5-second cabinet reads, using virtual timers. It
writes 65%, then 76% within ten virtual seconds, with two snapshots and two
calibration entries. The original PR #277 head repeatedly replaced identical
65% requests and wrote nothing during that interval. Further gates cover config
refresh during irreversible dispatch with both default and custom slew limits,
changing predictions with equal bounded output, post-drain hysteresis, fresh
manual/config invalidation at equal percentages, exact restoration baselines and
shutdown with queued automatic work.

Run the suite with Node >= 22 and the pinned pnpm:

```bash
corepack pnpm --dir perimeter-control test
```

The #240 byte-identity/baseline comparison documents the historical PR #273
retirement proof; #252 intentionally changes those arbitration traces. These
tests establish simulated software behavior only. They do not qualify hardware,
gateway networking, Firebase rules, systemd confinement or deployment. No live
service, hardware or cloud mutations are part of this proof.
