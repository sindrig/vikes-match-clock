use std::time::Duration;
use tauri::webview::{PageLoadEvent, PageLoadPayload, Webview};
use tauri::WebviewWindow;

const RETRY_INTERVAL: Duration = Duration::from_secs(60);
const PROBE_SCRIPT: &str = include_str!("../../ui/probe.js");

pub fn on_page_load<R: tauri::Runtime>(webview: &Webview<R>, payload: &PageLoadPayload<'_>) {
    if let PageLoadEvent::Finished = payload.event() {
        if let Err(error) = webview.eval(PROBE_SCRIPT) {
            log::warn!("Cannot inject kiosk probe: {error}");
        }
    }
}

pub fn watch(window: &WebviewWindow) {
    let ticker = window.clone();
    let thread = std::thread::Builder::new()
        .name("kiosk-probe".to_string())
        .spawn(move || loop {
            std::thread::sleep(RETRY_INTERVAL);
            if let Err(error) = ticker.eval(PROBE_SCRIPT) {
                log::warn!("Cannot run kiosk probe: {error}");
            }
        });
    if let Err(error) = thread {
        log::error!("Cannot start kiosk probe thread: {error}");
    }
}
