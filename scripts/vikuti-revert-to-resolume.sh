#!/usr/bin/env bash
#
# Revert Víkin úti (vikuti) to the Resolume renderer.
#
# What it does:
#   1. Removes the published web mapping (locations/vikuti/perimeterDisplay),
#      which is exactly the pre-rollout state. The public display selector
#      stops offering Perimeter and the daemon/Resolume path resumes.
#   2. Restores the pre-swap desired perimeter state snapshot (clears
#      skipCue/refreshToken tokens left behind by web-venue testing and
#      removes any generation backfill the swap added) if the snapshot
#      file exists.
#   3. Re-fetches and verifies.
#
# Prerequisites: same gcloud auth as vikuti-swap-to-web.sh.
#
# Usage:
#   ./scripts/vikuti-revert-to-resolume.sh           # revert
#   ./scripts/vikuti-revert-to-resolume.sh --check   # verify only, no writes
#
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PROD_DB="https://vikes-match-clock-firebase.firebaseio.com"
SNAPSHOT="/tmp/opencode/vikuti-swap/prod-states-vikuti-perimeter-pre-swap.json"
LOCATION="vikuti"

command -v python3 >/dev/null 2>&1 || { echo "python3 not found" >&2; exit 1; }

# See vikuti-swap-to-web.sh: gcloud when present, otherwise $GCLOUD_ID_TOKEN.
get_token() {
  if command -v gcloud >/dev/null 2>&1; then
    gcloud auth print-identity-token
  elif [[ -n "${GCLOUD_ID_TOKEN:-}" ]]; then
    printf '%s' "$GCLOUD_ID_TOKEN"
  else
    echo "No gcloud CLI and GCLOUD_ID_TOKEN is not set." >&2
    echo "Run 'gcloud auth print-identity-token' on a machine with gcloud" >&2
    echo "and export it as GCLOUD_ID_TOKEN." >&2
    return 1
  fi
}

if [[ "${1:-}" == "--check" ]]; then
  VAL=$(curl -sf "${PROD_DB}/locations/${LOCATION}/perimeterDisplay.json")
  if [[ "$VAL" == "null" ]]; then
    echo -e "${GREEN}[check]${NC} perimeterDisplay removed; vikuti is a Resolume venue."
  else
    echo -e "${RED}[check]${NC} perimeterDisplay still present:" >&2
    echo "$VAL" >&2
    exit 1
  fi
  exit 0
fi

echo "[1/3] Removing prod locations/${LOCATION}/perimeterDisplay (back to pre-rollout Resolume state)"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE "${PROD_DB}/locations/${LOCATION}/perimeterDisplay.json?access_token=$(get_token)")
if [[ "$HTTP" != "200" ]]; then
  echo -e "${RED}[fail]${NC} DELETE returned HTTP ${HTTP}" >&2
  exit 1
fi

echo "[2/3] Restoring pre-swap desired perimeter state snapshot (if present)"
if [[ -f "$SNAPSHOT" ]]; then
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "${PROD_DB}/states/${LOCATION}/perimeter.json?access_token=$(get_token)" \
    -H 'Content-Type: application/json' \
    --data-binary @"$SNAPSHOT")
  if [[ "$HTTP" != "200" ]]; then
    echo -e "${RED}[warn]${NC} Snapshot restore PUT returned HTTP ${HTTP} (continuing; state paths are non-critical for revert)" >&2
  else
    echo "      restored states/${LOCATION}/perimeter from snapshot"
  fi
else
  echo "      snapshot not found at ${SNAPSHOT}; skipping (mapping removal is the critical step)"
fi

echo "[3/3] Verifying"
VAL=$(curl -sf "${PROD_DB}/locations/${LOCATION}/perimeterDisplay.json")
if [[ "$VAL" == "null" ]]; then
  echo -e "${GREEN}[done]${NC} vikuti is back on Resolume."
  echo "  Physical cutover: switch the LED processor input back to Resolume."
  echo "  Re-swap anytime with: ./scripts/vikuti-swap-to-web.sh"
else
  echo -e "${RED}[fail]${NC} perimeterDisplay still present:" >&2
  echo "$VAL" >&2
  exit 1
fi
