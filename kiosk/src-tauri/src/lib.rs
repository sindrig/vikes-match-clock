use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;

pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.open_devtools();

            let autostart = app.autolaunch();
            if !autostart.is_enabled().unwrap_or(false) {
                if let Err(e) = autostart.enable() {
                    eprintln!("Failed to enable autostart: {}", e);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("Error running tauri application: {:?}", e);
    }
}
