# PR 284 roster writer repair

Repair head: `a19771d2cf02866f09c66455d1c17e8a7c1b9fed`.
PR comparison base: `6461bb060de06272521e990d5f7aef3cc83c5e1b`.

Ordinary roster commands now write their intended paths instead of serializing
the filtered subscription model. Edits patch supplied changed fields at the
selected raw child; deletion removes that child; addition appends beyond every
occupied raw key, including rejected rows. The Team checkbox and React row key
use the rendered raw child key. Existing numeric API selections still resolve
against the current subscription. Removed/rejected key selections are ignored.

`setRoster` explicitly replaces only supplied sides. Both lineup-fetch paths in
`TodaysMatches` and `TeamAssetController.refetchRoster` supply both sides;
Resolve Roster supplies one. Untouched raw sides and roster metadata survive.
`clearRoster` remains the explicit whole-roster clear, including rejected rows
and roster metadata. Generic controller updates reject roster replacement.
The complete caller inventory and ordering policy are in
[the nested state contract](nested-state-boundary.md).

Numeric children retain array producer order, including players before
officials; shirt numbers do not reorder them. Named legacy children follow in
lexical key order. Additions do not reuse holes or rekey siblings. Original
session eligibility, one atomic audited update, queue acknowledgements,
occurrence CAS and read-only parsing remain intact. Retained key metadata
contains no optimistic roster values or general server conflict resolution.

## Verification

All installs, tests, lint, formatting, builds and complete emulator/browser
lifecycles used the host `check.sh`, one test worker and the 5,000,000,000-byte
cgroup working-set guard. Clock used explicit `corepack pnpm@10.34.9`.
Node heaps stayed at or below 1024 MiB; smaller per-command heaps and sequential
unit batches were necessary. No quota/deadline policy was changed.

- Frozen installation and API-client generation from the committed schema passed.
- All 94 unit files / 2,182 tests passed in sequential batches. The new coverage
  includes the four writers on both sides with dense arrays, holes, sparse and
  named maps, rejected siblings, metadata, rapid echoes, stable key selections,
  no-op/invalid selections, generic-writer rejection and explicit replacement/clear.
- Final TypeScript build checking passed with a 384 MiB heap.
- All four changed production TypeScript/TSX files passed ESLint with 512 MiB
  heaps. Changed source, tests and documentation passed formatting.
- Static esbuild bundles completed for the repair, exact repair head and PR
  base. The repair bundle includes the actual App and all three browser fixtures.
- Twenty core browser scenarios and seven Storage/session scenarios passed in
  complete, separately guarded lifecycles. They include 24 repository test bodies
  and three pinned comparison cases; the latter perform 12 operations per pin.

The resource-bounded browser collector runs the repository's fixture hooks,
test bodies and Playwright assertions in one process. It uses Firebase CLI
15.34.2's unmodified Auth/Database/Storage emulator implementations, the official
Database and Storage rules-runtime JARs, and JDK 21. Java heaps were 96 MiB.
Both requested browser library roots and `fonts.conf` were configured.
Repository Database rules were installed and read back in the actual
`vikes-match-clock-test` namespace. Storage's object-list HTTP endpoint returned
200 before its SDK checks. Actual SDK denials covered anonymous, wrong-venue,
forged-audit and Storage writes.

The new real-SDK matrix checks the complete raw backend tree, each exact state
path, the six audit paths belonging to one event, and one root SDK merge. Audit
strings must exactly match the actual wire diff and the persisted event. Home
edits use the rendered Team checkbox. Both sides and all four writers are
covered; rapid retained commands exercise synchronous SDK echoes and explicit
two-side replacement/full clear. Existing cases cover malformed read-only data,
original substitution keys, denied pending queue creation with ordered real
server frames, stale sessions, occurrence replay/captured callbacks, raw legacy
completion, conditional generations and retained file/semantic media contracts.

| Probe                                                                       | PR base                                                                       | Repair head before fix                                                                       | Repaired                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Home checkbox; away children `0` and `2`                                    | Away keys preserved, whole-roster audit                                       | Away compacted to `0` and `1`, whole-roster audit                                            | Only `roster/home/0/show`; away keys preserved                                          |
| Sparse home `17`, rejected `26`, valid `31`, rejected `40`; away `53`, `78` | Maps are unsupported; an ordinary delete can clear the projected-empty roster | All four writers rewrite the untouched side; ordinary edits/add/delete discard rejected rows | Edit/delete target `17`; add allocates `41`; one-side replacement leaves away untouched |
| Array order: shirt `20`, shirt `1`, coach                                   | Producer order                                                                | Producer order                                                                               | Producer order retained                                                                 |

Proof remains outside `/tmp` and the checkout:
`/home/paseo/.local/share/vikes-audit-coordination/repair-284-r1-a19771d2/`.
It includes raw before/after trees, SDK transport/audit maps, pinned comparison
records, unit summaries, rules readbacks, readiness and cleanup records, command
logs and resource JSON. Comparison sources came from read-only `git archive`
snapshots; no other worktree was used. Completed core and Storage lifecycles
peaked at 4,873,371,648 and 4,892,688,384 bytes respectively. Owned ports and
processes were verified released.

## Limits and incomplete attempts

The final normal Vite build did not complete under the guard. Runtime proof
uses the completed static esbuild bundles; this does not qualify the final
normal Vite/CSS production pipeline. The ordinary Playwright test runner also
hit the guard; its selected test bodies completed through the single-process
collector instead. This is scoped Chromium/emulator coverage, not the complete
browser suite, live cloud data, physical screens or hosted YouTube. YouTube used
the existing offline API double. General concurrent-controller conflicts and
older binaries retain their existing limits.

All guard-aborted attempts remain recorded as incomplete: the combined static
build, initial whole unit invocation, combined source checks, final Vite attempt,
ordinary browser runner, two standalone browser attempts, and the initial final
typecheck. No abort is counted as a passing check. Completed unit batches,
smaller lint/typecheck heaps and the shared-process emulator/browser setup
provide the qualified results above. Comparison-harness assumptions about a
base delete and JSON property order were corrected; their original failed logs
remain preserved. Clean file-cache release was limited to this checkout and
its proof files; no system configuration was changed.

No push, PR update, deployment, merge, live hardware/cloud operation, secret
retrieval, subagent, rules, infrastructure or playback-protocol change occurred.
