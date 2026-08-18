use std::collections::{HashMap, HashSet};

use regex::Regex;
use tauri::{AppHandle, Emitter};

use crate::{
    model_manager::{model_supports_capability, ReadyModel, MODEL_CAPABILITY_DICTIONARY},
    settings::{Replacement, UserSettings},
    AppRuntime, AppState, EVENT_SETTINGS_CHANGED,
};

pub const MAX_DICTIONARY_ENTRIES: usize = 200;
const MAX_DICTIONARY_CHARACTERS: usize = 160;
const MAX_REPLACEMENTS: usize = 64;
const MAX_REPLACEMENT_SOURCE_CHARACTERS: usize = 100;
const MAX_REPLACEMENT_TARGET_CHARACTERS: usize = 200;

struct FirstWins<T> {
    identities: HashSet<String>,
    values: Vec<T>,
    capacity: usize,
}

impl<T> FirstWins<T> {
    fn with_capacity(capacity: usize) -> Self {
        Self {
            identities: HashSet::with_capacity(capacity),
            values: Vec::with_capacity(capacity),
            capacity,
        }
    }

    fn insert(&mut self, identity: String, value: impl FnOnce() -> T) {
        if self.identities.insert(identity) {
            self.values.push(value());
        }
    }

    fn is_full(&self) -> bool {
        self.values.len() >= self.capacity
    }

    fn finish(self) -> Vec<T> {
        self.values
    }
}

pub fn sanitize_dictionary_entries(entries: &[String]) -> Vec<String> {
    let mut output = FirstWins::with_capacity(MAX_DICTIONARY_ENTRIES);
    for entry in entries {
        let term = entry.trim();
        if term.is_empty() {
            continue;
        }
        output.insert(term.to_lowercase(), || {
            term.chars()
                .take(MAX_DICTIONARY_CHARACTERS)
                .collect::<String>()
                .trim_end()
                .to_owned()
        });
        if output.is_full() {
            break;
        }
    }
    output.finish()
}

pub fn dictionary_entries_for_model(model: &ReadyModel, settings: &UserSettings) -> Vec<String> {
    if model_supports_capability(&model.key, MODEL_CAPABILITY_DICTIONARY) {
        sanitize_dictionary_entries(&settings.dictionary)
    } else {
        Vec::new()
    }
}

pub fn sanitize_replacements(replacements: &[Replacement]) -> Vec<Replacement> {
    let mut output = FirstWins::with_capacity(MAX_REPLACEMENTS);
    for replacement in replacements {
        let source = replacement.from.trim();
        if source.is_empty() {
            continue;
        }
        let target = replacement.to.trim();
        output.insert(source.to_lowercase(), || Replacement {
            from: capped_and_trimmed(source, MAX_REPLACEMENT_SOURCE_CHARACTERS),
            to: capped_and_trimmed(target, MAX_REPLACEMENT_TARGET_CHARACTERS),
        });
        if output.is_full() {
            break;
        }
    }
    output.finish()
}

fn capped_and_trimmed(value: &str, maximum: usize) -> String {
    value
        .chars()
        .take(maximum)
        .collect::<String>()
        .trim()
        .to_owned()
}

struct CompiledReplacement<'a> {
    matcher: Regex,
    target: &'a str,
}

impl<'a> CompiledReplacement<'a> {
    fn compile(replacement: &'a Replacement) -> Option<Self> {
        if replacement.from.is_empty() {
            return None;
        }
        let expression = format!(r"(?i)\b{}\b", regex::escape(&replacement.from));
        Regex::new(&expression).ok().map(|matcher| Self {
            matcher,
            target: &replacement.to,
        })
    }

    fn apply(&self, text: String) -> String {
        self.matcher
            .replace_all(&text, |capture: &regex::Captures| {
                mirror_case(&capture[0], self.target)
            })
            .into_owned()
    }
}

pub fn apply_replacements(text: &str, replacements: &[Replacement]) -> String {
    replacements
        .iter()
        .filter_map(CompiledReplacement::compile)
        .fold(text.to_owned(), |current, rule| rule.apply(current))
}

enum LetterCase {
    Upper,
    InitialUpper,
    Original,
}

impl LetterCase {
    fn detect(value: &str) -> Self {
        let all_uppercase = value.len() > 1
            && value
                .chars()
                .all(|character| !character.is_alphabetic() || character.is_uppercase());
        if all_uppercase {
            Self::Upper
        } else if value.chars().next().is_some_and(char::is_uppercase) {
            Self::InitialUpper
        } else {
            Self::Original
        }
    }
}

fn mirror_case(matched: &str, replacement: &str) -> String {
    if replacement.is_empty() {
        return String::new();
    }
    match LetterCase::detect(matched) {
        LetterCase::Upper => replacement.to_uppercase(),
        LetterCase::InitialUpper => {
            let mut characters = replacement.chars();
            match characters.next() {
                Some(first) => first.to_uppercase().collect::<String>() + characters.as_str(),
                None => String::new(),
            }
        }
        LetterCase::Original => replacement.to_owned(),
    }
}

#[tauri::command]
pub fn set_dictionary(
    entries: Vec<String>,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<Vec<String>, String> {
    let dictionary = sanitize_dictionary_entries(&entries);
    let mut settings = state.current_settings();
    settings.dictionary = dictionary.clone();
    settings.auto_dictionary_ignored =
        crate::auto_dictionary::remove_dictionary_entries_from_ignored(
            settings.auto_dictionary_ignored,
            &dictionary,
        );
    let saved = state
        .persist_settings(settings)
        .map_err(|error| error.to_string())?;
    crate::auto_dictionary::sync_ignored_dictionary_entries(&dictionary);
    emit_settings_update(&app, &saved);
    Ok(dictionary)
}

#[tauri::command]
pub fn get_replacements(state: tauri::State<AppState>) -> Result<Vec<Replacement>, String> {
    let mut settings = state.current_settings();
    let replacements = sanitize_replacements(&settings.replacements);
    if settings.replacements != replacements {
        settings.replacements = replacements.clone();
        state
            .persist_settings(settings)
            .map_err(|error| error.to_string())?;
    }
    Ok(replacements)
}

#[tauri::command]
pub fn set_replacements(
    replacements: Vec<Replacement>,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<Vec<Replacement>, String> {
    let replacements = sanitize_replacements(&replacements);
    let mut settings = state.current_settings();
    settings.replacements = replacements.clone();
    let saved = state
        .persist_settings(settings)
        .map_err(|error| error.to_string())?;
    emit_settings_update(&app, &saved);
    Ok(replacements)
}

fn emit_settings_update(app: &AppHandle<AppRuntime>, settings: &UserSettings) {
    if let Err(error) = app.emit(EVENT_SETTINGS_CHANGED, settings) {
        tracing::error!("Failed to emit settings change: {error}");
    }
}

struct SearchTerm {
    display: String,
    lowercase: String,
}

struct UsageAccumulator {
    terms: Vec<SearchTerm>,
    totals: HashMap<String, u32>,
}

impl UsageAccumulator {
    fn new(dictionary: &[String]) -> Self {
        let terms = dictionary
            .iter()
            .map(|term| SearchTerm {
                display: term.clone(),
                lowercase: term.to_lowercase(),
            })
            .collect::<Vec<_>>();
        let totals = terms.iter().map(|term| (term.display.clone(), 0)).collect();
        Self { terms, totals }
    }

    fn is_empty(&self) -> bool {
        self.terms.is_empty()
    }

    fn observe(&mut self, text: &str) {
        let haystack = text.to_lowercase();
        for term in &self.terms {
            let occurrences = whole_term_occurrences(&haystack, &term.lowercase);
            if occurrences != 0 {
                *self.totals.entry(term.display.clone()).or_default() += occurrences;
            }
        }
    }

    fn finish(self) -> HashMap<String, u32> {
        self.totals
    }
}

fn whole_term_occurrences(haystack: &str, needle: &str) -> u32 {
    if needle.is_empty() {
        return 0;
    }
    let bytes = haystack.as_bytes();
    let mut cursor = 0;
    let mut total = 0;
    while let Some(relative) = haystack[cursor..].find(needle) {
        let start = cursor + relative;
        let end = start + needle.len();
        let begins_at_boundary = start == 0 || !bytes[start - 1].is_ascii_alphanumeric();
        let ends_at_boundary = end == bytes.len() || !bytes[end].is_ascii_alphanumeric();
        total += u32::from(begins_at_boundary && ends_at_boundary);
        cursor = start + needle.len().max(1);
        if cursor >= haystack.len() {
            break;
        }
    }
    total
}

#[tauri::command]
pub fn get_dictionary_usage(state: tauri::State<AppState>) -> Result<HashMap<String, u32>, String> {
    let mut usage = UsageAccumulator::new(&state.current_settings().dictionary);
    if usage.is_empty() {
        return Ok(HashMap::new());
    }
    let records = state
        .storage()
        .get_all()
        .map_err(|error| format!("Failed to read transcriptions: {error}"))?;
    for record in records {
        usage.observe(&record.text);
    }
    Ok(usage.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replacement(from: &str, to: &str) -> Replacement {
        Replacement {
            from: from.to_owned(),
            to: to.to_owned(),
        }
    }

    #[test]
    fn dictionary_cleanup_is_first_wins_case_insensitive_and_unicode_safe() {
        let long = format!("{}  ", "ñ".repeat(170));
        let result = sanitize_dictionary_entries(&[
            "  Convex  ".to_owned(),
            "convex".to_owned(),
            "".to_owned(),
            "Marta Díaz".to_owned(),
            long,
        ]);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], "Convex");
        assert_eq!(result[1], "Marta Díaz");
        assert_eq!(result[2].chars().count(), MAX_DICTIONARY_CHARACTERS);
    }

    #[test]
    fn dictionary_capacity_stops_after_the_first_two_hundred_terms() {
        let source = (0..MAX_DICTIONARY_ENTRIES + 5)
            .map(|index| format!("term-{index}"))
            .collect::<Vec<_>>();
        let cleaned = sanitize_dictionary_entries(&source);
        assert_eq!(cleaned.len(), MAX_DICTIONARY_ENTRIES);
        assert_eq!(cleaned.last().map(String::as_str), Some("term-199"));
    }

    #[test]
    fn replacement_cleanup_trims_caps_and_deduplicates_by_source() {
        let long_source = "a".repeat(120);
        let long_target = "b".repeat(220);
        let cleaned = sanitize_replacements(&[
            replacement("  Looper  ", " Dictation "),
            replacement("looper", "ignored"),
            replacement("", "empty source"),
            replacement(&long_source, &long_target),
        ]);
        assert_eq!(cleaned.len(), 2);
        assert_eq!(cleaned[0], replacement("Looper", "Dictation"));
        assert_eq!(cleaned[1].from.chars().count(), 100);
        assert_eq!(cleaned[1].to.chars().count(), 200);
    }

    #[test]
    fn sequential_replacements_keep_word_boundaries_and_mirror_case() {
        let rules = [replacement("cat", "dog"), replacement("dog park", "garden")];
        assert_eq!(
            apply_replacements("cat Cat CAT scatter cat dog park", &rules),
            "dog Dog DOG scatter dog garden"
        );
    }

    #[test]
    fn empty_target_deletes_only_complete_matching_words() {
        assert_eq!(
            apply_replacements("keep remove removed", &[replacement("remove", "")]),
            "keep  removed"
        );
    }

    #[test]
    fn whole_term_counter_handles_boundaries_punctuation_and_phrases() {
        assert_eq!(
            whole_term_occurrences("convex and convex again", "convex"),
            2
        );
        assert_eq!(whole_term_occurrences("convex", "con"), 0);
        assert_eq!(whole_term_occurrences("use convex, please", "convex"), 1);
        assert_eq!(
            whole_term_occurrences("ping marta díaz today; marta díaz again", "marta díaz"),
            2
        );
        assert_eq!(whole_term_occurrences("nothing here", "convex"), 0);
    }

    #[test]
    fn usage_accumulator_preserves_dictionary_display_keys_and_duplicate_semantics() {
        let mut usage = UsageAccumulator::new(&[
            "Convex".to_owned(),
            "convex".to_owned(),
            "Convex".to_owned(),
        ]);
        usage.observe("Convex once");
        usage.observe("convex twice, convex again");
        let totals = usage.finish();
        assert_eq!(totals["Convex"], 6);
        assert_eq!(totals["convex"], 3);
    }

    #[test]
    fn no_replacement_rules_returns_the_original_text() {
        assert_eq!(apply_replacements("Untouched", &[]), "Untouched");
    }
}
