---
name: deploy-staging
description: Build the clock frontend and deploy to staging (S3 cp + CloudFront invalidation)
---

# Deploy Staging Skill

Build the `clock/` React app and deploy it to the staging environment at https://staging-klukka.irdn.is.

## Prerequisites

- `/home/dev/vikes-creds.txt` must exist (provisioned by Terraform from `infra/devpod-creds/`)
- `pnpm` installed and `clock/node_modules` present

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

```bash
# Working directory: clock/
pnpm build
```

Verify the `clock/build/` directory exists and contains `index.html`.

### 5. Deploy to S3

**Do NOT use `aws s3 sync`** — it skips files with the same size, which can leave stale content. Instead, use `aws s3 cp --recursive` to force-upload all files:

```bash
source /home/dev/vikes-creds.txt
aws s3 rm "s3://$STAGING_BUCKET" --recursive --region eu-west-1
aws s3 cp clock/build/ "s3://$STAGING_BUCKET" --recursive --region eu-west-1
```

The `rm --recursive` first ensures deleted files are removed. Then `cp --recursive` uploads every file unconditionally.

### 6. Invalidate CloudFront and wait

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

### 7. Report to user

Summarize:
- Build succeeded
- S3 upload complete (bucket name)
- CloudFront invalidation completed (show invalidation ID)
- URL: https://staging-klukka.irdn.is (live now)

## Error handling

- If `pnpm build` fails: show the build errors, do NOT proceed to deploy
- If S3 upload fails: check credentials are valid (expired key?), suggest re-running `terraform apply` in `infra/staging/`
- If CloudFront invalidation fails: deploy still succeeded (S3 has new files), just note the CF invalidation failed

## Important notes

- This deploys ONLY the frontend. Backend/API changes require a separate deployment.
- The staging environment shares nothing with production — safe to deploy freely.
- CloudFront caches aggressively; without invalidation, changes may take up to 24h to appear.
- Only `/index.html` is invalidated because asset files are content-hashed (unique filenames on each build).

## Uploading screenshots for PRs

GitHub doesn't support programmatic image uploads to PR comments. Use the staging S3 bucket instead:

```bash
source /home/dev/vikes-creds.txt
aws s3 cp screenshot.png "s3://$STAGING_BUCKET/pr-images/<ISSUE_NUMBER>-<descriptive-name>.png" --region eu-west-1
```

Then reference in PR/comment markdown:
```
![Description](https://staging-klukka.irdn.is/pr-images/<ISSUE_NUMBER>-<descriptive-name>.png)
```

These images are served via CloudFront and don't need invalidation (unique paths). They persist until the next `aws s3 rm --recursive` deploy, so use descriptive names with issue numbers. They are disposable — losing them on next deploy is fine since PRs are already merged by then.
