# Design: Injury Time Display Mode

## Field

Replace `showInjuryTime?: boolean` with `injuryTimeDisplayMode`:

```typescript
export type InjuryTimeDisplayMode = "stop" | "full" | "minutes";
```

| Mode    | Behavior at half-stop                                     |
| ------- | --------------------------------------------------------- |
| `stop`  | Pause, force seconds to `00`, buzz once.                  |
| `full`  | Continue counting elapsed minutes and seconds.            |
| `minutes` | Continue counting, but render whole minutes with `:00` seconds. |

The mode applies at every half-stop (`halfStops[0]`), which shifts through
the match as periods complete (`pauseMatch` slices the array). This mirrors
the existing `showInjuryTime` behavior, which was also period-agnostic.

## Legacy Migration

On parsing a match snapshot:

1. If `raw.injuryTimeDisplayMode` is one of `stop`/`full`/`minutes`, use it.
2. Otherwise, if `raw.showInjuryTime` is a boolean, map `false → stop`,
   `true → full`.
3. Otherwise fall back to the default (`full`).

Migration is a **derivation at parse time**: the parsed state exposes only
`injuryTimeDisplayMode` and never retains `showInjuryTime`. Authenticated
controllers persist the derived mode on their next write; read-only displays
never write.

## Clock Behavior

In `Clock.tsx`:

- `stop` — current `showInjuryTime === false` path: cap minutes at the
  half-stop, force seconds to `0`, fire `pauseMatch(true)` + `buzz(true)`.
- `full` — current `showInjuryTime === true` path: show real seconds.
- `minutes` — continue elapsed time, but after the half-stop is reached,
  force displayed seconds to `00` and show the full elapsed minutes.

Countdown behavior is preserved for all modes.

## Controller

`HalfStops.tsx` replaces the checkbox with a three-option selector. The
`setHalfStops` action signature becomes `(halfStops: number[], mode:
InjuryTimeDisplayMode)`. `MatchActions.tsx` shows the "Næsti hálfleikur"
button whenever the mode is not `stop`.
