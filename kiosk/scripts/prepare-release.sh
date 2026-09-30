#!/usr/bin/env bash
set -euo pipefail

tag="${GITHUB_REF_NAME:?Release tag is required}"
git fetch origin master "refs/tags/$tag"
tag_ref="refs/tags/$tag"
original_tag=$(git rev-parse "$tag_ref")
tag_commit=$(git rev-parse "$tag_ref^{commit}")
master_commit=$(git rev-parse origin/master)

# Never release newer, untagged changes or a revision outside master.
if [[ "$tag_commit" != "$master_commit" ]]; then
  echo "Release tag must point to the current master HEAD." >&2
  exit 1
fi

git checkout -B master origin/master
python kiosk/scripts/set-release-version.py "$tag"
git add kiosk/src-tauri/Cargo.toml kiosk/src-tauri/Cargo.lock kiosk/src-tauri/tauri.conf.json
if ! git diff --cached --quiet; then
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git commit -m "chore(kiosk): release $tag"
  git tag -f "$tag"
  # Update both refs together, rejecting concurrent changes to either ref.
  git push --atomic \
    --force-with-lease="refs/heads/master:$master_commit" \
    --force-with-lease="$tag_ref:$original_tag" \
    origin HEAD:refs/heads/master "$tag_ref:$tag_ref"
fi

echo "sha=$(git rev-parse HEAD)" >> "${GITHUB_OUTPUT:?Output file is required}"
