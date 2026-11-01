---
name: dev-server
description: Start, inspect or stop a workspace-owned clock frontend dev server on an explicit port, and report HTTP and browser verification separately
---

# Dev Server Skill

Start the Vite dev server for the `clock/` React app on a user-specified port, ensuring all generated code is in place, the server binds to `0.0.0.0`, and the app actually loads in a browser.

Use the repository's `scripts/dev-server.sh` helper from this worktree. It needs Bash, Git, Node, tmux and installed clock dependencies (pnpm). It launches the installed Vite CLI directly in a detached tmux session; it does not use `nohup`. If a required tool is missing, report it or install development tooling within the user's authorized scope.

## Steps

### 1. Determine the port

- The user provides a port number as an argument (e.g. `/dev-server 8000`).
- If no port is provided, default to **8000**.

### 2. Inspect this workspace's server

```bash
# Working directory: repository root; replace 8000 with the chosen port throughout
bash scripts/dev-server.sh status 8000
```

An exit status of 1 with `Stopped` means there is no managed session for this worktree/port. Reuse an existing session when appropriate. To restart it explicitly, run `bash scripts/dev-server.sh stop 8000` first. Never kill by process name, kill a process just because it owns the requested port, or stop another workspace's session.

### 3. Generate the API client

The project uses `@hey-api/openapi-ts` to generate a TypeScript API client from the committed `clock-api/v3/openapi.json` spec. This frontend-only step does not require Python or AWS credentials. Without this, the app fails with import errors for `src/api/client`.

```bash
# Working directory: clock/
pnpm generate-api-client
```

Verify that `clock/src/api/client/index.ts` exists after generation. If the command fails, report the error to the user.

### 4. Start the dev server

The helper identifies the physical worktree and port, uses a dedicated tmux socket/session, and logs to `<worktree>/.dev-server/<port>.log`. `status` reports the live pane PID; it is diagnostic only. The helper never reads a saved PID or signals one directly, so stale logs/PID files cannot target a reused PID. `Running` means the tmux session exists, not that HTTP or the app has been verified. `--strictPort` makes an occupied port fail instead of silently selecting a different port. Choose another explicit port if there is a collision. It preserves the Vite cache.

```bash
# Working directory: repository root
bash scripts/dev-server.sh start 8000
```

The current environment is inherited when starting a new session, including `VITE_USE_EMULATOR=true` when requested. An existing session keeps its original environment; stop/start it to change settings. Do not assume a worktree or port isolates Firebase: development defaults to shared staging Firebase. Avoid authenticated actions against shared state unless authorized.

### 5. Check the HTTP shell

The helper waits up to 15 seconds for Vite to report a listening URL. If startup is not confirmed, inspect the reported log and status; a slow session may still be running. Stop it with the scoped command if abandoning the attempt. Check HTTP separately:

```bash
curl --fail --silent --show-error --max-time 5 http://localhost:8000/ | rg -o '<title>[^<]*</title>'
```

Expected shell title: `<title>VikesClock</title>`. A 200 response/title proves only that Vite serves the HTML shell. It does **not** prove that JavaScript imports, React, API calls, authentication or Firebase synchronization work. Inspect this workspace's log for transform/import errors.

### 6. Verify the app in a browser

Use the browser tools actually available in the session (for example Playwright or Paseo navigation, snapshots, console logs and screenshots), or a local Playwright runner. If no usable browser is available, report **HTTP shell checked; application verification not performed** and the reason.

1. Navigate to `http://localhost:8000/`.
2. Inspect rendered application content (clock display or "Stillingar"), rather than just the HTML title or an empty root element.
3. Check browser console errors and failed module/network requests. Record what was exercised; a rendered clock alone does not verify authenticated controls or cross-client sync.
4. Capture a screenshot when relevant; follow the root guide's image handling rules and the user's limits on external uploads.

For independent controller/display sessions, use separate browser contexts or profiles. Same-origin tabs in one context share localStorage and auth persistence. Playwright's runner supports `browser.newContext()`; if a browser tool exposes code execution and context APIs, those can also operate separate contexts. Inspect actual capabilities rather than assuming every MCP/tool has the same limitation. Browser isolation still shares Firebase data when using the same project and `listenPrefix`.

### 7. Report and stop

Summarize:

- The worktree, port, tmux handle/PID from `status`, and log path
- The local URL: `http://localhost:<PORT>`
- The network URL (from the Vite log, grep for "Network:")
- HTTP-shell result and browser application verification result, including any unverified behavior
- Any errors found in console

Inspect the workspace log for errors and share only relevant lines with secrets redacted. To stop this server, from this worktree:

```bash
bash scripts/dev-server.sh stop 8000
```

This closes only this worktree/port's tmux session. Other ports and worktrees remain running. Logs remain after stopping and are replaced when a new session starts, including a failed Vite startup. Stop sessions before deleting or moving a worktree; moving it changes its handle. Servers launched manually or by other tools are not owned by this helper: use their original terminal/session handle to stop them.

To check lifecycle isolation without frontend dependencies, Firebase or a browser, run `node --test scripts/dev-server.test.mjs` from the repository root (requires Bash, Git, Node and tmux). It exercises disposable linked worktrees and local HTTP fixtures under the user cache, then stops their scoped sessions and removes the fixtures. It checks PID identity, stale state, occupied ports, startup failures and timeout cleanup; it does not verify the application.

## Important notes

- The `vite.config.ts` has `allowedHosts: true` so any hostname works (e.g. `devpod-*` hostnames)
- The server persists in tmux after the invoking shell ends; it does not survive a reboot
- The helper prints a proposed local URL; consult Vite's log for any configured base path and network URL
