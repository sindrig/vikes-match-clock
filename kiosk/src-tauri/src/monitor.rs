use serde::{Deserialize, Serialize};
use std::{fs, path::Path, sync::Mutex};
use tauri::{Manager, Monitor, PhysicalPosition, WebviewWindow, WindowEvent};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct SavedMonitor {
    name: Option<String>,
    x: i32,
    y: i32,
}

impl From<&Monitor> for SavedMonitor {
    fn from(monitor: &Monitor) -> Self {
        Self {
            name: monitor.name().cloned(),
            x: monitor.position().x,
            y: monitor.position().y,
        }
    }
}

fn matching_monitor(saved: &SavedMonitor, monitors: &[SavedMonitor]) -> Option<usize> {
    // Position disambiguates identical names; name survives desktop rearrangement.
    monitors
        .iter()
        .position(|monitor| monitor == saved)
        .or_else(|| {
            saved.name.as_ref().and_then(|name| {
                let mut matches = monitors
                    .iter()
                    .enumerate()
                    .filter(|(_, monitor)| monitor.name.as_ref() == Some(name));
                let (index, _) = matches.next()?;
                matches.next().is_none().then_some(index)
            })
        })
}

fn read_saved(path: &Path) -> Option<SavedMonitor> {
    match fs::read(path) {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(saved) => Some(saved),
            Err(error) => {
                log::warn!("Ignoring invalid saved monitor: {error}");
                None
            }
        },
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                log::warn!("Cannot read saved monitor: {error}");
            }
            None
        }
    }
}

pub fn restore_and_track(window: &WebviewWindow) -> tauri::Result<()> {
    let path = window
        .path()
        .app_local_data_dir()
        .map(|dir| dir.join("monitor.json"));
    let path = match path {
        Ok(path) => Some(path),
        Err(error) => {
            log::warn!("Cannot locate monitor settings: {error}");
            None
        }
    };

    if let Some(saved) = path.as_deref().and_then(read_saved) {
        match window.available_monitors() {
            Ok(monitors) => {
                let identities: Vec<_> = monitors.iter().map(SavedMonitor::from).collect();
                if let Some(index) = matching_monitor(&saved, &identities) {
                    let position = monitors[index].position();
                    if let Err(error) =
                        window.set_position(PhysicalPosition::new(position.x, position.y))
                    {
                        log::warn!("Cannot restore monitor position: {error}");
                    }
                } else {
                    log::info!("Saved monitor unavailable; using default display");
                }
            }
            Err(error) => log::warn!("Cannot enumerate monitors: {error}"),
        }
    }

    window.set_fullscreen(true)?;
    window.show()?;

    // Save only monitor changes, not startup/fallback placement. Persist immediately
    // rather than on exit, since stadium PCs may shut down without a clean exit.
    let current = window.current_monitor()?.as_ref().map(SavedMonitor::from);
    let last_monitor = Mutex::new(current);
    let tracked_window = window.clone();
    window.on_window_event(move |event| {
        if !matches!(event, WindowEvent::Moved(_)) {
            return;
        }
        let Some(path) = &path else { return };
        let Ok(Some(monitor)) = tracked_window.current_monitor() else {
            return;
        };
        let monitor = SavedMonitor::from(&monitor);
        let Ok(mut last) = last_monitor.lock() else {
            return;
        };
        if last.as_ref() == Some(&monitor) {
            return;
        }
        let result = (|| -> Result<(), Box<dyn std::error::Error>> {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(path, serde_json::to_vec(&monitor)?)?;
            Ok(())
        })();
        match result {
            Ok(()) => {
                log::info!("Saved monitor: {monitor:?}");
                *last = Some(monitor);
            }
            Err(error) => log::warn!("Cannot save monitor: {error}"),
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn display(name: &str, x: i32) -> SavedMonitor {
        SavedMonitor {
            name: Some(name.into()),
            x,
            y: 0,
        }
    }

    #[test]
    fn restores_secondary_display_even_when_enumeration_changes() {
        let saved = display("stadium", -1920);
        assert_eq!(
            matching_monitor(&saved, &[saved.clone(), display("desk", 0)]),
            Some(0)
        );
    }

    #[test]
    fn follows_named_display_when_desktop_is_rearranged() {
        assert_eq!(
            matching_monitor(
                &display("stadium", 1920),
                &[display("desk", 0), display("stadium", -1920)]
            ),
            Some(1)
        );
    }

    #[test]
    fn missing_display_does_not_match_replacement_at_same_position() {
        assert_eq!(
            matching_monitor(
                &display("stadium", 1920),
                &[display("desk", 0), display("other", 1920)]
            ),
            None
        );
    }

    #[test]
    fn duplicate_names_require_matching_position() {
        let monitors = [display("screen", 0), display("screen", 1920)];
        assert_eq!(
            matching_monitor(&display("screen", 1920), &monitors),
            Some(1)
        );
        assert_eq!(matching_monitor(&display("screen", -1920), &monitors), None);
    }

    #[test]
    fn settings_round_trip_preserves_negative_coordinates() {
        let saved = display("stadium", -1920);
        let bytes = serde_json::to_vec(&saved).unwrap();
        assert_eq!(
            serde_json::from_slice::<SavedMonitor>(&bytes).unwrap(),
            saved
        );
    }
}
