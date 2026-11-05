# Nested Firebase state boundary (#246)

Inventory taken at `b7020e9bc62fcea65018b9c26e8f39d35bee6619`, before
implementation. This builds on the [session/queue contract](session-mutation-boundary.md)
and [playback occurrence contract](playback-occurrences.md).

| Domain                       | Actual producers                                                                                                                                                                                                                            | Readers and write-back paths                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IMAGE / VIDEO                | `controller/media/ImageList.tsx`: Storage path key, download URL, filename; MP4 videos loop. Older URL-key images/videos remain readable.                                                                                                   | `Asset`, `VideoPlayer`, deferred media preload, queue thumbnails, queue selection/advance, optional main-screen media-pair link.                                                                 |
| URL                          | `UrlController`, YouTube playlist expansion in `AssetController`. The key is the URL.                                                                                                                                                       | `Asset`'s YouTube branch; natural-end completion carries the rendered occurrence.                                                                                                                |
| PLAYER / NO_IMAGE_PLAYER     | `team/assetHelpers.ts`: photo URL key or `custom-…` key with team/name/number/role/overlay. Coaches omit number. Scorer/player callers add backgrounds, full names and goal flags.                                                          | `PlayerCard`, preload, `SubstitutionInfo`, downstream perimeter band presentation.                                                                                                               |
| MOTM                         | `getMOTMAsset`: player card plus `originalAssetType` (PLAYER or NO_IMAGE_PLAYER).                                                                                                                                                           | `Asset` sponsor wrapper, then the original player card; perimeter sponsor lead-in.                                                                                                               |
| SUB                          | `useHomeTeamQuickActions`: two prepared player cards, incoming in `subIn`, outgoing in `subOut`, plus full names/background.                                                                                                                | `Asset` and preload, `SubstitutionInfo`, perimeter substitution band. The existing documented inverted-field legacy form is not distinguishable; do not swap sides or invent a migration marker. |
| CurrentAsset                 | Explicit selection, queue playback/advance: reusable asset, seconds/null duration, fresh occurrence ID. Persisted legacy playback omits ID.                                                                                                 | Controller subscription, lifecycle, deferred live renderer, authoritative completion CAS. Reads never mint IDs.                                                                                  |
| Player / roster              | API `transformSingleLineup` / `transformLineups`, resolve-roster placeholders (`id: 0`, `name: "#N"`), coaches, `addPlayer` editable blank rows, roster import/edit commands. Semantic scorer contract explicitly allows manual opaque IDs. | Team/selection rendering, player media preparation, quick actions; substitution writes two `show` leaves and must retain original Firebase child keys after filtering.                           |
| Penalty                      | `addPenalty`: string key, numeric elapsed time and duration; `addToPenalty` edits duration.                                                                                                                                                 | Scoreboard/TwoMinClock, lifecycle expiry and conditional removal.                                                                                                                                |
| Viewport                     | `setViewPort`, `locations` screen editor, legacy venue screen numeric dimension strings.                                                                                                                                                    | App dimensions/root font size, PlayerCard measurement, YouTube options. Venue screens may be dense/sparse arrays or keyed maps and retain editable metadata.                                     |
| Retained perimeter contracts | Version-1 file overlays, version-2 semantic scorer, named Storage pairs/main-screen links, goal videos, ad layouts and venue mapping aliases.                                                                                               | Existing specialized parsers, web runtime, generation backfill/cache. These remain independent protocols with existing bounds and atomic pair/layout validation.                                 |

The historical broad `Asset.type: string` and renderer's private schema do not
describe an additional supported kind. The current and historical AssetTypes
producer has seven uppercase discriminators. Lowercase test placeholders are
not a producer contract. The former Nuxt `admin/` directory is absent in this
base; current venue administration is in `clock/src/admin/`.

## Invalid and fallback policy

Structural parsing owns Firebase ingestion. Presentation-specific restrictions
(scorer IDs, digit-only shirt numbers, bounded band names, Storage scopes and
mapping geometry) stay with their existing downstream domains. Do not impose
those limits on foreign names, blank manual rows, coach cards or main-screen
media.

Collections written as Firebase arrays also accept object snapshots, including
sparse numeric children. Invalid entries are discarded independently. Retain
the actual child key for roster leaf commands; never substitute a compacted
array index. Parsing is read-only and never repairs persisted data itself.

Roster display order follows the actual array producers: numeric child keys in
numeric order, including holes, with coaches/officials following players as
produced. Named legacy children follow in lexical key order, independent of
snapshot object insertion order. Shirt numbers never determine roster order.
Parser-only key metadata also retains rejected raw child keys for allocation;
it contains no optimistic values and is never serialized.
The Team checkbox passes the rendered raw key. Edit/delete also retain numeric
projection-index support for existing API callers; raw-key selections are
resolved against the current subscription and ignored if no valid row remains.

Ordinary roster commands never persist the compacted read projection:

| Writer / production caller                                                                 | Intended update                                                                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `editPlayer` / Team checkbox                                                               | Changed supplied fields at the selected original child key; omitted/undefined fields are untouched        |
| `deletePlayer` / public controller API (no production UI caller)                           | Null deletion of the selected original child, without shifting siblings                                   |
| `addPlayer` / public controller API (no production UI caller)                              | One editable blank row at the next unused numeric child, or after the last named child using a `~` suffix |
| `setRoster` / `TeamAssetController.refetchRoster`, both `TodaysMatches` lineup-fetch paths | Explicit replacement of both supplied sides, preserving roster-level metadata                             |
| `setRoster` / Resolve Roster confirmation                                                  | Explicit replacement of the one supplied side, preserving the other raw side and roster-level metadata    |
| `clearRoster` / team clear button                                                          | Explicit whole-roster replacement, including rejected rows and roster-level metadata                      |

Side replacements accept `Partial<Roster>` and skip unchanged subscription-array
references. Rejected rows within an explicitly replaced side are intentionally
removed. Additions consider every raw child, including rejected rows, and never
reuse holes or rekey existing siblings. A named append that exceeds Firebase's
768-byte key limit rejects before submission. Rapid SDK echoes refresh the same
subscription refs; commands do not create shadow state, new transactions, or
general multi-controller conflict resolution. Generic `updateController` no
longer accepts roster replacement. Each submitted ordinary roster command still
uses its original session origin and one exact audited root update.

Known optional null player/card scalar fields normalize to absence (Firebase
removes null children); explicit `overlay: null` remains a supported empty
overlay. Unnamed manual players with other known fields normalize to an empty
display name; empty/unrelated records are not invented roster rows.
Finite numeric and string IDs/shirt numbers remain distinct. Wrong non-null
field types reject the owning entry. A malformed overlay or SUB side rejects
its asset, not valid siblings. SUB sides are player cards, so nested SUBs
cannot recurse. Missing/null duration is null; malformed present occurrence
IDs reject the entire current envelope, exactly as in #244.

Unknown metadata is retained on accepted entries. Validation is not a blanket
unknown-field purge. Conditional transitions apply their intended diff to the
authoritative raw node, so an unrelated transition does not write defaulted or
filtered collections back as a migration. Queue item edits may normalize the
edited collection; valid entry metadata must survive that round trip.

Runtime viewports normalize legacy numeric dimension strings and use existing
defaults for absent/invalid dimensions; dimensions must be finite and positive
for layout/measurement. Screen/style metadata remains available to admin
leaf edits. No discriminator is added to persisted player, penalty or viewport
documents. Asset variants and identified/legacy CurrentAsset variants use
their existing fields.

## Verification and limits

The same eight consumer regressions were run before and after the change:

| Malformed input                       | Base behavior                             | Canonical boundary behavior                              |
| ------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| Player/SUB background object or array | Preload throws from `url.toLowerCase()`   | Owning asset is rejected; no preload or completion       |
| Player name object                    | `PlayerCard` throws from `text.replace()` | Owning asset is rejected                                 |
| Shirt-number/overlay-text object      | React throws while rendering the child    | Owning asset is rejected                                 |
| SUB inside a SUB side                 | Partial substitution renders              | Entire malformed SUB is rejected; valid siblings survive |
| Null/malformed roster siblings        | `Team` throws reading `show`              | Valid manual, foreign and coach rows render              |
| Null viewport style                   | `PlayerCard` throws reading `width`       | Valid card renders with default dimensions               |

`nestedParsers.spec.ts` covers supported producer payloads and actual coach,
missing-photo and MOTM factory round trips; mixed array/object collections;
known-field nulls; deep malformed SUBs; numeric/string player forms; metadata;
viewport normalization; and deterministic identified/legacy occurrence reads.
`nestedStatePaths.spec.tsx` uses the actual media preload, card, substitution,
Team and lifecycle components. Provider regressions in `sessionMutations.spec.tsx`
verify no SDK/audit attempt for invalid due data, original roster child-key
writes, and unchanged raw siblings during successful conditional transitions.
Band tests retain structurally valid fixtures so presentation rejections cannot
pass merely because a required asset key is missing.

`e2e/nested-state.spec.ts` uses real Auth/Database/Storage SDKs in namespace
`vikes-match-clock-test`, reads back the installed repository Database rules,
and verifies actual Database/Storage denials. It tests non-empty malformed
payloads that the existing rules allow, zero unintended transport/audit writes,
sparse roster edits, lifecycle advancement, legacy/raw-ID rejection, and actual
Storage-generation backfill for saved pairs/ad layouts. Semantic version-2
overlays pass through without file-generation lookups; version-1 files and the
optional main-screen link retain their identities.

Its fifteen serial registrations allocate case-owned venues, account and an
ungranted negative destination. The immutable input tuple and actual served
emulator target are admitted before fixture mutations; the canonical Database
installer remains global and externally serialized. Trusted Storage seeding
uses LocalFixture.uploadStorage for the original GIF bytes, while actual browser
SDK URL/metadata/backfill operations and explicit read/write authorization
controls remain real. Only resource roots are namespaced: raw roster children,
rejected neighbors, logical IDs, metadata and generation content are preserved.

The original rendered consumers use the writer's own SDK echoes and rollbacks.
Test-only completion accounting observes original put/merge callbacks and helper
promises, including separate lifecycle CAS audits. Void commands retain their
return behavior; diagnostic resets cannot acknowledge pending work. Independent
observer/anonymous contexts are created when required. One twenty-second finally
deadline covers client drain, closure and owned cleanup; unknown completion or
failed cleanup remains failed. See [fixture ownership and evidence limits](clock/testing.md#shared-fixture-ownership-and-emulator-guards).

The earlier #246 qualification described below is historical. Fixture ownership
and retirement changes need their own evidence and do not complete the deferred
#232 global isolation, failure recovery or benchmark work.

Firebase prunes null children and empty objects. For example, `name: {}` is
delivered as absence and is a supported partial card, not a malformed present
name. Browser malformed fixtures therefore use non-empty objects; untrusted
raw present-null occurrence IDs are separately rejected in units. Reads never
invent an occurrence ID to compensate for Firebase omission.

The local qualification also runs the existing playback-occurrence,
queue-intent and session-boundary browser suites, including competing real
transactions, captured natural-end callbacks, pending queue acknowledgements,
stale-session rejection, version-1/version-2 media and mapping preservation.
Use one test worker and the host resource wrapper for the entire emulator and
browser lifecycle. A resource-aborted check is incomplete until a later
bounded run passes. The full lint invocation exceeded the 5 GB working-set
guard; source lint is qualified in sequential batches instead.

This qualifies local Chromium and emulators. It does not qualify live cloud
data, physical screens, other browsers, hosted YouTube behavior, or retired
clients. The existing mixed-writer occurrence limit remains unchanged. There
are no rules, transport, playback protocol or provider partition changes.
