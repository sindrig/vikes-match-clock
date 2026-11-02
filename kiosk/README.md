# Windows kiosk

The kiosk starts automatically at sign-in and opens fullscreen on its last-used
monitor. To change screens, focus the kiosk and press **Win + Shift + Left/Right
Arrow**, then restart it to confirm the choice was remembered.

Monitor selection is saved on each PC, for the current Windows user, in
`%LOCALAPPDATA%\com.vikes.matchclock\monitor.json`. No controller or Firebase
configuration is required. Delete that file while the kiosk is closed to reset
the choice.

If the saved monitor is unavailable at launch, the kiosk opens on the default
display and retains the saved preference. Connect/power on the desired display
before starting the kiosk. Moving the kiosk to another monitor saves a new choice
immediately.

## Network behavior

The kiosk loads the clock from `https://klukka.irdn.is`. While the clock cannot
be loaded — the kiosk starts without network, or the display falls back to a
WebView error screen (for example a local reload while offline) — the
kiosk retries every minute until the network connection is back and then loads
the clock. Until then it shows a black screen, so recovery can take up to a
minute after the connection returns.

When the clock is already displayed and the connection is lost for at least two
consecutive checks (roughly a minute or more), the kiosk reloads the clock once
the connection returns so the display always runs with a fresh connection. A
single failed check does not interrupt the display.

Each connectivity check times out after 10 seconds. A stalled request counts as
a failed check and does not block the next one-minute retry.

On the clock's origin, only a successful HTTP response counts as a healthy
check. HTTP errors (including 5xx) count toward the same two-check outage as
network failures. A same-origin error document without the clock's `#root`
element navigates back to the clock on the first successful check, even if it
has never observed a failed probe. The root is part of the initial HTML shell;
an empty root while React starts does not trigger a reload. This identifies the
application document, not whether React, Firebase or match data are ready.

From the local bootstrap or an off-origin WebView error page, a cross-origin
`no-cors` request can return an opaque response. That proves only transport
reachability, not HTTP success; it permits a navigation attempt so the next
same-origin check can inspect HTTP status and the document. It does not reset
the outage count. Probes still use a timestamp query and `cache: "no-store"`;
recovery uses `location.replace` with the unchanged clock URL. Native injection
on page-load completion and every minute also remains unchanged.

Recovery attempts record a deadline in tab- and origin-scoped `sessionStorage`
before navigating. The first attempt is immediate; subsequent attempts on that
origin wait at least 60 seconds, including across fresh documents. This prevents repeated
page-load recovery when the timestamped probe succeeds but the canonical clock
URL still serves an error document. Deadlines that are expired, malformed or
more than one interval in the future are ignored so stale data or a clock change
cannot indefinitely prevent recovery. Healthy app/startup checks do not navigate
or change this deadline.

If storage access or writes fail, each document waits one full retry interval
before allowing a recovery attempt on a later periodic check. This can delay
initial recovery, but still bounds attempts when no deadline can survive a
navigation. A displayed clock awaiting recovery from a sustained outage retains
that recovery until an attempt is allowed.

## Windows runtime packaging

Windows MSVC builds statically link the C/C++ runtime via `.cargo/config.toml`.
Run Cargo/Tauri commands from `kiosk/` or `kiosk/src-tauri/` so Cargo picks up
this configuration. Do not override it with `RUSTFLAGS` that omit `crt-static`.
The kiosk should not require a separate Visual C++ Redistributable installation.
WebView2 remains a prerequisite handled by the installer's embedded bootstrapper.

The release workflow builds the installers, checks the release executable with
Visual Studio's `dumpbin /DEPENDENTS`, and publishes only if it has no Visual C++
runtime DLL imports (including `VCRUNTIME140_1.dll`). To repeat the check after a
local Windows release build, run `./scripts/check-windows-runtime.ps1` in
PowerShell from `kiosk/` with the Visual Studio C++ build tools installed.

For release smoke testing, install on a clean Windows PC/VM without the Visual
C++ Redistributable, then launch the kiosk. Also verify an upgrade from 0.0.0
launches successfully and retains the saved monitor selection.

## Releases

Versions are bumped only when creating a release. Push a `vMAJOR.MINOR.PATCH`
tag on the current `master` HEAD (for example, `v0.1.4`). The release workflow:

1. Updates `src-tauri/Cargo.toml`, the root package in `src-tauri/Cargo.lock`,
   and `src-tauri/tauri.conf.json` to the tag's version.
2. Commits those files to `master` and moves the release tag to that commit in
   one atomic push. An annotated tag becomes a lightweight tag.
3. Checks out the exact version commit on Windows, tests and builds it, checks
   the runtime linkage, then publishes the installers under the release tag.

The workflow needs permission to push to `master` and update release tags;
repository branch/tag rules must allow these writes by GitHub Actions.
Concurrent changes to either ref cause preparation to fail rather than overwrite
them. If `master` advances past the tagged revision, create the release tag on
the new HEAD. A failed build can be retried without another version commit as
long as the tag still points to `master` HEAD.

PRs test and build installers available as the `kiosk-installers` workflow
artifact; they do not bump versions or publish GitHub releases.
Version tags use three numeric components without prerelease suffixes, within
Windows MSI limits (major/minor ≤ 255, patch ≤ 65535).

## Verification

Run `python kiosk/scripts/test-release.py` from the repository root with Python
3.11 or newer to test version synchronization, tag/master updates, retry behavior,
and invalid or stale tags using temporary local Git repositories.

Run `node --test scripts/probe.test.cjs` in `kiosk/` for connectivity probe
regressions, and `cargo test --locked` in `src-tauri` for the Rust tests. The
release workflow runs both on Windows before building the installers.

With `clock/`'s Playwright dependency and Chromium installed, run
`node kiosk/scripts/probe.browser.cjs` from the repository root for isolated
loopback HTTP browser regressions. It reinjects the probe after every real page
load and waits through real 60-second retry intervals, including with denied
storage. Optional arguments are a probe source path and a JSON evidence path;
`--loop-only` after those arguments selects just the repeated-navigation case.
It uses fresh browser contexts and closes its browser and local servers. No
application scripts, Firebase or external origins are loaded. This is JavaScript
verification, not Windows/WebView2 qualification.

For a Windows multi-monitor smoke test:

1. Start the kiosk and move it to the secondary screen using the shortcut above.
2. Close and reopen it; verify it opens fullscreen on that screen.
3. Reboot and verify autostart uses the same screen.
4. Close it, disconnect the selected display, and reopen; verify a visible
   fullscreen fallback. Close it, reconnect the display, and reopen; verify the
   saved choice is restored.
5. Repeat with the secondary screen positioned left of the primary screen and
   with different display scaling settings.

For a network recovery smoke test:

1. Start the kiosk with the network disabled; verify it shows a black screen.
   Enable the network; verify the clock appears within a minute.
2. With the clock displayed, disable the network for about two minutes and
   re-enable it; verify the display reloads within a minute of reconnecting.
3. With the clock displayed, disable the kiosk's network and reload locally
   (focus the kiosk and press **Ctrl + R**). Confirm the WebView error screen
   appears before restoring the network; then verify the clock returns within a
   minute of reconnecting. Use a local reload because an offline kiosk cannot
   receive "Endurræsa alla skjái" from Firebase until it reconnects.
4. Restart with the network enabled; verify the clock appears immediately.
5. Using a controlled local HTTP fixture in Windows/WebView2, serve a same-origin
   503 document without `#root`, allow repeated probes to return 503, then restore
   HTTP 200. Verify errors do not clear the outage and the clock returns after the
   next check. Also test an initial 503 document whose very first probe gets
   200: it must recover without waiting for two failed checks.
6. On a working display, return one probe 503 followed by 200 and verify no
   reload or display-state loss. Return two 503s followed by 200 and verify one
   recovery navigation. Delay React startup with an empty `#root` and verify no
   repeated navigation. Exercise the actual WebView2 network-error document as
   well as the server's same-origin HTTP error document.
7. Keep canonical `/` serving 503 without `#root` while timestamped probes return
   a 200 app shell. Verify the first recovery attempt is immediate and repeated
   page-load injections cannot trigger another attempt within 60 seconds. Restore
   the canonical page and verify a later check recovers it. Repeat with storage
   unavailable: each fresh document must wait a full interval before attempting
   recovery, including the initial attempt.

**Qualification HOLD:** local Node/Chromium checks do not qualify Windows or
WebView2 error-page injection, native retry timing, monitor persistence or
physical display behavior. Complete the Windows checks above before deploying
this recovery change. No release, installer publication or deployment is
authorized by local verification.
