use std::{collections::HashSet, sync::OnceLock};

use chrono::{DateTime, Days, Local, Months};

use super::model::{
    AppBinding, AutoDeleteTarget, MediaAction, Personality, RecordingPrunePolicy, ShortcutBinding,
    ShortcutBindings, ThemeMode, TranscriptionMode, UserSettings,
};

pub(super) fn default_smart_shortcut() -> String {
    if cfg!(target_os = "macos") {
        "Fn".to_owned()
    } else {
        "Control+Space".to_owned()
    }
}

pub(super) fn default_hold_shortcut() -> String {
    "Control+Shift+Space".to_owned()
}

pub(super) fn default_toggle_shortcut() -> String {
    "Control+Alt+Space".to_owned()
}

pub fn default_shortcut_bindings() -> ShortcutBindings {
    ShortcutBindings {
        smart: singleton_binding(default_smart_shortcut(), false),
        hold: singleton_binding(default_hold_shortcut(), false),
        toggle: singleton_binding(default_toggle_shortcut(), false),
    }
}

fn singleton_binding(shortcut: String, cleanup_enabled: bool) -> Vec<ShortcutBinding> {
    vec![ShortcutBinding {
        shortcut,
        temporary: false,
        cleanup_enabled,
    }]
}

pub fn shortcut_bindings_from_legacy(settings: &UserSettings) -> ShortcutBindings {
    let cleanup = settings.cleanup_enabled;
    ShortcutBindings {
        smart: singleton_binding(settings.smart_shortcut.clone(), cleanup),
        hold: singleton_binding(settings.hold_shortcut.clone(), cleanup),
        toggle: singleton_binding(settings.toggle_shortcut.clone(), cleanup),
    }
}

pub fn sync_legacy_shortcuts_from_bindings(settings: &mut UserSettings) {
    let primary = |bindings: &[ShortcutBinding]| bindings.first().map(|item| item.shortcut.clone());
    if let Some(shortcut) = primary(&settings.shortcut_bindings.smart) {
        settings.smart_shortcut = shortcut;
    }
    if let Some(shortcut) = primary(&settings.shortcut_bindings.hold) {
        settings.hold_shortcut = shortcut;
    }
    if let Some(shortcut) = primary(&settings.shortcut_bindings.toggle) {
        settings.toggle_shortcut = shortcut;
    }
}

pub(crate) fn default_true() -> bool {
    true
}

pub(super) fn default_personalities() -> Vec<Personality> {
    vec![
        personality(
            "messaging",
            "Messaging",
            default_messaging_apps(),
            &["slack.com"],
        ),
        personality(
            "email",
            "Email",
            default_email_apps(),
            &["mail.google.com", "outlook.com", "mail.yahoo.com"],
        ),
        personality(
            "notes",
            "Notes",
            default_notes_apps(),
            &["notion.so", "craft.do", "affine.pro", "obsidian.md"],
        ),
        personality(
            "coding",
            "Coding",
            default_coding_apps(),
            &["github.com", "gitlab.com", "bitbucket.org"],
        ),
    ]
}

fn personality(id: &str, name: &str, apps: Vec<AppBinding>, websites: &[&str]) -> Personality {
    Personality {
        id: id.to_owned(),
        name: name.to_owned(),
        enabled: true,
        apps,
        websites: websites.iter().map(|site| (*site).to_owned()).collect(),
        instructions: Vec::new(),
    }
}

fn app_bindings(names: &[&str]) -> Vec<AppBinding> {
    names.iter().map(|name| AppBinding::legacy(*name)).collect()
}

#[cfg(target_os = "windows")]
fn default_messaging_apps() -> Vec<AppBinding> {
    app_bindings(&["Microsoft Teams", "Slack", "Discord", "WhatsApp"])
}

#[cfg(not(target_os = "windows"))]
fn default_messaging_apps() -> Vec<AppBinding> {
    app_bindings(&["Messages", "Slack"])
}

#[cfg(target_os = "windows")]
fn default_email_apps() -> Vec<AppBinding> {
    app_bindings(&["Outlook", "Thunderbird"])
}

#[cfg(not(target_os = "windows"))]
fn default_email_apps() -> Vec<AppBinding> {
    app_bindings(&["Mail", "Outlook", "Spark"])
}

#[cfg(target_os = "windows")]
fn default_notes_apps() -> Vec<AppBinding> {
    app_bindings(&["OneNote", "Sticky Notes", "Notion", "Obsidian"])
}

#[cfg(not(target_os = "windows"))]
fn default_notes_apps() -> Vec<AppBinding> {
    app_bindings(&["Notes", "Notion", "Obsidian", "Craft", "Affine"])
}

#[cfg(target_os = "windows")]
fn default_coding_apps() -> Vec<AppBinding> {
    app_bindings(&[
        "Cursor",
        "Visual Studio Code",
        "Visual Studio",
        "WebStorm",
        "IntelliJ IDEA",
    ])
}

#[cfg(not(target_os = "windows"))]
fn default_coding_apps() -> Vec<AppBinding> {
    app_bindings(&[
        "Cursor",
        "Visual Studio Code",
        "Xcode",
        "WebStorm",
        "IntelliJ IDEA",
    ])
}

pub(super) fn seed_personality_notes(personalities: &mut [Personality]) {
    for personality in personalities {
        if personality.instructions.is_empty() {
            personality.instructions = note_template(&personality.id)
                .iter()
                .map(|line| (*line).to_owned())
                .collect();
        }
    }
}

fn note_template(id: &str) -> &'static [&'static str] {
    match id {
        "messaging" => &[
            "- Write semi-casual, friendly, as if you're messaging someone",
            "",
            "- Transcribe spoken emoji descriptions directly into icons (e.g., 'laughing face' becomes 😂).",
            "",
            "- Retain all internet slang, acronyms, and text-speak (e.g., 'tmrw', 'rn', 'omg') exactly as said.",
        ],
        "email" => &[
            "- Write in correct email semi-formal, friendly, formatting with new lines and paragraphs.",
            "",
            "- Fix run-on sentences by breaking them into distinct, logical statements.",
            "",
            "- Ensure standard capitalization and punctuation rules are applied strictly.",
            "",
            "- Sign off emails with [My Name].",
        ],
        "notes" => &[
            "- Distill into a concise, scannable format based on the user's speech.",
            "",
            "- Remove conversational filler (ums, ahs), repetitive thoughts, and fluff.",
            "",
            "- Utilize Markdown syntax: Use bullet points for lists and bold text for key concepts.",
            "",
            "- Rephrase rambling narrative into direct, active-voice statements based on the user's speech.",
        ],
        "coding" => &[
            "- Treat technical keywords, library names, and logic as immutable constants based on the user's speech; do not rephrase them.",
            "",
            "- Apply proper casing conventions to variables and functions based on context (e.g., camelCase for JS, snake_case for Python) based on the user's speech.",
            "",
            "- Prioritize syntax accuracy over conversational flow based on the user's speech.",
        ],
        _ => &[],
    }
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            onboarding_completed: false,
            smart_shortcut: default_smart_shortcut(),
            smart_enabled: true,
            hold_shortcut: default_hold_shortcut(),
            hold_enabled: false,
            toggle_shortcut: default_toggle_shortcut(),
            toggle_enabled: false,
            shortcut_bindings: super::default_shortcut_bindings(),
            transcription_mode: default_transcription_mode(),
            local_model: default_local_model(),
            remote_speech_enabled: false,
            remote_speech_provider: default_remote_speech_provider(),
            remote_speech_endpoint: default_remote_speech_endpoint(),
            remote_speech_api_key: String::new(),
            remote_speech_model: default_remote_speech_model(),
            microphone_device: None,
            language: default_language(),
            capture_pill_presentation: Default::default(),
            capture_pill_dock_position: Default::default(),
            app_locale: default_app_locale(),
            theme_mode: ThemeMode::default(),
            llm_enabled: false,
            cleanup_enabled: false,
            llm_provider: default_llm_provider(),
            llm_endpoint: String::new(),
            llm_api_key: String::new(),
            llm_model: String::new(),
            meeting_ai_provider: default_meeting_ai_provider(),
            local_llm_model: default_local_llm_model(),
            personalities_notes_seeded: false,
            dictionary: Vec::new(),
            auto_dictionary_enabled: false,
            auto_dictionary_ignored: Vec::new(),
            replacements: Vec::new(),
            user_snippets: Vec::new(),
            personalities: default_personalities(),
            mode_rules: Vec::new(),
            active_workflow_id: None,
            edit_mode_enabled: false,
            preview_before_insert_enabled: false,
            preview_before_insert_selection_enabled: true,
            use_screen_context: false,
            media_action: MediaAction::Off,
            auto_update_enabled: false,
            auto_launch_enabled: false,
            start_in_background: true,
            calendar_meeting_awareness_enabled: false,
            microphone_meeting_awareness_enabled: true,
            meeting_system_audio_enabled: true,
            meeting_live_transcript_enabled: true,
            auto_delete_target: default_auto_delete_target(),
            auto_delete_duration: default_auto_delete_duration(),
            audio_storage_budget_mb: 0,
            hide_overlays_from_capture: false,
            markdown_mirror_enabled: false,
            markdown_mirror_path: String::new(),
            analytics_enabled: true,
            analytics_install_id: String::new(),
            analytics_first_run: false,
        }
    }
}

pub fn default_remote_speech_provider() -> String {
    "openai".to_owned()
}

pub fn default_remote_speech_endpoint() -> String {
    "https://api.openai.com/v1".to_owned()
}

pub fn default_remote_speech_model() -> String {
    "auto".to_owned()
}

pub(super) fn default_transcription_mode() -> TranscriptionMode {
    TranscriptionMode::Local
}

pub(super) fn default_auto_delete_duration() -> RecordingPrunePolicy {
    RecordingPrunePolicy::Never
}

pub fn canonicalize_recording_prune_policy(policy: RecordingPrunePolicy) -> RecordingPrunePolicy {
    match policy {
        RecordingPrunePolicy::ThreeMonths => RecordingPrunePolicy::Year,
        supported => supported,
    }
}

pub(crate) fn recording_prune_cutoff(
    policy: RecordingPrunePolicy,
    now: DateTime<Local>,
) -> Option<DateTime<Local>> {
    match policy {
        RecordingPrunePolicy::Never => None,
        RecordingPrunePolicy::Immediately => Some(now),
        RecordingPrunePolicy::Day => now.checked_sub_days(Days::new(1)),
        RecordingPrunePolicy::Week => now.checked_sub_days(Days::new(7)),
        RecordingPrunePolicy::Month => now.checked_sub_months(Months::new(1)),
        RecordingPrunePolicy::ThreeMonths => now.checked_sub_months(Months::new(3)),
        RecordingPrunePolicy::Year => now.checked_sub_months(Months::new(12)),
    }
}

pub(super) fn default_auto_delete_target() -> AutoDeleteTarget {
    AutoDeleteTarget::Transcripts
}

pub fn auto_delete_recording_policy(settings: &UserSettings) -> RecordingPrunePolicy {
    match settings.auto_delete_target {
        AutoDeleteTarget::Audio => settings.auto_delete_duration,
        AutoDeleteTarget::Transcripts => RecordingPrunePolicy::Never,
    }
}

pub fn auto_delete_transcription_policy(settings: &UserSettings) -> RecordingPrunePolicy {
    match settings.auto_delete_target {
        AutoDeleteTarget::Audio => RecordingPrunePolicy::Never,
        AutoDeleteTarget::Transcripts => settings.auto_delete_duration,
    }
}

pub(super) fn migrate_auto_delete_from_legacy(
    settings: &mut UserSettings,
    legacy_recording: RecordingPrunePolicy,
    legacy_transcription: RecordingPrunePolicy,
) {
    if legacy_transcription != RecordingPrunePolicy::Never {
        settings.auto_delete_target = AutoDeleteTarget::Transcripts;
        settings.auto_delete_duration = canonicalize_recording_prune_policy(legacy_transcription);
    } else if legacy_recording != RecordingPrunePolicy::Never {
        settings.auto_delete_target = AutoDeleteTarget::Audio;
        settings.auto_delete_duration = canonicalize_recording_prune_policy(legacy_recording);
    }
}

pub(super) fn default_llm_provider() -> String {
    "none".to_owned()
}

pub fn default_meeting_ai_provider() -> String {
    "writing".to_owned()
}

pub fn default_local_llm_model() -> String {
    crate::local_llm::DEFAULT_MODEL_ID.to_owned()
}

pub fn default_local_model() -> String {
    if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "cohere_transcribe_int4".to_owned()
    } else {
        "parakeet_tdt_int8".to_owned()
    }
}

pub(super) fn default_language() -> String {
    "en".to_owned()
}

pub(super) fn default_app_locale() -> String {
    "system".to_owned()
}

const SUPPORTED_LOCALES_WIRE: &str = include_str!("../../../supported-app-locales.json");
static SUPPORTED_LOCALES: OnceLock<Vec<String>> = OnceLock::new();

fn supported_app_locales() -> &'static [String] {
    SUPPORTED_LOCALES
        .get_or_init(parse_supported_locales)
        .as_slice()
}

fn parse_supported_locales() -> Vec<String> {
    let locales: Vec<String> = serde_json::from_str(SUPPORTED_LOCALES_WIRE)
        .expect("supported-app-locales.json must be a JSON array of locale strings");
    if locales.is_empty() {
        panic!("supported-app-locales.json must not be empty");
    }
    let mut unique = HashSet::with_capacity(locales.len());
    for locale in &locales {
        if locale.is_empty() || locale.trim() != locale || locale.to_ascii_lowercase() != *locale {
            panic!("supported-app-locales.json must use lowercase, trimmed locale codes");
        }
        if !unique.insert(locale.clone()) {
            panic!("supported-app-locales.json cannot contain duplicate locale codes");
        }
    }
    locales
}

pub fn canonicalize_app_locale(value: &str) -> Option<String> {
    let locale = value.trim().replace('_', "-").to_ascii_lowercase();
    if locale.is_empty() {
        return None;
    }
    (locale == default_app_locale() || supported_app_locales().contains(&locale)).then_some(locale)
}

pub fn canonicalize_app_locale_or_default(value: &str) -> String {
    canonicalize_app_locale(value).unwrap_or_else(default_app_locale)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_preserve_product_behavior() {
        let settings = UserSettings::default();
        assert!(!settings.onboarding_completed);
        assert!(settings.smart_enabled);
        assert!(!settings.hold_enabled);
        assert!(!settings.toggle_enabled);
        assert_eq!(settings.shortcut_bindings.smart.len(), 1);
        assert_eq!(settings.shortcut_bindings.hold.len(), 1);
        assert_eq!(settings.shortcut_bindings.toggle.len(), 1);
        assert_eq!(settings.transcription_mode, TranscriptionMode::Local);
        assert!(!settings.remote_speech_enabled);
        assert_eq!(settings.remote_speech_provider, "openai");
        assert_eq!(settings.remote_speech_endpoint, "https://api.openai.com/v1");
        assert_eq!(settings.remote_speech_model, "auto");
        assert!(settings.remote_speech_api_key.is_empty());
        assert_eq!(settings.microphone_device, None);
        assert_eq!(settings.language, "en");
        assert_eq!(settings.app_locale, "system");
        assert_eq!(settings.theme_mode, ThemeMode::System);
        assert!(!settings.llm_enabled);
        assert!(!settings.cleanup_enabled);
        assert_eq!(settings.llm_provider, "none");
        assert!(settings.llm_endpoint.is_empty());
        assert!(settings.llm_api_key.is_empty());
        assert!(settings.llm_model.is_empty());
        assert_eq!(settings.meeting_ai_provider, "writing");
        assert_eq!(settings.local_llm_model, crate::local_llm::DEFAULT_MODEL_ID);
        assert!(!settings.personalities_notes_seeded);
        assert!(settings.dictionary.is_empty());
        assert!(!settings.auto_dictionary_enabled);
        assert!(settings.auto_dictionary_ignored.is_empty());
        assert!(settings.replacements.is_empty());
        assert!(settings.user_snippets.is_empty());
        assert_eq!(settings.personalities.len(), 4);
        assert!(settings.mode_rules.is_empty());
        assert_eq!(settings.active_workflow_id, None);
        assert!(!settings.edit_mode_enabled);
        assert!(!settings.preview_before_insert_enabled);
        assert!(settings.preview_before_insert_selection_enabled);
        assert!(!settings.use_screen_context);
        assert_eq!(settings.media_action, MediaAction::Off);
        assert!(!settings.auto_update_enabled);
        assert!(!settings.auto_launch_enabled);
        assert!(settings.start_in_background);
        assert!(!settings.calendar_meeting_awareness_enabled);
        assert!(settings.microphone_meeting_awareness_enabled);
        assert!(settings.meeting_system_audio_enabled);
        assert!(settings.meeting_live_transcript_enabled);
        assert_eq!(settings.auto_delete_target, AutoDeleteTarget::Transcripts);
        assert_eq!(settings.auto_delete_duration, RecordingPrunePolicy::Never);
        assert_eq!(settings.audio_storage_budget_mb, 0);
        assert!(!settings.hide_overlays_from_capture);
        assert!(!settings.markdown_mirror_enabled);
        assert!(settings.markdown_mirror_path.is_empty());
        assert!(settings.analytics_enabled);
        assert!(settings.analytics_install_id.is_empty());
        assert!(!settings.analytics_first_run);
    }

    #[test]
    fn legacy_shortcuts_become_primary_bindings_with_cleanup_state() {
        let mut settings = UserSettings::default();
        settings.smart_shortcut = "A".to_owned();
        settings.hold_shortcut = "B".to_owned();
        settings.toggle_shortcut = "C".to_owned();
        settings.cleanup_enabled = true;
        let bindings = shortcut_bindings_from_legacy(&settings);
        assert_eq!(bindings.smart[0].shortcut, "A");
        assert!(bindings.smart[0].cleanup_enabled);
        assert_eq!(bindings.hold[0].shortcut, "B");
        assert_eq!(bindings.toggle[0].shortcut, "C");
    }

    #[test]
    fn locale_policy_normalizes_only_shipped_locales() {
        assert_eq!(canonicalize_app_locale(" EN "), Some("en".to_owned()));
        assert_eq!(canonicalize_app_locale("system"), Some("system".to_owned()));
        assert_eq!(canonicalize_app_locale("xx-invalid"), None);
        assert_eq!(canonicalize_app_locale_or_default(""), "system");
    }

    #[test]
    fn transcription_migration_wins_over_recording_and_three_months_is_retired() {
        let mut settings = UserSettings::default();
        migrate_auto_delete_from_legacy(
            &mut settings,
            RecordingPrunePolicy::Day,
            RecordingPrunePolicy::ThreeMonths,
        );
        assert_eq!(settings.auto_delete_target, AutoDeleteTarget::Transcripts);
        assert_eq!(settings.auto_delete_duration, RecordingPrunePolicy::Year);
    }

    #[test]
    fn personality_seed_does_not_replace_user_authored_instructions() {
        let mut personalities = default_personalities();
        personalities[0].instructions = vec!["Mine".to_owned()];
        seed_personality_notes(&mut personalities);
        assert_eq!(personalities[0].instructions, ["Mine"]);
        assert!(!personalities[1].instructions.is_empty());
    }

    #[test]
    fn default_personality_catalog_keeps_ids_sites_and_order() {
        let personalities = default_personalities();
        assert_eq!(
            personalities
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["messaging", "email", "notes", "coding"]
        );
        assert_eq!(personalities[0].websites, ["slack.com"]);
        assert_eq!(
            personalities[1].websites,
            ["mail.google.com", "outlook.com", "mail.yahoo.com"]
        );
        assert_eq!(
            personalities[2].websites,
            ["notion.so", "craft.do", "affine.pro", "obsidian.md"]
        );
        assert_eq!(
            personalities[3].websites,
            ["github.com", "gitlab.com", "bitbucket.org"]
        );
        assert!(personalities.iter().all(|item| item.enabled));
        assert!(personalities
            .iter()
            .all(|item| item.instructions.is_empty()));
    }

    #[test]
    fn primary_shortcut_projection_ignores_empty_groups_and_uses_first_entry() {
        let mut settings = UserSettings::default();
        settings.smart_shortcut = "legacy-smart".to_owned();
        settings.hold_shortcut = "legacy-hold".to_owned();
        settings.toggle_shortcut = "legacy-toggle".to_owned();
        settings.shortcut_bindings.smart = vec![
            ShortcutBinding {
                shortcut: "primary-smart".to_owned(),
                temporary: true,
                cleanup_enabled: true,
            },
            ShortcutBinding {
                shortcut: "secondary-smart".to_owned(),
                temporary: false,
                cleanup_enabled: false,
            },
        ];
        settings.shortcut_bindings.hold.clear();
        settings.shortcut_bindings.toggle = singleton_binding("primary-toggle".to_owned(), false);
        sync_legacy_shortcuts_from_bindings(&mut settings);
        assert_eq!(settings.smart_shortcut, "primary-smart");
        assert_eq!(settings.hold_shortcut, "legacy-hold");
        assert_eq!(settings.toggle_shortcut, "primary-toggle");
    }

    #[test]
    fn auto_delete_policy_routes_only_the_selected_content_kind() {
        let mut settings = UserSettings::default();
        settings.auto_delete_target = AutoDeleteTarget::Audio;
        settings.auto_delete_duration = RecordingPrunePolicy::Week;
        assert_eq!(
            auto_delete_recording_policy(&settings),
            RecordingPrunePolicy::Week
        );
        assert_eq!(
            auto_delete_transcription_policy(&settings),
            RecordingPrunePolicy::Never
        );
        settings.auto_delete_target = AutoDeleteTarget::Transcripts;
        assert_eq!(
            auto_delete_recording_policy(&settings),
            RecordingPrunePolicy::Never
        );
        assert_eq!(
            auto_delete_transcription_policy(&settings),
            RecordingPrunePolicy::Week
        );
    }

    #[test]
    fn public_provider_defaults_remain_wire_compatible() {
        assert_eq!(default_remote_speech_provider(), "openai");
        assert_eq!(
            default_remote_speech_endpoint(),
            "https://api.openai.com/v1"
        );
        assert_eq!(default_remote_speech_model(), "auto");
        assert_eq!(default_meeting_ai_provider(), "writing");
        assert_eq!(
            default_local_llm_model(),
            crate::local_llm::DEFAULT_MODEL_ID
        );
        assert!(matches!(
            default_local_model().as_str(),
            "parakeet_tdt_int8" | "cohere_transcribe_int4"
        ));
    }

    #[test]
    fn every_recording_retention_policy_maps_to_its_existing_cutoff() {
        let now = Local::now();
        assert_eq!(
            recording_prune_cutoff(RecordingPrunePolicy::Never, now),
            None
        );
        assert_eq!(
            recording_prune_cutoff(RecordingPrunePolicy::Immediately, now),
            Some(now)
        );
        assert_eq!(
            recording_prune_cutoff(RecordingPrunePolicy::Day, now),
            now.checked_sub_days(Days::new(1))
        );
        assert_eq!(
            recording_prune_cutoff(RecordingPrunePolicy::Week, now),
            now.checked_sub_days(Days::new(7))
        );
        assert_eq!(
            recording_prune_cutoff(RecordingPrunePolicy::Month, now),
            now.checked_sub_months(Months::new(1))
        );
        assert_eq!(
            recording_prune_cutoff(RecordingPrunePolicy::ThreeMonths, now),
            now.checked_sub_months(Months::new(3))
        );
        assert_eq!(
            recording_prune_cutoff(RecordingPrunePolicy::Year, now),
            now.checked_sub_months(Months::new(12))
        );
    }
}
