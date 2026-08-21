pub(crate) mod icons;

use std::{collections::HashSet, sync::OnceLock};

use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub use icons::{InstalledApp, WebsiteIcon};

use crate::settings::{AppBinding, Personality, UserSettings};
use crate::{AppRuntime, AppState, EVENT_SETTINGS_CHANGED};

const MAX_PERSONALITIES: usize = 32;
const MAX_APPS_PER_PERSONALITY: usize = 64;
const MAX_WEBSITES_PER_PERSONALITY: usize = 64;
const MAX_NAME_CHARS: usize = 60;
const MAX_APP_IDENTIFIER_CHARS: usize = 255;
const MAX_WEBSITE_CHARS: usize = 120;

// Shared with the frontend through personalization-limits.json so the character
// budget the backend enforces and the counter the UI renders cannot drift apart.
//
// The value is parsed at runtime, but a bad file must NEVER reach a user: the
// `personalization_limits_wire_is_valid` test below fails the build if the JSON
// stops parsing or goes non-positive. Runtime therefore degrades to the frozen
// default instead of panicking — a settings screen that enforces a stale limit
// is recoverable, a process that aborts on startup is not.
const PERSONALIZATION_LIMITS_WIRE: &str = include_str!("../../../personalization-limits.json");
const DEFAULT_MAX_INSTRUCTION_CHARS: usize = 3_000;
static MAX_INSTRUCTION_CHARS: OnceLock<usize> = OnceLock::new();

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonalizationLimits {
    max_instruction_chars: usize,
}

// `None` when the wire file is unusable, so both the runtime fallback and the
// build-time test read the same parse.
fn parse_instruction_limit(wire: &str) -> Option<usize> {
    let limits: PersonalizationLimits = serde_json::from_str(wire).ok()?;
    (limits.max_instruction_chars > 0).then_some(limits.max_instruction_chars)
}

fn max_instruction_chars() -> usize {
    *MAX_INSTRUCTION_CHARS.get_or_init(|| {
        parse_instruction_limit(PERSONALIZATION_LIMITS_WIRE)
            .unwrap_or(DEFAULT_MAX_INSTRUCTION_CHARS)
    })
}

struct UniqueIds {
    claimed: HashSet<String>,
}

impl UniqueIds {
    fn new() -> Self {
        Self {
            claimed: HashSet::new(),
        }
    }

    fn issue(&mut self, requested: &str) -> String {
        let mut candidate = requested.trim().to_owned();
        if candidate.is_empty() {
            candidate = Uuid::new_v4().to_string();
        }
        while !self.claimed.insert(candidate.to_lowercase()) {
            candidate = Uuid::new_v4().to_string();
        }
        candidate
    }
}

struct InstructionBudget {
    remaining: usize,
    has_previous: bool,
}

impl InstructionBudget {
    fn new() -> Self {
        Self {
            remaining: max_instruction_chars(),
            has_previous: false,
        }
    }

    fn accept(&mut self, instruction: &str) -> Option<String> {
        if self.remaining == 0 {
            return None;
        }

        let separator_cost = usize::from(self.has_previous);
        if self.remaining <= separator_cost {
            return None;
        }

        let allowed = self.remaining - separator_cost;
        let accepted: String = instruction.chars().take(allowed).collect();
        self.remaining -= separator_cost + accepted.chars().count();
        self.has_previous = true;
        Some(accepted)
    }
}

fn clean_instructions(source: &[String]) -> Vec<String> {
    let mut budget = InstructionBudget::new();
    source
        .iter()
        .map_while(|instruction| budget.accept(instruction))
        .collect()
}

fn clean_websites(source: &[String]) -> Vec<String> {
    let mut identities = HashSet::new();
    let mut websites = Vec::new();

    for candidate in source {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }

        let capped: String = trimmed.chars().take(MAX_WEBSITE_CHARS).collect();
        let capped = capped.trim();
        let identity = capped.to_lowercase();
        if identities.insert(identity.clone()) {
            websites.push(identity);
        }
        if websites.len() == MAX_WEBSITES_PER_PERSONALITY {
            break;
        }
    }

    websites
}

fn names_backed_by_identifiers(personalities: &[Personality]) -> HashSet<String> {
    let mut names = HashSet::new();
    for personality in personalities {
        for app in &personality.apps {
            let has_identifier = app
                .identifier
                .as_deref()
                .is_some_and(|identifier| !identifier.trim().is_empty());
            if !has_identifier {
                continue;
            }

            let bounded_name: String = app.name.trim().chars().take(MAX_NAME_CHARS).collect();
            if !bounded_name.is_empty() {
                names.insert(bounded_name.to_lowercase());
            }
        }
    }
    names
}

struct AppAssignments {
    claimed: HashSet<String>,
    identified_names: HashSet<String>,
}

impl AppAssignments {
    fn scan(personalities: &[Personality]) -> Self {
        Self {
            claimed: HashSet::new(),
            identified_names: names_backed_by_identifiers(personalities),
        }
    }

    fn clean(&mut self, source: &[AppBinding]) -> Vec<AppBinding> {
        let mut apps = Vec::new();
        for candidate in source {
            let name: String = candidate.name.trim().chars().take(MAX_NAME_CHARS).collect();
            if name.is_empty() {
                continue;
            }

            let identifier = candidate
                .identifier
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| {
                    value
                        .chars()
                        .take(MAX_APP_IDENTIFIER_CHARS)
                        .collect::<String>()
                        .to_lowercase()
                });
            let normalized_name = name.to_lowercase();
            if identifier.is_none() && self.identified_names.contains(&normalized_name) {
                continue;
            }

            let identity = identifier
                .as_ref()
                .map(|identifier| format!("id:{identifier}"))
                .unwrap_or_else(|| format!("name:{normalized_name}"));
            if !self.claimed.insert(identity) {
                continue;
            }

            apps.push(AppBinding { name, identifier });
            if apps.len() == MAX_APPS_PER_PERSONALITY {
                break;
            }
        }
        apps
    }
}

struct PersonalitySanitizer {
    ids: UniqueIds,
    apps: AppAssignments,
}

impl PersonalitySanitizer {
    fn for_input(input: &[Personality]) -> Self {
        Self {
            ids: UniqueIds::new(),
            apps: AppAssignments::scan(input),
        }
    }

    fn run(mut self, input: &[Personality]) -> Vec<Personality> {
        let mut output = Vec::new();
        for candidate in input {
            let name = candidate.name.trim();
            if name.is_empty() {
                continue;
            }

            let bounded_name: String = name.chars().take(MAX_NAME_CHARS).collect();
            output.push(Personality {
                id: self.ids.issue(&candidate.id),
                name: bounded_name.trim().to_owned(),
                enabled: candidate.enabled,
                apps: self.apps.clean(&candidate.apps),
                websites: clean_websites(&candidate.websites),
                instructions: clean_instructions(&candidate.instructions),
            });
            if output.len() == MAX_PERSONALITIES {
                break;
            }
        }
        output
    }
}

pub fn sanitize_personalities(entries: &[Personality]) -> Vec<Personality> {
    PersonalitySanitizer::for_input(entries).run(entries)
}

fn personality_for_preview(settings: &UserSettings, id: &str) -> Result<Personality, String> {
    settings
        .personalities
        .iter()
        .find(|personality| personality.id == id)
        .cloned()
        .ok_or_else(|| "Style not found".to_string())
}

#[tauri::command]
pub fn get_personalities(state: tauri::State<AppState>) -> Result<Vec<Personality>, String> {
    let mut settings = state.current_settings();
    let personalities = sanitize_personalities(&settings.personalities);
    if personalities != settings.personalities {
        settings.personalities = personalities.clone();
        state
            .persist_settings(settings)
            .map_err(|error| error.to_string())?;
    }
    Ok(personalities)
}

#[tauri::command]
pub fn set_personalities(
    personalities: Vec<Personality>,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<Vec<Personality>, String> {
    let personalities = sanitize_personalities(&personalities);
    let mut settings = state.current_settings();
    settings.personalities.clone_from(&personalities);
    let saved = state
        .persist_settings(settings)
        .map_err(|error| error.to_string())?;

    if let Err(error) = app.emit(EVENT_SETTINGS_CHANGED, &saved) {
        tracing::error!("Failed to emit settings change: {error}");
    }
    Ok(personalities)
}

#[tauri::command]
pub fn list_installed_apps(app: AppHandle<AppRuntime>) -> Result<Vec<InstalledApp>, String> {
    icons::list_installed_apps(app)
}

#[tauri::command]
pub fn list_website_icons(
    sites: Vec<String>,
    app: AppHandle<AppRuntime>,
) -> Result<Vec<WebsiteIcon>, String> {
    icons::list_website_icons(sites, app)
}

/// Aplica un estilo a un texto de muestra para que el usuario vea cómo escribe
/// Looper con ese estilo, sin tener que dictar en otra app y volver.
#[tauri::command]
pub async fn preview_personality_style(
    app: AppHandle<AppRuntime>,
    personality_id: String,
    text: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let sample = text.trim();
    if sample.is_empty() {
        return Err("Nothing to preview".to_string());
    }

    let settings = state.current_settings_unmasked();
    let personality = personality_for_preview(&settings, &personality_id)?;
    crate::llm_cleanup::cleanup_transcription(
        &app,
        &state.http(),
        sample,
        &settings,
        Some(&personality),
        None,
    )
    .await
    .map_err(|error| crate::llm_cleanup::llm_issue_message(&error))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    // The build-time guard that lets `max_instruction_chars()` fall back instead
    // of panicking: a malformed or non-positive wire file fails here, in CI,
    // rather than aborting the app in front of a user.
    #[test]
    fn personalization_limits_wire_is_valid() {
        assert_eq!(
            parse_instruction_limit(PERSONALIZATION_LIMITS_WIRE),
            Some(max_instruction_chars()),
            "personalization-limits.json must parse to a positive maxInstructionChars"
        );
    }

    #[test]
    fn instruction_limit_rejects_unusable_wire_files() {
        assert_eq!(parse_instruction_limit("not json"), None);
        assert_eq!(parse_instruction_limit(r#"{"maxInstructionChars":0}"#), None);
        assert_eq!(parse_instruction_limit("{}"), None);
        assert_eq!(
            parse_instruction_limit(r#"{"maxInstructionChars":1234}"#),
            Some(1234)
        );
    }

    fn personality(id: &str, name: &str) -> Personality {
        Personality {
            id: id.to_owned(),
            name: name.to_owned(),
            enabled: true,
            apps: Vec::new(),
            websites: Vec::new(),
            instructions: Vec::new(),
        }
    }

    fn identified_app(name: &str, identifier: &str) -> AppBinding {
        AppBinding {
            name: name.to_owned(),
            identifier: Some(identifier.to_owned()),
        }
    }

    #[test]
    fn personality_wire_shape_keeps_all_frontend_fields() {
        let mut mode = personality("focused", "Focused");
        mode.apps = vec![identified_app("Mail", "com.apple.mail")];
        mode.websites = vec!["mail.example.com".to_owned()];
        mode.instructions = vec!["Be concise".to_owned()];

        assert_eq!(
            serde_json::to_value(mode).expect("serialize personality"),
            json!({
                "id": "focused",
                "name": "Focused",
                "enabled": true,
                "apps": [{ "name": "Mail", "identifier": "com.apple.mail" }],
                "websites": ["mail.example.com"],
                "instructions": ["Be concise"]
            })
        );
    }

    #[test]
    fn sanitizer_preserves_order_caps_and_case_insensitive_identity() {
        let mut first = personality(" Shared ", &format!(" {} ", "N".repeat(70)));
        first.websites = vec![
            " Example.COM ".to_owned(),
            "example.com".to_owned(),
            format!("{}TAIL", "x".repeat(MAX_WEBSITE_CHARS)),
        ];
        let duplicate = personality("shared", "Second");

        let cleaned = sanitize_personalities(&[first, duplicate]);

        assert_eq!(cleaned.len(), 2);
        assert_eq!(cleaned[0].id, "Shared");
        assert_eq!(cleaned[0].name.chars().count(), MAX_NAME_CHARS);
        assert_eq!(cleaned[0].websites[0], "example.com");
        assert_eq!(cleaned[0].websites[1].chars().count(), MAX_WEBSITE_CHARS);
        assert_ne!(cleaned[1].id.to_lowercase(), "shared");
        assert!(Uuid::parse_str(&cleaned[1].id).is_ok());
    }

    #[test]
    fn instruction_budget_counts_newline_separators_without_trimming_rows() {
        let mut mode = personality("notes", "Notes");
        mode.instructions = vec![" a ".to_owned(), "b".repeat(max_instruction_chars())];

        let cleaned = sanitize_personalities(&[mode]);

        assert_eq!(cleaned[0].instructions[0], " a ");
        assert_eq!(cleaned[0].instructions[1].chars().count(), 2_996);
        assert_eq!(cleaned[0].instructions.join("\n").chars().count(), 3_000);
    }

    #[test]
    fn identified_binding_claims_are_global_but_identifiers_remain_distinct() {
        let mut first = personality("first", "First");
        first.apps = vec![identified_app("Notes", " COM.APPLE.NOTES ")];
        let mut second = personality("second", "Second");
        second.apps = vec![
            identified_app("Notes", "com.example.notes"),
            identified_app("Other label", "com.apple.notes"),
        ];

        let cleaned = sanitize_personalities(&[first, second]);

        assert_eq!(
            cleaned[0].apps[0].identifier.as_deref(),
            Some("com.apple.notes")
        );
        assert_eq!(cleaned[1].apps.len(), 1);
        assert_eq!(
            cleaned[1].apps[0].identifier.as_deref(),
            Some("com.example.notes")
        );
    }

    #[test]
    fn any_identified_name_suppresses_legacy_bindings_before_row_filtering() {
        let mut ignored = personality("ignored", "   ");
        ignored.apps = vec![identified_app("Slack", "com.tinyspeck.slackmacgap")];
        let mut legacy = personality("legacy", "Legacy");
        legacy.apps = vec![AppBinding::legacy("Slack")];

        let cleaned = sanitize_personalities(&[ignored, legacy]);

        assert_eq!(cleaned.len(), 1);
        assert!(cleaned[0].apps.is_empty());
    }

    #[test]
    fn sanitizer_keeps_collection_limits_and_first_personality_order() {
        let candidates: Vec<_> = (0..40)
            .map(|index| {
                let mut mode = personality(&format!("mode-{index}"), &format!("Mode {index}"));
                mode.apps = (0..70)
                    .map(|app| {
                        identified_app(&format!("App {index}-{app}"), &format!("id.{index}.{app}"))
                    })
                    .collect();
                mode.websites = (0..70).map(|site| format!("{site}.example.com")).collect();
                mode
            })
            .collect();

        let cleaned = sanitize_personalities(&candidates);

        assert_eq!(cleaned.len(), MAX_PERSONALITIES);
        assert_eq!(cleaned[0].id, "mode-0");
        assert_eq!(cleaned[31].id, "mode-31");
        assert_eq!(cleaned[0].apps.len(), MAX_APPS_PER_PERSONALITY);
        assert_eq!(cleaned[0].websites.len(), MAX_WEBSITES_PER_PERSONALITY);
    }

    #[test]
    fn preview_lookup_keeps_public_not_found_error_and_exact_id_matching() {
        let mut settings = UserSettings::default();
        settings.personalities = vec![personality("CaseSensitive", "Mode")];

        assert_eq!(
            personality_for_preview(&settings, "casesensitive"),
            Err("Style not found".to_string())
        );
        assert_eq!(
            personality_for_preview(&settings, "CaseSensitive")
                .expect("find exact id")
                .name,
            "Mode"
        );
    }
}
