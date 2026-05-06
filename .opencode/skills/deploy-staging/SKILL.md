---
name: deploy-staging
description: Build the clock frontend and deploy to staging (S3 sync + CloudFront invalidation)
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

```bash
source /home/dev/vikes-creds.txt
aws s3 sync clock/build/ "s3://$STAGING_BUCKET" --delete --region eu-west-1
```

The `--delete` flag removes files from the bucket that don't exist in the build output.

### 6. Invalidate CloudFront

```bash
source /home/dev/vikes-creds.txt
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/index.html"
```

### 7. Report to user

Summarize:
- Build succeeded
- S3 sync complete (bucket name)
- CloudFront invalidation created (show invalidation ID from output)
- URL: https://staging-klukka.irdn.is
- Note: It may take 1-2 minutes for the invalidation to propagate

## Error handling

- If `pnpm build` fails: show the build errors, do NOT proceed to deploy
- If S3 sync fails: check credentials are valid (expired key?), suggest re-running `terraform apply` in `infra/staging/`
- If CloudFront invalidation fails: deploy still succeeded (S3 has new files), just note the CF invalidation failed

## Important notes

- This deploys ONLY the frontend. Backend/API changes require a separate deployment.
- The staging environment shares nothing with production — safe to deploy freely.
- CloudFront caches aggressively; without invalidation, changes may take up to 24h to appear.
- Only `/index.html` is invalidated because asset files are content-hashed (unique filenames on each build).
