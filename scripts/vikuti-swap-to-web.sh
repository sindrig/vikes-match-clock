#!/usr/bin/env bash
#
# Swap Víkin úti (vikuti) from the Resolume renderer to the web renderer.
#
# What it does:
#   1. Snapshot the current prod vikuti perimeter state (revert artifact).
#   2. Copy the verified staging mapping (locations/vikuti/perimeterDisplay)
#      into production and set renderer to "web". The revision is regenerated
#      so every publish is a fresh revision ID (repo rule: never edit a
#      published document in place).
#   3. Re-fetch and verify the published document.
#
# Prerequisites:
#   gcloud CLI authenticated with a principal that has Firebase RTDB admin on
#   project vikes-match-clock-firebase, e.g.:
#     gcloud auth login
#   (firebase.owner or firebase.developer roles both include
#    firebasedatabase.instances.update.)
#
# Usage:
#   ./scripts/vikuti-swap-to-web.sh            # do the swap
#   ./scripts/vikuti-swap-to-web.sh --check    # verify only, no writes
#
# Revert:
#   ./scripts/vikuti-revert-to-resolume.sh
#
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PROD_DB="https://vikes-match-clock-firebase.firebaseio.com"
STAGING_DB="https://vikes-match-clock-staging.firebaseio.com"
SNAPSHOT="/tmp/opencode/vikuti-swap/prod-states-vikuti-perimeter-pre-swap.json"
LOCATION="vikuti"

command -v python3 >/dev/null 2>&1 || { echo "python3 not found" >&2; exit 1; }

# Returns a Google identity token from the gcloud CLI when available; without
# gcloud, falls back to $GCLOUD_ID_TOKEN (e.g. exported from a machine that
# has gcloud: gcloud auth print-identity-token > token.txt).
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

doc_is_valid() {
  python3 - "$1" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
ok = (
    d.get("version") == 1
    and d.get("renderer") == "web"
    and d.get("framebuffer", {}).get("width") == 3840
    and d.get("framebuffer", {}).get("height") == 1080
    and set(d.get("logicalScreens", {}).keys()) == {"screen-48", "screen-40"}
    and len(d.get("regions", [])) == 3
    and {r["id"] for r in d.get("regions", [])}
    == {"screen-40-full", "screen-48-left-half", "screen-48-right-half"}
    and d.get("playback", {}).get("cueDurationMs") == 20000
    and isinstance(d.get("revision"), str)
    and len(d["revision"]) > 0
)
sys.exit(0 if ok else 1)
PY
}

if [[ "${1:-}" == "--check" ]]; then
  TMP=$(mktemp)
  curl -sf "${PROD_DB}/locations/${LOCATION}/perimeterDisplay.json" -o "$TMP"
  if doc_is_valid "$TMP"; then
    echo -e "${GREEN}[check]${NC} prod perimeterDisplay is the web mapping (renderer=web, 3840x1080, 3 regions)."
    python3 -c "import json,sys; print('  revision:', json.load(open(sys.argv[1]))['revision'])" "$TMP"
  else
    echo -e "${RED}[check]${NC} prod perimeterDisplay is NOT a valid web mapping."
    cat "$TMP"
    exit 1
  fi
  exit 0
fi

echo "[1/4] Snapshotting current prod states/${LOCATION}/perimeter -> ${SNAPSHOT}"
if [[ -f "$SNAPSHOT" ]]; then
  BACKUP="${SNAPSHOT%.json}-$(date +%Y%m%dT%H%M%S).json"
  cp "$SNAPSHOT" "$BACKUP"
  echo "      (previous snapshot kept at ${BACKUP})"
fi
curl -sf "${PROD_DB}/states/${LOCATION}/perimeter.json" -o "$SNAPSHOT"
python3 -c "import json; json.load(open('${SNAPSHOT}'))" || {
  echo "Snapshot failed validation; aborting." >&2; exit 1; }

echo "[2/4] Loading verified staging mapping and assigning a fresh revision"
python3 - "$STAGING_DB" "$LOCATION" <<'PY'
import json, sys, uuid, urllib.request
db, location = sys.argv[1], sys.argv[2]
url = f"{db}/locations/{location}/perimeterDisplay.json"
with urllib.request.urlopen(url) as r:
    doc = json.load(r)
if not isinstance(doc, dict) or doc.get("renderer") != "web":
    sys.exit("Staging mapping is not a valid web renderer document; aborting.")
doc["revision"] = str(uuid.uuid4())
with open("/tmp/opencode/vikuti-swap/prod-perimeterDisplay-payload.json", "w") as f:
    json.dump(doc, f)
print(f"      new revision: {doc['revision']}")
PY

echo "[3/4] Publishing web mapping to prod locations/${LOCATION}/perimeterDisplay"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT "${PROD_DB}/locations/${LOCATION}/perimeterDisplay.json?access_token=$(get_token)" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/opencode/vikuti-swap/prod-perimeterDisplay-payload.json)
if [[ "$HTTP" != "200" ]]; then
  echo -e "${RED}[fail]${NC} PUT returned HTTP ${HTTP}" >&2
  exit 1
fi

echo "[4/4] Verifying published document"
TMP=$(mktemp)
curl -sf "${PROD_DB}/locations/${LOCATION}/perimeterDisplay.json" -o "$TMP"
if doc_is_valid "$TMP"; then
  echo -e "${GREEN}[done]${NC} vikuti is now a web venue."
  echo "  Web perimeter displays can now select Perimeter for Víkin úti."
  echo "  Remember the physical cutover is separate: the LED processor input"
  echo "  must be switched from Resolume to the kiosk browser output."
  echo "  Revert anytime with: ./scripts/vikuti-revert-to-resolume.sh"
else
  echo -e "${RED}[fail]${NC} Verification failed; published document was:" >&2
  cat "$TMP" >&2
  exit 1
fi
