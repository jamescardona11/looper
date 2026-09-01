use std::{env, fs, path::PathBuf};

use anyhow::{Context, Result};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Manager};

use super::{
    model::{MediaAction, RecordingPrunePolicy, UserSettings},
    policy,
};

const DATABASE_FILE: &str = "settings.db";
const LEGACY_MEDIA_CONTROL: &str = "media_control_enabled";
const LEGACY_RECORDING_PRUNE: &str = "recording_prune_policy";
const LEGACY_TRANSCRIPTION_PRUNE: &str = "transcription_prune_policy";

macro_rules! read_fields {
    ($reader:ident, $settings:ident; $($field:ident => $key:ident),* $(,)?) => {
        $(
            $settings.$field = $reader.value(Key::$key, $settings.$field.clone())?;
        )*
    };
}

macro_rules! write_fields {
    ($writer:ident, $settings:ident; $($field:ident => $key:ident),* $(,)?) => {
        $(
            $writer.put(Key::$key, &$settings.$field)?;
        )*
    };
}

#[derive(Clone, Copy)]
enum Key {
    OnboardingCompleted,
    SmartShortcut,
    SmartEnabled,
    HoldShortcut,
    HoldEnabled,
    ToggleShortcut,
    ToggleEnabled,
    ShortcutBindings,
    TranscriptionMode,
    LocalModel,
    RemoteSpeechEnabled,
    RemoteSpeechProvider,
    RemoteSpeechEndpoint,
    RemoteSpeechApiKey,
    RemoteSpeechModel,
    MicrophoneDevice,
    Language,
    CapturePillPresentation,
    CapturePillDockPosition,
    AppLocale,
    ThemeMode,
    LlmEnabled,
    CleanupEnabled,
    LlmProvider,
    LlmEndpoint,
    LlmApiKey,
    LlmModel,
    MeetingAiProvider,
    LocalLlmModel,
    PersonalitiesNotesSeeded,
    Dictionary,
    AutoDictionaryEnabled,
    AutoDictionaryIgnored,
    Replacements,
    UserSnippets,
    Personalities,
    ModeRules,
    EditModeEnabled,
    PreviewBeforeInsertEnabled,
    PreviewBeforeInsertSelectionEnabled,
    UseScreenContext,
    MediaAction,
    AutoUpdateEnabled,
    AutoLaunchEnabled,
    StartInBackground,
    CalendarMeetingAwarenessEnabled,
    MicrophoneMeetingAwarenessEnabled,
    AutoDeleteTarget,
    AutoDeleteDuration,
    AudioStorageBudgetMb,
    HideOverlaysFromCapture,
    MarkdownMirrorEnabled,
    MarkdownMirrorPath,
    AnalyticsEnabled,
    AnalyticsInstallId,
}

impl Key {
    fn name(self) -> &'static str {
        match self {
            Self::OnboardingCompleted => "onboarding_completed",
            Self::SmartShortcut => "smart_shortcut",
            Self::SmartEnabled => "smart_enabled",
            Self::HoldShortcut => "hold_shortcut",
            Self::HoldEnabled => "hold_enabled",
            Self::ToggleShortcut => "toggle_shortcut",
            Self::ToggleEnabled => "toggle_enabled",
            Self::ShortcutBindings => "shortcut_bindings",
            Self::TranscriptionMode => "transcription_mode",
            Self::LocalModel => "local_model",
            Self::RemoteSpeechEnabled => "remote_speech_enabled",
            Self::RemoteSpeechProvider => "remote_speech_provider",
            Self::RemoteSpeechEndpoint => "remote_speech_endpoint",
            Self::RemoteSpeechApiKey => "remote_speech_api_key",
            Self::RemoteSpeechModel => "remote_speech_model",
            Self::MicrophoneDevice => "microphone_device",
            Self::Language => "language",
            Self::CapturePillPresentation => "capture_pill_presentation",
            Self::CapturePillDockPosition => "capture_pill_dock_position",
            Self::AppLocale => "app_locale",
            Self::ThemeMode => "theme_mode",
            Self::LlmEnabled => "llm_enabled",
            Self::CleanupEnabled => "cleanup_enabled",
            Self::LlmProvider => "llm_provider",
            Self::LlmEndpoint => "llm_endpoint",
            Self::LlmApiKey => "llm_api_key",
            Self::LlmModel => "llm_model",
            Self::MeetingAiProvider => "meeting_ai_provider",
            Self::LocalLlmModel => "local_llm_model",
            Self::PersonalitiesNotesSeeded => "personalities_notes_seeded",
            Self::Dictionary => "dictionary",
            Self::AutoDictionaryEnabled => "auto_dictionary_enabled",
            Self::AutoDictionaryIgnored => "auto_dictionary_ignored",
            Self::Replacements => "replacements",
            Self::UserSnippets => "user_snippets",
            Self::Personalities => "personalities",
            Self::ModeRules => "mode_rules",
            Self::EditModeEnabled => "edit_mode_enabled",
            Self::PreviewBeforeInsertEnabled => "preview_before_insert_enabled",
            Self::PreviewBeforeInsertSelectionEnabled => "preview_before_insert_selection_enabled",
            Self::UseScreenContext => "use_screen_context",
            Self::MediaAction => "media_action",
            Self::AutoUpdateEnabled => "auto_update_enabled",
            Self::AutoLaunchEnabled => "auto_launch_enabled",
            Self::StartInBackground => "start_in_background",
            Self::CalendarMeetingAwarenessEnabled => "calendar_meeting_awareness_enabled",
            Self::MicrophoneMeetingAwarenessEnabled => "microphone_meeting_awareness_enabled",
            Self::AutoDeleteTarget => "auto_delete_target",
            Self::AutoDeleteDuration => "auto_delete_duration",
            Self::AudioStorageBudgetMb => "audio_storage_budget_mb",
            Self::HideOverlaysFromCapture => "hide_overlays_from_capture",
            Self::MarkdownMirrorEnabled => "markdown_mirror_enabled",
            Self::MarkdownMirrorPath => "markdown_mirror_path",
            Self::AnalyticsEnabled => "analytics_enabled",
            Self::AnalyticsInstallId => "analytics_install_id",
        }
    }
}

struct SecretCache {
    ciphertext: Mutex<Option<String>>,
}

impl SecretCache {
    fn empty() -> Self {
        Self {
            ciphertext: Mutex::new(None),
        }
    }

    fn reveal(&self, stored: String, kind: SecretKind) -> String {
        let encrypted = crate::crypto::looks_encrypted(&stored);
        let (plaintext, retained) = if stored.is_empty() {
            (String::new(), None)
        } else if let Some(hardware_uuid) = crate::crypto::get_hardware_uuid() {
            match crate::crypto::decrypt(&stored, &hardware_uuid) {
                Ok(plaintext) => (plaintext, None),
                Err(_error) if !encrypted => (stored, None),
                Err(error) => {
                    kind.log_decrypt_error(&error);
                    (String::new(), Some(stored))
                }
            }
        } else if encrypted {
            kind.log_missing_hardware_id();
            (String::new(), Some(stored))
        } else {
            kind.log_missing_hardware_id();
            (stored, None)
        };
        *self.ciphertext.lock() = retained;
        plaintext
    }

    fn prepare_for_storage(&self, plaintext: &str, kind: SecretKind) -> Result<String> {
        let mut cached = self.ciphertext.lock();
        if plaintext.is_empty() {
            return Ok(cached.clone().unwrap_or_default());
        }
        if cached.as_ref().is_some_and(|value| value == plaintext) {
            return Ok(plaintext.to_owned());
        }
        *cached = None;
        if let Some(hardware_uuid) = crate::crypto::get_hardware_uuid() {
            crate::crypto::encrypt(plaintext, &hardware_uuid)
                .map_err(|error| anyhow::anyhow!(kind.encrypt_error(error)))
        } else {
            kind.log_unencrypted_storage();
            Ok(plaintext.to_owned())
        }
    }
}

#[derive(Clone, Copy)]
enum SecretKind {
    Llm,
    RemoteSpeech,
}

impl SecretKind {
    fn log_decrypt_error(self, error: &impl std::fmt::Display) {
        match self {
            Self::Llm => tracing::error!(
                "Error: Failed to decrypt API key: {}. Preserving encrypted value.",
                error
            ),
            Self::RemoteSpeech => tracing::error!(
                "Error: Failed to decrypt remote speech API key: {}. Preserving encrypted value.",
                error
            ),
        }
    }

    fn log_missing_hardware_id(self) {
        match self {
            Self::Llm => {
                tracing::error!("Warning: Could not get hardware UUID, preserving stored API key")
            }
            Self::RemoteSpeech => tracing::error!(
                "Warning: Could not get hardware UUID, preserving stored remote speech API key"
            ),
        }
    }

    fn log_unencrypted_storage(self) {
        match self {
            Self::Llm => {
                tracing::error!("Warning: Could not get hardware UUID, storing API key unencrypted")
            }
            Self::RemoteSpeech => tracing::error!(
                "Warning: Could not get hardware UUID, storing remote speech API key unencrypted"
            ),
        }
    }

    fn encrypt_error(self, error: impl std::fmt::Display) -> String {
        match self {
            Self::Llm => format!("Failed to encrypt API key: {error}"),
            Self::RemoteSpeech => format!("Failed to encrypt remote speech API key: {error}"),
        }
    }
}

pub struct SettingsStore {
    conn: Mutex<Connection>,
    llm_secret: SecretCache,
    remote_speech_secret: SecretCache,
}

impl SettingsStore {
    pub fn new(app: &AppHandle) -> Result<Self> {
        Self::open(database_path(app)?)
    }

    pub(crate) fn for_cli(app_identifier: &str) -> Result<Self> {
        Self::open(settings_database_path(cli_app_config_dir(app_identifier)?))
    }

    fn open(path: PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create settings dir {}", parent.display()))?;
        }
        let connection = Connection::open(&path)
            .with_context(|| format!("Failed to open settings DB at {}", path.display()))?;
        let store = Self::from_connection(connection);
        store.initialize_schema()?;
        store.remove_retired_keys()?;
        Ok(store)
    }

    fn from_connection(connection: Connection) -> Self {
        Self {
            conn: Mutex::new(connection),
            llm_secret: SecretCache::empty(),
            remote_speech_secret: SecretCache::empty(),
        }
    }

    fn initialize_schema(&self) -> Result<()> {
        self.conn
            .lock()
            .execute(
                "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                [],
            )
            .context("Failed to create settings table")?;
        Ok(())
    }

    fn remove_retired_keys(&self) -> Result<()> {
        self.conn
            .lock()
            .execute(
                "DELETE FROM settings WHERE key IN (
                    'local_api_key', 'local_api_port', 'local_api_model',
                    'local_api_host', 'local_api_start_on_launch', 'local_api_cors'
                )",
                [],
            )
            .context("Failed to remove retired local API settings")?;
        Ok(())
    }

    pub fn load(&self) -> Result<UserSettings> {
        let mut settings = UserSettings::default();
        let mut migration = MigrationState::default();
        let stored_remote_key;
        let stored_llm_key;
        {
            let connection = self.conn.lock();
            let reader = Reader::new(self, &connection);
            read_fields!(reader, settings;
                onboarding_completed => OnboardingCompleted,
                smart_shortcut => SmartShortcut,
                smart_enabled => SmartEnabled,
                hold_shortcut => HoldShortcut,
                hold_enabled => HoldEnabled,
                toggle_shortcut => ToggleShortcut,
                toggle_enabled => ToggleEnabled,
            );
            migration.shortcut_bindings_present = reader
                .optional(Key::ShortcutBindings)?
                .map(|value| settings.shortcut_bindings = value)
                .is_some();
            read_fields!(reader, settings;
                transcription_mode => TranscriptionMode,
                local_model => LocalModel,
                remote_speech_enabled => RemoteSpeechEnabled,
                remote_speech_provider => RemoteSpeechProvider,
                remote_speech_endpoint => RemoteSpeechEndpoint,
            );
            stored_remote_key = reader.value(Key::RemoteSpeechApiKey, String::new())?;
            read_fields!(reader, settings;
                remote_speech_model => RemoteSpeechModel,
                microphone_device => MicrophoneDevice,
                language => Language,
                capture_pill_presentation => CapturePillPresentation,
                capture_pill_dock_position => CapturePillDockPosition,
                app_locale => AppLocale,
            );
            migration.theme_present = reader
                .optional(Key::ThemeMode)?
                .map(|value| settings.theme_mode = value)
                .is_some();
            read_fields!(reader, settings;
                llm_enabled => LlmEnabled,
                cleanup_enabled => CleanupEnabled,
                llm_provider => LlmProvider,
                llm_endpoint => LlmEndpoint,
            );
            stored_llm_key = reader.value(Key::LlmApiKey, String::new())?;
            read_fields!(reader, settings;
                llm_model => LlmModel,
                meeting_ai_provider => MeetingAiProvider,
                local_llm_model => LocalLlmModel,
                personalities_notes_seeded => PersonalitiesNotesSeeded,
                dictionary => Dictionary,
                auto_dictionary_enabled => AutoDictionaryEnabled,
                auto_dictionary_ignored => AutoDictionaryIgnored,
                replacements => Replacements,
                user_snippets => UserSnippets,
                personalities => Personalities,
                mode_rules => ModeRules,
                edit_mode_enabled => EditModeEnabled,
                preview_before_insert_enabled => PreviewBeforeInsertEnabled,
                preview_before_insert_selection_enabled => PreviewBeforeInsertSelectionEnabled,
                use_screen_context => UseScreenContext,
            );
            migration.load_media_action(&reader, &mut settings)?;
            read_fields!(reader, settings;
                auto_update_enabled => AutoUpdateEnabled,
                auto_launch_enabled => AutoLaunchEnabled,
                start_in_background => StartInBackground,
                calendar_meeting_awareness_enabled => CalendarMeetingAwarenessEnabled,
                auto_delete_target => AutoDeleteTarget,
            );
            migration.load_microphone_meeting_awareness(&reader, &mut settings)?;
            migration.load_auto_delete(&reader, &mut settings)?;
            read_fields!(reader, settings;
                audio_storage_budget_mb => AudioStorageBudgetMb,
                hide_overlays_from_capture => HideOverlaysFromCapture,
                markdown_mirror_enabled => MarkdownMirrorEnabled,
                markdown_mirror_path => MarkdownMirrorPath,
                analytics_enabled => AnalyticsEnabled,
                analytics_install_id => AnalyticsInstallId,
            );
        }

        settings.llm_api_key = self.llm_secret.reveal(stored_llm_key, SecretKind::Llm);
        settings.remote_speech_api_key = self
            .remote_speech_secret
            .reveal(stored_remote_key, SecretKind::RemoteSpeech);
        migration.finish(&mut settings);
        if migration.should_persist {
            self.save(&settings)?;
        }
        Ok(settings)
    }

    pub fn save(&self, settings: &UserSettings) -> Result<()> {
        let llm_key = self
            .llm_secret
            .prepare_for_storage(&settings.llm_api_key, SecretKind::Llm)?;
        let remote_key = self
            .remote_speech_secret
            .prepare_for_storage(&settings.remote_speech_api_key, SecretKind::RemoteSpeech)?;
        let locale = policy::canonicalize_app_locale_or_default(&settings.app_locale);
        let connection = self.conn.lock();
        let writer = Writer::new(self, &connection);
        write_fields!(writer, settings;
            onboarding_completed => OnboardingCompleted,
            hide_overlays_from_capture => HideOverlaysFromCapture,
            smart_shortcut => SmartShortcut,
            smart_enabled => SmartEnabled,
            hold_shortcut => HoldShortcut,
            hold_enabled => HoldEnabled,
            toggle_shortcut => ToggleShortcut,
            toggle_enabled => ToggleEnabled,
            shortcut_bindings => ShortcutBindings,
            transcription_mode => TranscriptionMode,
            local_model => LocalModel,
            remote_speech_enabled => RemoteSpeechEnabled,
            remote_speech_provider => RemoteSpeechProvider,
            remote_speech_endpoint => RemoteSpeechEndpoint,
        );
        writer.put(Key::RemoteSpeechApiKey, &remote_key)?;
        write_fields!(writer, settings;
            remote_speech_model => RemoteSpeechModel,
            microphone_device => MicrophoneDevice,
            language => Language,
            capture_pill_presentation => CapturePillPresentation,
            capture_pill_dock_position => CapturePillDockPosition,
        );
        writer.put(Key::AppLocale, &locale)?;
        write_fields!(writer, settings;
            theme_mode => ThemeMode,
            llm_enabled => LlmEnabled,
            cleanup_enabled => CleanupEnabled,
            llm_provider => LlmProvider,
            llm_endpoint => LlmEndpoint,
        );
        writer.put(Key::LlmApiKey, &llm_key)?;
        write_fields!(writer, settings;
            llm_model => LlmModel,
            meeting_ai_provider => MeetingAiProvider,
            local_llm_model => LocalLlmModel,
            personalities_notes_seeded => PersonalitiesNotesSeeded,
            dictionary => Dictionary,
            auto_dictionary_enabled => AutoDictionaryEnabled,
            auto_dictionary_ignored => AutoDictionaryIgnored,
            replacements => Replacements,
            user_snippets => UserSnippets,
            personalities => Personalities,
            mode_rules => ModeRules,
            edit_mode_enabled => EditModeEnabled,
            preview_before_insert_enabled => PreviewBeforeInsertEnabled,
            preview_before_insert_selection_enabled => PreviewBeforeInsertSelectionEnabled,
            use_screen_context => UseScreenContext,
            media_action => MediaAction,
            auto_update_enabled => AutoUpdateEnabled,
            auto_launch_enabled => AutoLaunchEnabled,
            start_in_background => StartInBackground,
            calendar_meeting_awareness_enabled => CalendarMeetingAwarenessEnabled,
            microphone_meeting_awareness_enabled => MicrophoneMeetingAwarenessEnabled,
            auto_delete_target => AutoDeleteTarget,
            auto_delete_duration => AutoDeleteDuration,
            audio_storage_budget_mb => AudioStorageBudgetMb,
            markdown_mirror_enabled => MarkdownMirrorEnabled,
            markdown_mirror_path => MarkdownMirrorPath,
            analytics_enabled => AnalyticsEnabled,
            analytics_install_id => AnalyticsInstallId,
        );
        Ok(())
    }

    pub(crate) fn read_app_value<T: DeserializeOwned>(&self, key: &str, default: T) -> Result<T> {
        Reader::new(self, &self.conn.lock()).value_named(key, default)
    }

    pub(crate) fn write_app_value<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        Writer::new(self, &self.conn.lock()).put_named(key, value)
    }
}

struct Reader<'a> {
    store: &'a SettingsStore,
    connection: &'a Connection,
}

impl<'a> Reader<'a> {
    fn new(store: &'a SettingsStore, connection: &'a Connection) -> Self {
        Self { store, connection }
    }

    fn value<T: DeserializeOwned>(&self, key: Key, default: T) -> Result<T> {
        self.value_named(key.name(), default)
    }

    fn value_named<T: DeserializeOwned>(&self, key: &str, default: T) -> Result<T> {
        match self.store.raw_value(self.connection, key)? {
            Some(raw) => serde_json::from_str(&raw).context("Malformed setting JSON in DB"),
            None => Ok(default),
        }
    }

    fn optional<T: DeserializeOwned>(&self, key: Key) -> Result<Option<T>> {
        self.store
            .raw_value(self.connection, key.name())?
            .map(|raw| serde_json::from_str(&raw).context("Malformed setting JSON in DB"))
            .transpose()
    }
}

struct Writer<'a> {
    store: &'a SettingsStore,
    connection: &'a Connection,
}

impl<'a> Writer<'a> {
    fn new(store: &'a SettingsStore, connection: &'a Connection) -> Self {
        Self { store, connection }
    }

    fn put<T: Serialize>(&self, key: Key, value: &T) -> Result<()> {
        self.put_named(key.name(), value)
    }

    fn put_named<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        self.store.store_value(self.connection, key, value)
    }
}

impl SettingsStore {
    fn raw_value(&self, connection: &Connection, key: &str) -> Result<Option<String>> {
        connection
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .context("Failed to read setting from DB")
    }

    fn store_value<T: Serialize>(
        &self,
        connection: &Connection,
        key: &str,
        value: &T,
    ) -> Result<()> {
        let json = serde_json::to_string(value)?;
        connection
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, json],
            )
            .with_context(|| format!("Failed to upsert setting '{key}' into DB"))?;
        Ok(())
    }
}

#[derive(Default)]
struct MigrationState {
    should_persist: bool,
    theme_present: bool,
    shortcut_bindings_present: bool,
}

impl MigrationState {
    fn load_microphone_meeting_awareness(
        &mut self,
        reader: &Reader<'_>,
        settings: &mut UserSettings,
    ) -> Result<()> {
        if let Some(enabled) = reader.optional(Key::MicrophoneMeetingAwarenessEnabled)? {
            settings.microphone_meeting_awareness_enabled = enabled;
            return Ok(());
        }

        // Esta señal es independiente del calendario. Una instalación previa
        // nunca tuvo una preferencia específica para ella, así que la clave
        // ausente usa su default `true`; el valor de Calendar se conserva sin
        // reinterpretarlo. La consulta solo lee el booleano de CoreAudio y no
        // abre ni captura el micrófono.
        settings.microphone_meeting_awareness_enabled = true;
        self.should_persist = true;
        Ok(())
    }

    fn load_media_action(
        &mut self,
        reader: &Reader<'_>,
        settings: &mut UserSettings,
    ) -> Result<()> {
        if let Some(action) = reader.optional(Key::MediaAction)? {
            settings.media_action = action;
        } else if let Some(enabled) = reader
            .store
            .raw_value(reader.connection, LEGACY_MEDIA_CONTROL)?
            .map(|raw| serde_json::from_str::<bool>(&raw).context("Malformed setting JSON in DB"))
            .transpose()?
        {
            settings.media_action = if enabled {
                MediaAction::Pause
            } else {
                MediaAction::Off
            };
            self.should_persist = true;
        }
        Ok(())
    }

    fn load_auto_delete(&mut self, reader: &Reader<'_>, settings: &mut UserSettings) -> Result<()> {
        if let Some(duration) = reader.optional(Key::AutoDeleteDuration)? {
            settings.auto_delete_duration = duration;
            return Ok(());
        }
        let recording = reader.value_named(LEGACY_RECORDING_PRUNE, RecordingPrunePolicy::Never)?;
        let transcription =
            reader.value_named(LEGACY_TRANSCRIPTION_PRUNE, RecordingPrunePolicy::Never)?;
        policy::migrate_auto_delete_from_legacy(settings, recording, transcription);
        self.should_persist = true;
        Ok(())
    }

    fn finish(&mut self, settings: &mut UserSettings) {
        if settings.analytics_install_id.is_empty() {
            settings.analytics_install_id = uuid::Uuid::new_v4().to_string();
            settings.analytics_first_run = true;
            self.should_persist = true;
        }
        if !settings.personalities_notes_seeded {
            policy::seed_personality_notes(&mut settings.personalities);
            settings.personalities_notes_seeded = true;
            self.should_persist = true;
        }
        if !self.theme_present {
            self.should_persist = true;
        }
        if !self.shortcut_bindings_present {
            settings.shortcut_bindings = super::shortcut_bindings_from_legacy(settings);
            self.should_persist = true;
        }
        if settings.cleanup_enabled {
            if !self.shortcut_bindings_present {
                for binding in settings
                    .shortcut_bindings
                    .smart
                    .iter_mut()
                    .chain(settings.shortcut_bindings.hold.iter_mut())
                    .chain(settings.shortcut_bindings.toggle.iter_mut())
                {
                    binding.cleanup_enabled = true;
                }
            }
            settings.cleanup_enabled = false;
            self.should_persist = true;
        }
        policy::sync_legacy_shortcuts_from_bindings(settings);

        if crate::model_manager::definition(&settings.local_model).is_none() {
            settings.local_model = policy::default_local_model();
            self.should_persist = true;
        }
        if !crate::local_llm::is_known_model(&settings.local_llm_model) {
            settings.local_llm_model = policy::default_local_llm_model();
            self.should_persist = true;
        }
        let duration =
            policy::canonicalize_recording_prune_policy(settings.auto_delete_duration);
        if duration != settings.auto_delete_duration {
            settings.auto_delete_duration = duration;
            self.should_persist = true;
        }
        let locale = policy::canonicalize_app_locale_or_default(&settings.app_locale);
        if locale != settings.app_locale {
            settings.app_locale = locale;
            self.should_persist = true;
        }
    }
}

fn database_path(app: &AppHandle) -> Result<PathBuf> {
    let resolver = app.path();
    let directory = resolver
        .app_config_dir()
        .or_else(|_| resolver.app_data_dir())
        .context("Unable to resolve config directory")?;
    Ok(settings_database_path(directory))
}

fn cli_app_config_dir(app_identifier: &str) -> Result<PathBuf> {
    Ok(platform_config_dir()?.join(app_identifier))
}

pub(crate) fn cli_data_dir(app_identifier: &str) -> Result<PathBuf> {
    cli_app_config_dir(app_identifier)
}

#[cfg(target_os = "macos")]
fn platform_config_dir() -> Result<PathBuf> {
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .context("Unable to resolve home directory")?;
    Ok(home.join("Library").join("Application Support"))
}

#[cfg(target_os = "windows")]
fn platform_config_dir() -> Result<PathBuf> {
    env::var_os("APPDATA")
        .map(PathBuf::from)
        .context("Unable to resolve roaming app data directory")
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_config_dir() -> Result<PathBuf> {
    if let Some(config_home) = env::var_os("XDG_CONFIG_HOME") {
        return Ok(PathBuf::from(config_home));
    }
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .context("Unable to resolve home directory")?;
    Ok(home.join(".config"))
}

fn settings_database_path(mut directory: PathBuf) -> PathBuf {
    directory.push("Looper");
    directory.push(DATABASE_FILE);
    directory
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_store() -> SettingsStore {
        let store = SettingsStore::from_connection(Connection::open_in_memory().unwrap());
        store.initialize_schema().unwrap();
        store
    }

    fn write<T: Serialize>(store: &SettingsStore, key: &str, value: &T) {
        let connection = store.conn.lock();
        store.store_value(&connection, key, value).unwrap();
    }

    fn read<T: DeserializeOwned>(store: &SettingsStore, key: Key, default: T) -> T {
        let connection = store.conn.lock();
        Reader::new(store, &connection).value(key, default).unwrap()
    }

    #[test]
    fn complete_settings_round_trip_keeps_preferences_and_canonicalizes_locale() {
        let store = test_store();
        let mut settings = UserSettings::default();
        settings.calendar_meeting_awareness_enabled = true;
        settings.microphone_meeting_awareness_enabled = false;
        settings.capture_pill_presentation = crate::pill::capture::CapturePillPresentation::Floating;
        settings.capture_pill_dock_position =
            crate::pill::capture::CapturePillDockPosition::LeftCenter;
        settings.app_locale = " EN ".to_owned();
        store.save(&settings).unwrap();
        let loaded = store.load().unwrap();
        assert!(loaded.calendar_meeting_awareness_enabled);
        assert!(!loaded.microphone_meeting_awareness_enabled);
        assert_eq!(
            loaded.capture_pill_presentation,
            settings.capture_pill_presentation
        );
        assert_eq!(
            loaded.capture_pill_dock_position,
            settings.capture_pill_dock_position
        );
        assert_eq!(loaded.app_locale, "en");
    }

    #[test]
    fn fresh_installs_enable_microphone_suggestions_without_enabling_calendar() {
        let store = test_store();

        let loaded = store.load().unwrap();

        assert!(!loaded.calendar_meeting_awareness_enabled);
        assert!(loaded.microphone_meeting_awareness_enabled);
        assert!(read(
            &store,
            Key::MicrophoneMeetingAwarenessEnabled,
            false
        ));
    }

    #[test]
    fn existing_calendar_opt_out_does_not_disable_the_new_microphone_mode() {
        let store = test_store();
        write(&store, Key::CalendarMeetingAwarenessEnabled.name(), &false);

        let loaded = store.load().unwrap();

        assert!(!loaded.calendar_meeting_awareness_enabled);
        assert!(loaded.microphone_meeting_awareness_enabled);
        assert!(read(
            &store,
            Key::MicrophoneMeetingAwarenessEnabled,
            false
        ));
    }

    #[test]
    fn existing_calendar_opt_in_remains_enabled_during_split_migration() {
        let store = test_store();
        write(&store, Key::CalendarMeetingAwarenessEnabled.name(), &true);

        let loaded = store.load().unwrap();

        assert!(loaded.calendar_meeting_awareness_enabled);
        assert!(loaded.microphone_meeting_awareness_enabled);
    }

    #[test]
    fn retired_local_llm_model_is_replaced_and_persisted() {
        let store = test_store();
        write(&store, Key::LocalLlmModel.name(), &"qwen3.5:2b-q4_k_m");
        write(&store, Key::PersonalitiesNotesSeeded.name(), &true);
        let loaded = store.load().unwrap();
        assert_eq!(loaded.local_llm_model, crate::local_llm::DEFAULT_MODEL_ID);
        assert_eq!(
            read(&store, Key::LocalLlmModel, String::new()),
            crate::local_llm::DEFAULT_MODEL_ID
        );
    }

    #[test]
    fn encrypted_secret_that_cannot_be_opened_remains_persisted() {
        let store = test_store();
        let ciphertext = crate::crypto::encrypt("api-key-value", "different-hardware-id").unwrap();
        write(&store, Key::LlmApiKey.name(), &ciphertext);
        write(&store, Key::PersonalitiesNotesSeeded.name(), &true);
        let loaded = store.load().unwrap();
        assert!(loaded.llm_api_key.is_empty());
        assert_eq!(read(&store, Key::LlmApiKey, String::new()), ciphertext);
        assert_eq!(
            store.llm_secret.ciphertext.lock().as_ref(),
            Some(&ciphertext)
        );
    }

    #[test]
    fn readable_secret_clears_a_previous_ciphertext_cache() {
        let Some(hardware_uuid) = crate::crypto::get_hardware_uuid() else {
            return;
        };
        let store = test_store();
        let unreadable = crate::crypto::encrypt("key", "different-hardware-id").unwrap();
        write(&store, Key::LlmApiKey.name(), &unreadable);
        write(&store, Key::PersonalitiesNotesSeeded.name(), &true);
        assert!(store.load().unwrap().llm_api_key.is_empty());
        let readable = crate::crypto::encrypt("key", &hardware_uuid).unwrap();
        write(&store, Key::LlmApiKey.name(), &readable);
        assert_eq!(store.load().unwrap().llm_api_key, "key");
        assert!(store.llm_secret.ciphertext.lock().is_none());
    }

    #[test]
    fn legacy_media_and_auto_delete_values_are_migrated_to_current_keys() {
        let store = test_store();
        write(&store, LEGACY_MEDIA_CONTROL, &true);
        write(&store, LEGACY_RECORDING_PRUNE, &RecordingPrunePolicy::Day);
        write(&store, Key::PersonalitiesNotesSeeded.name(), &true);
        let loaded = store.load().unwrap();
        assert_eq!(loaded.media_action, MediaAction::Pause);
        assert_eq!(
            loaded.auto_delete_target,
            super::super::AutoDeleteTarget::Audio
        );
        assert_eq!(loaded.auto_delete_duration, RecordingPrunePolicy::Day);
        assert_eq!(
            read(&store, Key::MediaAction, MediaAction::Off),
            MediaAction::Pause
        );
    }

    #[test]
    fn retired_api_rows_are_deleted_without_touching_current_values() {
        let store = test_store();
        write(&store, "local_api_key", &"retired-secret");
        write(&store, Key::Language.name(), &"es");
        store.remove_retired_keys().unwrap();
        let connection = store.conn.lock();
        assert!(store
            .raw_value(&connection, "local_api_key")
            .unwrap()
            .is_none());
        assert!(store
            .raw_value(&connection, Key::Language.name())
            .unwrap()
            .is_some());
    }

    #[test]
    fn malformed_json_reports_the_existing_database_error_contract() {
        let store = test_store();
        let connection = store.conn.lock();
        connection
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)",
                params![Key::ThemeMode.name(), "not-json"],
            )
            .unwrap();
        drop(connection);
        assert_eq!(
            store.load().unwrap_err().to_string(),
            "Malformed setting JSON in DB"
        );
    }

    #[test]
    fn save_materializes_every_current_database_key() {
        let store = test_store();
        store.save(&UserSettings::default()).unwrap();
        let count: i64 = store
            .conn
            .lock()
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 55);
    }

    #[test]
    fn application_owned_values_keep_the_generic_json_contract() {
        let store = test_store();
        let payload = vec!["first".to_owned(), "second".to_owned()];
        store
            .write_app_value("integration_fixture", &payload)
            .unwrap();
        assert_eq!(
            store
                .read_app_value("integration_fixture", Vec::<String>::new())
                .unwrap(),
            payload
        );
        assert_eq!(store.read_app_value("missing_fixture", 42_u8).unwrap(), 42);
    }
}
