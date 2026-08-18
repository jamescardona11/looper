use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::meeting_awareness::MeetingAwarenessPhase;
use crate::pill::PillStatus;
use crate::{AppRuntime, AppState};

use super::types::{
    MeetingCalendarContext, MeetingCaptureState, MeetingDetails, MeetingNotesUpdate,
    MeetingStartOptions, EVENT_MEETING_DETAILS_CHANGED,
};

pub(crate) const MENU_ID_MEETING_TOGGLE: &str = "menu_meeting_toggle";

pub(crate) fn join_calendar_meeting_from_menu(app: &AppHandle<AppRuntime>, event_id: &str) {
    let Some(meeting) = app
        .state::<AppState>()
        .meeting_awareness()
        .meeting_by_id(event_id)
    else {
        crate::toast::show(
            app,
            "error",
            Some("Calendar meeting"),
            "This meeting is no longer in your upcoming agenda.",
        );
        return;
    };
    let Some(meeting_url) = meeting.meeting_url.as_deref() else {
        return;
    };

    if let Err(error) = app.opener().open_url(meeting_url, None::<&str>) {
        crate::toast::show(
            app,
            "error",
            Some("Calendar meeting"),
            &format!("Could not open the meeting link: {error}"),
        );
        return;
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        if let Err(message) = start_calendar_meeting(&app, &state, meeting).await {
            crate::toast::show(&app, "error", Some("Meeting recording"), &message);
        }
    });
}

pub(crate) fn meeting_toggle_label(state: &AppState) -> &'static str {
    if state.meeting_capture().is_active() {
        "Stop Meeting Recording"
    } else {
        "Record Meeting"
    }
}

pub(crate) fn toggle_meeting_from_menu(app: &AppHandle<AppRuntime>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let result = if state.meeting_capture().is_active() {
            state.meeting_capture().stop(&app, &state).await.map(|_| ())
        } else {
            if let Err(message) = require_meeting_license(&state) {
                crate::toast::show(&app, "error", Some("Meeting recording"), &message);
                return;
            }
            let settings = state.current_settings_unmasked();
            let model_key = match default_meeting_model(&app, &settings) {
                Ok(model_key) => model_key,
                Err(message) => {
                    crate::toast::show(&app, "error", Some("Meeting recording"), &message);
                    return;
                }
            };
            let live_model_key = default_live_meeting_model(&app, &settings);
            state
                .meeting_capture()
                .start(
                    &app,
                    &state,
                    MeetingStartOptions {
                        model_key,
                        live_model_key,
                        system_audio_enabled: true,
                        calendar_context: None,
                    },
                )
                .await
                .map(|_| ())
        };
        if let Err(message) = result {
            crate::toast::show(&app, "error", Some("Meeting recording"), &message);
        }
    });
}

fn default_live_meeting_model(
    app: &AppHandle<AppRuntime>,
    settings: &crate::settings::UserSettings,
) -> Option<String> {
    let models = crate::speech::list_models(app, settings);
    select_default_live_meeting_model(&models)
}

fn select_default_live_meeting_model(models: &[crate::speech::SpeechModel]) -> Option<String> {
    models
        .iter()
        .find(|model| {
            model.installed
                && !model.remote
                && model.engine_id == "nvidia"
                && model.capabilities.iter().any(|capability| {
                    capability == crate::model_manager::MODEL_CAPABILITY_TIMESTAMPS
                })
        })
        .map(|model| model.id.clone())
}

pub(crate) fn default_meeting_model(
    app: &AppHandle<AppRuntime>,
    settings: &crate::settings::UserSettings,
) -> Result<String, String> {
    let models = crate::speech::list_models(app, settings);
    select_default_meeting_model(&models, &settings.local_model).ok_or_else(|| {
        "Install a local transcription model or configure a remote speech provider before recording a meeting."
            .to_string()
    })
}

fn select_default_meeting_model(
    models: &[crate::speech::SpeechModel],
    local_model: &str,
) -> Option<String> {
    models
        .iter()
        .find(|model| {
            model.installed
                && !model.remote
                && model.key == local_model
                && model.capabilities.iter().any(|capability| {
                    capability == crate::model_manager::MODEL_CAPABILITY_TIMESTAMPS
                })
        })
        .or_else(|| {
            models.iter().find(|model| {
                model.installed
                    && !model.remote
                    && model.capabilities.iter().any(|capability| {
                        capability == crate::model_manager::MODEL_CAPABILITY_TIMESTAMPS
                    })
            })
        })
        .or_else(|| models.iter().find(|model| model.installed && model.remote))
        .map(|model| model.id.clone())
}

pub(crate) fn require_meeting_license(state: &AppState) -> Result<(), String> {
    crate::license::require_license_gate(&state.settings_store, "Meeting recording")
}

#[tauri::command]
pub async fn start_meeting_capture(
    options: MeetingStartOptions,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<MeetingCaptureState, String> {
    require_meeting_license(&state)?;
    state.meeting_capture().start(&app, &state, options).await
}

#[tauri::command]
pub async fn start_note_from_dock(
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<MeetingCaptureState, String> {
    if state.meeting_capture().is_active() {
        return Err("A note or meeting recording is already active.".to_string());
    }
    if state.pill().is_recording()
        || !matches!(
            state.pill().status(),
            PillStatus::Idle | PillStatus::Preflight
        )
    {
        return Err("Finish the current Dictation before starting a note.".to_string());
    }

    require_meeting_license(&state)?;
    let settings = state.current_settings_unmasked();
    state
        .meeting_capture()
        .start_voice_note(&app, &state, default_meeting_model(&app, &settings)?)
        .await
}

/// El aviso llega por dos caminos: un evento del calendario o un micrófono que
/// abrió otra aplicación. Exigir evento aquí rompía el segundo, que es
/// precisamente el que no tiene ninguno: el botón fallaba con "The calendar
/// meeting is no longer available" sobre una llamada que sí se podía grabar.
#[tauri::command]
pub async fn start_prompted_meeting_capture(
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<MeetingCaptureState, String> {
    let awareness = state.meeting_awareness().state();
    match awareness.meeting {
        Some(meeting) => start_calendar_meeting(&app, &state, meeting).await,
        None if awareness.phase == MeetingAwarenessPhase::Detected => {
            start_unscheduled_meeting(&app, &state).await
        }
        None => Err("The meeting prompt is no longer available.".to_string()),
    }
}

async fn start_unscheduled_meeting(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
) -> Result<MeetingCaptureState, String> {
    require_meeting_license(state)?;
    let settings = state.current_settings_unmasked();
    let capture = state
        .meeting_capture()
        .start(
            app,
            state,
            MeetingStartOptions {
                model_key: default_meeting_model(app, &settings)?,
                live_model_key: default_live_meeting_model(app, &settings),
                system_audio_enabled: true,
                calendar_context: None,
            },
        )
        .await?;
    state.meeting_awareness().dismiss(app);
    Ok(capture)
}

async fn start_calendar_meeting(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    meeting: crate::meeting_awareness::CalendarMeeting,
) -> Result<MeetingCaptureState, String> {
    require_meeting_license(state)?;
    let settings = state.current_settings_unmasked();
    let event_id = meeting.id.clone();
    let context = MeetingCalendarContext {
        provider: "apple".to_string(),
        event_id: meeting.id,
        external_id: meeting.external_id,
        calendar_id: meeting.calendar_id,
        series_id: meeting.series_id,
        occurrence_id: meeting.occurrence_id,
        title: meeting.title,
        meeting_url: meeting.meeting_url,
        scheduled_start: meeting.started_at,
        scheduled_end: meeting.ended_at,
        organizer: meeting.organizer,
        attendee_count: meeting.attendee_count,
    };
    let capture = state
        .meeting_capture()
        .start(
            app,
            state,
            MeetingStartOptions {
                model_key: default_meeting_model(app, &settings)?,
                live_model_key: default_live_meeting_model(app, &settings),
                system_audio_enabled: true,
                calendar_context: Some(context),
            },
        )
        .await?;
    state.meeting_awareness().dismiss_event(app, &event_id);
    Ok(capture)
}

#[tauri::command]
pub async fn stop_meeting_capture(
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<MeetingCaptureState, String> {
    state.meeting_capture().stop(&app, &state).await
}

#[tauri::command]
pub fn continue_meeting_after_silence(
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<MeetingCaptureState, String> {
    state.meeting_capture().continue_after_silence(&app)
}

#[tauri::command]
pub fn get_meeting_capture_state(state: tauri::State<'_, AppState>) -> MeetingCaptureState {
    state.meeting_capture().state()
}

#[tauri::command]
pub fn capture_meeting_note(
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<super::types::MeetingNoteMarker, String> {
    require_meeting_license(&state)?;
    state.meeting_capture().capture_note(&app, &state)
}

#[tauri::command]
pub fn get_meeting_details(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<MeetingDetails, String> {
    state
        .storage()
        .get_meeting_details(&id)
        .map_err(|err| format!("Failed to load meeting details: {err}"))?
        .ok_or_else(|| "Meeting details not found".to_string())
}

#[tauri::command]
pub fn update_meeting_notes(
    id: String,
    update: MeetingNotesUpdate,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<MeetingDetails, String> {
    require_meeting_license(&state)?;
    let details = state
        .storage()
        .update_meeting_notes(&id, update)
        .map_err(|err| format!("Failed to update meeting notes: {err}"))?
        .ok_or_else(|| "Meeting details not found".to_string())?;
    if let Err(err) = crate::markdown_mirror::mirror_library_by_id(
        &state.current_settings_unmasked(),
        &state.storage(),
        &id,
    ) {
        tracing::warn!("Failed to update Markdown mirror for meeting notes: {err}");
    }
    let _ = app.emit(EVENT_MEETING_DETAILS_CHANGED, &details);
    Ok(details)
}

#[tauri::command]
pub fn generate_meeting_summary(
    id: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<Option<MeetingDetails>, String> {
    require_meeting_license(&state)?;
    if !crate::llm_cleanup::is_meeting_ai_available(&app, &state.current_settings_unmasked()) {
        return Err(
            "Meeting intelligence is not ready. Download or configure it in Settings -> Providers."
                .to_string(),
        );
    }
    super::meeting_summary::schedule_meeting_summary(&app, id)
}

#[tauri::command]
pub async fn ask_meeting(
    id: String,
    question: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    require_meeting_license(&state)?;
    let question = question.trim();
    if question.is_empty() {
        return Err("Write a question about this meeting.".to_string());
    }
    let settings = state.current_settings_unmasked();
    if !crate::llm_cleanup::is_meeting_ai_available(&app, &settings) {
        return Err(
            "Meeting intelligence is not ready. Download or configure it in Settings -> Providers."
                .to_string(),
        );
    }
    let item = state
        .storage()
        .get_library_item(&id)
        .map_err(|error| format!("Failed to load meeting: {error}"))?
        .filter(|item| item.kind == "meeting")
        .ok_or_else(|| "Meeting not found".to_string())?;
    let details = state
        .storage()
        .get_meeting_details(&id)
        .map_err(|error| format!("Failed to load meeting details: {error}"))?
        .ok_or_else(|| "Meeting details not found".to_string())?;
    let max_context_chars = if settings.meeting_ai_provider == "local" {
        36_000
    } else {
        MAX_QUESTION_CONTEXT_CHARS
    };
    let context = select_meeting_context(
        question,
        item.transcript.as_deref().unwrap_or_default(),
        item.segments.as_deref(),
        &details.live_transcript,
        max_context_chars,
    );

    crate::llm_cleanup::answer_meeting_question(
        &app,
        &state.http(),
        question,
        &item.name,
        &details.notes,
        details.summary.as_deref(),
        &context,
        &settings,
    )
    .await
    .map_err(|error| crate::llm_cleanup::llm_issue_message(&error))
}

const MAX_QUESTION_CONTEXT_SEGMENTS: usize = 80;
const MAX_QUESTION_CONTEXT_CHARS: usize = 60_000;

fn select_meeting_context(
    question: &str,
    transcript: &str,
    segments: Option<&[super::types::TranscriptSegment]>,
    live_transcript: &[super::types::MeetingTranscriptSegment],
    max_context_chars: usize,
) -> String {
    let mut context_segments = segments.unwrap_or_default().to_vec();
    context_segments.extend(live_transcript.iter().map(|segment| {
        super::types::TranscriptSegment {
            start_ms: segment.start_ms,
            end_ms: segment.end_ms,
            text: format!("{}: {}", segment.source.as_str(), segment.text.trim()),
            speaker_id: None,
        }
    }));
    context_segments.sort_by_key(|segment| (segment.start_ms, segment.end_ms));

    if context_segments.is_empty() {
        return transcript.chars().take(max_context_chars).collect();
    }
    let segments = context_segments.as_slice();
    let terms = question
        .split(|character: char| !character.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|term| term.chars().count() >= 3)
        .collect::<Vec<_>>();
    let mut ranked = segments
        .iter()
        .enumerate()
        .map(|(index, segment)| {
            let text = segment.text.to_lowercase();
            let score = terms
                .iter()
                .filter(|term| text.contains(term.as_str()))
                .count();
            (score, index, segment)
        })
        .collect::<Vec<_>>();
    ranked.sort_by_key(|(score, index, _)| (std::cmp::Reverse(*score), *index));
    let has_matches = ranked.first().is_some_and(|(score, _, _)| *score > 0);
    if has_matches {
        ranked.retain(|(score, _, _)| *score > 0);
    }
    ranked.truncate(MAX_QUESTION_CONTEXT_SEGMENTS);
    let selected_indexes = if has_matches {
        ranked
            .iter()
            .flat_map(|(_, index, _)| [index.saturating_sub(1), *index, index.saturating_add(1)])
            .filter(|index| *index < segments.len())
            .collect::<std::collections::BTreeSet<_>>()
    } else {
        ranked
            .iter()
            .map(|(_, index, _)| *index)
            .collect::<std::collections::BTreeSet<_>>()
    };

    let mut context = String::new();
    for index in selected_indexes {
        let segment = &segments[index];
        let line = format!(
            "[{}–{}] {}\n",
            format_meeting_timestamp(segment.start_ms),
            format_meeting_timestamp(segment.end_ms),
            segment.text.trim()
        );
        if context.chars().count() + line.chars().count() > max_context_chars {
            break;
        }
        context.push_str(&line);
    }
    context
}

fn format_meeting_timestamp(milliseconds: u64) -> String {
    let seconds = milliseconds / 1_000;
    format!("{:02}:{:02}", seconds / 60, seconds % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model(id: &str, remote: bool, installed: bool) -> crate::speech::SpeechModel {
        crate::speech::SpeechModel {
            id: id.to_string(),
            key: id.to_string(),
            label: id.to_string(),
            description: String::new(),
            size_mb: 0.0,
            engine_id: String::new(),
            variant: String::new(),
            tags: Vec::new(),
            capabilities: (!remote)
                .then(|| vec![crate::model_manager::MODEL_CAPABILITY_TIMESTAMPS.to_string()])
                .unwrap_or_default(),
            supported_languages: Vec::new(),
            remote,
            installed,
        }
    }

    fn parakeet(id: &str, installed: bool) -> crate::speech::SpeechModel {
        let mut model = model(id, false, installed);
        model.engine_id = "nvidia".to_string();
        model
    }

    #[test]
    fn menu_prefers_selected_local_model_without_silent_remote_upload() {
        let models = vec![
            model("remote:provider:model", true, true),
            model("local-fallback", false, true),
            model("local-selected", false, true),
        ];

        assert_eq!(
            select_default_meeting_model(&models, "local-selected").as_deref(),
            Some("local-selected")
        );
    }

    #[test]
    fn menu_uses_remote_only_when_no_local_model_is_installed() {
        let models = vec![
            model("local-selected", false, false),
            model("remote:provider:model", true, true),
        ];

        assert_eq!(
            select_default_meeting_model(&models, "local-selected").as_deref(),
            Some("remote:provider:model")
        );
    }

    #[test]
    fn menu_skips_local_models_without_timestamps() {
        let mut cohere = model("cohere", false, true);
        cohere.capabilities.clear();
        let models = vec![cohere, model("parakeet", false, true)];

        assert_eq!(
            select_default_meeting_model(&models, "cohere").as_deref(),
            Some("parakeet")
        );
    }

    #[test]
    fn menu_enables_live_transcript_only_with_installed_parakeet() {
        let models = vec![
            model("remote:provider:model", true, true),
            model("cohere", false, true),
            parakeet("parakeet_tdt_int8", true),
        ];

        assert_eq!(
            select_default_live_meeting_model(&models).as_deref(),
            Some("parakeet_tdt_int8")
        );
    }

    #[test]
    fn menu_does_not_enable_live_transcript_without_parakeet() {
        let models = vec![
            model("remote:provider:model", true, true),
            model("cohere", false, true),
            parakeet("parakeet_tdt_int8", false),
        ];

        assert!(select_default_live_meeting_model(&models).is_none());
    }

    #[test]
    fn meeting_question_context_keeps_matches_with_neighboring_timestamps() {
        let segments = vec![
            super::super::types::TranscriptSegment {
                start_ms: 0,
                end_ms: 5_000,
                text: "We need a launch decision.".to_string(),
                speaker_id: None,
            },
            super::super::types::TranscriptSegment {
                start_ms: 5_000,
                end_ms: 10_000,
                text: "Ship on Friday.".to_string(),
                speaker_id: None,
            },
            super::super::types::TranscriptSegment {
                start_ms: 10_000,
                end_ms: 15_000,
                text: "The owner is Alex.".to_string(),
                speaker_id: None,
            },
            super::super::types::TranscriptSegment {
                start_ms: 15_000,
                end_ms: 20_000,
                text: "Unrelated discussion.".to_string(),
                speaker_id: None,
            },
        ];

        let context = select_meeting_context(
            "When do we ship?",
            "",
            Some(&segments),
            &[],
            MAX_QUESTION_CONTEXT_CHARS,
        );

        assert!(context.contains("[00:00–00:05]"));
        assert!(context.contains("[00:05–00:10] Ship on Friday."));
        assert!(context.contains("[00:10–00:15]"));
        assert!(!context.contains("Unrelated discussion"));
    }

    #[test]
    fn meeting_question_context_includes_persisted_live_segments() {
        let live = vec![super::super::types::MeetingTranscriptSegment {
            id: "live-1".to_string(),
            source: super::super::types::MeetingTranscriptSource::Them,
            text: "The launch owner is Priya.".to_string(),
            start_ms: 30_000,
            end_ms: 35_000,
        }];

        let context = select_meeting_context(
            "Who owns the launch?",
            "",
            None,
            &live,
            MAX_QUESTION_CONTEXT_CHARS,
        );

        assert!(context.contains("[00:30–00:35] them: The launch owner is Priya."));
    }
}
