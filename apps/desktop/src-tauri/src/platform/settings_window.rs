use crate::AppRuntime;
#[cfg(target_os = "windows")]
use anyhow::Context;
use anyhow::Result;
use tauri::WebviewWindow;

pub fn init(settings_window: &WebviewWindow<AppRuntime>) {
    if let Err(error) = apply_native_chrome(settings_window) {
        tracing::error!(
            window = settings_window.label(),
            %error,
            "Settings window chrome setup failed"
        );
    }
}

#[cfg(target_os = "windows")]
fn apply_native_chrome(settings_window: &WebviewWindow<AppRuntime>) -> Result<()> {
    crate::platform::windows::settings_window::init(settings_window)
        .context("apply the borderless Windows settings surface policy")
}

#[cfg(not(target_os = "windows"))]
fn apply_native_chrome(_settings_window: &WebviewWindow<AppRuntime>) -> Result<()> {
    Ok(())
}
