# PR 281 focused repair

Repair base: `2c08e8898bde08176f39bd12c8c327391aef5512`.

Queue creation acknowledgements now form a dependency barrier for commands
that read those queues. Registration precedes the SDK call, including its
synchronous local echoes and reentrant callbacks. Once a dependency settles,
the command checks its original session origin and recomputes from subscription
refs. A denied creation cannot supply metadata or items to a later intent.
Named intents can create a complete queue or use the restored predecessor;
explicit queue IDs must still exist. Cancellation removes waiting listeners
immediately, including when the SDK acknowledgement remains unresolved.

The barrier stores in-flight IDs and notification listeners only. It does not
maintain queue/roster values, replay obsolete commands, retry failed writes,
or resolve general server conflicts. Independent creations and durable-queue
actions remain usable. State and audit still use one atomic root update, and
durable queue metadata still uses leaf diffs.

Player-selection failures render in the modal header, outside its scrolling
roster. Existing selection ownership and keyboard focus/retry remain intact.

## Verification

All installation, test, lint, formatting and build commands, and complete
emulator/browser lifecycles, used the host coordination `check.sh` without
nesting. Clock used `corepack pnpm@10.34.9`, one unit/browser worker, Node's
1024 MiB heap cap, JDK 21 and Firebase CLI 15.34.2. Both browser library paths
and the provided font configuration were set. The production build includes
API-client generation and TypeScript checking; a task-local pinned pnpm shim
also resolves the build script's nested pnpm invocation.

The full unit suite passed: 90 files, 2,034 tests. Regression coverage includes
create/replacement/first-substitution echoes, reentrant commands, denial and
success, overlapping waiters, current eligibility, cancellation before any
acknowledgement, explicit ID operations and durable metadata. Context tests
passed again (371 tests) after tightening the generic controller update's ID dependencies.
Lint, formatting and the production build passed.

Completed real-SDK browser evidence used static bundles to keep memory below
the guard. Exact repair-base and repaired bundles shared actual Auth, Database
and Storage emulators in `vikes-match-clock-test`. Rules were explicitly
installed and read back; anonymous, wrong-venue and forged-audit SDK writes
were denied; Storage was HTTP-ready.

| Probe                                                                                  | Exact repair base                                                                                              | Repaired                                                                                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Denied first substitution, ordered server frames held, independent second substitution | Second write submits before settlement; drained server queue has only `items`, including the failed first item | Waits, then creates all seven queue fields with only the second item; one accepted atomic intent/audit                                 |
| Player-card failure at player 23, 1280 × 720                                           | Alert top −182, hit test false                                                                                 | Alert top 62, hit test true; Enter retry succeeds                                                                                      |
| MOTM failure at player 23, 1280 × 720                                                  | Alert top −182, hit test false                                                                                 | Alert top 62, hit test true; Enter retry succeeds                                                                                      |
| Hide, venue ABA and logout during dependency wait                                      | —                                                                                                              | Prompt cancellation before acknowledgement; zero dependent SDK/state/audit writes after frames drain                                   |
| Durable queue setting during unrelated pending creation                                | —                                                                                                              | Immediate leaf write preserves items, autoplay and independent metadata; creation ID becomes usable only after its own acknowledgement |

This ten-probe lifecycle exited 0, closed the browser, cleaned up all owned
processes, and peaked at 4,803,293,184 bytes of cgroup memory. Server frames were
held in transport and delivered in their original order; SDK callbacks and
write outcomes were not replaced.

Proof and raw logs remain outside the repository under
`/home/paseo/.local/share/vikes-audit-coordination/repair-281-r4-2c08e889/`,
including `static-summary.json`, `static-lifecycle.log`, individual probe JSON
and PNG files, `rules-readback.json`, and the memory samples.

## Limits

Two supplementary Playwright lifecycles hit the 5,000,000,000-byte cgroup
memory guard during startup/first-test execution and exited 143 with owned
cleanup. Their partial logs and samples are preserved and are not counted as
passes. The committed Playwright regression cases and the full browser suite
therefore remain uncompleted by that runner; the completed static SDK/browser
probes provide the before/after evidence above. No timeout was increased and
no test was skipped or retried in a loop. The final generic controller-update
ID guard has context-unit coverage; the static probes exercise the explicit
queue APIs.

No cloud, deployment, hardware, push, PR or merge operations were performed.
Physical OS suspension and general multi-controller/offline conflict handling
remain outside this repair.
