use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;
use tauri::menu::{MenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::{AppRuntime, AppState};

const MENU_PREFIX: &str = "qa_lab_";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum QaAction {
    StartDictation,
    FinishDictation,
    CancelDictation,
    ShowLastDictationResult,
    ToggleMeeting,
    HoldPreviousNote,
    ReleasePreviousNote,
    StartImportantMoment,
    SaveImportantMoment,
    StopEverything,
    OpenEvidenceFolder,
}

impl QaAction {
    fn id(self) -> &'static str {
        match self {
            Self::StartDictation => "qa_lab_start_dictation",
            Self::FinishDictation => "qa_lab_finish_dictation",
            Self::CancelDictation => "qa_lab_cancel_dictation",
            Self::ShowLastDictationResult => "qa_lab_show_last_dictation_result",
            Self::ToggleMeeting => "qa_lab_toggle_meeting",
            Self::HoldPreviousNote => "qa_lab_hold_previous_note",
            Self::ReleasePreviousNote => "qa_lab_release_previous_note",
            Self::StartImportantMoment => "qa_lab_start_important_moment",
            Self::SaveImportantMoment => "qa_lab_save_important_moment",
            Self::StopEverything => "qa_lab_stop_everything",
            Self::OpenEvidenceFolder => "qa_lab_open_evidence_folder",
        }
    }

    fn from_id(id: &str) -> Option<Self> {
        Some(match id {
            "qa_lab_start_dictation" => Self::StartDictation,
            "qa_lab_finish_dictation" => Self::FinishDictation,
            "qa_lab_cancel_dictation" => Self::CancelDictation,
            "qa_lab_show_last_dictation_result" => Self::ShowLastDictationResult,
            "qa_lab_toggle_meeting" => Self::ToggleMeeting,
            "qa_lab_hold_previous_note" => Self::HoldPreviousNote,
            "qa_lab_release_previous_note" => Self::ReleasePreviousNote,
            "qa_lab_start_important_moment" => Self::StartImportantMoment,
            "qa_lab_save_important_moment" => Self::SaveImportantMoment,
            "qa_lab_stop_everything" => Self::StopEverything,
            "qa_lab_open_evidence_folder" => Self::OpenEvidenceFolder,
            _ => return None,
        })
    }
}

pub(crate) fn build_submenu(app: &AppHandle<AppRuntime>) -> tauri::Result<Submenu<AppRuntime>> {
    let state = app.state::<AppState>();
    let dictation_active = state.pill().is_recording();
    let meeting_active = state.meeting_capture().is_active();
    let meeting_recording =
        state.meeting_capture().state().phase == crate::library::MeetingCapturePhase::Recording;

    let start_dictation = MenuItem::with_id(
        app,
        QaAction::StartDictation.id(),
        "Start Real Dictation",
        !dictation_active && !meeting_active,
        None::<&str>,
    )?;
    let finish_dictation = MenuItem::with_id(
        app,
        QaAction::FinishDictation.id(),
        "Finish Dictation",
        dictation_active,
        None::<&str>,
    )?;
    let cancel_dictation = MenuItem::with_id(
        app,
        QaAction::CancelDictation.id(),
        "Cancel Dictation",
        dictation_active,
        None::<&str>,
    )?;
    let show_last_dictation_result = MenuItem::with_id(
        app,
        QaAction::ShowLastDictationResult.id(),
        "Show Last Dictation Result",
        !dictation_active && !meeting_active,
        None::<&str>,
    )?;
    let toggle_meeting = MenuItem::with_id(
        app,
        QaAction::ToggleMeeting.id(),
        if meeting_active {
            "Stop Real Meeting"
        } else {
            "Start Real Meeting"
        },
        !dictation_active,
        None::<&str>,
    )?;
    let hold_previous = MenuItem::with_id(
        app,
        QaAction::HoldPreviousNote.id(),
        "Hold Previous Note (10/15/20…)",
        meeting_recording,
        None::<&str>,
    )?;
    let release_previous = MenuItem::with_id(
        app,
        QaAction::ReleasePreviousNote.id(),
        "Release & Save Previous Note",
        meeting_recording,
        None::<&str>,
    )?;
    let start_important = MenuItem::with_id(
        app,
        QaAction::StartImportantMoment.id(),
        "Start Important Moment",
        meeting_recording,
        None::<&str>,
    )?;
    let save_important = MenuItem::with_id(
        app,
        QaAction::SaveImportantMoment.id(),
        "Save Important Moment",
        meeting_recording,
        None::<&str>,
    )?;
    let stop_everything = MenuItem::with_id(
        app,
        QaAction::StopEverything.id(),
        "Stop Everything",
        dictation_active || meeting_active,
        None::<&str>,
    )?;
    let open_evidence = MenuItem::with_id(
        app,
        QaAction::OpenEvidenceFolder.id(),
        "Open QA Evidence Folder",
        true,
        None::<&str>,
    )?;

    SubmenuBuilder::new(app, "QA Lab · Debug")
        .item(&start_dictation)
        .item(&finish_dictation)
        .item(&cancel_dictation)
        .item(&show_last_dictation_result)
        .separator()
        .item(&toggle_meeting)
        .item(&hold_previous)
        .item(&release_previous)
        .item(&start_important)
        .item(&save_important)
        .separator()
        .item(&stop_everything)
        .item(&open_evidence)
        .build()
}

pub(crate) fn handle_menu_event(app: &AppHandle<AppRuntime>, id: &str) -> bool {
    if !id.starts_with(MENU_PREFIX) {
        return false;
    }
    let Some(action) = QaAction::from_id(id) else {
        tracing::warn!("Unknown QA Lab menu action: {id}");
        return true;
    };

    record_snapshot(app, action, "before", None);
    let result = run_action(app, action);
    record_snapshot(
        app,
        action,
        "after",
        result.as_ref().err().map(String::as_str),
    );
    if let Err(message) = result {
        crate::toast::show(app, "error", Some("QA Lab"), &message);
    }

    if matches!(action, QaAction::ToggleMeeting | QaAction::StopEverything) {
        let settled_app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(2));
            record_snapshot(&settled_app, action, "settled", None);
        });
    }
    true
}

fn run_action(app: &AppHandle<AppRuntime>, action: QaAction) -> Result<(), String> {
    let state = app.state::<AppState>();
    match action {
        QaAction::StartDictation => crate::pill::start_qa_dictation(app),
        QaAction::FinishDictation => crate::pill::finish_recording(app.clone()),
        QaAction::CancelDictation => {
            crate::stop_active_recording(app);
            Ok(())
        }
        QaAction::ShowLastDictationResult => crate::transcribe::show_last_result_for_qa(app),
        QaAction::ToggleMeeting => {
            crate::library::meeting_commands::toggle_meeting_from_menu(app);
            Ok(())
        }
        QaAction::HoldPreviousNote => state
            .meeting_capture()
            .handle_note_press(app, &state)
            .map(|_| ()),
        QaAction::ReleasePreviousNote => state
            .meeting_capture()
            .handle_note_release(app, &state)
            .map(|_| ()),
        QaAction::StartImportantMoment => {
            state.meeting_capture().handle_note_press(app, &state)?;
            state.meeting_capture().handle_note_release(app, &state)?;
            state.meeting_capture().handle_note_press(app, &state)?;
            state.meeting_capture().handle_note_release(app, &state)?;
            Ok(())
        }
        QaAction::SaveImportantMoment => {
            state.meeting_capture().handle_note_press(app, &state)?;
            state.meeting_capture().handle_note_release(app, &state)?;
            Ok(())
        }
        QaAction::StopEverything => {
            if state.pill().is_recording() {
                crate::stop_active_recording(app);
            }
            if state.meeting_capture().is_active() {
                let task_app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let task_state = task_app.state::<AppState>();
                    if let Err(message) = task_state
                        .meeting_capture()
                        .stop(&task_app, &task_state)
                        .await
                    {
                        crate::toast::show(&task_app, "error", Some("QA Lab"), &message);
                    }
                });
            }
            Ok(())
        }
        QaAction::OpenEvidenceFolder => {
            let dir = evidence_dir(app)?;
            std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
            app.opener()
                .open_path(dir.to_string_lossy(), None::<&str>)
                .map_err(|error| error.to_string())
        }
    }
}

#[derive(Serialize)]
struct QaSnapshot {
    timestamp: String,
    action: String,
    stage: String,
    error: Option<String>,
    pill_status: String,
    dictation_recording: bool,
    meeting: crate::library::MeetingCaptureState,
}

fn record_snapshot(
    app: &AppHandle<AppRuntime>,
    action: QaAction,
    stage: &str,
    error: Option<&str>,
) {
    let state = app.state::<AppState>();
    let snapshot = QaSnapshot {
        timestamp: chrono::Utc::now().to_rfc3339(),
        action: format!("{action:?}"),
        stage: stage.to_string(),
        error: error.map(str::to_string),
        pill_status: state.pill().status().to_string(),
        dictation_recording: state.pill().is_recording(),
        meeting: state.meeting_capture().state(),
    };

    let Ok(dir) = evidence_dir(app) else {
        return;
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let Ok(line) = serde_json::to_string(&snapshot) else {
        return;
    };
    let path = dir.join("qa-lab-events.jsonl");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

fn evidence_dir(app: &AppHandle<AppRuntime>) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_log_dir()
        .map(|dir| dir.join("qa-lab"))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_qa_action_round_trips_through_its_menu_id() {
        let actions = [
            QaAction::StartDictation,
            QaAction::FinishDictation,
            QaAction::CancelDictation,
            QaAction::ShowLastDictationResult,
            QaAction::ToggleMeeting,
            QaAction::HoldPreviousNote,
            QaAction::ReleasePreviousNote,
            QaAction::StartImportantMoment,
            QaAction::SaveImportantMoment,
            QaAction::StopEverything,
            QaAction::OpenEvidenceFolder,
        ];

        for action in actions {
            assert_eq!(QaAction::from_id(action.id()), Some(action));
        }
        assert_eq!(QaAction::from_id("qa_lab_unknown"), None);
    }
}
