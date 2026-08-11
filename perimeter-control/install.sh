#!/usr/bin/env bash
# Install the perimeter-control daemon as a systemd service.
# Requires root and Node.js >= 18.
#
# Usage: sudo ./install.sh /path/to/firebase-service-account.json
#
# The first argument must be the JSON private key downloaded from the
# Firebase console (Project settings -> Service accounts -> Generate new
# private key). The installer refuses to run without it.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "error: install.sh must be run as root" >&2
  exit 1
fi

SERVICE_ACCOUNT_FILE="${1:-}"
if [[ -z "$SERVICE_ACCOUNT_FILE" ]]; then
  echo "error: missing service account file argument" >&2
  echo "usage: sudo $0 /path/to/firebase-service-account.json" >&2
  echo "Download it from Firebase console -> Project settings -> Service accounts -> Generate new private key." >&2
  exit 1
fi
if [[ ! -f "$SERVICE_ACCOUNT_FILE" ]]; then
  echo "error: service account file not found: $SERVICE_ACCOUNT_FILE" >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "error: node not found in PATH; install Node.js >= 18 first" >&2
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
# The service runs as perimeter-control, so the config dir must be
# traversable and readable by that user.
install -d -o root -g perimeter-control -m 0750 "$ETC_DIR"

install -o root -g root -m 0644 "$SCRIPT_DIR/index.js" "$APP_DIR/index.js"
install -o root -g root -m 0644 "$SCRIPT_DIR/resolume-preview.js" "$APP_DIR/resolume-preview.js"
install -o root -g root -m 0644 "$SCRIPT_DIR/package.json" "$APP_DIR/package.json"
install -o root -g root -m 0644 "$SCRIPT_DIR/package-lock.json" "$APP_DIR/package-lock.json"

# Service-account credential, readable by the perimeter-control service user.
install -o root -g perimeter-control -m 0640 "$SERVICE_ACCOUNT_FILE" "$ETC_DIR/perimeter-service-account.json"
echo "installed service account to $ETC_DIR/perimeter-service-account.json"

(cd "$APP_DIR" && npm ci --omit=dev --no-fund --no-audit)
chmod -R a+rX "$APP_DIR/node_modules"

if [[ ! -f "$ETC_DIR/perimeter-control.env" ]]; then
  install -o root -g perimeter-control -m 0640 "$SCRIPT_DIR/perimeter-control.env.example" "$ETC_DIR/perimeter-control.env"
  echo "created $ETC_DIR/perimeter-control.env from example"
else
  echo "keeping existing $ETC_DIR/perimeter-control.env (not overwritten)"
fi

install -o root -g root -m 0644 "$SCRIPT_DIR/perimeter-control.service" "/etc/systemd/system/$SERVICE_NAME.service"
sed -i "s|@NODE_BIN@|$NODE_BIN|g" "/etc/systemd/system/$SERVICE_NAME.service"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo
echo "perimeter-control installed and started (node: $NODE_BIN)."
echo "Verify:"
echo "  systemctl status $SERVICE_NAME"
echo "  journalctl -u $SERVICE_NAME -f"
