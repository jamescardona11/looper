use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use crate::{
    library::types::{
        LibraryErrorPayload, LibraryItemPatch, LibraryItemStatus, LibraryProgressPayload,
        LibraryProgressUpdate, TranscriptSegment, EVENT_LIBRARY_ERROR, EVENT_LIBRARY_PROGRESS,
    },
    storage::StorageManager,
    AppRuntime,
};

pub(super) fn emit_library_error(
    app: &AppHandle<AppRuntime>,
    id: &str,
    message: impl Into<String>,
    cancelled: bool,
) {
    let notification = LibraryErrorPayload {
        id: String::from(id),
        message: message.into(),
        cancelled,
    };
    let _ = app.emit(EVENT_LIBRARY_ERROR, notification);
}

pub(super) fn set_library_status(storage: &StorageManager, id: &str, status: LibraryItemStatus) {
    let mut changes = LibraryItemPatch::default();
    changes.status = Some(status);
    let _ = storage.update_library_item(id, changes);
}

pub(super) struct LibraryProgress<'a> {
    destination: &'a AppHandle<AppRuntime>,
    records: Arc<StorageManager>,
    library_id: &'a str,
}

impl<'a> LibraryProgress<'a> {
    pub(super) fn new(
        destination: &'a AppHandle<AppRuntime>,
        records: Arc<StorageManager>,
        library_id: &'a str,
    ) -> Self {
        Self {
            destination,
            records,
            library_id,
        }
    }

    pub(super) fn begin(&self) {
        self.save(0.0, Some(String::new()), Some(Vec::new()));
        self.send(LibraryProgressPayload {
            id: String::from(self.library_id),
            progress: 0.0,
            current_chunk: 0,
            total_chunks: 0,
            chunk_text: None,
            chunk_segments: None,
        });
    }

    pub(super) fn publish(&self, update: LibraryProgressUpdate) {
        self.save(update.progress, update.transcript, update.segments);
        let notification = LibraryProgressPayload {
            id: String::from(self.library_id),
            progress: update.progress,
            current_chunk: update.current_chunk,
            total_chunks: update.total_chunks,
            chunk_text: update.chunk_text,
            chunk_segments: update.chunk_segments,
        };
        self.send(notification);
    }

    fn save(
        &self,
        completion: f32,
        transcript: Option<String>,
        segments: Option<Vec<TranscriptSegment>>,
    ) {
        let status = LibraryItemStatus::Transcribing {
            progress: completion,
        };
        let changes = LibraryItemPatch {
            status: Some(status),
            transcript,
            segments,
            ..LibraryItemPatch::default()
        };
        let _ = self.records.update_library_item(self.library_id, changes);
    }

    fn send(&self, notification: LibraryProgressPayload) {
        let _ = self.destination.emit(EVENT_LIBRARY_PROGRESS, notification);
    }
}
