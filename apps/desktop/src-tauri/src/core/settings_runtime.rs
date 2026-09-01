use tauri::AppHandle;

use super::settings_input::{self, UpdateSettingsArgs, ValidatedSettingsUpdate};
use crate::{
    analytics, auto_dictionary, pill,
    settings::{canonicalize_app_locale_or_default, ShortcutBindings, UserSettings},
    tray, AppRuntime, AppState,
};

pub(crate) fn update(
    args: UpdateSettingsArgs,
    app: &AppHandle<AppRuntime>,
    state: &AppState,
) -> Result<UserSettings, String> {
    let request = settings_input::validate(args)?;
    enforce_access(&request, state)?;
    let launch = LaunchChange::prepare(&request, state, app)?;
    let active_license = crate::license::license_gate_active(&state.settings_store);
    let saved = persist_request(state, request, active_license);
    let (previous, current) = launch.resolve(saved, app)?;

    finalize_update(app, state, &previous, &current);
    Ok(state.settings_for_response(current))
}

fn enforce_access(request: &ValidatedSettingsUpdate, state: &AppState) -> Result<(), String> {
    if request.requires_license() {
        crate::license::require_license_gate(&state.settings_store, "AI writing and Edit Mode")?;
    }
    Ok(())
}

struct LaunchChange {
    previous: bool,
    requested: bool,
}

impl LaunchChange {
    fn prepare(
        request: &ValidatedSettingsUpdate,
        state: &AppState,
        app: &AppHandle<AppRuntime>,
    ) -> Result<Self, String> {
        let previous = state.current_settings_unmasked().auto_launch_enabled;
        let requested = request.requested_auto_launch();
        if previous != requested {
            crate::sync_launch_at_login(app, requested)?;
        }
        Ok(Self {
            previous,
            requested,
        })
    }

    fn resolve(
        self,
        saved: Result<(UserSettings, UserSettings), anyhow::Error>,
        app: &AppHandle<AppRuntime>,
    ) -> Result<(UserSettings, UserSettings), String> {
        match saved {
            Ok(pair) => Ok(pair),
            Err(error) if self.previous == self.requested => Err(error.to_string()),
            Err(error) => {
                if let Err(rollback) = crate::sync_launch_at_login(app, self.previous) {
                    return Err(format!(
                        "{} (also failed to roll back launch at login from {} back to {}: {})",
                        error, self.requested, self.previous, rollback
                    ));
                }
                Err(error.to_string())
            }
        }
    }
}

fn persist_request(
    state: &AppState,
    request: ValidatedSettingsUpdate,
    active_license: bool,
) -> Result<(UserSettings, UserSettings), anyhow::Error> {
    state.persist_settings_with(|previous, next| {
        apply_shortcuts(next, &request.args, request.shortcut_bindings);
        apply_transcription(next, &request.args);
        apply_intelligence(next, previous, &request.args, active_license);
        apply_product_preferences(next, &request.args);
    })
}

fn apply_shortcuts(next: &mut UserSettings, args: &UpdateSettingsArgs, bindings: ShortcutBindings) {
    next.shortcut_bindings = bindings;
    let primary = |entries: &[crate::settings::ShortcutBinding], fallback: &str| {
        entries
            .first()
            .map(|entry| entry.shortcut.clone())
            .unwrap_or_else(|| fallback.to_string())
    };
    next.smart_shortcut = primary(
        &next.shortcut_bindings.smart,
        &args.recording.smart_shortcut,
    );
    next.hold_shortcut = primary(&next.shortcut_bindings.hold, &args.recording.hold_shortcut);
    next.toggle_shortcut = primary(
        &next.shortcut_bindings.toggle,
        &args.recording.toggle_shortcut,
    );
    next.smart_enabled = args.recording.smart_enabled;
    next.hold_enabled = args.recording.hold_enabled;
    next.toggle_enabled = args.recording.toggle_enabled;
}

fn apply_transcription(next: &mut UserSettings, args: &UpdateSettingsArgs) {
    next.transcription_mode = args.speech.transcription_mode.clone();
    next.local_model.clone_from(&args.speech.local_model);
    next.remote_speech_enabled = args.speech.remote_speech_enabled;
    next.remote_speech_provider
        .clone_from(&args.speech.remote_speech_provider);
    next.remote_speech_endpoint = args.speech.remote_speech_endpoint.trim().to_string();
    next.remote_speech_api_key
        .clone_from(&args.speech.remote_speech_api_key);
    next.remote_speech_model = args.speech.remote_speech_model.trim().to_string();
    next.microphone_device
        .clone_from(&args.speech.microphone_device);
    next.language.clone_from(&args.speech.language);
    next.app_locale = canonicalize_app_locale_or_default(&args.speech.app_locale);
    next.theme_mode = args.speech.theme_mode;
}

fn apply_intelligence(
    next: &mut UserSettings,
    previous: &UserSettings,
    args: &UpdateSettingsArgs,
    active_license: bool,
) {
    if active_license {
        next.llm_enabled = args.intelligence.llm_enabled;
        next.cleanup_enabled = args.intelligence.cleanup_enabled;
        next.edit_mode_enabled = args.intelligence.edit_mode_enabled;
        next.meeting_ai_provider
            .clone_from(&args.intelligence.meeting_ai_provider);
        next.local_llm_model
            .clone_from(&args.intelligence.local_llm_model);
    } else {
        retain_cleanup_preferences(&mut next.shortcut_bindings, &previous.shortcut_bindings);
    }
    next.llm_provider
        .clone_from(&args.intelligence.llm_provider);
    next.llm_endpoint
        .clone_from(&args.intelligence.llm_endpoint);
    next.llm_api_key.clone_from(&args.intelligence.llm_api_key);
    next.llm_model = args.intelligence.llm_model.trim().to_string();
}

fn retain_cleanup_preferences(next: &mut ShortcutBindings, previous: &ShortcutBindings) {
    for (current, before) in [
        (&mut next.smart, &previous.smart),
        (&mut next.hold, &previous.hold),
        (&mut next.toggle, &previous.toggle),
    ] {
        for (entry, old_entry) in current.iter_mut().zip(before) {
            entry.cleanup_enabled = old_entry.cleanup_enabled;
        }
    }
}

fn apply_product_preferences(next: &mut UserSettings, args: &UpdateSettingsArgs) {
    next.auto_dictionary_enabled = args.product.auto_dictionary_enabled;
    next.preview_before_insert_enabled = args.product.preview_before_insert_enabled;
    next.preview_before_insert_selection_enabled =
        args.product.preview_before_insert_selection_enabled;
    next.use_screen_context = args.product.use_screen_context;
    next.media_action = args.product.media_action;
    next.auto_update_enabled = args.product.auto_update_enabled;
    next.auto_launch_enabled = args.product.auto_launch_enabled;
    next.start_in_background = args.product.auto_launch_enabled && args.product.start_in_background;
    next.calendar_meeting_awareness_enabled = args.product.calendar_meeting_awareness_enabled;
    next.microphone_meeting_awareness_enabled =
        args.product.microphone_meeting_awareness_enabled;
    next.auto_delete_target = args.product.auto_delete_target;
    next.auto_delete_duration = args.product.auto_delete_duration;
    next.audio_storage_budget_mb = args.product.audio_storage_budget_mb;
    next.hide_overlays_from_capture = args.product.hide_overlays_from_capture;
    next.markdown_mirror_enabled = args.product.markdown_mirror_enabled
        && !args.product.markdown_mirror_path.trim().is_empty();
    next.markdown_mirror_path = args.product.markdown_mirror_path.trim().to_string();
    next.analytics_enabled = args.product.analytics_enabled;
}

fn finalize_update(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    previous: &UserSettings,
    current: &UserSettings,
) {
    auto_dictionary::sync_ignored_dictionary_entries(&current.dictionary);
    state.request_preflight_refresh();
    refresh_meeting_awareness(state, previous, current);
    refresh_shortcuts_and_menus(app, previous, current);
    state.emit_settings_changed(app, current);
    apply_system_side_effects(app, previous, current);
    analytics::track_settings_changes(app, previous, current);
    refresh_analytics(app, previous, current);
    schedule_retention(app, previous, current);
}

fn refresh_meeting_awareness(state: &AppState, previous: &UserSettings, current: &UserSettings) {
    if previous.calendar_meeting_awareness_enabled != current.calendar_meeting_awareness_enabled
        || previous.microphone_meeting_awareness_enabled
            != current.microphone_meeting_awareness_enabled
    {
        state.meeting_awareness().request_refresh();
    }
}

fn refresh_shortcuts_and_menus(
    app: &AppHandle<AppRuntime>,
    previous: &UserSettings,
    current: &UserSettings,
) {
    if let Err(error) = pill::register_shortcuts(app) {
        tracing::warn!(
            "Settings were saved, but global shortcuts could not be registered: {error}"
        );
    }
    let should_refresh = previous.transcription_mode != current.transcription_mode
        || previous.local_model != current.local_model
        || previous.remote_speech_enabled != current.remote_speech_enabled
        || previous.remote_speech_provider != current.remote_speech_provider
        || previous.remote_speech_model != current.remote_speech_model
        || previous.microphone_device != current.microphone_device
        || previous.calendar_meeting_awareness_enabled
            != current.calendar_meeting_awareness_enabled
        || previous.microphone_meeting_awareness_enabled
            != current.microphone_meeting_awareness_enabled;
    if !should_refresh {
        return;
    }
    if let Err(error) = tray::refresh_tray_menu(app, current) {
        tracing::error!("Failed to refresh tray menu: {error}");
    }
    #[cfg(target_os = "macos")]
    if let Err(error) = crate::set_app_menu(app, current) {
        tracing::error!("Failed to refresh app menu: {error}");
    }
}

fn apply_system_side_effects(
    app: &AppHandle<AppRuntime>,
    previous: &UserSettings,
    current: &UserSettings,
) {
    if previous.hide_overlays_from_capture != current.hide_overlays_from_capture {
        crate::platform::overlay::sync_content_protection(app, current.hide_overlays_from_capture);
    }
}

fn refresh_analytics(app: &AppHandle<AppRuntime>, previous: &UserSettings, current: &UserSettings) {
    match (previous.analytics_enabled, current.analytics_enabled) {
        (true, false) => analytics::track_analytics_opt_out(app),
        (false, true) => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                analytics::init(&handle).await;
            });
        }
        _ => {}
    }
}

fn schedule_retention(
    app: &AppHandle<AppRuntime>,
    previous: &UserSettings,
    current: &UserSettings,
) {
    if crate::settings::auto_delete_recording_policy(previous)
        != crate::settings::auto_delete_recording_policy(current)
        || previous.audio_storage_budget_mb != current.audio_storage_budget_mb
    {
        crate::schedule_recording_prune(app.clone(), current.clone());
    }
    if crate::settings::auto_delete_transcription_policy(previous)
        != crate::settings::auto_delete_transcription_policy(current)
    {
        crate::schedule_transcription_prune(app.clone(), current.clone());
    }
}
