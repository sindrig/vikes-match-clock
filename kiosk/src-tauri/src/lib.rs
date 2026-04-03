use log::info;
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;

pub fn run() {
    env_logger::init();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            info!("App setup started");

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.open_devtools();
                info!("Opened devtools");
            }

            let autostart = app.autolaunch();
            if let Ok(false) = autostart.is_enabled() {
                if let Err(e) = autostart.enable() {
                    eprintln!("Failed to enable autostart: {}", e);
                } else {
                    info!("Autostart enabled");
                }
            }

            info!("App setup complete");
            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("Error running tauri application: {:?}", e);
    }
}
