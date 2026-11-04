# Screenshots and source artwork

Save manual/browser review captures under the repository's ignored
**`screenshots/`** directory, for example `screenshots/perimeter-manager.png`.
Never commit screenshots or proof images. Playwright's automatic failure
artifacts remain in ignored `clock/test-results/` and `clock/playwright-report/`;
copy a chosen review capture into `screenshots/` before sharing it.

Intentional product source assets are different: bundled club crests, fonts,
icons and kiosk installer artwork belong in their established source paths and
may be reviewed/committed as part of an asset change. Do not store screenshots
among those inputs. A blanket ban on source images would break asset maintenance.

## Capture procedure

1. Check [Firebase selection](environment.md#firebase-selection) before browser
   work. Default Vite development uses shared staging; a production build
   previewed on localhost uses production unless emulator mode was compiled in.
   Emulator selection does not isolate match/weather API requests.
2. Prepare the SDK using [API preparation](api-client-preparation.md). For a
   persistent local server, from the root use
   `VITE_USE_EMULATOR=true bash scripts/dev-server.sh start 4500` with the local
   services already running. The helper requires Bash, Git, Node, tmux and
   installed Clock dependencies; it invokes Vite directly. Use `status 4500`
   to identify its handle/log and `stop 4500` for only that worktree/port. Its
   default port is 8000; choose explicitly to avoid the local API on 8000.
3. Use the browser tooling actually available, or Playwright's page/locator
   screenshot API. Use synthetic emulator accounts for isolated state checks.
   Separately authorized shared-staging login uses the maintainer-approved
   account and explicit loader in the [environment contract](environment.md#shared-staging-login).
   Do not print credentials or assume another worktree contains them.
4. Inspect rendered content, console errors and failed requests. An HTML title
   or HTTP 200 alone verifies only the shell. Use separate browser contexts for
   controller/display roles; same-origin tabs and staging subpaths share storage.
5. Create `screenshots/` if necessary and save the capture there. Vite HMR
   reflects CSS/JS edits; environment selection changes require restarting the
   server or rebuilding compiled assets.

## Authorized hosting for a PR

An external upload needs explicit authorization. Load approved AWS access and
`STAGING_BUCKET` in the upload shell through the
[manual AWS contract](environment.md#manual-aws-staging-operations); no fixed
machine path or automatic login is required. This task needs no distribution ID.
Missing access means obtain access, not provision infrastructure.

From the repository root, for an already captured file:

```bash
: "${STAGING_BUCKET:?Obtain staging upload access and bucket metadata from the maintainer.}"
TIMESTAMP=$(date +%s)
aws s3 cp screenshots/perimeter-manager.png "s3://$STAGING_BUCKET/pr-images/258-perimeter-manager-${TIMESTAMP}.png" --region eu-west-1
```

Reference the resulting timestamped URL in the PR:

```markdown
![Perimeter manager](https://staging-klukka.irdn.is/pr-images/258-perimeter-manager-<TIMESTAMP>.png)
```

Use a fresh timestamp for every capture because CloudFront caches paths.
The manual [staging procedure](../.opencode/skills/deploy-staging/SKILL.md)
excludes `pr-images/*` from its root deletion; CI's root deployment has
`delete-removed: true` without that exclusion, so persistence is not guaranteed.
Root deployments can also remove staging subpath bundles. Shared subpaths are
not separate Firebase environments or browser-storage origins.

OpenCode users must restart their OpenCode session after pulling changed skill
guidance so the session loads the update. No configuration/schema change is
needed for this screenshot path/link correction.
