#!/usr/bin/env bash
#
# Manual production deploy for the clock frontend.
# Use when GitHub Actions is unavailable.
#
# Prerequisites:
#   - AWS CLI configured with production access (eu-west-1)
#   - Terraform installed
#   - pnpm installed
#   - Firebase CLI installed and logged in (`firebase login`)
#
# Usage:
#   ./scripts/deploy-prod.sh            # full deploy from master
#   ./scripts/deploy-prod.sh --skip-checks  # skip branch/clean checks (dangerous)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLOCK_DIR="$REPO_ROOT/clock"
INFRA_DIR="$REPO_ROOT/infra/prod"
BUILD_DIR="$CLOCK_DIR/build"

SKIP_CHECKS=false
if [[ "${1:-}" == "--skip-checks" ]]; then
  SKIP_CHECKS=true
fi

FIREBASE_PROJECT="vikes-match-clock-firebase"
STADIUM_PREFIXES=(vikinni vikuti safamyriuti hasteinsvollur kopavogsvollur krvollur meistaravellir)

log()   { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*" >&2; }
die()   { error "$@"; exit 1; }

# ── Pre-flight checks ────────────────────────────────────────────────

log "Pre-flight checks..."

command -v aws       >/dev/null 2>&1 || die "aws CLI not found"
command -v terraform >/dev/null 2>&1 || die "terraform not found"
command -v pnpm      >/dev/null 2>&1 || die "pnpm not found"
command -v firebase  >/dev/null 2>&1 || die "firebase CLI not found"

if [[ "$SKIP_CHECKS" == false ]]; then
  CURRENT_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
  if [[ "$CURRENT_BRANCH" != "master" ]]; then
    die "Must be on master branch (currently on '$CURRENT_BRANCH'). Use --skip-checks to override."
  fi

  if ! git -C "$REPO_ROOT" diff --quiet || ! git -C "$REPO_ROOT" diff --cached --quiet; then
    die "Working tree is dirty. Commit or stash changes first. Use --skip-checks to override."
  fi

  log "Pulling latest master..."
  git -C "$REPO_ROOT" pull --ff-only origin master
else
  warn "Skipping branch and clean-tree checks (--skip-checks)"
fi

# ── Build ─────────────────────────────────────────────────────────────

log "Installing dependencies..."
(cd "$CLOCK_DIR" && pnpm install)

log "Building clock frontend..."
(cd "$CLOCK_DIR" && pnpm build)

if [[ ! -d "$BUILD_DIR" ]] || [[ ! -f "$BUILD_DIR/index.html" ]]; then
  die "Build failed — $BUILD_DIR/index.html not found"
fi

log "Build complete: $BUILD_DIR"

# ── Terraform outputs ─────────────────────────────────────────────────

log "Fetching infrastructure details from Terraform..."
(cd "$INFRA_DIR" && terraform init -backend=true -input=false >/dev/null 2>&1)

FRONTEND_BUCKET="$(cd "$INFRA_DIR" && terraform output -raw frontend_bucket)"
CF_DISTRIBUTION_ID="$(cd "$INFRA_DIR" && terraform output -raw cloudfront_distribution_id)"

if [[ -z "$FRONTEND_BUCKET" ]] || [[ -z "$CF_DISTRIBUTION_ID" ]]; then
  die "Failed to get Terraform outputs (bucket='$FRONTEND_BUCKET', distribution='$CF_DISTRIBUTION_ID')"
fi

log "S3 bucket:       $FRONTEND_BUCKET"
log "CloudFront dist: $CF_DISTRIBUTION_ID"

# ── Deploy to S3 ──────────────────────────────────────────────────────

log "Syncing build to s3://$FRONTEND_BUCKET ..."
aws s3 sync "$BUILD_DIR" "s3://$FRONTEND_BUCKET" \
  --delete \
  --region eu-west-1

log "S3 sync complete"

# ── CloudFront invalidation ──────────────────────────────────────────

log "Invalidating /index.html on CloudFront..."
INVALIDATION_ID="$(aws cloudfront create-invalidation \
  --distribution-id "$CF_DISTRIBUTION_ID" \
  --paths "/index.html" \
  --query 'Invalidation.Id' \
  --output text)"

log "Invalidation created: $INVALIDATION_ID"

# ── Refresh stadium screens ──────────────────────────────────────────

log "Refreshing stadium screens..."
REFRESH_TOKEN="$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')"

for prefix in "${STADIUM_PREFIXES[@]}"; do
  firebase -P "$FIREBASE_PROJECT" database:set \
    "/states/$prefix/controller/refreshToken" \
    -f -d "\"$REFRESH_TOKEN\"" >/dev/null 2>&1
  echo -n "."
done
echo ""
log "All screens refreshed"

# ── Done ──────────────────────────────────────────────────────────────

log "Production deploy complete!"
log "  URL: https://klukka.irdn.is"
log "  CloudFront invalidation may take a few minutes to propagate."
