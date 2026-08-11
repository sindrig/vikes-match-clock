# perimeter-control

Daemon that mirrors the `states/vikuti/perimeter` Firebase state onto a
dedicated Resolume Arena composition that drives the perimeter LED screens at
the Víkin stadium.

The daemon is a long-lived Python process:

1. Streams `states/vikuti/perimeter/state.json` from Firebase Realtime
   Database over SSE (`Accept: text/event-stream`).
2. Treats Firebase as the **desired-state authority**: only the exact strings
   `"on"` and `"off"` are valid. Missing, `null`, malformed or unknown values
   trigger **no** Resolume request and produce a warning log.
3. Applies the desired state to Resolume over its HTTP API:
   - `off` → `POST /api/v1/composition/disconnect-all` (Resolume's global
     Stop — stops **all** content controlled by this Resolume instance).
   - `on` → `POST /api/v1/composition/columns/1/connect` (starts column 1,
     which drives both perimeter outputs).

## Scope

This version controls **column 1** and uses the **global `disconnect-all`**
endpoint. `disconnect-all` intentionally stops every Resolume-accessible
output on the dedicated composition, not only column 1.

## Resolume setup (prerequisite)

1. In Resolume Arena Preferences → Advanced, enable the **web server**.
2. Configure a reverse proxy so the Resolume API is reachable on
   `http://localhost:80/api/v1` on the same machine as this service.
3. Verify the API responds before installing:

   ```bash
   curl -i -X POST http://localhost:80/api/v1/composition/disconnect-all
   curl -i -X POST http://localhost:80/api/v1/composition/columns/1/connect
   ```

## Installation

Requires root and a Python 3.12+ interpreter.

```bash
sudo ./install.sh
```

The installer:

- Creates the `perimeter-control` system user.
- Installs the daemon to `/opt/perimeter-control` with a virtualenv.
- Creates `/etc/perimeter-control/perimeter-control.env` from the example
  (an existing file is **never** overwritten).
- Installs, enables and starts the `perimeter-control` systemd service.

## Configuration

Edit `/etc/perimeter-control/perimeter-control.env`:

| Variable                          | Default                                                                 | Description                                  |
| --------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| `PERIMETER_FIREBASE_URL`          | `https://vikes-match-clock-firebase.firebaseio.com/states/vikuti/perimeter/state` | Firebase stream location (`.json` is appended) |
| `PERIMETER_RESOLUME_BASE_URL`     | `http://localhost:80/api/v1`                                            | Resolume HTTP API base URL                    |
| `PERIMETER_RESOLUME_COLUMN`       | `1`                                                                     | Column started by `on`                        |
| `PERIMETER_REQUEST_TIMEOUT`       | `10`                                                                    | HTTP timeout in seconds                       |
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

- **Firebase unreachable**: the daemon reconnects with bounded exponential
  backoff, forever.
- **Resolume unreachable**: the failed request retries with bounded
  exponential backoff. A newer Firebase value supersedes a failed operation
  still awaiting retry, so stale requests are never applied after the state
  has moved on.
- **Replay on reconnect**: every fresh stream connection redelivers the
  current Firebase value as an initial `put` event, so the daemon re-applies
  the desired state on startup and after any reconnect without further input.

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
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest tests/
```
