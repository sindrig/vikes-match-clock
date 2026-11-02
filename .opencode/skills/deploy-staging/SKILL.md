---
name: deploy-staging
description: Build the clock frontend and deploy to staging (S3 cp + CloudFront invalidation)
---

# Deploy Staging Skill

Build the `clock/` React app and deploy it to the staging environment at https://staging-klukka.irdn.is.

Supports **subpath bundle locations** (e.g. `staging-klukka.irdn.is/my-feature/`). These separate uploaded frontend files, not application data or browser sessions. Root deployments can remove these bundles.

## Shared staging boundaries

- On `staging-klukka.irdn.is`, `clock/src/firebase.ts` selects the same staging Firebase project for root and every subpath. Auth, Realtime Database, Storage and Functions are shared; controllers using the same `listenPrefix` can change each other's state. A subpath does not create a Firebase namespace.
- Subpaths share an origin. Within one browser context/profile they share localStorage keys (including screen selection and `listenPrefix`) and Firebase auth persistence. Use separate browser contexts/profiles for independent sessions; these still use shared backend data. Separate same-origin tabs or ordinary windows in the same profile do not isolate sessions.
- `VITE_BASE_PATH` sets Vite's public asset base; it does not configure React Router. `clock/src/index.tsx` uses `BrowserRouter` without a `basename`; the admin route and navigation remain root-relative (`/admin`). A subpath bundle is not a fully namespaced application, and an HTML 200 at a subpath does not verify routing or application startup.
- Coordinate bundle prefixes and shared staging state with other users. For isolated state testing, use the emulator setup in `clock/AGENTS.md` with deliberately separate test data. Do not treat subpaths as disposable independent environments.

## Prerequisites

- Existing approved AWS CLI access for staging and operator-provided `STAGING_BUCKET` / `CLOUDFRONT_DISTRIBUTION_ID` metadata. See [the environment contract](../../../docs/environment.md#manual-aws-staging-operations) for retrieval and loaders.
- `pnpm` installed and `clock/node_modules` present

No fixed credential path or Devpod installation is required. GitHub Actions uses OIDC for CI AWS deployment jobs; that does not configure a local shell. The legacy `infra/devpod-creds/` stack creates a static IAM key and provisions a specific remote host. It remains available to authorized operators of that installation, and is not a missing-credentials fallback for this skill.

## Parameters

- **subpath** (optional): Deploy frontend files to a bundle prefix (e.g. `my-feature`). When set:
  - Vite builds with `base: /<subpath>/`
  - Files deploy to `s3://bucket/<subpath>/` (NOT root)
  - The subpath upload/delete commands below target only that prefix; shared application state is unaffected by this file boundary
  - URL becomes `https://staging-klukka.irdn.is/<subpath>/`

Before substituting `<subpath>` into commands, require an agreed, nonempty single path segment containing only lowercase letters, digits and hyphens. Do not use `pr-images`, a generated root asset directory, slashes or traversal segments. An empty or overlapping prefix can broaden deletion scope. If the intended prefix is unclear, stop before deleting.

## Steps

### 1. Load the approved staging environment

Use already exported AWS access and staging metadata, or explicitly select a trusted **Bash** environment file with `VIKES_STAGING_ENV_FILE`. It must export its variables; a dotenv `.envrc-local` file is loaded only by optional direnv, not by `source`. The contract provides placeholder examples. Run these checks and the later AWS commands in the same shell; repeat this setup if using a new shell/tool process.

```bash
if [[ -n "${VIKES_STAGING_ENV_FILE:-}" ]]; then
  source "$VIKES_STAGING_ENV_FILE" || { echo "Could not load the selected staging Bash file." >&2; exit 1; }
fi
: "${STAGING_BUCKET:?Ask the infrastructure maintainer for staging bucket metadata.}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?Ask the infrastructure maintainer for staging distribution metadata.}"
```

Check presence without printing credential values or reading secret files into the conversation. These checks do not prove AWS authentication/authorization. If credentials, the selected file, or metadata are missing, stop and ask the infrastructure maintainer for the existing approved staging access. Do not initiate login or apply Terraform as a bootstrap/recovery step. Continue offline generation/build work only if it is part of the requested task.

### 2. Install dependencies (if needed)

```bash
# Working directory: clock/
pnpm i
```

### 3. Generate API client

```bash
# Working directory: clock/
pnpm generate-api-client
```

Verify `clock/src/api/client/index.ts` exists.

### 4. Build

For root deploy:

```bash
# Working directory: clock/
pnpm build
```

For subpath deploy:

```bash
# Working directory: clock/
VITE_BASE_PATH=<subpath> pnpm build
```

Verify the `clock/build/` directory exists and contains `index.html`.

### 5. Deploy to S3

**Do NOT use `aws s3 sync`** — it skips files with the same size, which can leave stale content. Instead, use `aws s3 cp --recursive` to force-upload all files.

#### Root deploy (default)

**Deletion scope:** This removes every object in the staging bucket except `pr-images/*`, including all other subpath bundles and older hashed assets, before uploading the root build. Coordinate with other staging users and inspect the deletion dry run first. This is not a retention or atomic deployment procedure.

```bash
aws s3 rm "s3://$STAGING_BUCKET" --recursive --exclude "pr-images/*" --dryrun --region eu-west-1
```

```bash
aws s3 rm "s3://$STAGING_BUCKET" --recursive --exclude "pr-images/*" --region eu-west-1
aws s3 cp clock/build/ "s3://$STAGING_BUCKET" --recursive --region eu-west-1
```

The `--exclude "pr-images/*"` preserves PR screenshot uploads for this manual command only. The `sandbox-deploy` workflow in `.github/workflows/build.yml` deploys at bucket root with `delete-removed: true` and no `pr-images` exclusion configured. Treat subpath bundles and PR images as removable by CI; this skill does not change that deployment behavior. Then `cp --recursive` uploads every file unconditionally.

#### Subpath deploy

```bash
aws s3 rm "s3://$STAGING_BUCKET/<subpath>/" --recursive --region eu-west-1
aws s3 cp clock/build/ "s3://$STAGING_BUCKET/<subpath>/" --recursive --region eu-west-1
```

Only remove/upload the validated subpath. This deletes the prior files under that prefix; it does not protect them from a later manual or CI root deployment. It also does not isolate Firebase or browser storage.

### 6. Invalidate CloudFront and wait

For root deploy:

```bash
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/index.html" \
  --query 'Invalidation.Id' --output text)
echo "Invalidation ID: $INVALIDATION_ID"
aws cloudfront wait invalidation-completed \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --id "$INVALIDATION_ID"
echo "Invalidation complete"
```

For subpath deploy:

```bash
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/<subpath>/*" \
  --query 'Invalidation.Id' --output text)
echo "Invalidation ID: $INVALIDATION_ID"
aws cloudfront wait invalidation-completed \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --id "$INVALIDATION_ID"
echo "Invalidation complete"
```

### 7. Report to user

Summarize:

- Build succeeded
- S3 upload complete (bucket name, subpath if used)
- CloudFront invalidation completed (show invalidation ID)
- URL: https://staging-klukka.irdn.is (or https://staging-klukka.irdn.is/<subpath>/)
- Verification performed: distinguish uploaded files/invalidation, HTTP-shell response, and rendered application/routing checks. Report browser console/network errors and any checks not performed; upload or an HTML 200 alone does not prove the app works.

### 8. Cleanup subpath (optional)

When a subpath deploy is no longer needed:

Recheck the exact nonempty prefix as described above. Cleanup deletes frontend files under that prefix only; it does not remove shared Firebase data or browser storage. Do not clear shared state as part of bundle cleanup.

```bash
aws s3 rm "s3://$STAGING_BUCKET/<subpath>/" --recursive --region eu-west-1
```

## Error handling

- If `pnpm build` fails: show the build errors, do NOT proceed to deploy
- If S3 upload fails: stop subsequent deployment steps and report the error with secrets redacted. Ask the infrastructure maintainer for the correct existing session/profile, target metadata or permissions. Do not treat denied access or expired credentials as a reason to apply Terraform, mint keys or start login automatically.
- If CloudFront invalidation fails: deploy still succeeded (S3 has new files), just note the CF invalidation failed

## Important notes

- This deploys ONLY the frontend. Backend/API changes require a separate deployment.
- The staging hostname selects staging Firebase, shared by all staging bundles. Verify the target and current users before interacting; a frontend build or subpath alone does not establish backend isolation.
- CloudFront caches aggressively; without invalidation, changes may take up to 24h to appear.
- Only `/index.html` is invalidated for root deploys because asset files are content-hashed (unique filenames on each build).
- For subpath deploys, `/<subpath>/*` is invalidated to cover all files under that path.
- Subpath files can coexist until overwritten or removed, but sessions/data are shared and root deployments can delete every subpath.

## Uploading screenshots for PRs

GitHub doesn't support programmatic image uploads to PR comments. For an authorized upload, load approved AWS access and `STAGING_BUCKET` metadata as in step 1 (a screenshot upload does not require a distribution ID). Use the staging S3 bucket:

```bash
: "${STAGING_BUCKET:?Ask the infrastructure maintainer for staging upload access and bucket metadata.}"
TIMESTAMP=$(date +%s)
aws s3 cp screenshot.png "s3://$STAGING_BUCKET/pr-images/<ISSUE_NUMBER>-<descriptive-name>-${TIMESTAMP}.png" --region eu-west-1
```

Then reference in PR/comment markdown:

```
![Description](https://staging-klukka.irdn.is/pr-images/<ISSUE_NUMBER>-<descriptive-name>-<TIMESTAMP>.png)
```

**IMPORTANT: CloudFront caches aggressively.** If you reuse the same filename for an updated screenshot, CloudFront will serve the old cached version. Always include a timestamp or unique suffix in the filename to bust the cache. Never reuse a previous screenshot path when updating an image.

These images are served via CloudFront and don't need invalidation (unique paths). The manual root deletion above excludes `pr-images/`; CI root deployment has no such exclusion configured, so persistence across all deployments is not guaranteed.
