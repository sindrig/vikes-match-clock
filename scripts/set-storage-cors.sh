#!/usr/bin/env bash
#
# Set CORS on the Firebase Storage buckets so the web perimeter renderer can
# fetch media with fetch() into Cache Storage. The perimeter media loader uses
# fetch(), which the browser blocks without Access-Control-Allow-Origin, while
# <img> tags elsewhere in the app work without it.
#
# Prerequisites:
#   - Google Cloud CLI authenticated with access to both Firebase projects
#     (`gcloud auth login`, project permission storage.buckets.update)
#
# Usage:
#   ./scripts/set-storage-cors.sh            # staging + prod
#   ./scripts/set-storage-cors.sh staging    # staging only
#   ./scripts/set-storage-cors.sh prod       # prod only

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORS_FILE="$REPO_ROOT/scripts/storage-cors.json"

TARGET="${1:-both}"

declare -A BUCKETS=(
  [staging]="vikes-match-clock-staging.appspot.com"
  [prod]="vikes-match-clock-firebase.appspot.com"
)

SELECTED=()
case "$TARGET" in
  staging) SELECTED=(staging) ;;
  prod) SELECTED=(prod) ;;
  both) SELECTED=(staging prod) ;;
  *) echo "Usage: $0 [staging|prod|both]" >&2; exit 1 ;;
esac

command -v gcloud >/dev/null 2>&1 || { echo "gcloud CLI not found" >&2; exit 1; }

for name in "${SELECTED[@]}"; do
  bucket="${BUCKETS[$name]}"
  echo -e "${GREEN}[cors]${NC} Applying CORS to gs://${bucket} (${name})"
  gcloud storage buckets update "gs://${bucket}" \
    --cors-file="$CORS_FILE"
done

echo -e "${GREEN}[cors]${NC} Done. Verify with:"
echo "  curl -sD - -o /dev/null -H 'Origin: https://staging-klukka.irdn.is' \\"
echo "    'https://firebasestorage.googleapis.com/v0/b/vikes-match-clock-staging.appspot.com/o/<object>?alt=media&token=<token>'"
echo "  ...and look for Access-Control-Allow-Origin."
