#!/usr/bin/env bash
# First-boot Tailscale enrollment script.
#
# Reads config from /etc/tailscale-enroll.conf (hostname + tags).
# Reads the raw auth key from /etc/tailscale-auth-key via
# --auth-key=file: — the key is never placed in argv or the process
# environment. Runs `tailscale up`, then securely shreds the auth key
# file. Retries indefinitely until connectivity is available — this
# device must never lose contact.
set -euo pipefail

ENROLL_MARKER="/var/lib/tailscale/.enrolled"
AUTH_KEY_FILE="/etc/tailscale-auth-key"
CONF_FILE="/etc/tailscale-enroll.conf"
LOG_TAG="tailscale-enroll"
RETRY_INTERVAL=60  # seconds between enrollment attempts

log() {
    echo "[$(date -Iseconds)] ${LOG_TAG}: $*"
}

# --- Read config file (safe key=value parsing, no source/eval) ---

if [[ ! -f "${CONF_FILE}" ]]; then
    log "ERROR: Config file ${CONF_FILE} not found."
    exit 1
fi

HOSTNAME=""
TAGS=""
while IFS='=' read -r key value; do
    # Trim whitespace from key and value
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    case "${key}" in
        TS_HOSTNAME) HOSTNAME="${value}" ;;
        TS_TAGS)     TAGS="${value}" ;;
        "")          continue ;;
        *)           log "WARNING: Unknown config key '${key}' in ${CONF_FILE}, ignoring." ;;
    esac
done < "${CONF_FILE}"

if [[ -z "${HOSTNAME}" ]]; then
    log "ERROR: TS_HOSTNAME is empty or missing in ${CONF_FILE}."
    exit 1
fi
if [[ -z "${TAGS}" ]]; then
    log "ERROR: TS_TAGS is empty or missing in ${CONF_FILE}."
    exit 1
fi

# --- Already enrolled guard ---

if [[ -f "${ENROLL_MARKER}" ]]; then
    log "Already enrolled. Exiting."
    exit 0
fi

# --- Validate auth key file exists ---

if [[ ! -f "${AUTH_KEY_FILE}" ]]; then
    log "ERROR: Auth key file ${AUTH_KEY_FILE} not found."
    exit 1
fi

# --- Retry loop: indefinite, modest interval ---

attempt=0
while true; do
    attempt=$((attempt + 1))
    log "Enrollment attempt ${attempt}..."

    # Wait for network (up to 5 minutes per attempt)
    log "Waiting for network connectivity..."
    net_ok=0
    for i in $(seq 1 60); do
        if curl -sf --max-time 5 https://controlplane.tailscale.com &>/dev/null; then
            log "Network is available."
            net_ok=1
            break
        fi
        sleep 5
    done

    if [[ ${net_ok} -ne 1 ]]; then
        log "Network not available after 5 minutes. Retrying in ${RETRY_INTERVAL}s..."
        sleep "${RETRY_INTERVAL}"
        continue
    fi

    # Ensure tailscaled is running
    if ! systemctl is-active --quiet tailscaled.service; then
        log "tailscaled.service is not active. Waiting ${RETRY_INTERVAL}s..."
        sleep "${RETRY_INTERVAL}"
        continue
    fi

    # Bring Tailscale up — auth key read from file, not from env or argv
    if tailscale up \
        --auth-key="file:${AUTH_KEY_FILE}" \
        --hostname="${HOSTNAME}" \
        --advertise-tags="${TAGS}" \
        --accept-routes \
        --ssh; then

        log "Tailscale up succeeded."

        # Mark enrollment complete
        mkdir -p /var/lib/tailscale
        touch "${ENROLL_MARKER}"

        # Securely remove the auth key file.
        # NOTE: On flash media (SD cards, eMMC), shred's overwrites may not
        # reach the physical blocks due to wear leveling. Deletion is
        # best-effort; treat a lost card as a compromised credential and
        # revoke the key in the Tailscale admin console.
        log "Securely removing auth key from filesystem..."
        if command -v shred &>/dev/null; then
            shred -u "${AUTH_KEY_FILE}" || rm -f "${AUTH_KEY_FILE}"
        else
            rm -f "${AUTH_KEY_FILE}"
        fi

        log "Disabling enrollment service (it will not run again)."
        systemctl disable tailscale-enroll.service || true

        log "Enrollment complete. Device is now accessible via Tailscale SSH."
        exit 0
    else
        log "tailscale up failed (exit code $?). Retrying in ${RETRY_INTERVAL}s..."
        sleep "${RETRY_INTERVAL}"
    fi
done
