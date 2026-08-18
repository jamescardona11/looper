use tauri::AppHandle;

use crate::{AppRuntime, AppState, LibraryJob};

use super::super::{
    processing::{build_export_content, build_meeting_export_content},
    queue::{release_library_slot, schedule_library_job},
    types::{
        ExportFormat, LibraryFilter, LibraryItem, LibraryItemPatch, LibraryItemStatus,
        LibraryItemsPage,
    },
};
use super::{files, recovery};

pub(super) fn page(
    state: &AppState,
    filter: Option<LibraryFilter>,
    limit: u32,
    offset: u32,
) -> Result<LibraryItemsPage, String> {
    let page_size = limit.clamp(1, 200) as usize;
    state
        .storage()
        .get_library_items_page(filter.unwrap_or_default(), page_size, offset as usize)
        .map(|(items, has_more)| LibraryItemsPage { items, has_more })
        .map_err(|error| format!("Failed to load library items page: {error}"))
}

pub(super) fn update(
    state: &AppState,
    id: String,
    patch: LibraryItemPatch,
) -> Result<LibraryItem, String> {
    let storage = state.storage();
    let item = storage
        .update_library_item(&id, patch)
        .map_err(|error| format!("Failed to update library item: {error}"))?
        .ok_or_else(|| "Library item not found".to_owned())?;
    let mirror_settings = state.current_settings_unmasked();
    if let Err(error) =
        crate::markdown_mirror::mirror_library_by_id(&mirror_settings, &storage, &id)
    {
        tracing::warn!("Failed to update Markdown mirror for Library item: {error}");
    }
    Ok(item)
}

pub(super) fn delete(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    id: String,
) -> Result<(), String> {
    if state.meeting_capture().is_active()
        && state.meeting_capture().state().id.as_deref() == Some(id.as_str())
    {
        return Err("Stop the meeting recording before deleting it.".to_owned());
    }

    state.remove_library_job(&id);
    state.cancel_library_transcription(&id);
    release_library_slot(app, state, &id);

    let storage = state.storage();
    let Some(item) = storage
        .get_library_item(&id)
        .map_err(|error| format!("Failed to load library item: {error}"))?
    else {
        return Ok(());
    };
    files::delete_managed_audio(app, &item.audio_path)?;
    storage
        .delete_library_item(&id)
        .map(|_| ())
        .map_err(|error| format!("Failed to delete library item: {error}"))
}

pub(super) fn cancel(app: &AppHandle<AppRuntime>, state: &AppState, id: String) {
    if state.remove_library_job(&id) {
        recovery::update_status(&state.storage(), &id, LibraryItemStatus::Cancelled);
        recovery::emit_error(app, &id, "Transcription cancelled", true);
        return;
    }
    state.cancel_library_transcription(&id);
    recovery::update_status(&state.storage(), &id, LibraryItemStatus::Cancelling);
}

pub(super) fn retry(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    id: String,
) -> Result<(), String> {
    let storage = state.storage();
    let item = load_item(state, &id)?;
    let kind = match recovery::retry_job(&item) {
        Ok(kind) => kind,
        Err(message) => {
            recovery::set_error(&storage, &id, &message);
            recovery::emit_error(app, &id, message.clone(), false);
            return Err(message);
        }
    };
    recovery::update_status(&storage, &id, LibraryItemStatus::Pending);
    schedule_library_job(app, state, LibraryJob { id, kind });
    Ok(())
}

pub(super) fn export(
    state: &AppState,
    id: String,
    format: ExportFormat,
    output_path: String,
) -> Result<(), String> {
    let item = load_item(state, &id)?;
    let content = if item.kind == "meeting" && matches!(&format, ExportFormat::Md) {
        let details = state
            .storage()
            .get_meeting_details(&id)
            .map_err(|error| format!("Failed to load meeting details: {error}"))?
            .ok_or_else(|| "Meeting details not found".to_owned())?;
        build_meeting_export_content(&item, &details, format)
    } else {
        build_export_content(&item, format)
    }
    .map_err(|error| format!("Failed to build export: {error}"))?;
    files::write_export(&output_path, &content)
}

pub(super) fn tags(state: &AppState) -> Result<Vec<String>, String> {
    state
        .storage()
        .get_library_tags()
        .map_err(|error| format!("Failed to load tags: {error}"))
}

fn load_item(state: &AppState, id: &str) -> Result<LibraryItem, String> {
    state
        .storage()
        .get_library_item(id)
        .map_err(|error| format!("Failed to load library item: {error}"))?
        .ok_or_else(|| "Library item not found".to_owned())
}
