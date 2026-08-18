use tauri::{AppHandle, Manager};

use super::super::contracts::AppRuntime;
use super::super::state::AppState;
use crate::{assistive, pill, selection_actions, transcribe};

pub(crate) fn stop_active_recording(app: &AppHandle<AppRuntime>) {
    app.state::<AppState>().pill().cancel(app);
}

#[tauri::command]
pub(crate) fn cancel_recording(app: AppHandle<AppRuntime>) {
    let state = app.state::<AppState>();
    match state.pill().status() {
        pill::PillStatus::Processing => state.pill().cancel_processing(&app),
        _ => stop_active_recording(&app),
    }
}

fn require_pending_resolution(resolved: bool, absent_message: &str) -> Result<(), String> {
    resolved
        .then_some(())
        .ok_or_else(|| absent_message.to_owned())
}

#[tauri::command]
pub(crate) fn confirm_pending_insertion(
    text: String,
    app: AppHandle<AppRuntime>,
) -> Result<(), String> {
    let resolved = app
        .state::<AppState>()
        .resolve_pending_insertion(transcribe::InsertionDecision::Confirm(text));
    require_pending_resolution(resolved, "No pending insertion to confirm")
}

#[tauri::command]
pub(crate) fn cancel_pending_insertion(app: AppHandle<AppRuntime>) -> Result<(), String> {
    let resolved = app
        .state::<AppState>()
        .resolve_pending_insertion(transcribe::InsertionDecision::Cancel);
    require_pending_resolution(resolved, "No pending insertion to cancel")
}

#[tauri::command]
pub(crate) fn choose_edit_action(
    action: selection_actions::EditAction,
    preset: Option<selection_actions::TransformPreset>,
    app: AppHandle<AppRuntime>,
) -> Result<(), String> {
    let decision = transcribe::EditActionDecision::Chosen { action, preset };
    let resolved = app
        .state::<AppState>()
        .resolve_pending_edit_action(decision);
    require_pending_resolution(resolved, "No pending edit action to resolve")
}

#[tauri::command]
pub(crate) fn cancel_edit_action(app: AppHandle<AppRuntime>) -> Result<(), String> {
    let resolved = app
        .state::<AppState>()
        .resolve_pending_edit_action(transcribe::EditActionDecision::Cancel);
    require_pending_resolution(resolved, "No pending edit action to cancel")
}

#[tauri::command]
pub(crate) fn undo_last_insertion(state: tauri::State<AppState>) -> Result<(), String> {
    let undo = state
        .take_last_insertion()
        .ok_or_else(|| "No insertion to undo".to_owned())?;
    assistive::undo_insertion(undo).map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) async fn insert_remote_text(
    text: String,
    app: AppHandle<AppRuntime>,
) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Nothing to insert".to_owned());
    }
    let insertion_app = app.clone();
    let insertion = tauri::async_runtime::spawn_blocking(move || {
        let before = assistive::focused_text_snapshot();
        assistive::insert_text(&text, before.as_ref())
    })
    .await
    .map_err(|failure| failure.to_string())?
    .map_err(|failure| failure.to_string())?;
    let (outcome, undo) = insertion;
    insertion_app.state::<AppState>().set_last_insertion(undo);
    let (kind, message) = if outcome.confirmed_failure {
        (
            "warning",
            "Insertion couldn't be confirmed - it may not have landed correctly.",
        )
    } else if outcome.verified {
        ("success", "Inserted")
    } else {
        ("info", "Inserted (unconfirmed)")
    };
    transcribe::emit_insertion_toast(&insertion_app, kind, message);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::require_pending_resolution;

    #[test]
    fn pending_resolution_retains_the_public_error() {
        assert!(require_pending_resolution(true, "missing").is_ok());
        assert_eq!(
            require_pending_resolution(false, "No pending insertion to confirm").unwrap_err(),
            "No pending insertion to confirm"
        );
    }
}
