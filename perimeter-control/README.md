# perimeter-control

Daemon that mirrors the `states/vikuti/perimeter` Firebase state onto a
dedicated Resolume Arena composition that drives the perimeter LED screens at
the Víkin stadium.

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
     which drives both perimeter outputs).

### Why Node?

The **JS Admin SDK** reads Realtime Database over its native **WebSocket
protocol** (`@firebase/database`) — the same transport the clock apps use,
which delivers toggles instantly. The Python Admin SDK never implemented that
protocol; its `listen()` is built on the REST SSE streaming endpoint, which is
marked *experimental* and intermittently held events for **minutes** on this
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
installer **fails if it is missing**:

```bash
sudo ./install.sh /path/to/firebase-service-account.json
```

The installer:

- **Fails** unless a service-account JSON file is given and exists, and unless
  `node` is on `PATH`.
- Creates the `perimeter-control` system user.
- Installs the daemon to `/opt/perimeter-control` and runs `npm ci` there.
- Installs the service account to `/etc/perimeter-control/perimeter-service-account.json`
  (mode `0640`, readable by the service user).
- Creates `/etc/perimeter-control/perimeter-control.env` from the example
  (an existing file is **never** overwritten).
- Installs, enables and starts the `perimeter-control` systemd service.

## Configuration

Edit `/etc/perimeter-control/perimeter-control.env`:

| Variable                          | Default                                                                 | Description                                  |
| --------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| `PERIMETER_FIREBASE_DATABASE_URL` | `https://vikes-match-clock-firebase.firebaseio.com`                     | Realtime Database root URL                    |
| `PERIMETER_FIREBASE_PATH`         | `states/vikuti/perimeter/state`                                         | Path of the state child to listen to          |
| `PERIMETER_SERVICE_ACCOUNT_FILE`  | `/etc/perimeter-control/perimeter-service-account.json`                 | Admin SDK credential file                     |
| `PERIMETER_RESOLUME_BASE_URL`     | `http://localhost:80/api/v1`                                            | Resolume HTTP API base URL                    |
| `PERIMETER_RESOLUME_COLUMN`       | `1`                                                                     | Column started by `on`                        |
| `PERIMETER_REQUEST_TIMEOUT`       | `10`                                                                    | HTTP timeout in seconds                       |
| `PERIMETER_LISTENER_REFRESH_SECONDS` | `300`                                                                 | Listener refresh interval (0 disables)       |
| `PERIMETER_INITIAL_BACKOFF_SECONDS` | `1`                                                                   | Initial retry backoff in seconds              |
| `PERIMETER_MAX_BACKOFF_SECONDS`   | `60`                                                                    | Maximum retry backoff in seconds              |

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

## Behavior on failure

- **Credential missing/unreadable**: the daemon exits with a clear error; the
  installer normally prevents this by requiring the file up front.
- **Firebase unreachable**: the JS SDK reconnects automatically; the periodic
  refresh additionally reopens the stream so the current state is re-applied.
- **Resolume unreachable**: the failed request retries with bounded
  exponential backoff. A newer Firebase value supersedes a failed operation
  still awaiting retry, so stale requests are never applied after the state
  has moved on.
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
the public `states` read rules (`firebase-rules.json`). The daemon never
writes to Firebase. Keep the credential file out of version control and
rotate it if it ever leaks.

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

## Tests

```bash
npm install
npm test
```
