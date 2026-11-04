# Playback occurrence contract (#244)

`states/{location}/controller/currentAsset` contains reusable `asset`, duration
`time` (seconds or null), and an optional `occurrenceId`. Every new selection,
replay or advance writes a fresh opaque UUID in the same mutation as the asset
and queue change. The ID never belongs to a library record or queue item.
Clearing removes the entire current asset. Metadata, activation and pause flags
preserve the current occurrence. Ordinary explicit commands retain their existing
last-write-wins semantics.

The parser validates the current-asset envelope and never generates IDs.
An absent ID is legitimate legacy playback. Present malformed IDs (including
empty strings, whitespace, incorrect types, or IDs outside the bounded ASCII
format) reject the envelope and cannot become eligible legacy playback.
Firebase removes null-valued children: persisted null is delivered as absence;
a present null in an untrusted raw object is invalid. Missing/null duration is
normalized to null, matching RTDB's omission of null children.

Completion observations explicitly carry `occurrenceId: string | null`; null
means a validated legacy observation. Missing observation fields are rejected.
Inside the controller transaction, the ID is checked against the raw current
asset as well as the parsed envelope. Legacy completion requires that the raw
field truly does not exist and the asset key, duration, queue and playing tuple
matches. An identified observation cannot downgrade to legacy matching.

A successful legacy completion either clears the current asset or writes an
identified successor, including a one-item cycling successor. Compliant writers
never recreate an ID-less current asset, so legacy A cannot recur after advancing
through B to another A. Two competing completions of one legacy or identified
occurrence can commit at most once. Candidate successor IDs are allocated once
outside the SDK transaction callback and survive transaction retries unchanged.
Only the committed winner requests an audit append; the append remains separate
from the transaction and can fail independently.

`MatchLifecycle` includes occurrence identity in its existing duration/queue
generation, retains due time across resynchronization, and owns pending/latch
settlements by generation. Eligibility is checked before submission and on every
transaction retry. Ordinary selections continue through the current-session and
pending-queue-creation barriers, recomputing after acknowledgements. No reader
updates calculation refs or queues observations for later replay.

All live App render branches use `PlaybackAsset`, keyed by the rendered
occurrence. `useDeferredAsset` retains the entire old record while media loads;
its natural-end callback therefore keeps the old ID, rather than borrowing an ID
from the latest controller state. Native video and YouTube are remounted on a
new selection; thumbnails and looping uploaded videos do not complete on natural
end. Queue durations still advance looping videos. Existing final non-cycling
item hold/explicit-next behavior is unchanged. Animated GIF replay must also be
verified in the target browser; a DOM remount alone is not evidence of a decoder
restart.

Storage paths provide stable library keys, and selection preserves media URLs
and saved pair metadata. Existing key-based duplicate rejection remains; repeated
intentional queue entries are outside this contract. Old persisted keys are not
rewritten. Main-screen and perimeter commands remain independent; perimeter
overlay IDs, player-band deduplication, and replay behavior are unchanged.

## Compatibility and rollout

The guarantee applies to compliant writers. Existing Firebase authorization
rules do not enforce this protocol. An old binary ignores occurrence IDs and
can clear or advance newer playback, or select ID-less state again. New-client
guards, optional ID validation, and protocol markers cannot constrain that old
code. The emulator regression deliberately proves an old tuple-only SDK writer
can clear replayed identified media under unchanged repository rules.

Coordinate rollout and refresh all active controllers/displays, including
returning suspended/offline sessions. A remote refresh reaches connected clients
but does not certify that every old client has retired. Legacy startup playback
continues via the bounded fallback; no read-time migration or forced operator
hold is needed. Rollback to an older bundle restores the older safety limit.
Strict mixed-binary protection would require a separately designed server-side
protocol. No rules, Functions, infrastructure or live data change is included.

## Verification

Focused units cover repeated A identity, explicit legacy matching, malformed
parsed/raw IDs, deterministic reads, one-item successors, stable retry candidates,
replay, renderer callback capture, and generation-owned lifecycle settlement.
`clock/e2e/playback-occurrences.spec.ts` uses actual SDKs and independent browser
contexts with real competing transaction hashes, repository rules readback and
unauthorized SDK denial. It also covers A/B/A, old-writer limits, native media
replay and delayed old callbacks while replacement rendering is deferred.
Browser checks require the Auth, Database and Storage emulators to be HTTP-ready
in namespace `vikes-match-clock-test`. Use the host resource-coordination wrapper
for the complete emulator/browser lifecycle, one worker and zero retries; report
resource-aborted or unsupported-media checks separately from passes.

Local Chromium qualification observes animated GIF frames through screenshot
pixels (canvas `drawImage` samples the default GIF frame) and native WebM video
playback through actual `currentTime`/end events, including deferred rendering.
The browser YouTube case uses the real `react-youtube` component with an offline
iframe-API double to verify player recreation and old/new end callback identity.
It does not qualify YouTube-hosted playback, platform autoplay policy, other
browsers or physical stadium screens.
