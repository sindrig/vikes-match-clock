#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::panic;
use std::path::PathBuf;

fn log_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("com.vikes.matchclock").join("logs"))
}

fn main() {
    panic::set_hook(Box::new(|info| {
        let msg = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "Unknown panic".to_string());
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let entry = format!("PANIC at {}: {}\n", location, msg);

        if let Some(dir) = log_dir() {
            let _ = std::fs::create_dir_all(&dir);
            if let Ok(mut f) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(dir.join("panic.log"))
            {
                let _ = f.write_all(entry.as_bytes());
            }
        }
    }));

    vikes_match_clock_lib::run();
}
