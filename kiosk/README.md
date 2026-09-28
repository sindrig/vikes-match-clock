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

## Verification

Run `cargo test --locked` in `src-tauri`. The release workflow runs these tests on
Windows before building the installers.

For a Windows multi-monitor smoke test:

1. Start the kiosk and move it to the secondary screen using the shortcut above.
2. Close and reopen it; verify it opens fullscreen on that screen.
3. Reboot and verify autostart uses the same screen.
4. Close it, disconnect the selected display, and reopen; verify a visible
   fullscreen fallback. Close it, reconnect the display, and reopen; verify the
   saved choice is restored.
5. Repeat with the secondary screen positioned left of the primary screen and
   with different display scaling settings.
