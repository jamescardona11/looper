// User snippets (F3): dictating `trigger` inserts `expansion` instead.
// Storage/commands mirror `dictionary.rs`'s replacements; the pipeline applies
// snippets right after replacements (see `transcribe.rs`). Distinct from
// `personalization_snippets.rs`, which expands `{{...}}` template variables in
// personality prompts.

use std::collections::HashSet;
use std::sync::OnceLock;

use tauri::{AppHandle, Emitter};

use crate::{settings::UserSnippet, AppRuntime, AppState, EVENT_SETTINGS_CHANGED};

const MAX_DYNAMIC_VALUE_LEN: usize = 20_000;
static SENSITIVE_RE: OnceLock<regex::Regex> = OnceLock::new();

#[derive(Debug, Clone, Default)]
pub struct UserSnippetContext {
    pub active: Option<crate::personalization_snippets::SnippetContext>,
    pub clipboard: Option<String>,
    pub selection: Option<String>,
}

impl UserSnippetContext {
    pub fn capture(snippets: &[UserSnippet], text: &str, selection: Option<&str>) -> Self {
        let needs_clipboard = snippets.iter().any(|snippet| {
            snippet_matches(text, &snippet.trigger)
                && SENSITIVE_RE
                    .get_or_init(|| {
                        regex::Regex::new(r"(?i)\{\{\s*(clipboard|selection)\s*\}\}").unwrap()
                    })
                    .captures_iter(&snippet.expansion)
                    .any(|captures| captures[1].eq_ignore_ascii_case("clipboard"))
        });
        Self {
            active: crate::accessibility_context::get_active_context()
                .as_ref()
                .map(crate::personalization_snippets::SnippetContext::from_active_context),
            clipboard: needs_clipboard
                .then(|| crate::assistive::read_text_from_clipboard(MAX_DYNAMIC_VALUE_LEN))
                .flatten(),
            selection: selection.and_then(bounded_dynamic_value),
        }
    }
}

fn snippet_matches(text: &str, trigger: &str) -> bool {
    let pattern = format!(r"(?i)\b{}\b", regex::escape(trigger));
    regex::Regex::new(&pattern).is_ok_and(|regex| regex.is_match(text))
}

fn bounded_dynamic_value(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.chars().take(MAX_DYNAMIC_VALUE_LEN).collect())
}

pub fn sanitize_user_snippets(snippets: &[UserSnippet]) -> Vec<UserSnippet> {
    let mut seen = HashSet::new();
    let mut cleaned = Vec::new();

    for s in snippets {
        let trigger = s.trigger.trim();
        let expansion = s.expansion.trim();
        if trigger.is_empty() || expansion.is_empty() {
            continue;
        }
        let key = trigger.to_lowercase();
        if seen.insert(key) {
            let trigger_capped: String = trigger.chars().take(100).collect();
            let expansion_capped: String = expansion.chars().take(2000).collect();
            cleaned.push(UserSnippet {
                trigger: trigger_capped.trim().to_string(),
                expansion: expansion_capped.trim().to_string(),
            });
        }
        if cleaned.len() >= 64 {
            break;
        }
    }

    cleaned
}

/// Replaces every whole-word, case-insensitive occurrence of each snippet's
/// trigger with its expansion. Unlike `dictionary::apply_replacements`, the
/// expansion is inserted verbatim (no case-pattern mirroring): it's full text,
/// not a corrected word.
pub fn apply_user_snippets(text: &str, snippets: &[UserSnippet]) -> String {
    apply_user_snippets_with_context(text, snippets, &UserSnippetContext::default())
}

pub fn apply_user_snippets_with_context(
    text: &str,
    snippets: &[UserSnippet],
    context: &UserSnippetContext,
) -> String {
    if snippets.is_empty() {
        return text.to_string();
    }

    let mut result = text.to_string();
    for s in snippets {
        if s.trigger.is_empty() {
            continue;
        }
        let pattern = format!(r"(?i)\b{}\b", regex::escape(&s.trigger));
        if let Ok(re) = regex::Regex::new(&pattern) {
            let expansion = expand_user_snippet_template(&s.expansion, context);
            // NoExpand: a `$` in the expansion must stay literal, not become a
            // capture-group reference.
            result = re
                .replace_all(&result, regex::NoExpand(&expansion))
                .to_string();
        }
    }
    result
}

fn expand_user_snippet_template(template: &str, context: &UserSnippetContext) -> String {
    let expanded = crate::personalization_snippets::expand_personalization_snippets(
        template,
        context.active.as_ref(),
    );
    let re = SENSITIVE_RE
        .get_or_init(|| regex::Regex::new(r"(?i)\{\{\s*(clipboard|selection)\s*\}\}").unwrap());
    re.replace_all(&expanded, |captures: &regex::Captures| {
        match captures[1].to_ascii_lowercase().as_str() {
            "clipboard" => context.clipboard.clone(),
            "selection" => context.selection.clone(),
            _ => None,
        }
        .unwrap_or_else(|| captures[0].to_string())
    })
    .to_string()
}

#[tauri::command]
pub fn get_snippets(state: tauri::State<AppState>) -> Result<Vec<UserSnippet>, String> {
    let mut settings = state.current_settings();
    let cleaned = sanitize_user_snippets(&settings.user_snippets);
    if cleaned != settings.user_snippets {
        settings.user_snippets = cleaned.clone();
        state
            .persist_settings(settings)
            .map_err(|err| err.to_string())?;
    }
    Ok(cleaned)
}

#[tauri::command]
pub fn set_snippets(
    snippets: Vec<UserSnippet>,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<Vec<UserSnippet>, String> {
    let cleaned = sanitize_user_snippets(&snippets);
    let mut settings = state.current_settings();
    settings.user_snippets = cleaned.clone();
    let saved = state
        .persist_settings(settings)
        .map_err(|err| err.to_string())?;
    if let Err(err) = app.emit(EVENT_SETTINGS_CHANGED, &saved) {
        tracing::error!("Failed to emit settings change: {err}");
    }
    Ok(cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snippet(trigger: &str, expansion: &str) -> UserSnippet {
        UserSnippet {
            trigger: trigger.to_string(),
            expansion: expansion.to_string(),
        }
    }

    #[test]
    fn expands_trigger_in_the_middle_of_a_sentence() {
        let snippets = vec![snippet("my address", "123 Main St, Springfield")];
        assert_eq!(
            apply_user_snippets("send it to my address please", &snippets),
            "send it to 123 Main St, Springfield please"
        );
    }

    #[test]
    fn matches_case_insensitively_and_inserts_expansion_verbatim() {
        let snippets = vec![snippet("sig", "Best regards,\nZoro")];
        assert_eq!(apply_user_snippets("Sig", &snippets), "Best regards,\nZoro");
        assert_eq!(apply_user_snippets("SIG", &snippets), "Best regards,\nZoro");
    }

    #[test]
    fn expands_multi_word_trigger() {
        let snippets = vec![snippet("meeting link", "https://meet.example.com/zoro")];
        assert_eq!(
            apply_user_snippets("Here's the meeting link.", &snippets),
            "Here's the https://meet.example.com/zoro."
        );
    }

    #[test]
    fn leaves_text_untouched_without_a_match() {
        let snippets = vec![snippet("sig", "Best regards")];
        assert_eq!(
            apply_user_snippets("signature design", &snippets),
            "signature design"
        );
        assert_eq!(
            apply_user_snippets("no triggers here", &[]),
            "no triggers here"
        );
    }

    #[test]
    fn does_not_expand_partial_word_matches() {
        let snippets = vec![snippet("addr", "123 Main St")];
        assert_eq!(
            apply_user_snippets("my address book", &snippets),
            "my address book"
        );
    }

    #[test]
    fn dollar_signs_in_expansion_stay_literal() {
        let snippets = vec![snippet("price", "$100")];
        assert_eq!(
            apply_user_snippets("the price is set", &snippets),
            "the $100 is set"
        );
    }

    #[test]
    fn expands_dynamic_and_sensitive_values_after_trigger_matching() {
        let snippets = vec![snippet(
            "stamp",
            "{{DATE}} — {{CLIPBOARD}} — {{SELECTION}} — {{APP}}",
        )];
        let context = UserSnippetContext {
            active: Some(crate::personalization_snippets::SnippetContext {
                app_name: Some("Mail".to_string()),
                ..Default::default()
            }),
            clipboard: Some("local clipboard".to_string()),
            selection: Some("selected text".to_string()),
        };

        let expanded = apply_user_snippets_with_context("insert stamp", &snippets, &context);

        assert!(expanded.starts_with("insert "));
        assert!(expanded.contains("local clipboard — selected text — Mail"));
        assert!(!expanded.contains("{{DATE}}"));
    }

    #[test]
    fn leaves_unavailable_sensitive_values_visible() {
        let snippets = vec![snippet("clip", "{{CLIPBOARD}}")];
        assert_eq!(apply_user_snippets("clip", &snippets), "{{CLIPBOARD}}");
    }

    #[test]
    fn clipboard_is_read_only_for_a_matching_sensitive_snippet() {
        let snippets = vec![
            snippet("clip", "{{CLIPBOARD}}"),
            snippet("plain", "No sensitive value"),
        ];
        assert!(snippet_matches("insert clip", &snippets[0].trigger));
        assert!(!snippet_matches("insert plain", &snippets[0].trigger));
    }

    #[test]
    fn sanitize_trims_dedupes_and_drops_incomplete_rows() {
        let cleaned = sanitize_user_snippets(&[
            snippet(" sig ", " Best regards "),
            snippet("SIG", "duplicate, dropped"),
            snippet("", "no trigger"),
            snippet("no expansion", ""),
        ]);
        assert_eq!(cleaned, vec![snippet("sig", "Best regards")]);
    }
}
