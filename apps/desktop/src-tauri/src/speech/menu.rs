use std::fmt;

use tauri::menu::{CheckMenuItemBuilder, MenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager};

use crate::settings::{TranscriptionMode, UserSettings};
use crate::speech::{self, catalog, install, remote};
use crate::{AppRuntime, AppState};

pub const MENU_ID_MODEL_PREFIX: &str = "menu_model_";
pub const MENU_ID_MODEL_STATUS_PREFIX: &str = "menu_model_status_";
const CLOUD_MODEL_KEY: &str = "cloud:looper";
const CLOUD_MODEL_LABEL: &str = "Looper Cloud (AssemblyAI)";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActiveSpeechMode<'a> {
    Cloud,
    Remote,
    Local(&'a str),
}

impl<'a> ActiveSpeechMode<'a> {
    fn resolve(settings: &'a UserSettings) -> Self {
        if settings.transcription_mode == TranscriptionMode::Cloud {
            Self::Cloud
        } else if remote::is_configured(settings) {
            Self::Remote
        } else {
            Self::Local(&settings.local_model)
        }
    }

    fn checks(self, model: &catalog::SpeechModel) -> bool {
        match (self, model.remote) {
            (Self::Remote, true) => true,
            (Self::Local(active), false) => active == model.key,
            _ => false,
        }
    }

    fn status_lines(self, settings: &UserSettings) -> Vec<String> {
        match self {
            Self::Cloud => vec![CLOUD_MODEL_LABEL.to_owned(), fallback_status(settings)],
            Self::Remote => vec![
                catalog::label(&speech::selected_model(settings)),
                fallback_status(settings),
            ],
            Self::Local(model) => vec![install::model_label(model)],
        }
    }
}

fn fallback_status(settings: &UserSettings) -> String {
    format!("Fallback: {}", install::model_label(&settings.local_model))
}

pub fn model_status_lines(settings: &UserSettings) -> Vec<String> {
    ActiveSpeechMode::resolve(settings).status_lines(settings)
}

pub fn build_model_status_items(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<Vec<MenuItem<AppRuntime>>> {
    model_status_lines(settings)
        .into_iter()
        .enumerate()
        .map(|(index, label)| {
            MenuItem::with_id(
                app,
                format!("{MENU_ID_MODEL_STATUS_PREFIX}{index}"),
                label,
                false,
                None::<&str>,
            )
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ModelChoice {
    id: String,
    label: String,
    checked: bool,
}

impl ModelChoice {
    fn cloud(active: ActiveSpeechMode<'_>) -> Self {
        Self {
            id: format!("{MENU_ID_MODEL_PREFIX}{CLOUD_MODEL_KEY}"),
            label: CLOUD_MODEL_LABEL.to_owned(),
            checked: active == ActiveSpeechMode::Cloud,
        }
    }

    fn speech(model: &catalog::SpeechModel, active: ActiveSpeechMode<'_>) -> Self {
        Self {
            id: format!("{MENU_ID_MODEL_PREFIX}{}", model.key),
            label: model.label.clone(),
            checked: active.checks(model),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ModelMenuRow {
    Choice(ModelChoice),
    Separator,
}

struct ModelMenuPlan {
    rows: Vec<ModelMenuRow>,
}

impl ModelMenuPlan {
    fn compose(models: &[catalog::SpeechModel], settings: &UserSettings) -> Self {
        let active = ActiveSpeechMode::resolve(settings);
        let remote_model = models
            .iter()
            .find(|model| model.remote)
            .cloned()
            .or_else(|| catalog::configured_remote_model(settings));
        let local_models = models
            .iter()
            .filter(|model| !model.remote && model.installed)
            .collect::<Vec<_>>();
        let mut rows = vec![ModelMenuRow::Choice(ModelChoice::cloud(active))];

        if remote_model.is_some() || !local_models.is_empty() {
            rows.push(ModelMenuRow::Separator);
        }
        if let Some(model) = remote_model.as_ref() {
            rows.push(ModelMenuRow::Choice(ModelChoice::speech(model, active)));
        }
        if remote_model.is_some() && !local_models.is_empty() {
            rows.push(ModelMenuRow::Separator);
        }
        rows.extend(
            local_models
                .into_iter()
                .map(|model| ModelMenuRow::Choice(ModelChoice::speech(model, active))),
        );

        Self { rows }
    }
}

pub fn build_models_submenu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<tauri::menu::Submenu<AppRuntime>> {
    let plan = ModelMenuPlan::compose(&catalog::list_models(app, settings), settings);
    let mut submenu = SubmenuBuilder::new(app, "Models");
    for row in plan.rows {
        match row {
            ModelMenuRow::Separator => submenu = submenu.separator(),
            ModelMenuRow::Choice(choice) => {
                let item = CheckMenuItemBuilder::with_id(choice.id, choice.label)
                    .checked(choice.checked)
                    .build(app)?;
                submenu = submenu.item(&item);
            }
        }
    }
    submenu.build()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SpeechMenuEvent<'a> {
    Cloud,
    Remote,
    Local(&'a str),
    Ignore,
}

impl<'a> SpeechMenuEvent<'a> {
    fn decode(id: &'a str) -> Self {
        if id.starts_with(MENU_ID_MODEL_STATUS_PREFIX) {
            return Self::Ignore;
        }
        let Some(model) = id.strip_prefix(MENU_ID_MODEL_PREFIX) else {
            return Self::Ignore;
        };
        if model == CLOUD_MODEL_KEY {
            Self::Cloud
        } else if remote::is_remote_model(model) {
            Self::Remote
        } else {
            Self::Local(model)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SelectionTransition {
    Changed,
    Unchanged,
    RemoteConfigurationRequired,
}

struct SettingsSelection<'a> {
    settings: &'a mut UserSettings,
}

impl<'a> SettingsSelection<'a> {
    fn new(settings: &'a mut UserSettings) -> Self {
        Self { settings }
    }

    fn select_cloud(&mut self) -> SelectionTransition {
        if self.settings.transcription_mode == TranscriptionMode::Cloud {
            return SelectionTransition::Unchanged;
        }
        self.settings.transcription_mode = TranscriptionMode::Cloud;
        SelectionTransition::Changed
    }

    fn toggle_remote(&mut self) -> SelectionTransition {
        let active = ActiveSpeechMode::resolve(self.settings) == ActiveSpeechMode::Remote;
        if !active && !remote::has_valid_config(self.settings) {
            return SelectionTransition::RemoteConfigurationRequired;
        }
        self.settings.remote_speech_enabled = !active;
        self.settings.transcription_mode = TranscriptionMode::Local;
        SelectionTransition::Changed
    }

    fn select_local(&mut self, model: &str) -> SelectionTransition {
        if self.settings.local_model == model
            && !self.settings.remote_speech_enabled
            && self.settings.transcription_mode == TranscriptionMode::Local
        {
            return SelectionTransition::Unchanged;
        }
        self.settings.local_model = model.to_owned();
        ensure_model_language(self.settings, model);
        self.settings.remote_speech_enabled = false;
        self.settings.transcription_mode = TranscriptionMode::Local;
        SelectionTransition::Changed
    }
}

#[derive(Debug)]
enum InstalledModelError {
    NotInstalled,
    Status(String),
}

impl fmt::Display for InstalledModelError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotInstalled => formatter.write_str("model is not installed"),
            Self::Status(error) => write!(formatter, "status check failed: {error}"),
        }
    }
}

fn require_installed_model(
    app: &AppHandle<AppRuntime>,
    model: &str,
) -> Result<(), InstalledModelError> {
    match install::check_model_status(app.clone(), model.to_owned()) {
        Ok(status) if status.installed => Ok(()),
        Ok(_) => Err(InstalledModelError::NotInstalled),
        Err(error) => Err(InstalledModelError::Status(error.to_string())),
    }
}

/// Select a local speech model by key from the CLI. Validates the key and that
/// the model is installed, then persists and refreshes the menu/tray.
pub(crate) fn cli_set_local_model(
    app: &AppHandle<AppRuntime>,
    model_key: &str,
) -> Result<(), String> {
    if catalog::definition(model_key).is_none() {
        return Err(format!("Unknown model: {model_key}"));
    }
    require_installed_model(app, model_key).map_err(|error| match error {
        InstalledModelError::NotInstalled => format!("Model not installed: {model_key}"),
        InstalledModelError::Status(error) => format!("Failed to check model status: {error}"),
    })?;

    let state = app.state::<AppState>();
    let mut settings = state.current_settings_unmasked();
    settings.local_model = model_key.to_owned();
    ensure_model_language(&mut settings, model_key);
    settings.remote_speech_enabled = false;
    settings.transcription_mode = TranscriptionMode::Local;
    persist_menu_settings(app, settings).ok_or_else(|| "Failed to persist settings".to_owned())?;
    Ok(())
}

/// Enable remote speech from the CLI. Requires a valid remote configuration.
pub(crate) fn cli_enable_remote(app: &AppHandle<AppRuntime>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut settings = state.current_settings_unmasked();
    if !remote::has_valid_config(&settings) {
        return Err("Remote speech is not configured. Set it up in Settings → Models.".to_owned());
    }
    settings.remote_speech_enabled = true;
    settings.transcription_mode = TranscriptionMode::Local;
    persist_menu_settings(app, settings).ok_or_else(|| "Failed to persist settings".to_owned())?;
    Ok(())
}

pub fn handle_speech_menu_event(app: &AppHandle<AppRuntime>, id: &str) -> Option<UserSettings> {
    match SpeechMenuEvent::decode(id) {
        SpeechMenuEvent::Cloud => apply_cloud_selection(app),
        SpeechMenuEvent::Remote => apply_remote_toggle(app),
        SpeechMenuEvent::Local(model) => apply_local_selection(app, model),
        SpeechMenuEvent::Ignore => None,
    }
}

fn apply_cloud_selection(app: &AppHandle<AppRuntime>) -> Option<UserSettings> {
    mutate_selection(app, |selection| selection.select_cloud())
}

fn apply_remote_toggle(app: &AppHandle<AppRuntime>) -> Option<UserSettings> {
    mutate_selection(app, |selection| selection.toggle_remote())
}

fn mutate_selection(
    app: &AppHandle<AppRuntime>,
    update: impl FnOnce(&mut SettingsSelection<'_>) -> SelectionTransition,
) -> Option<UserSettings> {
    let state = app.state::<AppState>();
    let mut settings = state.current_settings_unmasked();
    match update(&mut SettingsSelection::new(&mut settings)) {
        SelectionTransition::Changed => persist_menu_settings(app, settings),
        SelectionTransition::Unchanged => None,
        SelectionTransition::RemoteConfigurationRequired => {
            remote::emit_not_configured_toast(app, &settings);
            None
        }
    }
}

fn apply_local_selection(app: &AppHandle<AppRuntime>, model: &str) -> Option<UserSettings> {
    if install::definition(model).is_none() {
        tracing::error!("Ignoring unknown model selection: {model}");
        return None;
    }
    if let Err(error) = require_installed_model(app, model) {
        match error {
            InstalledModelError::NotInstalled => tracing::error!("Model not installed: {model}"),
            InstalledModelError::Status(error) => {
                tracing::error!("Failed to check model status for {model}: {error}")
            }
        }
        return None;
    }
    mutate_selection(app, |selection| selection.select_local(model))
}

fn ensure_model_language(settings: &mut UserSettings, model: &str) {
    let needs_language = install::definition(model)
        .is_some_and(|definition| definition.engine == install::LocalModelEngine::Cohere);
    if needs_language && settings.language.trim().is_empty() {
        settings.language = "en".to_owned();
    }
}

fn persist_menu_settings(
    app: &AppHandle<AppRuntime>,
    settings: UserSettings,
) -> Option<UserSettings> {
    let state = app.state::<AppState>();
    let previous = state.current_settings_unmasked();
    match state.persist_settings(settings) {
        Ok(saved) => {
            crate::analytics::track_settings_changes(app, &previous, &saved);
            state.emit_settings_changed(app, &saved);
            Some(saved)
        }
        Err(error) => {
            tracing::error!("Failed to update speech menu settings: {error}");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn remote_settings(enabled: bool) -> UserSettings {
        UserSettings {
            remote_speech_enabled: enabled,
            remote_speech_provider: "openai".to_owned(),
            remote_speech_endpoint: "https://api.openai.com/v1".to_owned(),
            remote_speech_api_key: "secret".to_owned(),
            remote_speech_model: "auto".to_owned(),
            transcription_mode: TranscriptionMode::Local,
            ..UserSettings::default()
        }
    }

    fn model(key: &str, label: &str, remote: bool, installed: bool) -> catalog::SpeechModel {
        catalog::SpeechModel {
            id: key.to_owned(),
            key: key.to_owned(),
            label: label.to_owned(),
            description: String::new(),
            size_mb: 0.0,
            engine_id: String::new(),
            variant: String::new(),
            tags: Vec::new(),
            capabilities: Vec::new(),
            supported_languages: Vec::new(),
            remote,
            installed,
        }
    }

    #[test]
    fn event_decoder_prioritizes_read_only_status_rows() {
        assert_eq!(
            SpeechMenuEvent::decode("menu_model_status_0"),
            SpeechMenuEvent::Ignore
        );
        assert_eq!(
            SpeechMenuEvent::decode("menu_model_cloud:looper"),
            SpeechMenuEvent::Cloud
        );
        assert_eq!(
            SpeechMenuEvent::decode("menu_model_remote:openai:model"),
            SpeechMenuEvent::Remote
        );
        assert_eq!(
            SpeechMenuEvent::decode("menu_model_parakeet-tdt-0.6b-v3-int8"),
            SpeechMenuEvent::Local("parakeet-tdt-0.6b-v3-int8")
        );
        assert_eq!(
            SpeechMenuEvent::decode("menu_settings"),
            SpeechMenuEvent::Ignore
        );
    }

    #[test]
    fn cloud_status_names_assemblyai_and_local_fallback() {
        let mut settings = UserSettings::default();
        settings.transcription_mode = TranscriptionMode::Cloud;
        assert_eq!(
            model_status_lines(&settings),
            vec![CLOUD_MODEL_LABEL.to_owned(), fallback_status(&settings)]
        );
    }

    #[test]
    fn remote_status_names_provider_model_and_local_fallback() {
        let settings = remote_settings(true);
        assert_eq!(
            model_status_lines(&settings),
            vec![
                "OpenAI · gpt-4o-mini-transcribe".to_owned(),
                fallback_status(&settings)
            ]
        );
    }

    #[test]
    fn local_status_only_names_the_local_model() {
        let settings = UserSettings::default();
        assert_eq!(
            model_status_lines(&settings),
            vec![install::model_label(&settings.local_model)]
        );
    }

    #[test]
    fn menu_plan_keeps_cloud_remote_and_installed_local_order() {
        let settings = remote_settings(true);
        let models = vec![
            model("remote:openai:gpt-4o-mini-transcribe", "Remote", true, true),
            model("local-ready", "Ready", false, true),
            model("local-missing", "Missing", false, false),
        ];
        let plan = ModelMenuPlan::compose(&models, &settings);
        assert_eq!(plan.rows.len(), 5);
        assert!(
            matches!(plan.rows[0], ModelMenuRow::Choice(ref item) if item.label == CLOUD_MODEL_LABEL && !item.checked)
        );
        assert_eq!(plan.rows[1], ModelMenuRow::Separator);
        assert!(
            matches!(plan.rows[2], ModelMenuRow::Choice(ref item) if item.label == "Remote" && item.checked)
        );
        assert_eq!(plan.rows[3], ModelMenuRow::Separator);
        assert!(
            matches!(plan.rows[4], ModelMenuRow::Choice(ref item) if item.label == "Ready" && !item.checked)
        );
    }

    #[test]
    fn menu_plan_excludes_uninstalled_models_and_checks_selected_local() {
        let mut settings = UserSettings::default();
        settings.local_model = "local-ready".to_owned();
        let models = vec![
            model("local-missing", "Missing", false, false),
            model("local-ready", "Ready", false, true),
        ];
        let plan = ModelMenuPlan::compose(&models, &settings);
        assert_eq!(plan.rows.len(), 3);
        assert!(
            matches!(plan.rows[2], ModelMenuRow::Choice(ref item) if item.label == "Ready" && item.checked)
        );
    }

    #[test]
    fn cloud_selection_is_idempotent_and_keeps_fallback_configuration() {
        let mut settings = remote_settings(true);
        let fallback = settings.local_model.clone();
        assert_eq!(
            SettingsSelection::new(&mut settings).select_cloud(),
            SelectionTransition::Changed
        );
        assert_eq!(settings.transcription_mode, TranscriptionMode::Cloud);
        assert!(settings.remote_speech_enabled);
        assert_eq!(settings.local_model, fallback);
        assert_eq!(
            SettingsSelection::new(&mut settings).select_cloud(),
            SelectionTransition::Unchanged
        );
    }

    #[test]
    fn remote_toggle_enables_and_disables_remote_while_staying_local_mode() {
        let mut settings = remote_settings(false);
        assert_eq!(
            SettingsSelection::new(&mut settings).toggle_remote(),
            SelectionTransition::Changed
        );
        assert!(settings.remote_speech_enabled);
        assert_eq!(settings.transcription_mode, TranscriptionMode::Local);
        assert_eq!(
            SettingsSelection::new(&mut settings).toggle_remote(),
            SelectionTransition::Changed
        );
        assert!(!settings.remote_speech_enabled);
    }

    #[test]
    fn remote_toggle_rejects_incomplete_configuration_without_mutation() {
        let mut settings = UserSettings::default();
        let before = (
            settings.remote_speech_enabled,
            settings.transcription_mode.clone(),
        );
        assert_eq!(
            SettingsSelection::new(&mut settings).toggle_remote(),
            SelectionTransition::RemoteConfigurationRequired
        );
        assert_eq!(
            (settings.remote_speech_enabled, settings.transcription_mode),
            before
        );
    }

    #[test]
    fn local_selection_disables_remote_and_preserves_nonempty_language() {
        let mut settings = remote_settings(true);
        settings.language = "es".to_owned();
        assert_eq!(
            SettingsSelection::new(&mut settings).select_local("parakeet-tdt-0.6b-v3-int8"),
            SelectionTransition::Changed
        );
        assert_eq!(settings.local_model, "parakeet-tdt-0.6b-v3-int8");
        assert!(!settings.remote_speech_enabled);
        assert_eq!(settings.transcription_mode, TranscriptionMode::Local);
        assert_eq!(settings.language, "es");
    }

    #[test]
    fn local_selection_repairs_an_enabled_but_invalid_remote_state() {
        let mut settings = UserSettings::default();
        settings.remote_speech_enabled = true;
        let selected = settings.local_model.clone();
        assert_eq!(
            SettingsSelection::new(&mut settings).select_local(&selected),
            SelectionTransition::Changed
        );
        assert!(!settings.remote_speech_enabled);
        assert_eq!(settings.transcription_mode, TranscriptionMode::Local);
    }

    #[test]
    fn cohere_selection_defaults_auto_language_to_english() {
        let mut settings = UserSettings::default();
        settings.language.clear();
        ensure_model_language(&mut settings, "cohere_transcribe_int4");
        assert_eq!(settings.language, "en");
    }
}
