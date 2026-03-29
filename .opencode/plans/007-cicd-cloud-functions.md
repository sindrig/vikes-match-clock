# Spec 007: CI/CD Updates for Cloud Function Deployment

**Issue**: #135 - Authz management portal
**Type**: Ops -- deploy Cloud Functions via GitHub Actions

## Context

The current CI/CD pipeline (`.github/workflows/build.yml`) deploys the React frontend to AWS S3/CloudFront and uses the Firebase CLI only to refresh screen tokens after deploy. There is no Cloud Functions deployment.

Firebase Cloud Functions will be deployed via `firebase deploy --only functions` using the Firebase CLI, which is already set up in the workflow (`w9jds/setup-firebase` action with `FIREBASE_TOKEN` secret).

## Changes

### New workflow job: `deploy-functions`

Add to `.github/workflows/build.yml` after the existing `deploy-prod` job:

### Reusable workflow: `.github/workflows/deploy-functions.yml`

Extract the function build, test, and deploy steps into a reusable workflow to avoid duplication between prod and staging:

```yaml
# .github/workflows/deploy-functions.yml
name: Deploy Cloud Functions

on:
  workflow_call:
    inputs:
      firebase_project:
        required: true
        type: string
        description: "Firebase project alias (e.g. vikes-match-clock-firebase)"
    secrets:
      FIREBASE_TOKEN:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install function dependencies
        working-directory: ./functions
        run: npm ci

      - name: Build functions
        working-directory: ./functions
        run: npm run build

      - name: Run function tests
        working-directory: ./functions
        run: npm test

      - uses: w9jds/setup-firebase@main
        with:
          tools-version: 11.9.0
          firebase_token: ${{ secrets.FIREBASE_TOKEN }}

      - name: Deploy Cloud Functions
        run: firebase deploy --only functions -P ${{ inputs.firebase_project }} --token $FIREBASE_TOKEN
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

### Calling the reusable workflow from `build.yml`

In `.github/workflows/build.yml`, replace the inline deploy jobs with calls to the reusable workflow:

```yaml
deploy-functions:
  if: github.ref == 'refs/heads/master'
  uses: ./.github/workflows/deploy-functions.yml
  with:
    firebase_project: vikes-match-clock-firebase
  secrets:
    FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}

deploy-functions-staging:
  if: |
    github.event_name == 'pull_request' &&
    contains(github.event.pull_request.labels.*.name, 'sandbox-deploy')
  uses: ./.github/workflows/deploy-functions.yml
  with:
    firebase_project: vikes-match-clock-staging
  secrets:
    FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

### Firebase project configuration

Update `.firebaserc` to include both projects:

```json
{
  "projects": {
    "default": "vikes-match-clock-test",
    "production": "vikes-match-clock-firebase",
    "staging": "vikes-match-clock-staging"
  }
}
```

### Updated `firebase.json`

Add functions configuration:

```json
{
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  },
  "database": { ... },
  "storage": { ... },
  "emulators": {
    "functions": {
      "port": 5001,
      "host": "0.0.0.0"
    },
    // ... existing emulators
  }
}
```

### Security rules deployment

Currently, `firebase-rules.json` is not deployed via CI -- it was likely set manually or via the Firebase Console. With the new rules (spec 002), add rules deployment:

```yaml
- name: Deploy database rules
  run: firebase deploy --only database -P vikes-match-clock-firebase --token $FIREBASE_TOKEN
```

This ensures rules changes are version-controlled and deployed alongside functions.

## Docker Compose update

Update `docker-compose.yml` to include the functions emulator for local development:

The emulator already picks up `firebase.json` config, so adding the `functions` key to `firebase.json` is sufficient. The Docker container running `firebase emulators:start` will automatically start the functions emulator.

## Files affected

- `.github/workflows/deploy-functions.yml` -- new reusable workflow for function build, test, and deploy
- `.github/workflows/build.yml` -- call reusable workflow for prod and staging function deploys, add rules deployment
- `.firebaserc` -- add production and staging project aliases
- `firebase.json` -- add `functions` config and functions emulator
- `docker-compose.yml` -- potentially update emulator command if needed

## Testing

1. CI runs function build step without errors
2. Functions deploy to production Firebase project on master push
3. Functions deploy to staging Firebase project on sandbox-deploy PRs
4. Database rules deploy alongside functions
5. Emulator starts functions locally with `firebase emulators:start`

## Acceptance criteria

1. Cloud Functions are deployed automatically on master push
2. Staging deployments include functions
3. Database rules are deployed via CI (not just manually)
4. Local development works with functions emulator
5. No changes to existing frontend or API deployment
