# Firebase Functions

Node 22 TypeScript package deployed independently of the React frontend. Read
the [root instructions](../AGENTS.md), [environment contract](../docs/environment.md)
and [task index](../docs/README.md). No frontend guide is required to discover
the backend's commands or rollout constraints.

## Commands and prerequisites

Run from **`functions/`**, with Node **22** (the manifest's engine):

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test --maxWorkers=1 --no-file-parallelism
```

`build` is `tsc`; `lib/` is ignored compiled output, never a source edit.
Native `sharp` dependencies must install for the target OS/architecture; render
tests exercise actual image composition as well as mocked service tests.

Use pnpm locally per repository policy. This manifest has no `packageManager`
version pin; both npm and pnpm locks remain, and the current Functions/Clock CI
uses `npm ci`/`npm run build`. That unresolved toolchain ownership is separate
work (#239). Do not invent a Functions pin, align it to Clock/gateway, remove a
lockfile, or rewrite a workflow as part of a feature/docs task.

## Exports and ownership

[src/index.ts](src/index.ts) exports:

| Export                   | Responsibility / contract                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `onUserCreate`           | v1 Auth trigger: validate matching invitations, merge true venue grants, write grants before deleting invitations |
| `listUsers`              | Admin-authorized v2 callable; paginates Firebase Auth users                                                       |
| `adminWrite`             | Admin-authorized v2 callable for grants, user disabling and invitations; cannot disable the caller's own account  |
| `cleanupAuditLog`        | Daily trusted cleanup, bounded per-venue pages, deletes only timestamps strictly older than 90 days               |
| `prepareGoalScorerMedia` | Temporarily retained generated-scorer service for older clients during #241 rollout                               |

**CRITICAL — #241 Phase 2 is pending.** Current web clients compose scorers in
the browser, but older clients may still invoke the service. Retain its export,
implementation, tests, sharp, locks and RTDB/Storage rules until the
[rollout hold and separate removal checklist](../docs/web-only-perimeter-rollout.md)
are satisfied. Existing generated v1 files may remain active references; never
bulk-delete `perimeter-overlays/`, which also contains named media pairs.
Public Cloud Run invocation permits callable transport/preflight; it does not
replace Firebase authentication and per-venue authorization in the handler.

Admin SDK writes bypass client rules. Keep authorization and validation inside
trusted handlers; React's [admin route](../clock/src/admin/AGENTS.md) is UI gating.
Client state commands still obey Firebase authority, current-session/origin and
audit contracts; a callable is not a shortcut around them. See
[audit semantics and limits](../docs/clock/audit.md) for JSON-string changes,
ordinary atomic writes, separate CAS audit appends and retention rationale.

## Emulator and rules verification

Mocked unit tests need no live credentials. Rules suites are **skipped** unless
`RUN_RULES_TESTS=true`; a passing default run does not prove authorization rules.
For local integration, use Firebase CLI, Java **21**, Node 22 and the root
[emulator configuration](../firebase.json) with project `vikes-match-clock-test`.
Compile Functions before starting its emulator; code is loaded from `lib/index.js`.
Auth 9099, Database 9000, Storage 9199 and Functions 5001 are separate services.
Start only required services, wait for each needed endpoint, and read back
Database rules in the actual test namespace. Never use emulator fixtures with
shared Firebase or live service accounts.

With local emulators already running, from `functions/`:

```bash
RUN_RULES_TESTS=true pnpm test --maxWorkers=1 --no-file-parallelism
```

Select relevant files for focused work; [Clock testing](../docs/clock/testing.md)
covers browser/real-SDK readiness. Deployment uses
[deploy-functions.yml](../.github/workflows/deploy-functions.yml) and explicit
Firebase project/authentication, separately from AWS OIDC. Do not deploy to
validate local setup. Update this guide for command/export ownership changes,
the audit reference for retention, and the rollout document for Phase 2 status.
