---
name: dev-server
description: Start the clock frontend dev server with all generated code ready, bound to 0.0.0.0, and verify it loads correctly using Playwright
---

# Dev Server Skill

Start the Vite dev server for the `clock/` React app on a user-specified port, ensuring all generated code is in place, the server binds to `0.0.0.0`, and the app actually loads in a browser.

## Steps

### 1. Determine the port

- The user provides a port number as an argument (e.g. `/dev-server 8000`).
- If no port is provided, default to **8000**.

### 2. Kill any existing Vite dev server

```bash
pkill -f "vite" 2>/dev/null || true
```

Wait 1-2 seconds for the process to die.

### 3. Generate the API client

The project uses `@hey-api/openapi-ts` to generate a TypeScript API client from the OpenAPI spec. Without this, the app fails with import errors for `src/api/client`.

```bash
# Working directory: clock/
pnpm generate-api-client
```

Verify that `clock/src/api/client/index.ts` exists after generation. If the command fails, report the error to the user.

### 4. Clear Vite cache

Remove stale pre-bundled dependencies so the freshly generated client is picked up:

```bash
rm -rf clock/node_modules/.vite
```

### 5. Start the dev server

Start Vite with `nohup` so it survives shell session termination. Bind to `0.0.0.0` so external hosts can reach it. Use the `PORT` env var for the port.

```bash
# Working directory: clock/
nohup env PORT=<PORT> pnpm start --host 0.0.0.0 > /tmp/vite-dev.log 2>&1 &
```

### 6. Wait and verify with curl

Wait ~5 seconds, then verify the server responds:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:<PORT>
```

Expected: `200`. If not `200`, check `/tmp/vite-dev.log` for errors and report to user.

### 7. Verify the app loads

Try Playwright browser tools first. If they are unavailable (e.g. Chrome not installed, no sudo), fall back to curl HTML verification.

**Option A — Playwright (preferred)**:
1. **Navigate** to `http://localhost:<PORT>`
2. **Take a snapshot** (`playwright_browser_snapshot`) and verify the page loaded (look for known elements like the `.App` container, clock display, or "Stillingar" text)
3. **Check console messages** (`playwright_browser_console_messages` with level `error`) — report any errors
4. **Take a screenshot** and show it to the user as confirmation

**Option B — curl fallback** (if Playwright fails to launch):
1. Fetch the HTML and check for key markers:
   ```bash
   curl -s http://localhost:<PORT> | grep -o '<title>[^<]*</title>'
   ```
   Expected: `<title>VikesClock</title>`
2. Check the Vite log for any errors:
   ```bash
   grep -i "error\|Error" /tmp/vite-dev.log
   ```
   If no errors and title matches, the app is loading correctly.

### 8. Report to the user

Summarize:
- The port the server is running on
- The local URL: `http://localhost:<PORT>`
- The network URL (from the Vite log, grep for "Network:")
- Whether Playwright verification passed
- Any errors found in console

If there are errors, show the relevant log lines from `/tmp/vite-dev.log`.

## Important notes

- The `vite.config.ts` has `allowedHosts: true` so any hostname works (e.g. `devpod-*` hostnames)
- Logs are written to `/tmp/vite-dev.log`
- The server runs as a background process via `nohup` and persists after the shell session ends
- To stop the server later: `pkill -f "vite"`
