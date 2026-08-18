use std::path::{Path, PathBuf};

use chrono::{DateTime, Local};
use tauri::{async_runtime, AppHandle, Emitter};
use tracing::{debug, warn};

use crate::recorder::RecordingSaved;
use crate::settings::{Personality, UserSettings};
use crate::{
    llm_cleanup, storage, transcribe, AppRuntime, AppState, TranscriptionCompletePayload,
    TranscriptionErrorPayload, EVENT_TRANSCRIPTION_COMPLETE, EVENT_TRANSCRIPTION_ERROR,
};

struct RetryPlan {
    source: PathBuf,
    recorded_at: DateTime<Local>,
    duration_seconds: f32,
    mode_id: Option<String>,
    mode_name: Option<String>,
}

impl RetryPlan {
    fn prepare(
        record: &storage::TranscriptionRecord,
        source_exists: impl FnOnce(&Path) -> bool,
    ) -> Result<Self, String> {
        let source = PathBuf::from(&record.audio_path);
        if !source_exists(&source) {
            return Err(
                "Cannot retry this transcription because its source audio is unavailable."
                    .to_string(),
            );
        }

        Ok(Self {
            source,
            recorded_at: record.timestamp,
            duration_seconds: record.audio_duration_seconds,
            mode_id: record.mode_id.clone(),
            mode_name: record.mode_name.clone(),
        })
    }

    fn into_launch(self) -> (RecordingSaved, (Option<String>, Option<String>)) {
        let recording = RecordingSaved {
            path: self.source,
            started_at: self.recorded_at,
            ended_at: self.recorded_at,
            duration_override_seconds: Some(self.duration_seconds),
            pending_path: None,
        };
        (recording, (self.mode_id, self.mode_name))
    }
}

pub(crate) fn retry_transcription(
    id: String,
    app: &AppHandle<AppRuntime>,
    state: &AppState,
) -> Result<(), String> {
    debug!(transcription_id = %id, "retry transcription requested");

    let record = state
        .storage()
        .get_by_id(&id)
        .ok_or_else(|| "Transcription not found".to_string())?;

    debug!(
        transcription_id = %id,
        speech_model = %record.speech_model,
        synced = record.synced,
        "found transcription record for retry"
    );

    let (recording, saved_mode) = RetryPlan::prepare(&record, Path::exists)?.into_launch();
    let settings = state.current_settings();
    let cancel_token = state.register_retry_transcription(id.clone());

    transcribe::retry_transcription_async(app, recording, settings, id, saved_mode, cancel_token);
    Ok(())
}

struct CleanupPlan {
    source_text: String,
    personality: Option<Personality>,
    model_label: Option<String>,
}

impl CleanupPlan {
    fn prepare(
        record: storage::TranscriptionRecord,
        settings: &UserSettings,
    ) -> Result<Self, String> {
        if record.status != storage::TranscriptionStatus::Success {
            return Err("Can only apply cleanup to successful transcriptions".to_string());
        }
        if !llm_cleanup::is_llm_available(settings) {
            return Err("Choose a language model in Settings -> Models.".to_string());
        }

        let personality = record.mode_id.as_deref().and_then(|saved_id| {
            settings
                .personalities
                .iter()
                .find(|candidate| candidate.enabled && candidate.id == saved_id)
                .cloned()
        });

        Ok(Self {
            source_text: record.raw_text.unwrap_or(record.text),
            personality,
            model_label: llm_cleanup::resolved_model_label(settings),
        })
    }
}

pub(crate) fn retry_llm_cleanup(
    id: String,
    app: &AppHandle<AppRuntime>,
    state: &AppState,
) -> Result<(), String> {
    let record = state
        .storage()
        .get_by_id(&id)
        .ok_or_else(|| "Transcription not found".to_string())?;
    let settings = state.current_settings();
    let plan = CleanupPlan::prepare(record, &settings)?;

    launch_cleanup(id, app, state, settings, plan);
    Ok(())
}

fn launch_cleanup(
    record_id: String,
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    settings: UserSettings,
    plan: CleanupPlan,
) {
    let app_handle = app.clone();
    let http = state.http();
    let storage = state.storage();

    async_runtime::spawn(async move {
        let result = llm_cleanup::cleanup_transcription(
            &app_handle,
            &http,
            &plan.source_text,
            &settings,
            plan.personality.as_ref(),
            None,
        )
        .await;

        match result {
            Ok(cleaned) => {
                match storage.update_with_llm_cleanup(&record_id, cleaned, plan.model_label) {
                    Ok(record) => emit_completion(&app_handle, record),
                    Err(error) => {
                        warn!(error = ?error, transcription_id = %record_id, "failed to save cleanup");
                    }
                }
            }
            Err(error) => {
                let message = llm_cleanup::llm_issue_message(&error);
                warn!(error = ?error, transcription_id = %record_id, "cleanup failed");
                emit_cleanup_failure(&app_handle, &message);
            }
        }
    });
}

pub(crate) fn undo_llm_cleanup(
    id: String,
    app: &AppHandle<AppRuntime>,
    state: &AppState,
) -> Result<(), String> {
    let record = state
        .storage()
        .revert_to_raw(&id)
        .map_err(|error| format!("Failed to undo cleanup: {error}"))?
        .ok_or_else(|| "No raw text available to revert to".to_string())?;

    emit_completion(app, Some(record));
    Ok(())
}

fn completion_payload(
    record: Option<storage::TranscriptionRecord>,
) -> TranscriptionCompletePayload {
    TranscriptionCompletePayload {
        transcript: String::new(),
        auto_paste: false,
        record,
    }
}

fn cleanup_failure_payload(message: &str) -> TranscriptionErrorPayload {
    TranscriptionErrorPayload {
        message: format!("Cleanup failed: {message}"),
        stage: "llm_cleanup".to_string(),
    }
}

fn emit_completion(app: &AppHandle<AppRuntime>, record: Option<storage::TranscriptionRecord>) {
    let _ = app.emit(EVENT_TRANSCRIPTION_COMPLETE, completion_payload(record));
}

fn emit_cleanup_failure(app: &AppHandle<AppRuntime>, message: &str) {
    let _ = app.emit(EVENT_TRANSCRIPTION_ERROR, cleanup_failure_payload(message));
}

#[cfg(test)]
mod tests {
    use chrono::{Local, TimeZone};

    use super::*;
    use crate::settings::Personality;

    fn record(status: storage::TranscriptionStatus) -> storage::TranscriptionRecord {
        storage::TranscriptionRecord {
            id: "record-17".to_string(),
            timestamp: Local.timestamp_millis_opt(1_700_000_000_000).unwrap(),
            text: "cleaned words".to_string(),
            raw_text: Some("raw words".to_string()),
            audio_path: "/tmp/retry.wav".to_string(),
            audio_available: true,
            status,
            error_message: None,
            llm_cleaned: true,
            speech_model: "speech-model".to_string(),
            llm_model: Some("old-model".to_string()),
            word_count: 2,
            audio_duration_seconds: 2.75,
            synced: true,
            mode_id: Some("saved-mode".to_string()),
            mode_name: Some("Saved Mode".to_string()),
            app_id: Some("com.example.Editor".to_string()),
        }
    }

    fn llm_settings(personality_enabled: bool) -> UserSettings {
        UserSettings {
            llm_enabled: true,
            llm_provider: "openai".to_string(),
            llm_endpoint: "https://api.openai.com/v1".to_string(),
            llm_model: "test-model".to_string(),
            personalities: vec![Personality {
                id: "saved-mode".to_string(),
                name: "Saved Mode".to_string(),
                enabled: personality_enabled,
                apps: Vec::new(),
                websites: Vec::new(),
                instructions: vec!["Keep the saved style".to_string()],
            }],
            ..Default::default()
        }
    }

    #[test]
    fn retry_plan_preserves_source_timing_duration_and_mode() {
        let record = record(storage::TranscriptionStatus::Success);
        let plan = RetryPlan::prepare(&record, |path| path == Path::new("/tmp/retry.wav"))
            .expect("available source");
        let (recording, mode) = plan.into_launch();

        assert_eq!(recording.path, PathBuf::from("/tmp/retry.wav"));
        assert_eq!(recording.started_at, record.timestamp);
        assert_eq!(recording.ended_at, record.timestamp);
        assert_eq!(recording.duration_override_seconds, Some(2.75));
        assert_eq!(recording.pending_path, None);
        assert_eq!(
            mode,
            (
                Some("saved-mode".to_string()),
                Some("Saved Mode".to_string())
            )
        );
    }

    #[test]
    fn retry_plan_keeps_missing_audio_error_contract() {
        let error = RetryPlan::prepare(&record(storage::TranscriptionStatus::Success), |_| false)
            .err()
            .unwrap();
        assert_eq!(
            error,
            "Cannot retry this transcription because its source audio is unavailable."
        );
    }

    #[test]
    fn cleanup_plan_uses_raw_text_saved_personality_and_current_model() {
        let plan = CleanupPlan::prepare(
            record(storage::TranscriptionStatus::Success),
            &llm_settings(true),
        )
        .expect("valid cleanup");

        assert_eq!(plan.source_text, "raw words");
        assert_eq!(plan.personality.unwrap().id, "saved-mode");
        assert_eq!(plan.model_label.as_deref(), Some("openai:test-model"));
    }

    #[test]
    fn cleanup_plan_ignores_disabled_saved_personality() {
        let plan = CleanupPlan::prepare(
            record(storage::TranscriptionStatus::Success),
            &llm_settings(false),
        )
        .expect("valid cleanup");
        assert!(plan.personality.is_none());
    }

    #[test]
    fn cleanup_preflight_errors_remain_stable() {
        let wrong_status = CleanupPlan::prepare(
            record(storage::TranscriptionStatus::Error),
            &llm_settings(true),
        )
        .err()
        .unwrap();
        assert_eq!(
            wrong_status,
            "Can only apply cleanup to successful transcriptions"
        );

        let missing_model = CleanupPlan::prepare(
            record(storage::TranscriptionStatus::Success),
            &UserSettings::default(),
        )
        .err()
        .unwrap();
        assert_eq!(
            missing_model,
            "Choose a language model in Settings -> Models."
        );
    }

    #[test]
    fn event_payloads_keep_frontend_wire_contract() {
        let complete = serde_json::to_value(completion_payload(None)).unwrap();
        let failure = serde_json::to_value(cleanup_failure_payload("quota reached")).unwrap();

        assert_eq!(
            complete,
            serde_json::json!({
                "transcript": "",
                "auto_paste": false,
                "record": null
            })
        );
        assert_eq!(
            failure,
            serde_json::json!({
                "message": "Cleanup failed: quota reached",
                "stage": "llm_cleanup"
            })
        );
    }

    #[test]
    fn sqlite_cleanup_and_undo_keep_text_metadata_contract() {
        let directory = tempfile::tempdir().unwrap();
        let storage = storage::StorageManager::new(directory.path().join("history.sqlite3"))
            .expect("temporary storage");
        let metadata = storage::TranscriptionMetadata {
            synced: true,
            word_count: 2,
            ..Default::default()
        };
        storage
            .save_transcription(
                "raw words".to_string(),
                String::new(),
                storage::TranscriptionStatus::Success,
                None,
                metadata,
                Some("record-17".to_string()),
                None,
            )
            .unwrap();

        let cleaned = storage
            .update_with_llm_cleanup(
                "record-17",
                "cleaned phrase here".to_string(),
                Some("openai:test-model".to_string()),
            )
            .unwrap()
            .unwrap();
        assert_eq!(cleaned.text, "cleaned phrase here");
        assert_eq!(cleaned.raw_text.as_deref(), Some("raw words"));
        assert_eq!(cleaned.llm_model.as_deref(), Some("openai:test-model"));
        assert_eq!(cleaned.word_count, 3);
        assert!(!cleaned.synced);

        let restored = storage.revert_to_raw("record-17").unwrap().unwrap();
        assert_eq!(restored.text, "raw words");
        assert_eq!(restored.raw_text, None);
        assert_eq!(restored.llm_model, None);
        assert!(!restored.llm_cleaned);
        assert!(!restored.synced);
    }
}
