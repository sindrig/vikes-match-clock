# Windows kiosk

Rust/Tauri v2 wrapper with a small static `ui/` bootstrap and connectivity
probe. It loads the hosted Clock at `https://klukka.irdn.is`; it does not bundle
the React application or run another admin/frontend package. There is no kiosk
`package.json` or pnpm install step.

Read the [root instructions](../AGENTS.md). The [README](README.md) is canonical
for monitor persistence, probe/recovery semantics, installation, release ordering
and Windows smoke tests. Update that document for behavior changes and this
guide for command/platform changes; use the [task index](../docs/README.md).

## Platform and commands

Production target: **Windows with MSVC**, Rust stable/Cargo, Visual Studio C++
build tools and Windows SDK, plus **WebView2** (the installer embeds its
bootstrapper). The runtime-link check needs PowerShell and Visual Studio's
`dumpbin`. Node 22 runs probe tests; Python >= 3.11 runs release-preparation
tests. CI uses Python 3.12 and installs/builds through the Tauri action.

From the repository root, these tests use local fixtures:

```bash
node --test kiosk/scripts/probe.test.cjs
python kiosk/scripts/test-release.py
```

For Rust tests, run from **`kiosk/src-tauri/`**:

```bash
cargo test --locked
```

Run Cargo/Tauri from `kiosk/` or `kiosk/src-tauri/` so `.cargo/config.toml`
applies the Windows **static C/C++ runtime**. Never override `RUSTFLAGS` with a
value omitting `crt-static`. If building installers locally, use a Tauri v2 CLI
with `cargo tauri build -- --locked` from `kiosk/`; the workflow's action supplies
that CLI, while plain Cargo does not. The host's native GUI dependencies are
needed for non-Windows Rust checks; a Linux pass does not qualify Windows output.

The isolated Chromium probe check is `node kiosk/scripts/probe.browser.cjs`
from the root. It needs Clock's installed Playwright/Chromium and browser system
libraries; it waits through real minute-long retries and closes its own local
servers/contexts. See the README for arguments and limits. It does not load
Firebase or the hosted application. Do not substitute a live kiosk launch for it.

## Boundaries

- Preserve `%LOCALAPPDATA%\com.vikes.matchclock\monitor.json`, default-display
  fallback and the saved preference for a temporarily missing monitor.
- Preserve bounded probe timeouts and retry deadlines across navigations;
  same-origin HTTP success and an opaque cross-origin response are distinct.
  Presence of `#root` proves an app document, not React/Firebase readiness.
- The hosted app chooses Firebase using its own environment/origin contract.
  Kiosk network recovery never authorizes a shared-state write or bypasses
  Clock's session/CAS/playback-occurrence rules.
- Versions change only through the separately authorized release process:
  Cargo manifest, root lock package and Tauri config must agree. Read
  [release ordering](README.md#releases) before tags or publication; the workflow
  writes `master` and the tag, unlike PR artifact builds.
- Save review captures under ignored `screenshots/`; never commit screenshots.
  Installer artwork/icons are intentional source assets, reviewed separately.

**Windows/WebView2 and physical display qualification remain HOLD.** Node,
local Git, Rust or Chromium evidence cannot substitute for clean-Windows runtime,
monitor/autostart and real WebView2 failure-page smoke tests. No release/tag,
installer publication or live application operation follows from local tests.
