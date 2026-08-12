# perimeter-control

Daemon that mirrors the `states/vikuti/perimeter` Firebase state onto a
dedicated Resolume Arena composition that drives the perimeter LED screens at
the Víkin stadium, and publishes a read-only **preview snapshot** of that
composition (columns, clips, filenames and bounded JPEG thumbnails) so the
controller UI can show operators what is loaded.

The daemon is a long-lived Node.js process:

1. Listens to `states/vikuti/perimeter/state` in Firebase Realtime Database
   through the **Firebase Admin SDK** (`ref.on("value", ...)`).
2. Treats Firebase as the **desired-state authority**: only the exact strings
   `"on"` and `"off"` are valid. Missing, `null`, malformed or unknown values
   trigger **no** Resolume request and produce a warning log.
3. Applies the desired state to Resolume over its HTTP API:
   - `off` → `POST /api/v1/composition/disconnect-all` (Resolume's global
     Stop — stops **all** content controlled by this Resolume instance).
   - `on` → `POST /api/v1/composition/columns/1/connect` (starts column 1,
     which drives both perimeter outputs), then **asserts the deck autopilot**
     to `PERIMETER_DECK_AUTOPILOT` (default `Play Next Column`) — see
     [Deck autopilot self-heal](#deck-autopilot-self-heal).
4. Publishes the composition **preview snapshot** to `perimeter/vikuti` (see
   [Preview snapshot](#preview-snapshot) below) once at startup and after each
   successful `on`, through the Admin SDK.

### Why Node?

The **JS Admin SDK** reads Realtime Database over its native **WebSocket
protocol** (`@firebase/database`) — the same transport the clock apps use,
which delivers toggles instantly. The Python Admin SDK never implemented that
protocol; its `listen()` is built on the REST SSE streaming endpoint, which is
marked _experimental_ and intermittently held events for **minutes** on this
network (the original motivation for this daemon). A Node daemon therefore
fixes the delayed-delivery problem at the transport level.

As a safety net the daemon still periodically closes and reopens the listener
(`PERIMETER_LISTENER_REFRESH_SECONDS`, default 300s), which re-delivers the
current state and bounds any transport stall. Unchanged state is never
re-applied, so the periodic reconnect causes no spurious Resolume calls.

## Scope

This version controls **column 1** and uses the **global `disconnect-all`**
endpoint. `disconnect-all` intentionally stops every Resolume-accessible
output on the dedicated composition, not only column 1.

## Deck autopilot self-heal

The base content deck — and with it the ads the ad-layout controller deploys
into its columns — cycles via the composition autopilot (`Play Next Column`).
That autopilot is the ads' transport: if it is ever left paused, the deck stays
stuck on a single ad. The only legitimate pausing is the goal overlay, which
freezes the autopilot while a celebration plays and restores it on clear
(persisting the original value to `<cache-dir>/overlay-autopilot.json` so a
restart mid-celebration still restores it).

Because stale paused state can otherwise accumulate, every `on` **asserts** the
autopilot target to `PERIMETER_DECK_AUTOPILOT` (default `Play Next Column`),
the column duration type to `PERIMETER_DECK_AUTOPILOT_DURATION` (default
`Seconds`) and the duration to `PERIMETER_DECK_AUTOPILOT_SECONDS` (default
`20`) right after connecting, overriding any leftover. The `Seconds`/20
duration exists because Resolume defaults still-image clips to 1s: with a
`Longest Clip` deck a PNG ad column would advance after 1s while video columns
play their full length, so a uniform 20s keeps every ad — images included — on
screen the same time. The assertion is skipped while a goal overlay is actively
freezing the deck (`overlay-autopilot.json` present), so a live celebration is
never unpaused, and it deletes the dead legacy
`<cache-dir>/autopilot-freeze.json` record from an earlier daemon build. `off`
never touches the autopilot.

## Prerequisites

1. **Node.js >= 18** on the gateway.
2. **Firebase service account**: download the JSON private key from Firebase
   console → Project settings → Service accounts → **Generate new private
   key**. The project's service account must be allowed to read Realtime
   Database (the Admin SDK bypasses the public `states` read rules).
3. **Resolume**: enable the **web server** in Resolume Arena Preferences →
   Advanced, and configure a reverse proxy so the API is reachable on
   `http://localhost:80/api/v1` on the same machine as this service. Verify
   before installing:

   ```bash
   curl -i -X POST http://localhost:80/api/v1/composition/disconnect-all
   curl -i -X POST http://localhost:80/api/v1/composition/columns/1/connect
   ```

## Installation

Requires root. The service account file is a required argument and the
installer **fails if it is missing**. The overlay SSH key is optional and
defaults to the installing user's `~/.ssh/id_ed25519`:

```bash
sudo ./install.sh /path/to/firebase-service-account.json [/path/to/overlay-ssh-key]
```

The installer:

- **Fails** unless a service-account JSON file is given and exists, and unless
  `node` is on `PATH`.
- Creates the `perimeter-control` system user.
- Creates the overlay asset cache directory `/var/cache/perimeter-control`
  (owned by the service user).
- Installs the daemon to `/opt/perimeter-control` and runs `npm ci` there.
- Installs the service account to `/etc/perimeter-control/perimeter-service-account.json`
  (mode `0640`, readable by the service user).
- Installs the overlay SSH key (if found/given) to
  `/etc/perimeter-control/overlay-ssh-key` (mode `0600`, owned by the service
  user) for passwordless SCP to the Windows Resolume host.
- Creates `/etc/perimeter-control/perimeter-control.env` from the example
  (an existing file is **never** overwritten).
- Installs, enables and starts the `perimeter-control` systemd service.

## Configuration

Edit `/etc/perimeter-control/perimeter-control.env`:

| Variable                             | Default                                                 | Description                                                       |
| ------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------- |
| `PERIMETER_FIREBASE_DATABASE_URL`    | `https://vikes-match-clock-firebase.firebaseio.com`     | Realtime Database root URL                                        |
| `PERIMETER_FIREBASE_PATH`            | `states/vikuti/perimeter/state`                         | Path of the state child to listen to                              |
| `PERIMETER_SERVICE_ACCOUNT_FILE`     | `/etc/perimeter-control/perimeter-service-account.json` | Admin SDK credential file                                         |
| `PERIMETER_RESOLUME_BASE_URL`        | `http://localhost:80/api/v1`                            | Resolume HTTP API base URL                                        |
| `PERIMETER_RESOLUME_COLUMN`          | `1`                                                     | Column started by `on`                                            |
| `PERIMETER_REQUEST_TIMEOUT`          | `10`                                                    | HTTP timeout in seconds                                           |
| `PERIMETER_LISTENER_REFRESH_SECONDS` | `300`                                                   | Listener refresh interval (0 disables)                            |
| `PERIMETER_INITIAL_BACKOFF_SECONDS`  | `1`                                                     | Initial retry backoff in seconds                                  |
| `PERIMETER_MAX_BACKOFF_SECONDS`      | `60`                                                    | Maximum retry backoff in seconds                                  |
| `PERIMETER_PREVIEW_ENABLED`          | `true`                                                  | Set to `false` to disable the preview snapshot                    |
| `PERIMETER_PREVIEW_PATH`             | `perimeter/vikuti`                                      | Path of the published preview snapshot                            |
| `PERIMETER_THUMBNAIL_MAX_DIM`        | `320`                                                   | Longest side of re-encoded thumbnails (px)                        |
| `PERIMETER_THUMBNAIL_QUALITY`        | `0.7`                                                   | JPEG quality (0.1–1.0) for thumbnails                             |
| `PERIMETER_THUMBNAIL_MAX_BYTES`      | `100000`                                                | Per-thumbnail cap in published data-URL chars (larger is omitted) |
| `PERIMETER_PREVIEW_MAX_BYTES`        | `8000000`                                               | Whole-snapshot byte cap (larger is rejected)                      |

After changing the environment file:

```bash
sudo systemctl restart perimeter-control
```

## Service lifecycle

```bash
sudo systemctl status perimeter-control
sudo systemctl restart perimeter-control
sudo systemctl stop perimeter-control
sudo systemctl disable --now perimeter-control
```

## Logs

The daemon logs to stdout/stderr, captured by journald:

```bash
journalctl -u perimeter-control -f
```

## Preview snapshot

The daemon publishes a normalized read-only snapshot of the Resolume
composition to `PERIMETER_PREVIEW_PATH` (`perimeter/vikuti`) so the controller
UI can preview which clips are loaded, grouped by Resolume column. The shape
is:

```json
{
  "updatedAt": 1723392000000,
  "columns": [
    {
      "id": 1,
      "name": "Column 1",
      "clips": [
        {
          "id": 12,
          "filename": "sponsor-loop.mp4",
          "thumbnail": "data:image/jpeg;base64,..."
        }
      ]
    }
  ]
}
```

- `updatedAt` is a **Firebase server timestamp**.
- The snapshot is refreshed **once at startup and after each successful `on`**.
  There is no manual refresh; the refresh never delays or changes the on/off
  command retry behavior. The snapshot is written with `update()` (not `set()`)
  so the sibling status paths `perimeter/{location}/adLayout` and
  `perimeter/{location}/overlayStatus` are preserved — a `set()` on the preview
  path would replace the whole subtree and silently delete them.
- The composition is read through the Resolume HTTP API
  (`GET /api/v1/composition` for columns and the layer→column clip grid,
  `GET /api/v1/composition/layers/{layer}/clips/{column}/thumbnail` for the
  PNG thumbnails). All Resolume-version-specific parsing is isolated in
  `resolume-preview.js`; invalid or missing fields are omitted rather than
  breaking the whole snapshot.
- Thumbnails are re-encoded client-side in the daemon as bounded JPEG data
  URLs (`PERIMETER_THUMBNAIL_MAX_DIM`, `PERIMETER_THUMBNAIL_QUALITY`).
  `PERIMETER_THUMBNAIL_MAX_BYTES` bounds the **published data URL** (base64
  characters), not the raw JPEG bytes, so the payload stays predictable.
- A snapshot whose whole payload would exceed `PERIMETER_PREVIEW_MAX_BYTES` is
  **rejected** (never written); the last published snapshot is kept and the
  failure is logged.
- The snapshot lives at the top-level `perimeter/{location}` path, **outside**
  the writable `states/` subtree, and is denied to clients by the database
  rules (see `firebase-rules.json`). The service account writes it through the
  Admin SDK.

## Behavior on failure

- **Credential missing/unreadable**: the daemon exits with a clear error; the
  installer normally prevents this by requiring the file up front.
- **Firebase unreachable**: the JS SDK reconnects automatically; the periodic
  refresh additionally reopens the stream so the current state is re-applied.
- **Resolume unreachable**: the failed request retries with bounded
  exponential backoff. A newer Firebase value supersedes a failed operation
  still awaiting retry, so stale requests are never applied after the state
  has moved on.
- **Preview refresh fails** (Resolume query error, oversized payload, or a
  rejected thumbnail batch): the failure is logged and the **last published
  snapshot is left intact** — the UI simply shows a stale `updatedAt`.
- **Convergence**: the current Firebase value is applied as soon as it is
  observed (the listener's initial snapshot, and again after each refresh or
  SDK reconnect). A state that changed while the daemon was down is applied
  when the stream next delivers. Unchanged state is never re-applied, so an
  idle Resolume is not spammed.

## Security

The daemon authenticates to Realtime Database with the **service-account
credential** installed to `/etc/perimeter-control/perimeter-service-account.json`
(mode `0640`, group `perimeter-control`), which the systemd service reads as
the `perimeter-control` user. The Admin SDK has full read access and bypasses
the public `states` read rules (`firebase-rules.json`), and writes the
preview snapshot to `perimeter/vikuti` — a path denied to unauthenticated
clients (see `firebase-rules.json`). Keep the credential file out of version
control and rotate it if it ever leaks.

## Manual API verification

With the service running, drive Resolume through Firebase:

```bash
# Turn perimeter LEDs off (stops all outputs on the composition)
curl -X PATCH 'https://vikes-match-clock-firebase.firebaseio.com/states/vikuti/perimeter.json' \
  -d '{"state":"off"}'

# Turn perimeter LEDs on (starts column 1)
curl -X PATCH 'https://vikes-match-clock-firebase.firebaseio.com/states/vikuti/perimeter.json' \
  -d '{"state":"on"}'
```

## Perimeter overlay (goal-triggered video sequences)

The daemon also runs an **overlay state machine** that plays video columns on
reserved Resolume layers when a goal is scored. This is independent of the
base perimeter on/off toggle.

### How it works

1. The clock controller writes an overlay document to
   `states/${location}/perimeter/overlay` when a home goal is scored.
2. The overlay controller validates the document (version, id, column count,
   durations, paired file targets, filename safety, approved bucket only).
3. `null` at the overlay path is treated as a clear command.
4. Assets are downloaded from GCS (`gs://vikes-match-clock-firebase.appspot.com`)
   to a local Linux cache, deduplicated by object generation.
5. Files are SCP-copied to the Windows Resolume host's `C:/Content` directory
   using a temporary remote filename, then renamed atomically. The rename
   uses a backslash path because cmd's `move` does not accept forward slashes.
   The copy is **skipped when the remote file already matches** the local
   cached size (verified over SSH and remembered per run), and the GCS object
   generation lookup is cached for 60s, so a repeated goal celebration skips
   the ~36 MB transfer and reaches "playing" in about a second. Remote
   filenames embed the GCS object generation (e.g. `goal-48-1234567890123.mp4`)
   so same-size re-uploads are always picked up; previous generation copies are
   cleaned up best-effort after a successful upload.
6. Before staging, the target clip slot is cleared first: Resolume holds a
   loaded video file open on Windows, so overwriting it without unloading
   fails with "Access is denied".
7. The daemon **pauses the deck autopilot** (composition autopilot target →
   "Off", via `PUT /api/v1/parameter/by-id/{id}`) so the base content cannot
   auto-advance away from the current column while the goal celebration plays.
   The original autopilot value is persisted to
   `<cache-dir>/overlay-autopilot.json` so a daemon restart during an overlay
   still restores the correct value on clear. If the freeze fails (e.g. the
   autopilot target cannot be read or the set fails), the overlay is aborted
   with an error status. The overlay file is then loaded
   into a single clip slot — the **currently active deck column** — on each
   reserved overlay layer; `PERIMETER_OVERLAY_LAYER_CLIP_COLUMNS` identifies
   each layer's reference slot (the fallback if the composition read fails).
   Loading one slot per layer keeps the trigger fast (~1-2s). Resolume's clip
   `open` takes a `file:///` URL (e.g. `file:///C:/Content/goal-48.mp4`) as a
   plain-text body. Playback loops via the clip transport's default `Loop`
   playmode, so no separate loop endpoints are needed (this Resolume REST
   version exposes no clip transport endpoints).
8. All paired layers are triggered together by connecting the clip in the
   **currently active deck column** (read from the live composition right
   before triggering). Because the autopilot is paused, the deck stays on
   that column and the overlay keeps looping until it is explicitly cleared.
9. Sequential columns advance after their configured `durationMs`.
10. The final column loops until the overlay is explicitly cleared.
11. Clearing unloads the overlay clip slot(s) (releasing the file handles) and
    restores the deck autopilot target — never touching the base content
    layers or the full deck.
12. On daemon restart, the overlay controller reconciles the active overlay
    document and restores playback.

### Resolume composition requirements

The `Efni` deck must contain reserved overlay layers above the base content.
Resolume's HTTP API addresses layers by **1-based index**, so
`PERIMETER_OVERLAY_LAYER_IDS` must be the layer **indices**, not Resolume
internal IDs. For the Víkin composition (flat layer list):

```
1  48 skjáir     (base layer, 4608×192)
2  Overlay       (48-screen overlay — configured as layer index 2)
3  40 skjáir     (base layer, 3840×192)
4  Overlay       (40-screen overlay — configured as layer index 4)
```

`PERIMETER_OVERLAY_LAYER_IDS=2,4` and
`PERIMETER_OVERLAY_LAYER_CLIP_COLUMNS={"2":1,"4":1}`, so layer index 2 plays
`goal-48.mp4` on the 48-screen array and layer index 4 plays `goal-40.mp4` on
the 40-screen array. If the composition is reorganized the indices must be
updated here **and** in the clock app's overlay document (which keys its
`files` by the same indices).

The overlay file is loaded into the currently active deck column of the
overlay layers and the deck autopilot is paused for the duration of the goal
celebration. This is deliberate: the base content (`48 skjáir` / `40 skjáir`)
is a multi-column deck that auto-advances on a ~20s timer, and an overlay
placed in a single column would disappear as soon as the deck moved to the
next column (the overlay layers would have nothing in the new column). Pausing
the autopilot keeps the deck on the overlay's column; mirroring the file into
every column instead was tried first but made the trigger ~13s slower (one
`open` per column), which is why the autopilot approach is used. On clear the
autopilot target is restored to its original value and the base content
rotation resumes.

The daemon only uses existing clip slots — it never creates groups, layers,
or columns.

### Status reporting

The daemon publishes its overlay state to `perimeter/${location}/overlayStatus`:

```json
{
  "commandId": "overlay-uuid",
  "phase": "downloading|copying|loading|playing|error",
  "activeColumn": 0,
  "error": null
}
```

Clients have read-only access to this path; only the daemon writes to it.

### Configuration

See `perimeter-control.env.example` for all overlay environment variables:
`PERIMETER_OVERLAY_ENABLED`, `PERIMETER_OVERLAY_PATH`, `PERIMETER_OVERLAY_STATUS_PATH`,
`PERIMETER_OVERLAY_GCP_PROJECT`, `PERIMETER_OVERLAY_CACHE_DIR`,
`PERIMETER_OVERLAY_SSH_HOST/USER/KEY`, `PERIMETER_OVERLAY_REMOTE_CONTENT_DIR`,
`PERIMETER_OVERLAY_LAYER_IDS`, `PERIMETER_OVERLAY_LAYER_CLIP_COLUMNS`,
`PERIMETER_OVERLAY_LAYER_TARGET_FOLDERS`.

The SSH key must provide passwordless access to the Windows Resolume host.

### Accepted GCS source paths (goal + named pairs)

The overlay controller accepts exactly two source families, both in the
approved `vikes-match-clock-firebase.appspot.com` bucket:

1. **Legacy home-goal files** — `gs://{bucket}/{location}/perimeter/{filename}`
   (e.g. `goal-48.mp4`, `goal-40.mp4`). The location is derived from the
   overlay path (`states/{location}/perimeter/overlay`).
2. **Named media-pair files** —
   `gs://{bucket}/{location}/perimeter-overlays/{pairId}/{48|40}/{filename}`.
   The target folder must match the layer's configured target folder: layer
   `"2"` → `48`, layer `"4"` → `40`
   (`PERIMETER_OVERLAY_LAYER_TARGET_FOLDERS`, default
   `{"2":"48","4":"40"}`). A partial override of this map is merged over the
   default, so a layer omitted from the override keeps its default folder and
   stays enforced. Any other object path — a foreign location, an
   arbitrary `perimeter-overlays` path, a traversal (`..`), or a
   target/layer mismatch — is rejected.

These named pairs use the same single active overlay channel as the goal
overlay: whichever overlay document is written most recently wins, and the
pair keeps looping until `overlay: null` (the shared clear path).

## Perimeter ad layout (content deployer on the base layers)

The ad-layout controller is a **content deployer**: it stages ad files from
Firebase Storage and opens them into the deck columns of the configured base
layers. It never drives clip-level transport and never touches the autopilot —
the composition's existing autopilot cycles the deck columns exactly as it
cycles the Efni content, so the Resolume UI stays fully functional. The one
exception is a **playback restart**: applying a new revision clears every ad
slot and reloads them (which stops the deck), so when the base perimeter state
is `on` the daemon reconnects the base column with
`POST /composition/columns/{column}/connect` after a successful apply to put
the new ads back into rotation.

The goal overlay (above) uses the disjoint **overlay** layers; the ad layout
uses the **base** layers. `assertNoSlotConflicts` in `index.js` rejects any
overlapping lane configuration at startup.

### How it works

1. The controller writes a desired layout to
   `states/${location}/perimeter/adLayout` (`version`, `revision`,
   `columns[]`, each column with one file per configured lane).
2. The daemon reads the live composition for lane names and the deck column
   count `M`.
3. The `N` layout columns map **1:1** to deck columns (`mapLayoutToDeckColumns`):
   layout column *i* loads into deck column *i+1*. Surplus deck columns stay
   empty — the deck autopilot skips empty columns, so the deck cycles only
   through the `N` ads.
4. **Clear-then-load**: the daemon empties all ad slots across the deck on the
   ad lanes, then stages each file (GCS → local cache → SCP to the Windows
   host) and opens it into its mapped deck column on every lane.
5. The daemon publishes the applied status to
   `perimeter/${location}/adLayout` with `phase: "loading"` → `"playing"`.
   The autopilot then cycles the columns; the ads play with no further daemon
   involvement.
6. Because the clear-then-load stops the deck, a layout change while the ads
   were playing would leave them stopped. The daemon tracks the base perimeter
   state (`states/${location}/perimeter/state`); after a successful apply it
   restarts the deck with `POST /composition/columns/{column}/connect` (the
   same primitive the `on` state uses) when the perimeter was `on` before the
   clear — and still is — so the new ads resume from column 1. The restart is
   best-effort (retried, failure logged, never fails the applied layout).
7. An empty `columns` array (or a deleted document) clears all ad slots on the
   ad lanes and publishes `phase: "idle"`.

Thumbnails are fetched once per unique ad file (from its first deck column)
and included in the status. A staging or load failure publishes
`phase: "error"` with the failure text.

The status publish is retried and re-published on the listener refresh, so a
write lost right after a daemon restart self-heals.

### Resolume composition requirements

- The ad lanes must be the base content layers (1-based layer indices) that
  the deck autopilot cycles. For the Víkin composition these are layers
  **1** ("48 skjáir") and **3** ("40 skjáir"); the overlay layers above them
  are **2** and **4**.
- The daemon only uses existing deck columns and clip slots — it never
  creates groups, layers, or columns.
- Each layout column occupies exactly one deck column (1:1); the deck
  autopilot skips empty columns, so the surplus columns after the last ad are
  left blank and never shown. A layout with more columns than the deck is
  refused with an `error` status.

### Configuration

See `perimeter-control.env.example` for all ad-layout environment variables:
`PERIMETER_AD_LAYOUT_ENABLED`, `PERIMETER_AD_LAYOUT_PATH`,
`PERIMETER_AD_LAYOUT_STATUS_PATH`, `PERIMETER_AD_LANE_IDS` (default `1,3`),
`PERIMETER_AD_LAYOUT_BUCKET`, `PERIMETER_AD_MAX_FILE_BYTES`.

The deck column range is derived from the live composition at runtime; there
is no per-slot configuration. The deck autopilot the ads rely on is asserted
on every `on` state (see [Deck autopilot self-heal](#deck-autopilot-self-heal);
`PERIMETER_DECK_AUTOPILOT`).

### Deck import (one-shot)

The controller's ad-layout manager starts empty; the operator can **import the
existing Resolume deck** into the editable layout system with a one-shot
command. A write to `states/${location}/perimeter/import` of the form
`{ commandId: "<uuid>", command: "from-resolume" }` makes the daemon:

1. read the live Resolume composition,
2. map each deck column position → an ad-layout column (`files` keyed by the ad
   lanes; a column is skipped when a lane has no valid clip),
3. pull the deck clip files off the Windows host and upload any missing ones to
   GCS at `<location>/perimeter/<basename>` (reusing objects that already exist;
   files over `PERIMETER_AD_MAX_FILE_BYTES` are skipped),
4. write the generated layout to `states/${location}/perimeter/adLayout` with a
   fresh revision (the ad-layout controller then stages and plays it),
5. publish `{ commandId, phase, columnsImported, columnsSkipped, errors }` to
   `perimeter/${location}/importStatus`.

The command is deduped by `commandId` (persisted in
`<cache-dir>/import-last-command.json` so a restart never re-imports) and is
deliberately left in place; a retry needs a fresh `commandId`. The write to the
desired `adLayout` path is a deliberate one-shot exception to the "daemon never
writes the desired path" rule — it cannot self-loop because it only reacts to
the separate import command path.

## Tests

```bash
npm install
npm test
```
