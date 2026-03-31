#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::panic;
use std::path::PathBuf;

fn panic_log_path() -> Option<PathBuf> {
    // Write to the same directory the log plugin uses:
    // %LOCALAPPDATA%\com.vikes.matchclock\logs\
    let base = dirs_next::data_local_dir()?;
    let log_dir = base.join("com.vikes.matchclock").join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    Some(log_dir.join("panic.log"))
}

fn main() {
    panic::set_hook(Box::new(|info| {
        let msg = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let text = format!("PANIC at {}: {}\n", location, msg);
        eprintln!("{}", text);
        if let Some(path) = panic_log_path() {
            if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
                let _ = f.write_all(text.as_bytes());
            }
        }
    }));

    vikes_match_clock_lib::run();
}
