# Shared-state command contract

Ordinary commands targeting `states/{location}` enter `executeCommand` in
`FirebaseStateContext.tsx`. It checks the render-bound command origin before
reading subscribed refs, prepares the update, then checks the origin again when
creating the audit identity immediately before calling `writeAudited`. There is
no await between that last check and submission. State and its audit event use
one root update. An empty diff submits nothing.

`MutationSession` owns the current scope and freshness epoch. `LocalStateContext`
invalidates the scope synchronously when the venue setter, logout, or Auth
listener runs, including batched A → B → A and same-user logout → login. The
boundary also reads the current Auth SDK UID. Visibility/pagehide, offline, and
Firebase connectivity handlers change eligibility synchronously, before React
renders. Returning to ready creates a new origin; hide → resume cannot revive a
retained callback. Unmount invalidates the scope. Old subscription callbacks
cannot populate a replacement scope or make it eligible. Resume cannot bypass
initial subscription readiness.

Initial readiness and reconnect proof can arrive in either order. All five
required subscriptions (match, controller, view, clubOverrides, perimeter) must
deliver for the current scope. A connected core snapshot can satisfy a pending
resync while those initial deliveries are incomplete; it does not yet enable
writes. Once all required snapshots arrive, that proof allows a fresh command
without an unrelated core update. An undropped resume can also finish on the
last initial snapshot when the core snapshots arrived before resume. Each new
subscription scope starts without a pending recovery. A Firebase disconnect
sets pending only while visible and already ready; it still records the drop
and preserves any recovery already pending. A partial initial load can thus
finish after a cached reconnect on its missing initial snapshot without an
unrelated core update. All five deliveries, visibility, connection and current
authenticated UID remain required. Connection arrival alone never unlocks
writes; non-core updates cannot clear an already-pending recovery. Neither
path restores any retained command origin.

This is the baseline initial-load compatibility policy, not global server
certification. SDK `onValue` has no public server/cache provenance. A settled
unchanged reconnect can remain resyncing when no core delivery occurs. An
initial load whose snapshots all arrive disconnected without a pending
recovery can also remain loading, even after connection arrival and another
core delivery. These inherited delivery orders are not repaired here.

Callbacks must retain their original command function across asynchronous
preparation. Do not replace it with a mutable ref to the newest callback: that
would turn an old intention into a new command. The boundary rejects before
reading refs, so an old destination never receives values read from another
venue. New explicit commands after resync use the new origin and subscribed
state.

Blocked ordinary commands reject with `MutationRejectedError`; validation and
Firebase failures reject too. The executor attaches a reporting handler to the
same promise, so existing button actions can explicitly discard it without an
unhandled rejection. Awaiting save APIs still receive the rejection. The
controller notice reports failures; save dialogs show their own errors and keep
drafts open. Scorer selection catches media/submission failures and closes only
after success. Club uploads, media-pair uploads, goal-video/layout edits,
brightness/config saves, and preset renames must await their command before
clearing a draft or reporting success. Preset rename completion is scoped to
its edit instance, draft revision, submission, modal lifetime and session scope;
matching a preset ID alone is insufficient after switching away/back or
reopening it. Enter/blur share a submission guard, while matching rejected
saves retain their draft/feedback and allow an explicit Enter retry. Old
completions cannot clear a newer draft's pending guard or feedback.
Club forms supply data and an action,
never their own UID/session audit payload. Brightness and auto config use
`perimeter.set-brightness` and `perimeter.set-brightness-auto`; auto config keeps
its existing `updatedAt: serverTimestamp()` shape.

Only Firebase subscriptions update shared state and its calculation refs. An
accepted write does not advance shadow refs while waiting for a subscription.
This preserves the same behavior after a rejected write. The existing writer's
synchronous SDK subscription echoes also advance these refs between rapid
ordinary commands: two goals, queue edits and preset saves preserve both
accepted actions without waiting for React to render or server acknowledgements.

## Ordinary mutation inventory

All methods below reach the same executor. The parameterized inventory in
`clock/src/contexts/sessionMutations.spec.tsx` asserts one audited update for
accepted commands and zero ordinary/audit/SDK attempts for retained commands.
`showItemNow` delegates to `renderAsset`; `saveClubOverride` uploads then delegates
to `commitClubOverride`. Club form create/update also delegate there. No direct
club, brightness, or configuration writer bypass remains.

| State area     | Entry points                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Match          | `updateMatch`, `resetMatch`, `addGoal`, `addPenalty`, `removePenalty`, `addToPenalty`, `updateHalfLength`, `adjustMatchTime`, `setHalfStops`, `matchTimeout`, `removeTimeout`, `buzz`, `countdown`, `startHalftimeCountdown`, `stopHalftimeCountdown`, `updateRedCards`                                                                                                                                                                                   |
| Controller     | `updateController`, `selectView`, `selectAssetView`, `createQueue`, `deleteQueue`, `renameQueue`, `reorderQueues`, `addItemsToQueue`, `removeItemFromQueue`, `reorderItemsInQueue`, `updateQueueSettings`, `playQueue`, `activateQueue`, `stopPlaying`, `showItemNow`, `setPlaying`, `renderAsset`, `showNextAsset`, `removeAssetAfterTimeout`, `remoteRefresh`, `setRoster`, `editPlayer`, `deletePlayer`, `addPlayer`, `clearRoster`, `selectTab`       |
| View           | `updateView`, `setViewPort`, `setBackground`, `setIdleImage`, `setIdleAd`, `setBlackoutStart`, `setBlackoutEnd`, `setGoalGifSettings`, `setTheme`, `setThemePreset`, `saveCustomPreset`, `deleteCustomPreset`                                                                                                                                                                                                                                             |
| Club overrides | `saveClubOverride`, `commitClubOverride` (create/update/save), `deleteClubOverride`                                                                                                                                                                                                                                                                                                                                                                       |
| Perimeter      | `setPerimeterState`, `skipPerimeterCue`, `restartPerimeterDisplays`, `setPerimeterOverlay`, `clearPerimeterOverlay`, `setPerimeterAdLayout`, `setPerimeterGoalVideo`, `setPerimeterScorerCelebration`, `setPerimeterIdleClock`, `setPerimeterPlayerDisplayStyle`, `setPerimeterSubstitutionStyle`, `setPerimeterBrightness`, `setPerimeterBrightnessAuto`, `createPerimeterMediaPair`, `setPerimeterMediaPairMainScreenAsset`, `deletePerimeterMediaPair` |

Automatic perimeter power changes, keyboard controls, scorer/player/team media
continuations, queue controls, theme editors, and all other consumers call these
same entry points. Storage preparation/cleanup is separate from the RTDB
command. Admin venue metadata (`locations/`) and display presence/heartbeats
(`presence/`) have separate ownership and are outside this match-state boundary.
Unused generic unaudited state and standalone club write helpers were removed.

## Conditional transitions and limits

`startMatch`, `pauseMatch`, `completeCountdownIfCurrent`,
`applyHalfStopIfCurrent`, `removeTimeoutIfCurrent`, `removePenaltyIfCurrent`, and
`completeAssetIfCurrent` remain separate CAS commands. They use the same
current-session eligibility before starting a transaction and on every retry,
plus their existing authoritative generation preconditions. Each retry clears
its candidate diff; only a final committed result produces an audit, using the
identity and venue captured at submission. A committed transaction's audit is
still a separate append: an audit failure is logged, not rolled back or retried
as another state mutation. Lifecycle latches remain commit-aware and retry-safe.

This is a client submission boundary. It cannot revoke a command already handed
to the SDK, cancel already-submitted Storage work, or provide cross-command
atomicity. Existing Firebase authorization, last-write-wins behavior, queue and
playback semantics remain in force. There is no offline command replay queue.

The local browser regression is `clock/e2e/session-mutation-boundary.spec.ts`.
Its dev-only fixture uses real providers, forms, Auth/Database/Storage SDKs and
emulators, counts audited-helper and SDK put/merge attempts, and checks backend
state and audit records. It explicitly installs and reads back repository rules
in `vikes-match-clock-test`, verifies real SDK denials, and requires independently
HTTP-ready Storage. Run with `VITE_USE_EMULATOR=true` and all lifecycle processes
inside the resource-coordination wrapper when working under that constraint.
The fixture is outside the production entrypoint and build.
