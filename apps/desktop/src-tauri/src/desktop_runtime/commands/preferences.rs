use tauri::{AppHandle, Manager};

use super::super::contracts::AppRuntime;
use super::super::state::AppState;
use crate::settings::UserSettings;
use crate::{core, license, markdown_mirror, meeting_awareness, pill, tray};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DictationStats {
    total_words: u64,
    total_duration_ms: u64,
    total_dictations: u64,
}

#[tauri::command]
pub(crate) fn get_settings(state: tauri::State<AppState>) -> Result<UserSettings, String> {
    Ok(state.current_settings())
}

#[tauri::command]
pub(crate) fn get_calendar_access_status() -> meeting_awareness::CalendarAccessStatus {
    meeting_awareness::calendar_access_status()
}

#[tauri::command]
pub(crate) async fn request_calendar_access(
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let permission =
        tauri::async_runtime::spawn_blocking(meeting_awareness::request_calendar_access)
            .await
            .map_err(|failure| failure.to_string())?;
    if permission {
        state.meeting_awareness().request_refresh();
    }
    Ok(permission)
}

#[tauri::command]
pub(crate) async fn get_upcoming_calendar_meetings(
) -> Result<Vec<meeting_awareness::CalendarMeeting>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        meeting_awareness::upcoming_calendar_meetings(chrono::Utc::now())
    })
    .await
    .map_err(|failure| failure.to_string())?
}

#[tauri::command]
pub(crate) fn get_meeting_awareness_state(
    state: tauri::State<AppState>,
) -> meeting_awareness::MeetingAwarenessState {
    state.meeting_awareness().state()
}

#[tauri::command]
pub(crate) fn dismiss_meeting_awareness(
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) {
    state.meeting_awareness().dismiss(&app);
}

/// La tarjeta se retira sola pasado su tiempo de vida; esto es "nunca más"
/// para la fuente que la originó. Calendario y actividad de micrófono tienen
/// controles independientes y uno no puede apagar el otro.
#[tauri::command]
pub(crate) fn disable_meeting_awareness_notifications(
    source: meeting_awareness::MeetingAwarenessSource,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let (_, next) = state
        .persist_settings_with(|_, settings| {
            disable_awareness_source(settings, source);
        })
        .map_err(|failure| failure.to_string())?;
    state.meeting_awareness().dismiss(&app);
    state.meeting_awareness().request_refresh();
    state.emit_settings_changed(&app, &next);
    tray::refresh_tray_menu(&app, &next).map_err(|failure| failure.to_string())?;
    #[cfg(target_os = "macos")]
    crate::set_app_menu(&app, &next).map_err(|failure| failure.to_string())?;
    Ok(())
}

fn disable_awareness_source(
    settings: &mut UserSettings,
    source: meeting_awareness::MeetingAwarenessSource,
) {
    match source {
        meeting_awareness::MeetingAwarenessSource::Calendar => {
            settings.calendar_meeting_awareness_enabled = false;
        }
        meeting_awareness::MeetingAwarenessSource::Microphone => {
            settings.microphone_meeting_awareness_enabled = false;
        }
    }
}

#[tauri::command]
pub(crate) fn open_meeting_notification_settings(
    app: AppHandle<AppRuntime>,
) -> Result<(), String> {
    tray::open_settings_calendar(&app).map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) fn mirror_confirmed_meeting_output(
    output_id: String,
    meeting_id: String,
    content: String,
    state: tauri::State<AppState>,
) -> Result<Option<String>, String> {
    markdown_mirror::mirror_confirmed_meeting_output(
        &state.current_settings_unmasked(),
        &output_id,
        &meeting_id,
        &content,
    )
    .map(|path| path.map(|value| value.to_string_lossy().into_owned()))
    .map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) fn set_shortcut_capture_active(
    active: bool,
    app: AppHandle<AppRuntime>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    state.set_shortcut_capture_active(active);
    if !active {
        return restore_recording_shortcuts(&app).map_err(|failure| failure.to_string());
    }
    state.hotkeys.stop_registration();
    if let Err(failure) = state.hotkeys.start_capture(&app) {
        state.set_shortcut_capture_active(false);
        if let Err(restore_failure) = pill::register_shortcuts(&app) {
            tracing::error!(
                "Failed to restore shortcuts after capture start error: {restore_failure}"
            );
        }
        return Err(failure.to_string());
    }
    Ok(())
}

pub(crate) fn restore_recording_shortcuts(app: &AppHandle<AppRuntime>) -> anyhow::Result<()> {
    let state = app.state::<AppState>();
    state.set_shortcut_capture_active(false);
    state.hotkeys.stop_capture();
    pill::register_shortcuts(app)
}

#[tauri::command]
pub(crate) fn retry_shortcuts(app: AppHandle<AppRuntime>) -> Result<(), String> {
    pill::register_shortcuts(&app).map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) fn complete_onboarding(
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    core::settings::complete_onboarding(&app, &state)
}

#[tauri::command]
pub(crate) fn reset_onboarding(
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    core::settings::reset_onboarding(&app, &state)
}

#[tauri::command]
pub(crate) fn update_settings(
    args: core::settings::UpdateSettingsArgs,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<UserSettings, String> {
    core::settings::update_settings(args, &app, &state)
}

#[tauri::command]
pub(crate) fn set_dictation_language(
    language: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<UserSettings, String> {
    let selected = language.trim().to_owned();
    let (_, saved) = state
        .persist_settings_with(|_, candidate| candidate.language = selected)
        .map_err(|failure| failure.to_string())?;
    state.emit_settings_changed(&app, &saved);
    Ok(state.settings_for_response(saved))
}

#[tauri::command]
pub(crate) fn get_license_state(
    state: tauri::State<AppState>,
) -> Result<license::LicenseState, String> {
    license::get_license_state(&state.settings_store)
}

#[tauri::command]
pub(crate) async fn activate_license(
    state: tauri::State<'_, AppState>,
    args: license::ActivateLicenseArgs,
) -> Result<license::LicenseState, String> {
    license::activate_license(state.http(), &state.settings_store, args).await
}

#[tauri::command]
pub(crate) async fn refresh_license(
    state: tauri::State<'_, AppState>,
) -> Result<license::LicenseState, String> {
    license::refresh_license(state.http(), &state.settings_store).await
}

#[tauri::command]
pub(crate) async fn deactivate_license(
    state: tauri::State<'_, AppState>,
) -> Result<license::LicenseState, String> {
    license::deactivate_license(state.http(), &state.settings_store).await
}

#[tauri::command]
pub(crate) fn get_dictation_stats(state: tauri::State<AppState>) -> Result<DictationStats, String> {
    state
        .storage()
        .lifetime_stats()
        .map(|stats| DictationStats {
            total_words: stats.words,
            total_duration_ms: stats.duration_ms,
            total_dictations: stats.dictations,
        })
        .map_err(|failure| failure.to_string())
}

pub(crate) fn refresh_native_menus(app: &AppHandle<AppRuntime>, settings: &UserSettings) {
    #[cfg(target_os = "macos")]
    if let Err(failure) = super::super::bootstrap::set_app_menu(app, settings) {
        tracing::error!("Failed to refresh app menu: {failure}");
    }
    if let Err(failure) = crate::tray::refresh_tray_menu(app, settings) {
        tracing::error!("Failed to refresh tray menu: {failure}");
    }
}

#[cfg(test)]
mod tests {
    use super::{disable_awareness_source, DictationStats};
    use crate::meeting_awareness::MeetingAwarenessSource;
    use crate::settings::UserSettings;

    #[test]
    fn stats_payload_keeps_the_frontend_field_names() {
        let encoded = serde_json::to_value(DictationStats {
            total_words: 12,
            total_duration_ms: 34,
            total_dictations: 5,
        })
        .unwrap();
        assert_eq!(encoded["totalWords"], 12);
        assert_eq!(encoded["totalDurationMs"], 34);
        assert_eq!(encoded["totalDictations"], 5);
    }

    #[test]
    fn meeting_opt_out_disables_only_the_selected_source() {
        let mut settings = UserSettings {
            calendar_meeting_awareness_enabled: true,
            microphone_meeting_awareness_enabled: true,
            ..UserSettings::default()
        };

        disable_awareness_source(&mut settings, MeetingAwarenessSource::Calendar);
        assert!(!settings.calendar_meeting_awareness_enabled);
        assert!(settings.microphone_meeting_awareness_enabled);

        settings.calendar_meeting_awareness_enabled = true;
        disable_awareness_source(&mut settings, MeetingAwarenessSource::Microphone);
        assert!(settings.calendar_meeting_awareness_enabled);
        assert!(!settings.microphone_meeting_awareness_enabled);
    }
}
