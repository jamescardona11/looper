//! macOS permission checking and settings links for audio and input access.

#[cfg(target_os = "macos")]
mod macos {
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
    use std::process::Command;
    use std::sync::mpsc;
    use std::time::Duration;
    #[cfg(debug_assertions)]
    use tracing::debug;

    const SETTINGS_URI_PREFIX: &str = "x-apple.systempreferences:com.apple.preference.security?";

    #[derive(Clone, Copy)]
    enum PrivacyPane {
        Accessibility,
        Microphone,
        InputMonitoring,
        ScreenCapture,
    }

    impl PrivacyPane {
        fn anchor(self) -> &'static str {
            match self {
                Self::Accessibility => "Privacy_Accessibility",
                Self::Microphone => "Privacy_Microphone",
                Self::InputMonitoring => "Privacy_ListenEvent",
                Self::ScreenCapture => "Privacy_ScreenCapture",
            }
        }

        fn uri(self) -> String {
            format!("{SETTINGS_URI_PREFIX}{}", self.anchor())
        }
    }

    fn open_privacy_pane(pane: PrivacyPane) -> Result<(), String> {
        Command::new("open")
            .arg(pane.uri())
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Failed to open System Settings: {error}"))
    }

    /// Check if accessibility (AX) permission is granted.
    /// Uses AXIsProcessTrusted() from ApplicationServices framework.
    pub fn check_accessibility_permission() -> bool {
        if let Some(result) = check_accessibility_native() {
            return result;
        }

        check_accessibility_osascript()
    }

    /// Native check using AXIsProcessTrusted
    fn check_accessibility_native() -> Option<bool> {
        #[link(name = "ApplicationServices", kind = "framework")]
        extern "C" {
            fn AXIsProcessTrusted() -> u8;
        }

        let result = unsafe { AXIsProcessTrusted() };
        Some(result != 0)
    }

    /// Fallback check using osascript to test if we can send keystrokes
    fn check_accessibility_osascript() -> bool {
        let output = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to return 1"])
            .output();

        match output {
            Ok(result) => {
                let success = result.status.success();
                #[cfg(debug_assertions)]
                debug!(success, "accessibility osascript permission check");
                success
            }
            Err(_) => false,
        }
    }

    /// Open System Settings to the Accessibility privacy pane.
    pub fn open_accessibility_settings() -> Result<(), String> {
        open_privacy_pane(PrivacyPane::Accessibility)
    }

    /// Open System Settings to the Microphone privacy pane.
    pub fn open_microphone_settings() -> Result<(), String> {
        open_privacy_pane(PrivacyPane::Microphone)
    }

    /// Open System Settings to the Screen & System Audio Recording privacy pane.
    pub fn open_system_audio_settings() -> Result<(), String> {
        open_privacy_pane(PrivacyPane::ScreenCapture)
    }

    /// Check if microphone permission is granted.
    pub fn check_microphone_permission() -> bool {
        microphone_authorization_status()
            .map(is_microphone_authorized)
            .unwrap_or(false)
    }

    /// Request microphone permission from macOS.
    pub fn request_microphone_permission() -> Result<(), String> {
        let media_type = unsafe { AVMediaTypeAudio }
            .ok_or_else(|| "AVFoundation audio media type is unavailable".to_string())?;
        let completion = RcBlock::new(|_granted: Bool| {});

        unsafe {
            AVCaptureDevice::requestAccessForMediaType_completionHandler(media_type, &completion);
        }

        Ok(())
    }

    /// Check and, when needed, request microphone access from async commands.
    pub async fn ensure_microphone_permission<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
    ) -> Result<bool, String> {
        match microphone_authorization_status()? {
            AVAuthorizationStatus::Authorized => Ok(true),
            AVAuthorizationStatus::Denied | AVAuthorizationStatus::Restricted => Ok(false),
            AVAuthorizationStatus::NotDetermined => {
                request_microphone_permission_on_main(app).await
            }
            _ => Ok(false),
        }
    }

    async fn request_microphone_permission_on_main<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
    ) -> Result<bool, String> {
        let (sender, receiver) = mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            let Some(media_type) = (unsafe { AVMediaTypeAudio }) else {
                let _ = sender.send(false);
                return;
            };
            let completion = RcBlock::new(move |granted: Bool| {
                let _ = sender.send(granted.as_bool());
            });
            unsafe {
                AVCaptureDevice::requestAccessForMediaType_completionHandler(
                    media_type,
                    &completion,
                );
            }
        })
        .map_err(|error| format!("Failed to request microphone permission: {error}"))?;

        tauri::async_runtime::spawn_blocking(move || {
            receiver
                .recv_timeout(Duration::from_secs(60))
                .map_err(|_| "Timed out waiting for microphone permission".to_string())
        })
        .await
        .map_err(|error| format!("Microphone permission task failed: {error}"))?
    }

    fn microphone_authorization_status() -> Result<AVAuthorizationStatus, String> {
        let media_type = unsafe { AVMediaTypeAudio }
            .ok_or_else(|| "AVFoundation audio media type is unavailable".to_string())?;
        Ok(unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) })
    }

    fn is_microphone_authorized(status: AVAuthorizationStatus) -> bool {
        status == AVAuthorizationStatus::Authorized
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn only_authorized_microphone_status_is_accepted() {
            assert!(is_microphone_authorized(AVAuthorizationStatus::Authorized));
            assert!(!is_microphone_authorized(AVAuthorizationStatus::Denied));
            assert!(!is_microphone_authorized(
                AVAuthorizationStatus::NotDetermined
            ));
            assert!(!is_microphone_authorized(AVAuthorizationStatus::Restricted));
        }

        #[test]
        fn privacy_panes_map_to_the_expected_system_settings_routes() {
            assert_eq!(
                PrivacyPane::Accessibility.uri(),
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            );
            assert_eq!(
                PrivacyPane::Microphone.uri(),
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
            );
            assert_eq!(
                PrivacyPane::InputMonitoring.uri(),
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
            );
            assert_eq!(
                PrivacyPane::ScreenCapture.uri(),
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
            );
        }
    }

    /// Open System Settings to the Input Monitoring privacy pane.
    pub fn open_input_monitoring_settings() -> Result<(), String> {
        open_privacy_pane(PrivacyPane::InputMonitoring)
    }

    pub fn check_screen_capture_permission() -> bool {
        cidre::api::version!(macos = 14.0) && cidre::cg::screen_capture_access::preflight()
    }

    pub fn request_screen_capture_permission() -> bool {
        cidre::api::version!(macos = 14.0) && cidre::cg::screen_capture_access::request()
    }

    pub fn open_screen_capture_settings() -> Result<(), String> {
        open_privacy_pane(PrivacyPane::ScreenCapture)
    }
}

#[cfg(not(target_os = "macos"))]
mod other {
    fn unavailable(capability: &str) -> Result<(), String> {
        Err(format!("{capability} settings are only available on macOS"))
    }

    pub fn check_accessibility_permission() -> bool {
        true
    }

    pub fn open_accessibility_settings() -> Result<(), String> {
        unavailable("Accessibility")
    }

    pub fn open_microphone_settings() -> Result<(), String> {
        unavailable("Microphone")
    }

    pub fn open_system_audio_settings() -> Result<(), String> {
        unavailable("System audio")
    }

    pub fn check_microphone_permission() -> bool {
        true
    }

    pub fn request_microphone_permission() -> Result<(), String> {
        Ok(())
    }

    pub async fn ensure_microphone_permission<R: tauri::Runtime>(
        _app: &tauri::AppHandle<R>,
    ) -> Result<bool, String> {
        Ok(true)
    }

    pub fn open_input_monitoring_settings() -> Result<(), String> {
        unavailable("Input Monitoring")
    }

    pub fn check_screen_capture_permission() -> bool {
        true
    }

    pub fn request_screen_capture_permission() -> bool {
        true
    }

    pub fn open_screen_capture_settings() -> Result<(), String> {
        unavailable("Screen Recording")
    }
}

#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(target_os = "macos"))]
pub use other::*;
