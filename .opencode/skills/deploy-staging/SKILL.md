---
name: deploy-staging
description: Build the clock frontend and deploy to staging (S3 cp + CloudFront invalidation)
---

# Deploy Staging Skill

Build the `clock/` React app and deploy it to the staging environment at https://staging-klukka.irdn.is.

Supports **subpath deploys** for isolated multi-agent staging (e.g. `staging-klukka.irdn.is/my-feature/`).

## Prerequisites

- `/home/dev/vikes-creds.txt` must exist (provisioned by Terraform from `infra/devpod-creds/`)
- `pnpm` installed and `clock/node_modules` present

## Parameters

- **subpath** (optional): Deploy to an isolated subpath (e.g. `my-feature`). When set:
  - Vite builds with `base: /<subpath>/`
  - Files deploy to `s3://bucket/<subpath>/` (NOT root)
  - Does NOT delete existing root or other subpaths
  - URL becomes `https://staging-klukka.irdn.is/<subpath>/`

## Steps

### 1. Source credentials

```bash
source /home/dev/vikes-creds.txt
```

Verify the variables are set:
```bash
echo "Bucket: $STAGING_BUCKET"
echo "CF Distribution: $CLOUDFRONT_DISTRIBUTION_ID"
```

If the file doesn't exist or variables are empty, tell the user to run `terraform apply` in `infra/devpod-creds/` to provision credentials.

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

```bash
source /home/dev/vikes-creds.txt
aws s3 rm "s3://$STAGING_BUCKET" --recursive --exclude "pr-images/*" --region eu-west-1
aws s3 cp clock/build/ "s3://$STAGING_BUCKET" --recursive --region eu-west-1
```

The `rm --recursive` first ensures deleted files are removed. The `--exclude "pr-images/*"` preserves PR screenshot uploads. Then `cp --recursive` uploads every file unconditionally.

#### Subpath deploy

```bash
source /home/dev/vikes-creds.txt
aws s3 rm "s3://$STAGING_BUCKET/<subpath>/" --recursive --region eu-west-1
aws s3 cp clock/build/ "s3://$STAGING_BUCKET/<subpath>/" --recursive --region eu-west-1
```

**Important**: Only remove/upload the subpath — NOT the entire bucket. Other deploys live at root and other subpaths.

### 6. Invalidate CloudFront and wait

For root deploy:
```bash
source /home/dev/vikes-creds.txt
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
source /home/dev/vikes-creds.txt
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
- URL: https://staging-klukka.irdn.is (or https://staging-klukka.irdn.is/<subpath>/) (live now)

### 8. Cleanup subpath (optional)

When a subpath deploy is no longer needed:

```bash
source /home/dev/vikes-creds.txt
aws s3 rm "s3://$STAGING_BUCKET/<subpath>/" --recursive --region eu-west-1
```

## Error handling

- If `pnpm build` fails: show the build errors, do NOT proceed to deploy
- If S3 upload fails: check credentials are valid (expired key?), suggest re-running `terraform apply` in `infra/staging/`
- If CloudFront invalidation fails: deploy still succeeded (S3 has new files), just note the CF invalidation failed

## Important notes

- This deploys ONLY the frontend. Backend/API changes require a separate deployment.
- The staging environment shares nothing with production — safe to deploy freely.
- CloudFront caches aggressively; without invalidation, changes may take up to 24h to appear.
- Only `/index.html` is invalidated for root deploys because asset files are content-hashed (unique filenames on each build).
- For subpath deploys, `/<subpath>/*` is invalidated to cover all files under that path.
- Multiple subpath deploys can coexist independently — they don't interfere with each other or the root deploy.

## Uploading screenshots for PRs

GitHub doesn't support programmatic image uploads to PR comments. Use the staging S3 bucket instead:

```bash
source /home/dev/vikes-creds.txt
TIMESTAMP=$(date +%s)
aws s3 cp screenshot.png "s3://$STAGING_BUCKET/pr-images/<ISSUE_NUMBER>-<descriptive-name>-${TIMESTAMP}.png" --region eu-west-1
```

Then reference in PR/comment markdown:
```
![Description](https://staging-klukka.irdn.is/pr-images/<ISSUE_NUMBER>-<descriptive-name>-<TIMESTAMP>.png)
```

**IMPORTANT: CloudFront caches aggressively.** If you reuse the same filename for an updated screenshot, CloudFront will serve the old cached version. Always include a timestamp or unique suffix in the filename to bust the cache. Never reuse a previous screenshot path when updating an image.

These images are served via CloudFront and don't need invalidation (unique paths). The `pr-images/` prefix is excluded from `aws s3 rm` during deploys, so these images persist across deployments.
