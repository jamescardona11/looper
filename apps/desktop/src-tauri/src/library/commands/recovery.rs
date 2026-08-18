use std::{path::PathBuf, sync::Arc};

use tauri::{AppHandle, Emitter, Manager};

use crate::{storage::StorageManager, AppRuntime, AppState, LibraryJob, LibraryJobKind};

use super::super::{
    processing::stored_original_path,
    queue::schedule_library_job,
    types::{
        LibraryErrorPayload, LibraryItem, LibraryItemPatch, LibraryItemStatus, EVENT_LIBRARY_ERROR,
    },
    youtube::validate_youtube_url,
};

enum InterruptedAction {
    RecoverRecording,
    MarkCancelled,
    Queue(LibraryJobKind),
    MarkError(String),
    Ignore,
}

pub(super) fn recover_interrupted(app: &AppHandle<AppRuntime>) {
    let state = app.state::<AppState>();
    let license_active = crate::license::license_gate_active(&state.settings_store);
    let storage = state.storage();
    let items = match storage.get_recoverable_library_items() {
        Ok(items) => items,
        Err(error) => {
            tracing::error!("Failed to load recoverable library items: {error}");
            return;
        }
    };

    for item in items {
        match interrupted_action(&item, license_active) {
            InterruptedAction::RecoverRecording => {
                if let Err(message) = state
                    .meeting_capture()
                    .recover_recording(app, &state, &item)
                {
                    set_error(&storage, &item.id, &message);
                }
            }
            InterruptedAction::MarkCancelled => {
                update_status(&storage, &item.id, LibraryItemStatus::Cancelled);
                emit_error(app, &item.id, "Transcription cancelled", true);
            }
            InterruptedAction::Queue(kind) => {
                update_status(&storage, &item.id, LibraryItemStatus::Pending);
                schedule_library_job(app, &state, LibraryJob { id: item.id, kind });
            }
            InterruptedAction::MarkError(message) => set_error(&storage, &item.id, &message),
            InterruptedAction::Ignore => {}
        }
    }
}

pub(super) fn retry_job(item: &LibraryItem) -> Result<LibraryJobKind, String> {
    if PathBuf::from(&item.audio_path).exists() {
        return Ok(LibraryJobKind::TranscribeExisting);
    }
    if item.kind == "youtube" {
        validate_youtube_url(&item.source_path).map_err(|error| error.to_string())?;
        return Ok(LibraryJobKind::ImportYoutube {
            url: item.source_path.clone(),
            store_original: item.store_original,
        });
    }
    recoverable_source(item)
        .map(|source_path| LibraryJobKind::Import {
            source_path,
            store_original: item.store_original,
        })
        .ok_or_else(missing_original_message)
}

pub(super) fn update_status(storage: &StorageManager, id: &str, status: LibraryItemStatus) {
    let mut patch = LibraryItemPatch::default();
    patch.status = Some(status);
    let _ = storage.update_library_item(id, patch);
}

pub(super) fn set_error(storage: &Arc<StorageManager>, id: &str, message: &str) {
    update_status(
        storage,
        id,
        LibraryItemStatus::Error {
            message: message.to_owned(),
        },
    );
}

pub(super) fn emit_error(
    app: &AppHandle<AppRuntime>,
    id: &str,
    message: impl Into<String>,
    cancelled: bool,
) {
    let _ = app.emit(
        EVENT_LIBRARY_ERROR,
        LibraryErrorPayload {
            id: id.to_owned(),
            message: message.into(),
            cancelled,
        },
    );
}

fn interrupted_action(item: &LibraryItem, license_active: bool) -> InterruptedAction {
    if !license_active && !matches!(item.status, LibraryItemStatus::Recording) {
        return InterruptedAction::Ignore;
    }
    match item.status {
        LibraryItemStatus::Recording => InterruptedAction::RecoverRecording,
        LibraryItemStatus::Cancelling => InterruptedAction::MarkCancelled,
        LibraryItemStatus::Pending
        | LibraryItemStatus::Importing { .. }
        | LibraryItemStatus::Transcribing { .. } => match recovery_job(item) {
            Ok(kind) => InterruptedAction::Queue(kind),
            Err(message) => InterruptedAction::MarkError(message),
        },
        _ => InterruptedAction::Ignore,
    }
}

fn recovery_job(item: &LibraryItem) -> Result<LibraryJobKind, String> {
    match item.status {
        LibraryItemStatus::Importing { .. } if item.kind != "youtube" => {
            if let Some(source_path) = recoverable_source(item) {
                return Ok(LibraryJobKind::Import {
                    source_path,
                    store_original: item.store_original,
                });
            }
            if PathBuf::from(&item.audio_path).exists() {
                Ok(LibraryJobKind::TranscribeExisting)
            } else {
                Err(missing_original_message())
            }
        }
        LibraryItemStatus::Pending
        | LibraryItemStatus::Transcribing { .. }
        | LibraryItemStatus::Importing { .. } => retry_job(item),
        LibraryItemStatus::Cancelling => Err("Transcription cancelled".to_owned()),
        _ => Err("Library item is not recoverable".to_owned()),
    }
}

fn recoverable_source(item: &LibraryItem) -> Option<PathBuf> {
    let stored = stored_original_path(item);
    let source = (!item.source_path.trim().is_empty()).then(|| PathBuf::from(&item.source_path));
    stored.into_iter().chain(source).find(|path| path.exists())
}

fn missing_original_message() -> String {
    "Original file not found. Re-import the file to try again.".to_owned()
}

#[cfg(test)]
mod tests {
    use super::{interrupted_action, InterruptedAction};
    use crate::library::types::{LibraryItem, LibraryItemStatus};

    fn item(status: LibraryItemStatus) -> LibraryItem {
        LibraryItem {
            id: "item-1".to_owned(),
            name: "Meeting".to_owned(),
            audio_path: "/missing/audio.wav".to_owned(),
            source_path: String::new(),
            store_original: false,
            status,
            transcript: None,
            segments: None,
            words: None,
            duration_seconds: 0.0,
            file_size_bytes: 0,
            original_format: "wav".to_owned(),
            created_at: String::new(),
            transcribed_at: None,
            tags: Vec::new(),
            llm_cleanup_enabled: false,
            denoise_enabled: false,
            speech_model: "parakeet".to_owned(),
            show_timestamps: false,
            detect_speakers: false,
            kind: "meeting".to_owned(),
            speakers: None,
        }
    }

    #[test]
    fn recording_recovery_bypasses_license_but_queued_work_does_not() {
        assert!(matches!(
            interrupted_action(&item(LibraryItemStatus::Recording), false),
            InterruptedAction::RecoverRecording
        ));
        assert!(matches!(
            interrupted_action(&item(LibraryItemStatus::Pending), false),
            InterruptedAction::Ignore
        ));
        assert!(matches!(
            interrupted_action(&item(LibraryItemStatus::Cancelling), true),
            InterruptedAction::MarkCancelled
        ));
    }
}
