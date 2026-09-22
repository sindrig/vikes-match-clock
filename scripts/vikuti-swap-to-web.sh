#!/usr/bin/env bash
#
# Swap Víkin úti (vikuti) from the Resolume renderer to the web renderer.
#
# What it does:
#   1. Snapshot the current prod vikuti perimeter state (revert artifact).
#   2. Backfill immutable Storage generations on every ad-layout and
#      media-pair record that lacks one (web playback rejects cues whose
#      media has no generation). Generations are read live from the prod
#      bucket; objects that cannot be resolved are reported and skipped.
#   3. Copy the verified staging mapping (locations/vikuti/perimeterDisplay)
#      into production and set renderer to "web". The revision is regenerated
#      so every publish is a fresh revision ID (repo rule: never edit a
#      published document in place).
#   4. Re-fetch and verify the published document.
#
# Prerequisites:
#   gcloud CLI authenticated with a principal that has Firebase RTDB admin on
#   project vikes-match-clock-firebase and storage.objects.get on its bucket,
#   e.g.:
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
#   (restores the pre-swap snapshot, which also removes the backfilled
#    generations and any web-venue tokens)
#
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PROD_DB="https://vikes-match-clock-firebase.firebaseio.com"
STAGING_DB="https://vikes-match-clock-staging.firebaseio.com"
WORKDIR="/tmp/opencode/vikuti-swap"
SNAPSHOT="${WORKDIR}/prod-states-vikuti-perimeter-pre-swap.json"
LOCATION="vikuti"

mkdir -p "$WORKDIR"
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
if not isinstance(d, dict):
    sys.exit(1)
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

# Counts generation coverage across ad-layout and media-pair records in a
# states/{location}/perimeter snapshot. Prints a summary; exits 1 when any
# record is missing its generation.
count_generations() {
  python3 - "$1" <<'PY'
import json, sys
snap = json.load(open(sys.argv[1]))
stats = {"total": 0, "missing": 0}

def check(record):
    if not isinstance(record, dict):
        return
    stats["total"] += 1
    gen = record.get("generation")
    if not (isinstance(gen, str) and gen):
        stats["missing"] += 1

for col in (snap.get("adLayout") or {}).get("columns") or []:
    files = col.get("files") if isinstance(col, dict) else None
    if isinstance(files, list):
        for record in files:
            check(record)
    elif isinstance(files, dict):
        for record in files.values():
            check(record)
for pair in (snap.get("mediaPairs") or {}).values():
    if isinstance(pair, dict):
        for record in (pair.get("files") or {}).values():
            check(record)

present = stats["total"] - stats["missing"]
if stats["missing"] == 0:
    print(f"      media generations: {present}/{present} present")
else:
    print(f"      media generations: {present}/{stats['total']} present, {stats['missing']} missing")
    sys.exit(1)
PY
}

if [[ "${1:-}" == "--check" ]]; then
  RC=0
  TMP=$(mktemp)
  curl -sf "${PROD_DB}/locations/${LOCATION}/perimeterDisplay.json" -o "$TMP"
  if doc_is_valid "$TMP"; then
    echo -e "${GREEN}[check]${NC} prod perimeterDisplay is the web mapping (renderer=web, 3840x1080, 3 regions)."
    python3 -c "import json,sys; print('  revision:', json.load(open(sys.argv[1]))['revision'])" "$TMP"
  else
    echo -e "${RED}[check]${NC} prod perimeterDisplay is NOT a valid web mapping."
    cat "$TMP"
    RC=1
  fi
  STATE=$(mktemp)
  curl -sf "${PROD_DB}/states/${LOCATION}/perimeter.json" -o "$STATE"
  count_generations "$STATE" || RC=1
  exit $RC
fi

echo "[1/5] Snapshotting current prod states/${LOCATION}/perimeter -> ${SNAPSHOT}"
if [[ -f "$SNAPSHOT" ]]; then
  BACKUP="${SNAPSHOT%.json}-$(date +%Y%m%dT%H%M%S).json"
  cp "$SNAPSHOT" "$BACKUP"
  echo "      (previous snapshot kept at ${BACKUP})"
fi
curl -sf "${PROD_DB}/states/${LOCATION}/perimeter.json" -o "$SNAPSHOT"
python3 -c "import json; json.load(open('${SNAPSHOT}'))" || {
  echo "Snapshot failed validation; aborting." >&2; exit 1; }

echo "[2/5] Backfilling Storage generations on desired-state media records"
REQ="${WORKDIR}/backfill-requests.tsv"
RES="${WORKDIR}/backfill-resolved.tsv"
PATCH="${WORKDIR}/backfill-patch.json"
python3 - "$SNAPSHOT" "$REQ" <<'PY'
import json, sys

snap = json.load(open(sys.argv[1]))
rows = []
already = 0

def add_record(record, where):
    global already
    if not isinstance(record, dict):
        return
    gen = record.get("generation")
    if isinstance(gen, str) and gen:
        already += 1
        return
    src = record.get("source")
    if isinstance(src, str) and src.startswith("gs://"):
        rows.append((f"{where}/generation", src))

for i, col in enumerate((snap.get("adLayout") or {}).get("columns") or []):
    if not isinstance(col, dict):
        continue
    files = col.get("files")
    if isinstance(files, list):
        for lane, record in enumerate(files):
            add_record(record, f"adLayout/columns/{i}/files/{lane}")
    elif isinstance(files, dict):
        for lane, record in files.items():
            add_record(record, f"adLayout/columns/{i}/files/{lane}")

for pair_id, pair in (snap.get("mediaPairs") or {}).items():
    if not isinstance(pair, dict):
        continue
    for lane, record in (pair.get("files") or {}).items():
        add_record(record, f"mediaPairs/{pair_id}/files/{lane}")

with open(sys.argv[2], "w") as fh:
    for path, uri in rows:
        fh.write(f"{path}\t{uri}\n")
print(f"      media records: {already + len(rows)} total, {already} already have generations, {len(rows)} to backfill")
PY

if [[ ! -s "$REQ" ]]; then
  echo "      nothing to backfill"
else
  declare -A GEN=()
  declare -A SEEN=()
  fail_count=0
  while IFS=$'\t' read -r path uri; do
    [[ -n "${SEEN[$uri]+x}" ]] && continue
    SEEN[$uri]=1
    short="${uri#gs://*/vikuti/}"
    gen=""
    if command -v gcloud >/dev/null 2>&1; then
      gen=$(gcloud storage objects describe "$uri" --format="value(generation)" 2>/dev/null || true)
    fi
    if [[ -z "$gen" ]] && command -v gsutil >/dev/null 2>&1; then
      gen=$(gsutil stat "$uri" 2>/dev/null | awk '/^Generation:/ {print $2; exit}')
    fi
    GEN[$uri]="$gen"
    if [[ -z "$gen" ]]; then
      fail_count=$((fail_count+1))
      echo "      [miss] ${short}"
    else
      echo "      [ok]   ${short}"
    fi
  done < "$REQ"

  : > "$RES"
  for uri in "${!GEN[@]}"; do
    [[ -n "${GEN[$uri]}" ]] && printf '%s\t%s\n' "$uri" "${GEN[$uri]}" >> "$RES"
  done

  python3 - "$REQ" "$RES" "$PATCH" "$LOCATION" <<'PY'
import json, sys

requests = {}
for line in open(sys.argv[1]):
    line = line.rstrip("\n")
    if line:
        path, uri = line.split("\t", 1)
        requests[path] = uri
resolved = {}
for line in open(sys.argv[2]):
    line = line.rstrip("\n")
    if line:
        uri, generation = line.split("\t", 1)
        resolved[uri] = generation
update = {path: resolved[uri] for path, uri in requests.items() if uri in resolved}
with open(sys.argv[3], "w") as fh:
    json.dump(update, fh)
print(f"      patching {len(update)} generation fields into states/{sys.argv[4]}/perimeter")
PY

  if [[ -s "$PATCH" ]]; then
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
      -X PATCH "${PROD_DB}/states/${LOCATION}/perimeter.json?access_token=$(get_token)" \
      -H 'Content-Type: application/json' \
      --data-binary @"$PATCH")
    if [[ "$HTTP" != "200" ]]; then
      echo -e "${RED}[fail]${NC} Generation PATCH returned HTTP ${HTTP}" >&2
      exit 1
    fi
    STATE2=$(mktemp)
    curl -sf "${PROD_DB}/states/${LOCATION}/perimeter.json" -o "$STATE2"
    count_generations "$STATE2" || true
  fi
  if (( fail_count > 0 )); then
    echo -e "${RED}[warn]${NC} ${fail_count} object(s) not found in the prod bucket; their"
    echo "       cues will be rejected by the web renderer until the files exist."
  fi
fi

echo "[3/5] Loading verified staging mapping and assigning a fresh revision"
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

echo "[4/5] Publishing web mapping to prod locations/${LOCATION}/perimeterDisplay"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT "${PROD_DB}/locations/${LOCATION}/perimeterDisplay.json?access_token=$(get_token)" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/opencode/vikuti-swap/prod-perimeterDisplay-payload.json)
if [[ "$HTTP" != "200" ]]; then
  echo -e "${RED}[fail]${NC} PUT returned HTTP ${HTTP}" >&2
  exit 1
fi

echo "[5/5] Verifying published document"
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
