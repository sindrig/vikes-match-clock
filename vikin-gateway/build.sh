#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS_FILE="${SCRIPT_DIR}/secrets.env"
STAGE_DIR="${SCRIPT_DIR}/stage-vikin"
PI_GEN_COMMIT="d7a31c6aa09f4b867902c51da2b45807c0a1709e"
PI_GEN_BRANCH="bookworm-arm64"
PI_GEN_DIR="${SCRIPT_DIR}/.cache/pi-gen"
OUTPUT_DIR="${SCRIPT_DIR}/output"
CONFIG_FILE="${SCRIPT_DIR}/.cache/build-config"
ENROLL_CONF_RENDERED="${STAGE_DIR}/03-enrollment-service/files/ts-enroll.conf"

cleanup() {
  echo "Cleaning up temporary secret-bearing files..."
  _secret_files=(
    "${STAGE_DIR}/03-enrollment-service/files/ts-auth-key"
    "${ENROLL_CONF_RENDERED}"
    "${STAGE_DIR}/01-network-config/files/wifi.nmconnection"
    "${CONFIG_FILE}"
  )
  # Also clean cached pi-gen copied custom stage
  if [[ -d "${PI_GEN_DIR}/stage-vikin" ]]; then
    _secret_files+=(
      "${PI_GEN_DIR}/stage-vikin/03-enrollment-service/files/ts-auth-key"
      "${PI_GEN_DIR}/stage-vikin/03-enrollment-service/files/ts-enroll.conf"
      "${PI_GEN_DIR}/stage-vikin/01-network-config/files/wifi.nmconnection"
    )
  fi
  for _f in "${_secret_files[@]}"; do
    if [[ -f "${_f}" ]]; then
      if command -v shred &>/dev/null; then
        shred -u "${_f}"
      else
        rm -f "${_f}"
      fi
    fi
  done
}
trap cleanup EXIT

# --- Validate secrets.env ---

if [[ ! -f "${SECRETS_FILE}" ]]; then
  echo "ERROR: ${SECRETS_FILE} not found."
  echo "Copy secrets.env.example to secrets.env and fill in real values."
  exit 1
fi

# shellcheck source=/dev/null
source "${SECRETS_FILE}"

missing=0
for var in TS_AUTH_KEY WIFI_COUNTRY; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: ${var} is not set in secrets.env"
    missing=1
  fi
done
if [[ ${missing} -ne 0 ]]; then
  exit 1
fi

# --- Validate hostname (Tailscale-compatible: alphanumeric + hyphens, 1-63 chars) ---

TS_HOSTNAME="${TS_HOSTNAME:-vikin-gateway}"
if [[ -z "${TS_HOSTNAME}" ]]; then
  echo "ERROR: TS_HOSTNAME must not be empty."
  exit 1
fi
if [[ ! "${TS_HOSTNAME}" =~ ^[A-Za-z0-9][A-Za-z0-9-]{0,62}$ ]]; then
  echo "ERROR: TS_HOSTNAME must be 1-63 characters, alphanumeric/hyphens, starting with alphanumeric. Got: '${TS_HOSTNAME}'"
  exit 1
fi

# --- Validate TS_TAGS (REQUIRED, comma-separated, each entry tag:[A-Za-z0-9_-]+) ---

TS_TAGS="${TS_TAGS:-}"
if [[ -z "${TS_TAGS}" ]]; then
  echo "ERROR: TS_TAGS is not set in secrets.env. At least one tag is required (e.g. tag:gateway)."
  exit 1
fi
IFS=',' read -ra _tags_arr <<<"${TS_TAGS}"
for _tag in "${_tags_arr[@]}"; do
  # Trim whitespace
  _tag="${_tag#"${_tag%%[![:space:]]*}"}"
  _tag="${_tag%"${_tag##*[![:space:]]}"}"
  if [[ ! "${_tag}" =~ ^tag:[A-Za-z0-9_-]+$ ]]; then
    echo "ERROR: Each TS_TAGS entry must match 'tag:[A-Za-z0-9_-]+' (no spaces, no special chars). Bad entry: '${_tag}'"
    exit 1
  fi
done

# Normalize: remove all whitespace so "tag:gateway, tag:foo" becomes
# "tag:gateway,tag:foo". Validation above already confirmed each tag
# is valid after trimming; this ensures the rendered config is clean.
TS_TAGS="${TS_TAGS//[[:space:]]/}"

# --- Validate Wi-Fi country: exactly two uppercase ASCII letters ---

if [[ ! "${WIFI_COUNTRY}" =~ ^[A-Z]{2}$ ]]; then
  echo "ERROR: WIFI_COUNTRY must be exactly two uppercase letters (e.g. IS, US, GB). Got: '${WIFI_COUNTRY}'"
  exit 1
fi

# --- Reject newline/control characters in secrets ---

for _varname in TS_AUTH_KEY WIFI_SSID WIFI_PSK TS_HOSTNAME TS_TAGS; do
  _val="${!_varname:-}"
  if [[ -n "${_val}" && "${_val}" == *$'\n'* ]]; then
    echo "ERROR: ${_varname} contains newline characters. Rejecting."
    exit 1
  fi
  if [[ -n "${_val}" && "${_val}" =~ [[:cntrl:]] ]]; then
    echo "ERROR: ${_varname} contains control characters. Rejecting."
    exit 1
  fi
done

# --- Validate WIFI_SSID and WIFI_PSK as a pair: both set or both unset ---

_has_ssid="${WIFI_SSID:+1}"
_has_psk="${WIFI_PSK:+1}"
_has_ssid="${_has_ssid:-0}"
_has_psk="${_has_psk:-0}"
if [[ "${_has_ssid}" -ne "${_has_psk}" ]]; then
  if [[ "${_has_ssid}" -eq 1 ]]; then
    echo "ERROR: WIFI_SSID is set but WIFI_PSK is not. Both must be set together, or both unset."
  else
    echo "ERROR: WIFI_PSK is set but WIFI_SSID is not. Both must be set together, or both unset."
  fi
  exit 1
fi

# --- Render temporary build files ---

mkdir -p "${STAGE_DIR}/03-enrollment-service/files"
mkdir -p "${STAGE_DIR}/01-network-config/files"

# Non-secret enrollment config: hostname + tags (read safely by script, no source/eval)
cat >"${ENROLL_CONF_RENDERED}" <<EOF
TS_HOSTNAME=${TS_HOSTNAME}
TS_TAGS=${TS_TAGS}
EOF
chmod 0600 "${ENROLL_CONF_RENDERED}"

# Auth key: raw key (no prefix), read by tailscale via --auth-key=file:
printf '%s\n' "${TS_AUTH_KEY}" >"${STAGE_DIR}/03-enrollment-service/files/ts-auth-key"
chmod 0600 "${STAGE_DIR}/03-enrollment-service/files/ts-auth-key"

# Wi-Fi NetworkManager connection profile (optional — Ethernet works without it)
WIFI_CONFIGURED=0
if [[ "${_has_ssid}" -eq 1 ]]; then
  # NetworkManager .nmconnection format requires proper escaping of special chars.
  # SSID: literal string (no quotes needed for alphanumeric; NM reads file directly).
  # PSK: literal string in the file.
  # Reject SSIDs longer than 32 bytes and PSKs outside 8-63 chars (WPA2 spec).
  if [[ ${#WIFI_SSID} -gt 32 ]]; then
    echo "ERROR: WIFI_SSID exceeds 32 characters (WPA2 limit). Got length: ${#WIFI_SSID}"
    exit 1
  fi
  if [[ ${#WIFI_PSK} -lt 8 || ${#WIFI_PSK} -gt 63 ]]; then
    echo "ERROR: WIFI_PSK must be 8-63 characters (WPA2-Personal spec). Got length: ${#WIFI_PSK}"
    exit 1
  fi
  WIFI_CONFIGURED=1
  cat >"${STAGE_DIR}/01-network-config/files/wifi.nmconnection" <<EOF
[connection]
id=wifi
type=wifi
autoconnect=true
autoconnect-priority=10

[wifi]
ssid=${WIFI_SSID}
mode=infrastructure

[wifi-security]
key-mgmt=wpa-psk
psk=${WIFI_PSK}

[ipv4]
method=auto

[ipv6]
method=auto
EOF
  chmod 0600 "${STAGE_DIR}/01-network-config/files/wifi.nmconnection"
fi

# --- Clone pi-gen and build ---

mkdir -p "${OUTPUT_DIR}" "${SCRIPT_DIR}/.cache"

if [[ ! -d "${PI_GEN_DIR}" ]]; then
  echo "Cloning pi-gen branch ${PI_GEN_BRANCH} at commit ${PI_GEN_COMMIT}..."
  git clone --branch "${PI_GEN_BRANCH}" https://github.com/RPi-Distro/pi-gen.git "${PI_GEN_DIR}"
  git -C "${PI_GEN_DIR}" checkout "${PI_GEN_COMMIT}"
else
  echo "Using cached pi-gen at ${PI_GEN_DIR}"
fi

# Write pi-gen config file (pi-gen reads this via build-docker.sh -c)
# pi-gen uses WPA_COUNTRY (not WIFI_COUNTRY) for the Wi-Fi regulatory domain.
# Include stage-vikin so our custom stage is built.
cat >"${CONFIG_FILE}" <<EOF
IMG_NAME="vikes-match-clock"
TARGET_HOSTNAME="${TS_HOSTNAME}"
FIRST_USER_NAME="vikin"
FIRST_USER_PASS="!"
DISABLE_FIRST_BOOT_USER_RENAME=1
STAGE_LIST="stage0 stage1 stage2 stage-vikin"
DEPLOY_COMPRESSION=none
WPA_COUNTRY="${WIFI_COUNTRY}"
EOF

# Copy custom stage into pi-gen build tree
rm -rf "${PI_GEN_DIR}/stage-vikin"
cp -r "${STAGE_DIR}" "${PI_GEN_DIR}/stage-vikin"

# Remove stage2 EXPORT_IMAGE so only our custom stage exports the image
rm -f "${PI_GEN_DIR}/stage2/EXPORT_IMAGE"

echo "Starting pi-gen Docker build..."
echo "Output will be in ${OUTPUT_DIR}"
if [[ ${WIFI_CONFIGURED} -eq 0 ]]; then
  echo "NOTE: No Wi-Fi configured. The device will use Ethernet only."
  echo "      Set WIFI_SSID and WIFI_PSK in secrets.env to enable Wi-Fi."
fi

# build-docker.sh must run from the pi-gen directory.
# It mounts the pi-gen dir into Docker and reads the config file.
(
  cd "${PI_GEN_DIR}"
  ./build-docker.sh -c "${CONFIG_FILE}"
)

# Copy built image from pi-gen deploy dir into output/
PI_GEN_DEPLOY="${PI_GEN_DIR}/deploy"
if compgen -G "${PI_GEN_DEPLOY}"/*.img >/dev/null 2>&1; then
  cp "${PI_GEN_DEPLOY}"/*.img "${OUTPUT_DIR}/"
  echo "Image copied to ${OUTPUT_DIR}/"
else
  echo "WARNING: No .img found in ${PI_GEN_DEPLOY}/"
fi

# Clear secret from shell
unset TS_AUTH_KEY
