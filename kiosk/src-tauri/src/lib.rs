use log::{error, info};
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_log::{Builder as LogBuilder, Target, TargetKind};

pub fn run() {
    let log_plugin = LogBuilder::new()
        .targets([
            Target::new(TargetKind::LogDir {
                file_name: Some("vikes-match-clock".into()),
            }),
            Target::new(TargetKind::Stderr),
        ])
        .level(log::LevelFilter::Info)
        .build();

    let result = tauri::Builder::default()
        .plugin(log_plugin)
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            info!("App setup started");

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.open_devtools();
                info!("Opened devtools");
            } else {
                error!("Could not get main webview window");
            }

            let autostart = app.autolaunch();
            match autostart.is_enabled() {
                Ok(false) => {
                    if let Err(e) = autostart.enable() {
                        error!("Failed to enable autostart: {:?}", e);
                    } else {
                        info!("Autostart enabled");
                    }
                }
                Ok(true) => {
                    info!("Autostart already enabled");
                }
                Err(e) => {
                    error!("Failed to check autostart status: {:?}", e);
                }
            }

            info!("App setup complete");
            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        // Can't use log:: here since tauri has already exited — write to stderr
        eprintln!("Error running tauri application: {:?}", e);
    }
}
