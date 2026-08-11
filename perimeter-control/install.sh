#!/usr/bin/env bash
# Install the perimeter-control daemon as a systemd service.
# Requires root.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "error: install.sh must be run as root" >&2
  exit 1
fi

APP_DIR=/opt/perimeter-control
ETC_DIR=/etc/perimeter-control
SERVICE_NAME=perimeter-control
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! id perimeter-control >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin perimeter-control
  echo "created system user perimeter-control"
fi

install -d -o root -g root -m 0755 "$APP_DIR"
install -d -o root -g root -m 0750 "$ETC_DIR"

install -o root -g root -m 0644 "$SCRIPT_DIR/perimeter_control.py" "$APP_DIR/perimeter_control.py"
install -o root -g root -m 0644 "$SCRIPT_DIR/requirements.txt" "$APP_DIR/requirements.txt"

if [[ ! -d "$APP_DIR/venv" ]]; then
  python3 -m venv "$APP_DIR/venv"
fi
"$APP_DIR/venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/venv/bin/pip" install --quiet -r "$APP_DIR/requirements.txt"

if [[ ! -f "$ETC_DIR/perimeter-control.env" ]]; then
  install -o root -g root -m 0640 "$SCRIPT_DIR/perimeter-control.env.example" "$ETC_DIR/perimeter-control.env"
  echo "created $ETC_DIR/perimeter-control.env from example"
else
  echo "keeping existing $ETC_DIR/perimeter-control.env (not overwritten)"
fi

install -o root -g root -m 0644 "$SCRIPT_DIR/perimeter-control.service" "/etc/systemd/system/$SERVICE_NAME.service"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo
echo "perimeter-control installed and started."
echo "Verify:"
echo "  systemctl status $SERVICE_NAME"
echo "  journalctl -u $SERVICE_NAME -f"
