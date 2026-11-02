#!/usr/bin/env bash
# Install/upgrade the brightness gateway. Requires root, Node.js >= 22 and
# Corepack with the package.json-pinned pnpm available to the installing user.
# Usage: sudo ./install.sh /path/to/firebase-service-account.json
set -euo pipefail

fail() {
  echo "error: $*" >&2
  exit 1
}

if [[ $EUID -ne 0 ]]; then
  fail "install.sh must be run as root"
fi
if [[ $# -ne 1 ]]; then
  fail "usage: $0 /path/to/firebase-service-account.json"
fi
SERVICE_ACCOUNT_FILE="$1"
[[ -f "$SERVICE_ACCOUNT_FILE" && -r "$SERVICE_ACCOUNT_FILE" ]] ||
  fail "a readable service account file is required; obtain it from the gateway maintainer"

APP_DIR=/opt/perimeter-control
ETC_DIR=/etc/perimeter-control
UNIT_FILE=/etc/systemd/system/perimeter-control.service
SERVICE_NAME=perimeter-control
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_FILES=(index.js brightness.js auto-brightness.js weather.js vnnox.js
  package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc)

# Finish prerequisites, including the frozen production dependency install in
# a staging directory, BEFORE changing the user, installation or service.
for tool in node corepack install cp chmod rm sed mktemp id useradd systemctl; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required"
done
for file in "${APP_FILES[@]}" perimeter-control.service perimeter-control.env.example; do
  [[ -f "$SCRIPT_DIR/$file" && -r "$SCRIPT_DIR/$file" ]] ||
    fail "missing readable source file: $file"
done

NODE_BIN="$(command -v node)"
# This exact executable goes into ExecStart. A login shell's node version is
# insufficient: systemd does not load a user's version manager or shell rc.
NODE_BIN="$("$NODE_BIN" -p 'process.execPath')"
NODE_VERSION="$("$NODE_BIN" -p 'process.versions.node')"
[[ "$NODE_VERSION" =~ ^([0-9]+)\. ]] && (( BASH_REMATCH[1] >= 22 )) ||
  fail "Node.js >= 22 is required by Firebase Admin (selected $NODE_VERSION)"
# Keep the systemd template substitution literal and usable with ProtectHome.
[[ "$NODE_BIN" =~ ^/[a-zA-Z0-9_./+-]+$ ]] ||
  fail "install node at a stable absolute system path without special characters"
case "$NODE_BIN" in
  /home/*|/root/*|/run/user/*) fail "service node must be outside protected home directories" ;;
esac
COREPACK_BIN="$(command -v corepack)"
# Pin pnpm and force its Node interpreter to be the same one as the service.
export PATH="${NODE_BIN%/*}:$PATH"
PNPM_SPEC="$("$NODE_BIN" -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).packageManager' "$SCRIPT_DIR/package.json")"
[[ "$PNPM_SPEC" =~ ^pnpm@([0-9]+\.[0-9]+\.[0-9]+)$ ]] ||
  fail "package.json must pin pnpm to an exact version"
PNPM_VERSION="${BASH_REMATCH[1]}"

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf -- "$STAGE_DIR"' EXIT
for file in "${APP_FILES[@]}"; do
  cp "$SCRIPT_DIR/$file" "$STAGE_DIR/$file"
done
# Running from the staged package makes Corepack select its packageManager.
# No credential file is read by Node or copied into dependency staging.
(
  cd "$STAGE_DIR"
  [[ "$("$NODE_BIN" "$COREPACK_BIN" pnpm --version)" == "$PNPM_VERSION" ]] ||
    fail "Corepack must provide $PNPM_SPEC"
  CI=true "$NODE_BIN" "$COREPACK_BIN" pnpm install --prod --frozen-lockfile
)

if ! id perimeter-control >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin perimeter-control
  echo "created system user perimeter-control"
fi
install -d -o root -g root -m 0755 "$APP_DIR"
install -d -o root -g perimeter-control -m 0750 "$ETC_DIR"
for file in "${APP_FILES[@]}"; do
  install -o root -g root -m 0644 "$SCRIPT_DIR/$file" "$APP_DIR/$file"
done
(
  cd "$APP_DIR"
  CI=true "$NODE_BIN" "$COREPACK_BIN" pnpm install --prod --frozen-lockfile --offline
)
chmod -R a+rX "$APP_DIR/node_modules"

# Only these retired, previously installed modules are pruned. Leave local
# files, credentials, old caches and Firebase/Storage data alone.
for file in overlay.js ad-layout.js resolume-import.js resolume-preview.js geometry.js; do
  rm -f -- "$APP_DIR/$file"
done

install -o root -g perimeter-control -m 0640 "$SERVICE_ACCOUNT_FILE" "$ETC_DIR/perimeter-service-account.json"
if [[ ! -f "$ETC_DIR/perimeter-control.env" ]]; then
  install -o root -g perimeter-control -m 0640 "$SCRIPT_DIR/perimeter-control.env.example" "$ETC_DIR/perimeter-control.env"
  echo "created $ETC_DIR/perimeter-control.env from example"
else
  echo "keeping existing $ETC_DIR/perimeter-control.env (not overwritten)"
fi

install -o root -g root -m 0644 "$SCRIPT_DIR/perimeter-control.service" "$UNIT_FILE"
sed -i "s|@NODE_BIN@|$NODE_BIN|g" "$UNIT_FILE"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "perimeter-control installed and started (node: $NODE_BIN, version: $NODE_VERSION)."
echo "Verify: systemctl status $SERVICE_NAME"
echo "Logs: journalctl -u $SERVICE_NAME -f"
