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
