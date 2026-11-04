# Clock state and venue metadata

Firebase owns shared state. The [command contract](../session-mutation-boundary.md),
[nested parsing contract](../nested-state-boundary.md), and
[playback occurrences](../playback-occurrences.md) own the detailed mutation,
ingestion, and completion rules.

Code paths in backticks are relative to `clock/src/` unless qualified. Update
this reference when changing the behavior it describes; see the
[task index](../README.md).

## 100% Firebase Architecture

**Firebase is the single source of truth.** There is no local state fallback.

State is managed through domain React contexts in `FirebaseStateContext`, with
one subscription owner for each runtime path:

- **Read path**: Firebase `onValue()` subscriptions → React state updates
- **Write path**: Actions call `set()`/`update()` on Firebase → Firebase triggers `onValue()` → React state updates
- State is **never** updated directly by action functions; all state changes flow through Firebase subscriptions

| Runtime owner                     | Subscription / hook                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Global venue metadata             | `locations`; `useListeners`, `useVenueMetadataStatus`                                                   |
| Match/controller/view/overrides   | One listener each under `states/{location}`; `useMatch`, `useController`, `useView`, `useClubOverrides` |
| Desired perimeter                 | One `states/{location}/perimeter` parent listener; `usePerimeter`                                       |
| Authenticated hardware telemetry  | Separate `PerimeterTelemetryProvider`, `perimeter/{location}/brightnessStatus`; `usePerimeterTelemetry` |
| Runtime availability and commands | `useFirebaseReadStatus`, `useMutationStatus`; existing session/connection machinery                     |

The desired parent delivery parses power/tokens/styles, overlay, goal video,
ad layout, media pairs, requested brightness and auto configuration together.
There are no additional desired-child listeners. Hardware reports never enter
the match context or its readiness gate. Distinct memoized context values and
stable commands prevent unrelated context notifications, including during an
ordinary provider render; an ordinary ancestor render can still render its
unmemoized children. The aggregate `useFirebaseState` hook remains for explicit
diagnostics/test composition, not production consumers or SDK ownership.

Each venue/auth session scope masks the previous scope's data immediately,
including a batched A → B → A. Data, cancellation and deadline callbacks also
belong to a particular read attempt; late callbacks cannot populate a new
scope or a retried attempt. Global metadata survives venue selection.

Five selected-venue deliveries (match, controller, view, clubOverrides and
perimeter) are required, including valid null/default/empty deliveries. A
permission failure or **15-second initial-delivery deadline** exposes an
actionable error and read retry rather than an endless spinner. Quiet loaded
data has no heartbeat deadline. Metadata and authenticated selector grants
have independent loading/error/retry states; an empty delivery is a completed
empty selector, not a failed read. Read errors use safe guidance rather than
raw SDK messages.

A required fault after load retains the last delivered data for that scope,
with a visible unavailable notice and locked commands. Explicit read retry
reattaches all five required streams without unmounting the same-venue
lifecycle or briefly replacing its current asset with null/default data. The
first recovered controller view establishes a baseline and does not trigger
automatic perimeter power. Retry is not write replay or server certification;
the [existing freshness handshake](../session-mutation-boundary.md) still
applies. Optional telemetry faults cannot block public output.

Key files:

- `contexts/FirebaseStateContext.tsx`: Main state provider with Firebase subscriptions and write operations
- `contexts/LocalStateContext.tsx`: Local display/settings state and Auth SDK projection
- `contexts/firebaseParsers.ts`: Type-safe runtime validators for Firebase snapshot data
- `contexts/nestedParsers.ts`: Canonical structural asset/current playback, roster/player,
  penalty and viewport parsers; shared discriminated asset model in `types.ts`
- `firebase.ts`: Firebase initialization with emulator support
- `firebaseDatabase.ts`: Low-level Firebase write operations

## Why 100% Firebase?

This architecture eliminates several classes of bugs:

- ~~Optimistic update divergence~~ - No local state to diverge
- ~~Hydration race conditions~~ - No hydration guards needed
- ~~Stale ref issues~~ - Refs only used for computing from latest state during rapid operations
- ~~Complex rollback logic~~ - Firebase is authoritative; failures simply don't update state

## Write Operations

When an authenticated controller calls an ordinary action (e.g., `addGoal()`):

1. The render-bound command checks its current session/venue/freshness epoch before reading subscription refs
2. `executeCommand` checks again immediately before an atomic `firebaseDatabase.writeAudited()` submission
3. Firebase triggers `onValue()` callback
4. React state updates from Firebase snapshot
5. UI re-renders with new state

CAS commands such as `startMatch()` use a transaction and a separate audit
append; they do not use the ordinary atomic write helper.

**Important**: Unauthenticated displays are read-only for shared state; presence
and diagnostics have their own limited write path. Ordinary commands require a current Auth SDK UID, ready freshness, and the same command-origin epoch. Ref values change only on Firebase subscription deliveries. See [the command contract and complete mutation inventory](../session-mutation-boundary.md).

## Multi-Controller Behavior

Multiple controllers can connect to the same `listenPrefix` simultaneously:

- All connected clients see the same state via Firebase subscriptions
- Uses **last-write-wins** semantics (no conflict resolution)
- For production use, coordinate with your team to avoid simultaneous edits

## Venue Metadata

`parseVenue()` / `parseLocations()` in `firebaseParsers.ts` provide the shared
validated `Venue` model for `LocationsManager` and runtime. The locations
subscription exposes `useListeners().venues[locationKey]` independently of
the flattened scoreboard `screens` selector entries. Read venue configuration
and perimeter mappings from `venues`, including for perimeter-only venues.
Screen entries retain their existing labels, keys, viewports and mapping
projection; authenticated selectors still use the operator's allowed locations.

`config.homeTeam` selects the KSI team for today's matches, match reports and
roster refetches. Team and pitch IDs normalize positive safe integers and
legacy decimal strings to numbers; missing/invalid home-team IDs alone use
the historical 2492 fallback. Screen definitions accept Firebase arrays,
sparse arrays and keyed maps, retaining child keys for edits. Admin saves
patch changed metadata leaves (including mapping publications) and clear only
`config/homeTeam` when that field is emptied, preserving unknown venue,
config, screen and mapping metadata. Reads never migrate persisted documents.
`Venue.document` retains the original snapshot solely for metadata edits;
mapping edits retain legacy aliases/array indices and fully write missing
defaulted objects on first edit.

`LocationsManager` derives its editor remount keys from the venue key and known
editable fields only. Unrelated metadata snapshots preserve open panels and
unsaved drafts; changes to known venue/screen/mapping fields still refresh the
editor, and a different venue key starts a separate draft. Screen drafts and
save comparisons also project only editable fields, so saving after an unknown
config, screen or style metadata update cannot restore stale metadata from the
draft. Leaf writes still use the latest canonical `Venue.document` for stored
paths and defaulted branches.

## The `listenPrefix` System

The `listenPrefix` (e.g., `"vikinni"`, `"hasteinsvollur"`) determines which Firebase path the instance subscribes to:

- `states/${listenPrefix}/match` - Match state (scores, clock, etc.)
- `states/${listenPrefix}/controller` - Controller state (assets, view mode, etc.)
- `states/${listenPrefix}/view` - View settings (viewport, background, etc.)
- `states/${listenPrefix}/perimeter` - [Desired browser media and power](perimeter-display.md)
- `states/${listenPrefix}/clubOverrides` - Venue-specific team definitions/logos

Empty `listenPrefix` blocks all write operations (prevents invalid paths like `states//match`).

## State Management

| Context                  | Purpose                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Firebase domain contexts | Shared state and explicit read/mutation status, with independent notification ownership |
| `LocalStateContext`      | Local app state (Auth, listen prefix)                                                   |

**Note**: Redux was fully removed from this codebase. All state is managed via React Context.

## Persistence

`LocalStateContext` persists listen prefix, scoreboard screen key and display
target in localStorage. Auth state is projected from the Firebase Auth SDK and
its persistence, not a second application-owned account record. Match state
comes from Firebase subscriptions.
