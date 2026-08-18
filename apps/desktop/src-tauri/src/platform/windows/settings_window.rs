use crate::AppRuntime;
use anyhow::Result;
use tauri::WebviewWindow;

pub fn init(settings_window: &WebviewWindow<AppRuntime>) -> Result<()> {
    set_window_chrome(settings_window)
}

fn set_window_chrome(settings_window: &WebviewWindow<AppRuntime>) -> Result<()> {
    settings_window.set_decorations(false).map_err(Into::into)
}
