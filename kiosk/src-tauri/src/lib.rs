use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_log::{Target, TargetKind};

pub fn run() {
    let result = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(Target::new(TargetKind::LogDir {
                    file_name: Some("vikes-match-clock".to_string()),
                }))
                .level(log::LevelFilter::Debug)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            log::info!("App setup started");

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.open_devtools();
            }

            let autostart = app.autolaunch();
            match autostart.is_enabled() {
                Ok(false) => {
                    if let Err(e) = autostart.enable() {
                        log::error!("Failed to enable autostart: {}", e);
                    } else {
                        log::info!("Autostart enabled");
                    }
                }
                Ok(true) => log::info!("Autostart already enabled"),
                Err(e) => log::error!("Failed to check autostart status: {}", e),
            }

            log::info!("App setup complete");
            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        log::error!("Fatal error running tauri application: {:?}", e);
    }
}
