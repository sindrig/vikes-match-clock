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
  echo "usage: sudo $0 /path/to/firebase-service-account.json [/path/to/overlay-ssh-key]" >&2
  echo "Download it from Firebase console -> Project settings -> Service accounts -> Generate new private key." >&2
  exit 1
fi
if [[ ! -f "$SERVICE_ACCOUNT_FILE" ]]; then
  echo "error: service account file not found: $SERVICE_ACCOUNT_FILE" >&2
  exit 1
fi

OVERLAY_SSH_KEY="${2:-}"
if [[ -z "$OVERLAY_SSH_KEY" ]]; then
  if [[ -n "${SUDO_USER:-}" ]]; then
    SUDO_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
    if [[ -f "$SUDO_HOME/.ssh/id_ed25519" ]]; then
      OVERLAY_SSH_KEY="$SUDO_HOME/.ssh/id_ed25519"
    fi
  fi
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
# The overlay asset cache is written by the service user.
CACHE_DIR="${PERIMETER_CACHE_DIR:-/var/cache/perimeter-control}"
install -d -o perimeter-control -g perimeter-control -m 0755 "$CACHE_DIR"
echo "created cache dir $CACHE_DIR"

install -o root -g root -m 0644 "$SCRIPT_DIR/index.js" "$APP_DIR/index.js"
install -o root -g root -m 0644 "$SCRIPT_DIR/resolume-preview.js" "$APP_DIR/resolume-preview.js"
install -o root -g root -m 0644 "$SCRIPT_DIR/overlay.js" "$APP_DIR/overlay.js"
install -o root -g root -m 0644 "$SCRIPT_DIR/package.json" "$APP_DIR/package.json"
install -o root -g root -m 0644 "$SCRIPT_DIR/package-lock.json" "$APP_DIR/package-lock.json"

# Service-account credential, readable by the perimeter-control service user.
install -o root -g perimeter-control -m 0640 "$SERVICE_ACCOUNT_FILE" "$ETC_DIR/perimeter-service-account.json"
echo "installed service account to $ETC_DIR/perimeter-service-account.json"

# Overlay SSH key for passwordless SCP to the Windows Resolume host.
if [[ -n "$OVERLAY_SSH_KEY" ]]; then
  if [[ ! -f "$OVERLAY_SSH_KEY" ]]; then
    echo "error: overlay SSH key not found: $OVERLAY_SSH_KEY" >&2
    exit 1
  fi
  install -o perimeter-control -g perimeter-control -m 0600 "$OVERLAY_SSH_KEY" "$ETC_DIR/overlay-ssh-key"
  echo "installed overlay SSH key to $ETC_DIR/overlay-ssh-key"
else
  echo "warning: no overlay SSH key given; the overlay cannot copy assets to the Resolume host"
fi

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
