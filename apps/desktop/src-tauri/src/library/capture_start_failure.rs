use serde::Serialize;
use tauri::AppHandle;

pub(crate) const MISSING_MEETING_MODEL: &str = "Install a local transcription model or configure a remote speech provider before recording a meeting.";

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CaptureRecovery {
    Models,
    Microphone,
    SystemAudio,
}

impl CaptureRecovery {
    fn action(self) -> (&'static str, &'static str) {
        match self {
            Self::Models => ("open_llm_cleanup_settings", "Get model"),
            Self::Microphone => ("open_microphone_settings", "Allow mic"),
            Self::SystemAudio => ("open_system_audio_settings", "Allow audio"),
        }
    }
}

/// The command boundary translates existing capture errors once. Renderers
/// receive a recovery code rather than guessing an action from English prose.
#[derive(Debug, Serialize)]
pub struct CaptureStartFailure {
    pub message: String,
    pub recovery: Option<CaptureRecovery>,
}

impl From<String> for CaptureStartFailure {
    fn from(message: String) -> Self {
        let recovery = match message.as_str() {
            MISSING_MEETING_MODEL
            | "Choose a transcription model before recording."
            | "The selected transcription model is not installed."
            | "The live transcription model is not installed."
            | "The selected transcription model does not support meeting timestamps."
            | "Choose an installed local Parakeet model for live transcript." => Some(CaptureRecovery::Models),
            "Microphone access is required to record a meeting." => Some(CaptureRecovery::Microphone),
            "System audio permission did not respond. Grant Looper access in System Settings -> Privacy & Security -> Screen & System Audio Recording, then restart Looper." => Some(CaptureRecovery::SystemAudio),
            _ => None,
        };
        let message = match recovery {
            Some(CaptureRecovery::Models) => "Download a model to record.".to_string(),
            Some(CaptureRecovery::Microphone) => "Allow microphone access to record.".to_string(),
            Some(CaptureRecovery::SystemAudio) => {
                "Allow system audio, then restart Looper.".to_string()
            }
            None => message,
        };
        Self { message, recovery }
    }
}

pub(crate) fn show_capture_start_failure(app: &AppHandle<crate::AppRuntime>, message: String) {
    let failure = CaptureStartFailure::from(message);
    if let Some(recovery) = failure.recovery {
        let (action, label) = recovery.action();
        crate::toast::show_with_action(
            app,
            "error",
            Some("Recording setup"),
            &failure.message,
            action,
            label,
        );
    } else {
        crate::toast::show(app, "error", Some("Meeting recording"), &failure.message);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_model_has_a_short_message_and_explicit_recovery() {
        let failure = CaptureStartFailure::from(MISSING_MEETING_MODEL.to_string());
        let payload = serde_json::to_value(failure).unwrap();
        assert_eq!(payload["recovery"], "models");
        assert_eq!(payload["message"], "Download a model to record.");
    }

    #[test]
    fn microphone_failure_offers_permissions_instead_of_model_downloads() {
        let failure = CaptureStartFailure::from(
            "Microphone access is required to record a meeting.".to_string(),
        );
        assert_eq!(failure.recovery, Some(CaptureRecovery::Microphone));
    }

    #[test]
    fn unrelated_failure_preserves_its_message_without_inventing_recovery() {
        let failure = CaptureStartFailure::from("Recording not found".to_string());
        assert_eq!(failure.recovery, None);
        assert_eq!(failure.message, "Recording not found");
    }
}
