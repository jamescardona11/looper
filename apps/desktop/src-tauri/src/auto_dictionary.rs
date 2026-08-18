use std::{
    collections::HashSet,
    sync::OnceLock,
    thread,
    time::{Duration, Instant},
};

use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

use crate::{
    assistive::{self, FocusedTextSnapshot},
    dictionary,
    settings::UserSettings,
    toast, AppRuntime, AppState, EVENT_SETTINGS_CHANGED,
};

const WATCH_START_DELAY: Duration = Duration::from_millis(500);
const WATCH_POLL_DELAY: Duration = Duration::from_millis(300);
const EDIT_SETTLE_DELAY: Duration = Duration::from_secs(2);
const WATCH_LIFETIME: Duration = Duration::from_secs(30);
const MAX_TERM_CHARACTERS: usize = 160;
const MAX_REPLACED_WORDS: usize = 4;
const MAX_IGNORED_TERMS: usize = 128;

#[derive(Default)]
struct SuggestionRuntime {
    pending: Option<String>,
    ignored: HashSet<String>,
}

static SUGGESTION_RUNTIME: OnceLock<Mutex<SuggestionRuntime>> = OnceLock::new();

fn runtime() -> &'static Mutex<SuggestionRuntime> {
    SUGGESTION_RUNTIME.get_or_init(|| Mutex::new(SuggestionRuntime::default()))
}

struct EditWatch {
    original: String,
    latest: String,
    latest_change: Instant,
    analyzed: Option<String>,
}

impl EditWatch {
    fn new(original: String, now: Instant) -> Self {
        Self {
            latest: original.clone(),
            original,
            latest_change: now,
            analyzed: None,
        }
    }

    fn settled_edit(&mut self, observed: String, now: Instant) -> Option<String> {
        if observed != self.latest {
            self.latest = observed;
            self.latest_change = now;
        }
        if self.latest == self.original
            || now.duration_since(self.latest_change) < EDIT_SETTLE_DELAY
        {
            return None;
        }
        if self.analyzed.as_ref() == Some(&self.latest) {
            return None;
        }
        self.analyzed = Some(self.latest.clone());
        Some(self.latest.clone())
    }
}

pub(crate) fn start_after_paste(
    app: AppHandle<AppRuntime>,
    pre_paste: FocusedTextSnapshot,
    inserted_text: String,
    dictionary_entries: Vec<String>,
    ignored_entries: Vec<String>,
) {
    if inserted_text.trim().is_empty() {
        return;
    }

    let dictionary_entries = dictionary::sanitize_dictionary_entries(&dictionary_entries);
    if dictionary_entries.len() >= dictionary::MAX_DICTIONARY_ENTRIES {
        return;
    }
    replace_runtime_ignored(&ignored_entries);
    sync_ignored_dictionary_entries(&dictionary_entries);

    thread::spawn(move || watch_for_correction(app, pre_paste, inserted_text, dictionary_entries));
}

fn watch_for_correction(
    app: AppHandle<AppRuntime>,
    pre_paste: FocusedTextSnapshot,
    inserted_text: String,
    dictionary_entries: Vec<String>,
) {
    thread::sleep(WATCH_START_DELAY);
    let started = Instant::now();
    let mut watch = EditWatch::new(pre_paste.value.clone(), Instant::now());

    while started.elapsed() < WATCH_LIFETIME {
        thread::sleep(WATCH_POLL_DELAY);
        let Some(snapshot) = assistive::focused_text_snapshot() else {
            return;
        };
        if !same_target(&pre_paste, &snapshot) {
            return;
        }
        let Some(current_value) = watch.settled_edit(snapshot.value, Instant::now()) else {
            continue;
        };
        let Some(candidate) = detect_candidate(
            &pre_paste.value,
            &inserted_text,
            &current_value,
            &dictionary_entries,
        ) else {
            continue;
        };
        if runtime_ignores(&candidate) {
            return;
        }

        remember_pending(candidate.clone());
        toast::emit_toast(&app, suggestion_toast(&candidate));
        return;
    }
}

fn suggestion_toast(candidate: &str) -> toast::Payload {
    toast::Payload {
        toast_type: "info".to_owned(),
        title: None,
        message: format!("Add \"{candidate}\" to dictionary?"),
        auto_dismiss: Some(false),
        duration: None,
        retry_id: Some(candidate.to_owned()),
        mode: None,
        action: Some("accept_auto_dictionary_suggestion".to_owned()),
        action_label: Some("Add".to_owned()),
        secondary_action: Some("reject_auto_dictionary_suggestion".to_owned()),
        secondary_action_label: Some("Never".to_owned()),
    }
}

#[derive(Clone, Copy)]
enum SuggestionDecision {
    Accept,
    Reject,
}

impl SuggestionDecision {
    fn apply(self, mut settings: UserSettings, suggestion: &str) -> UserSettings {
        match self {
            Self::Accept => {
                settings.dictionary.push(suggestion.to_owned());
                settings.dictionary = dictionary::sanitize_dictionary_entries(&settings.dictionary);
                settings.auto_dictionary_ignored = remove_dictionary_entries_from_ignored(
                    settings.auto_dictionary_ignored,
                    &settings.dictionary,
                );
            }
            Self::Reject => {
                settings.auto_dictionary_ignored.push(suggestion.to_owned());
                settings.auto_dictionary_ignored =
                    clean_ignored_terms(&settings.auto_dictionary_ignored);
            }
        }
        settings
    }

    fn commit_runtime(self, suggestion: &str) {
        let mut state = runtime().lock();
        match self {
            Self::Accept => {
                state.ignored.remove(&term_key(suggestion));
            }
            Self::Reject => {
                state.ignored.insert(term_key(suggestion));
            }
        }
        if state.pending.as_deref() == Some(suggestion) {
            state.pending = None;
        }
    }
}

fn emit_settings_change(app: &AppHandle<AppRuntime>, settings: &UserSettings) {
    if let Err(error) = app.emit(EVENT_SETTINGS_CHANGED, settings) {
        tracing::error!("Failed to emit settings change: {error}");
    }
}

#[tauri::command]
pub(crate) fn accept_auto_dictionary_suggestion(
    suggestion: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<Vec<String>, String> {
    let suggestion = suggestion.trim().to_owned();
    if suggestion.is_empty() {
        return Ok(state.current_settings().dictionary);
    }

    let next = SuggestionDecision::Accept.apply(state.current_settings(), &suggestion);
    let saved = state
        .persist_settings(next)
        .map_err(|error| error.to_string())?;
    SuggestionDecision::Accept.commit_runtime(&suggestion);
    emit_settings_change(&app, &saved);
    Ok(saved.dictionary)
}

#[tauri::command]
pub(crate) fn reject_auto_dictionary_suggestion(
    suggestion: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<Vec<String>, String> {
    let suggestion = suggestion.trim().to_owned();
    if suggestion.is_empty() {
        return Ok(state.current_settings().auto_dictionary_ignored);
    }

    let next = SuggestionDecision::Reject.apply(state.current_settings(), &suggestion);
    let saved = state
        .persist_settings(next)
        .map_err(|error| error.to_string())?;
    SuggestionDecision::Reject.commit_runtime(&suggestion);
    emit_settings_change(&app, &saved);
    Ok(saved.auto_dictionary_ignored)
}

pub(crate) fn clear_pending_suggestion() {
    runtime().lock().pending = None;
}

pub(crate) fn sync_ignored_dictionary_entries(dictionary_entries: &[String]) {
    let mut state = runtime().lock();
    for entry in dictionary_entries {
        state.ignored.remove(&term_key(entry));
    }
}

pub(crate) fn remove_dictionary_entries_from_ignored(
    ignored_entries: Vec<String>,
    dictionary_entries: &[String],
) -> Vec<String> {
    let dictionary_keys: HashSet<_> = dictionary_entries
        .iter()
        .map(|entry| term_key(entry))
        .collect();
    let retained: Vec<_> = ignored_entries
        .into_iter()
        .filter(|entry| !dictionary_keys.contains(&term_key(entry)))
        .collect();
    clean_ignored_terms(&retained)
}

// Also used by corrections learning (F5.2, see corrections.rs) to decide
// whether its deferred re-read still points at the element the insertion
// landed in.
pub(crate) fn same_target(initial: &FocusedTextSnapshot, current: &FocusedTextSnapshot) -> bool {
    initial.pid == current.pid
        && initial.role == current.role
        && initial.subrole == current.subrole
        && frame_anchor_matches(initial.frame, current.frame)
}

fn frame_anchor_matches(
    initial: Option<(f64, f64, f64, f64)>,
    current: Option<(f64, f64, f64, f64)>,
) -> bool {
    match (initial, current) {
        (Some(left), Some(right)) => {
            (left.0 - right.0).abs() < 2.0
                && (left.1 - right.1).abs() < 2.0
                && (left.2 - right.2).abs() < 2.0
        }
        _ => true,
    }
}

fn remember_pending(value: String) {
    runtime().lock().pending = Some(value);
}

fn replace_runtime_ignored(values: &[String]) {
    let mut state = runtime().lock();
    state.ignored = clean_ignored_terms(values)
        .into_iter()
        .map(|value| term_key(&value))
        .collect();
}

#[cfg(test)]
fn remember_ignored(value: &str) {
    runtime().lock().ignored.insert(term_key(value));
}

fn runtime_ignores(value: &str) -> bool {
    runtime().lock().ignored.contains(&term_key(value))
}

fn clean_ignored_terms(values: &[String]) -> Vec<String> {
    let mut identities = HashSet::new();
    let mut output = Vec::new();
    for raw in values {
        let Some(term) = normalize_candidate(raw) else {
            continue;
        };
        if identities.insert(term_key(&term)) {
            output.push(term);
        }
        if output.len() == MAX_IGNORED_TERMS {
            break;
        }
    }
    output
}

fn term_key(value: &str) -> String {
    value.trim().to_lowercase()
}

struct TextChange<'before, 'after> {
    before: &'before str,
    after: &'after str,
}

impl<'after> TextChange<'_, 'after> {
    fn changed_after(&self) -> Option<&'after str> {
        if self.before == self.after {
            return None;
        }
        let front = shared_front_bytes(self.before, self.after);
        let back = shared_back_bytes(&self.before[front..], &self.after[front..]);
        let end = self.after.len().checked_sub(back)?;
        self.after.get(front..end)
    }
}

struct CandidateDetector<'a> {
    inserted: &'a str,
    edited_span: &'a str,
    dictionary: &'a [String],
}

impl CandidateDetector<'_> {
    fn detect(self) -> Option<String> {
        if self.edited_span == self.inserted {
            return None;
        }
        if self.edited_span.chars().count() > self.inserted.chars().count() + 80 {
            return None;
        }

        let before = lex(self.inserted);
        let after = lex(self.edited_span);
        if before.is_empty() || after.is_empty() {
            return None;
        }
        let shared_front = shared_lexeme_front(&before, &after);
        let shared_back = shared_lexeme_back(&before, &after, shared_front);
        let replaced = &before[shared_front..before.len().saturating_sub(shared_back)];
        let replacement = &after[shared_front..after.len().saturating_sub(shared_back)];
        if replaced.is_empty() || replacement.is_empty() {
            return None;
        }
        if replaced.len() > MAX_REPLACED_WORDS || replacement.len() > MAX_REPLACED_WORDS {
            return None;
        }

        let start = replacement.first()?.start;
        let end = replacement.last()?.end;
        let term = normalize_candidate(self.edited_span.get(start..end)?.trim())?;
        let term_lexemes = lex(&term);
        CandidateRules {
            dictionary: self.dictionary,
        }
        .allows(&term, &term_lexemes)
        .then_some(term)
    }
}

fn shared_lexeme_front(left: &[Lexeme], right: &[Lexeme]) -> usize {
    left.iter()
        .zip(right)
        .take_while(|(left, right)| left.text == right.text)
        .count()
}

fn shared_lexeme_back(left: &[Lexeme], right: &[Lexeme], front: usize) -> usize {
    left.iter()
        .rev()
        .zip(right.iter().rev())
        .take(left.len().min(right.len()).saturating_sub(front))
        .take_while(|(left, right)| left.text == right.text)
        .count()
}

fn detect_candidate(
    pre_value: &str,
    inserted_text: &str,
    current_value: &str,
    dictionary_entries: &[String],
) -> Option<String> {
    let edited_span = changed_current_span(pre_value, current_value)?;
    CandidateDetector {
        inserted: inserted_text,
        edited_span,
        dictionary: dictionary_entries,
    }
    .detect()
}

// Shared with corrections learning (F5.2): given the field value before the
// insertion and its value now, returns the slice of the current value that
// changed (the region the insertion - plus any user edits to it - lives in).
pub(crate) fn changed_current_span<'a>(pre_value: &str, current_value: &'a str) -> Option<&'a str> {
    TextChange {
        before: pre_value,
        after: current_value,
    }
    .changed_after()
}

fn shared_front_bytes(left: &str, right: &str) -> usize {
    let mut bytes = 0;
    for ((left_index, left_char), (right_index, right_char)) in
        left.char_indices().zip(right.char_indices())
    {
        if left_char != right_char {
            break;
        }
        bytes = left_index + left_char.len_utf8();
        debug_assert_eq!(bytes, right_index + right_char.len_utf8());
    }
    bytes
}

fn shared_back_bytes(left: &str, right: &str) -> usize {
    left.chars()
        .rev()
        .zip(right.chars().rev())
        .take_while(|(left, right)| left == right)
        .map(|(character, _)| character.len_utf8())
        .sum()
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Lexeme {
    text: String,
    start: usize,
    end: usize,
}

fn lex(value: &str) -> Vec<Lexeme> {
    let mut output = Vec::new();
    let mut open = None;
    for (index, character) in value.char_indices() {
        if belongs_to_lexeme(character) {
            open.get_or_insert(index);
        } else if let Some(start) = open.take() {
            append_lexeme(value, start, index, &mut output);
        }
    }
    if let Some(start) = open {
        append_lexeme(value, start, value.len(), &mut output);
    }
    output
}

fn append_lexeme(value: &str, start: usize, end: usize, output: &mut Vec<Lexeme>) {
    let raw = &value[start..end];
    let text = raw.trim_matches('.');
    if text.is_empty() {
        return;
    }
    let leading_bytes = raw.find(text).unwrap_or(0);
    let adjusted_start = start + leading_bytes;
    output.push(Lexeme {
        text: text.to_owned(),
        start: adjusted_start,
        end: adjusted_start + text.len(),
    });
}

fn belongs_to_lexeme(character: char) -> bool {
    character.is_alphanumeric()
        || matches!(character, '\'' | '’' | '-' | '.' | '+' | '#' | '_' | '&')
}

fn normalize_candidate(candidate: &str) -> Option<String> {
    let mut value = candidate.trim().trim_matches(candidate_edge).to_owned();
    if value.is_empty() {
        return None;
    }

    let characters: Vec<_> = value.chars().collect();
    let has_possessive_suffix = characters.len() > 2
        && matches!(characters.get(characters.len() - 2), Some('\'' | '’'))
        && matches!(characters.last(), Some('s' | 'S'));
    if has_possessive_suffix {
        value = characters[..characters.len() - 2].iter().collect();
    } else if matches!(characters.last(), Some('\'' | '’')) && characters.len() > 3 {
        let without_apostrophe = value.trim_end_matches(['\'', '’']);
        if without_apostrophe.ends_with(['s', 'S']) {
            value = without_apostrophe.to_owned();
        }
    }

    let final_value = value.trim();
    (!final_value.is_empty()).then(|| final_value.to_owned())
}

fn candidate_edge(character: char) -> bool {
    character.is_whitespace()
        || matches!(
            character,
            '"' | '“' | '”' | '‘' | '’' | '.' | ',' | ':' | ';' | '!' | '?' | '(' | ')' | '[' | ']'
        )
}

struct CandidateRules<'a> {
    dictionary: &'a [String],
}

impl CandidateRules<'_> {
    fn allows(&self, candidate: &str, lexemes: &[Lexeme]) -> bool {
        let candidate = candidate.trim();
        if candidate.is_empty() || candidate.chars().count() > MAX_TERM_CHARACTERS {
            return false;
        }
        if !candidate.chars().all(allowed_term_character) {
            return false;
        }
        if self
            .dictionary
            .iter()
            .any(|entry| entry.trim().eq_ignore_ascii_case(candidate))
        {
            return false;
        }

        let words: Vec<_> = lexemes.iter().map(|lexeme| lexeme.text.as_str()).collect();
        if words.is_empty() || words.iter().all(|word| common_or_stretched(word)) {
            return false;
        }
        if plain_all_caps_phrase(&words) {
            return false;
        }
        words
            .iter()
            .enumerate()
            .all(|(position, word)| name_like(word) || allowed_name_particle(position, word))
    }
}

fn allowed_term_character(character: char) -> bool {
    character.is_alphanumeric()
        || character.is_whitespace()
        || matches!(character, '\'' | '’' | '-' | '.' | '+' | '#' | '_' | '&')
}

fn name_like(word: &str) -> bool {
    if word.chars().count() < 2 && !symbolic_technical_word(word) {
        return false;
    }
    acronym(word) || title_like(word) || mixed_case_brand(word) || symbolic_technical_word(word)
}

fn acronym(word: &str) -> bool {
    let mut alphabetic = false;
    let mut uppercase = false;
    for character in word.chars() {
        if character.is_alphabetic() {
            alphabetic = true;
            if character.is_uppercase() {
                uppercase = true;
            } else {
                return false;
            }
        } else if !character.is_numeric() && !matches!(character, '-' | '.' | '_' | '&') {
            return false;
        }
    }
    alphabetic && uppercase && word.chars().count() >= 2
}

fn title_like(word: &str) -> bool {
    let mut characters = word.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    first.is_uppercase()
        && characters.all(|character| {
            character.is_alphanumeric() || matches!(character, '\'' | '’' | '-' | '.' | '_' | '&')
        })
}

fn mixed_case_brand(word: &str) -> bool {
    word.chars().any(char::is_lowercase) && word.chars().any(char::is_uppercase)
}

fn symbolic_technical_word(word: &str) -> bool {
    word.chars().any(char::is_alphabetic)
        && word
            .chars()
            .any(|character| matches!(character, '+' | '#' | '.' | '_' | '&'))
}

fn plain_all_caps_phrase(words: &[&str]) -> bool {
    if words.is_empty() {
        return false;
    }
    for word in words {
        if word.chars().any(|character| {
            character.is_numeric() || matches!(character, '-' | '.' | '+' | '#' | '_' | '&')
        }) {
            return false;
        }
        let letters: Vec<_> = word
            .chars()
            .filter(|character| character.is_alphabetic())
            .collect();
        if letters.is_empty() || !letters.iter().all(|character| character.is_uppercase()) {
            return false;
        }
    }
    words.len() > 1 || words.iter().any(|word| word.chars().count() > 6)
}

fn allowed_name_particle(position: usize, word: &str) -> bool {
    const PARTICLES: &str = "al bin da de del der di du la le van von";
    position > 0
        && PARTICLES
            .split_ascii_whitespace()
            .any(|particle| particle == word.to_lowercase())
}

fn common_or_stretched(word: &str) -> bool {
    let normalized = word.to_lowercase();
    common_word(&normalized) || common_word(&collapse_character_runs(&normalized))
}

fn collapse_character_runs(value: &str) -> String {
    let mut output = String::new();
    let mut previous = None;
    for character in value.chars() {
        if previous == Some(character) {
            continue;
        }
        output.push(character);
        previous = Some(character);
    }
    output
}

fn common_word(value: &str) -> bool {
    const WORDS: &str = "
        a about after again all also an and any are as at back be because been but by can could
        did do does done for from get go guys had has have he hello her here hey him his how i if
        important in is it its it's just know lets let's like make me my no not now of okay on or
        our please she so that the their then there they this today tomorrow to uh um urgent was we
        were what when with would yeah yes you your
    ";
    WORDS
        .split_ascii_whitespace()
        .any(|candidate| candidate == value)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn detect(inserted: &str, edited: &str) -> Option<String> {
        detect_candidate("", inserted, edited, &[])
    }

    fn snapshot(value: &str, frame: Option<(f64, f64, f64, f64)>) -> FocusedTextSnapshot {
        FocusedTextSnapshot {
            pid: 42,
            role: Some("AXTextArea".to_owned()),
            subrole: None,
            value: value.to_owned(),
            frame,
            selection: None,
        }
    }

    #[test]
    fn candidate_matrix_preserves_names_brands_acronyms_and_possessives() {
        let cases = [
            (
                "I met Mackenzie today.",
                "I met McKenzie today.",
                "McKenzie",
            ),
            (
                "I met john smith today.",
                "I met John Smith today.",
                "John Smith",
            ),
            ("Open fig jam now.", "Open FigJam now.", "FigJam"),
            ("Use looper speech.", "Use Looper-Speech.", "Looper-Speech"),
            ("Open node js docs.", "Open Node.js docs.", "Node.js"),
            ("Use c plus plus.", "Use C++.", "C++"),
            ("Ship gpt 5 today.", "Ship GPT-5 today.", "GPT-5"),
            ("I saw Mike today.", "I saw Mike's today.", "Mike"),
            ("I saw Mike today.", "I saw Mike’s today.", "Mike"),
            ("I saw James today.", "I saw James' today.", "James"),
            ("I met Oneill.", "I met O'Neill.", "O'Neill"),
            ("I met Jose.", "I met José.", "José"),
            ("I called Muller.", "I called Müller.", "Müller"),
            ("Read van gogh.", "Read Van Gogh.", "Van Gogh"),
            ("This is nasa.", "This is NASA.", "NASA"),
        ];
        for (inserted, edited, expected) in cases {
            assert_eq!(detect(inserted, edited).as_deref(), Some(expected));
        }
    }

    #[test]
    fn rejection_matrix_preserves_noise_and_rewrite_guards() {
        let cases = [
            ("Their ready.", "There ready."),
            ("I met Mackenzie.", "I met Mackenzie!"),
            (
                "I met Mackenzie today.",
                "I am hungry and want to leave now.",
            ),
            (
                "guys let's get this done it's important",
                "Guys This Is Important",
            ),
            (
                "Guys, let's get this done, it's important.",
                "Guys, THIS IS IMPORTANTTTT. Let's get it done.",
            ),
            ("This is urgent.", "This is URGENT."),
        ];
        for (inserted, edited) in cases {
            assert_eq!(detect(inserted, edited), None);
        }
    }

    #[test]
    fn detector_rejects_edits_outside_the_inserted_region_and_dictionary_duplicates() {
        assert_eq!(
            detect_candidate(
                "Prefix suffix",
                "Mackenzie",
                "Changed Prefix Mackenzie suffix",
                &[]
            ),
            None
        );
        assert_eq!(
            detect_candidate(
                "",
                "I met Mackenzie.",
                "I met McKenzie.",
                &["mckenzie".to_owned()]
            ),
            None
        );
    }

    #[test]
    fn unicode_delta_returns_only_the_current_edited_span() {
        assert_eq!(
            changed_current_span("inicio Jose fin", "inicio José fin"),
            Some("é")
        );
        assert_eq!(changed_current_span("same", "same"), None);
    }

    #[test]
    fn target_identity_ignores_height_but_rejects_movement_and_role_changes() {
        let original = snapshot("before", Some((100.0, 200.0, 420.0, 36.0)));
        let resized = snapshot("after", Some((100.5, 200.5, 420.0, 72.0)));
        let moved = snapshot("after", Some((180.0, 200.0, 420.0, 36.0)));
        let mut changed_role = resized.clone();
        changed_role.role = Some("AXTextField".to_owned());

        assert!(same_target(&original, &resized));
        assert!(!same_target(&original, &moved));
        assert!(!same_target(&original, &changed_role));
    }

    #[test]
    fn edit_watch_waits_for_idle_and_analyzes_each_value_once() {
        let start = Instant::now();
        let mut watch = EditWatch::new("before".to_owned(), start);

        assert_eq!(
            watch.settled_edit("before".to_owned(), start + Duration::from_secs(3)),
            None
        );
        assert_eq!(
            watch.settled_edit("after".to_owned(), start + Duration::from_secs(4)),
            None
        );
        assert_eq!(
            watch.settled_edit("after".to_owned(), start + Duration::from_secs(6)),
            Some("after".to_owned())
        );
        assert_eq!(
            watch.settled_edit("after".to_owned(), start + Duration::from_secs(9)),
            None
        );
    }

    #[test]
    fn ignored_terms_are_canonical_ordered_deduplicated_and_bounded() {
        let mut values = vec![
            "  Alpha!  ".to_owned(),
            "alpha".to_owned(),
            "Beta's".to_owned(),
            "".to_owned(),
        ];
        values.extend((0..200).map(|index| format!("Term{index}")));

        let cleaned = clean_ignored_terms(&values);

        assert_eq!(&cleaned[..2], &["Alpha".to_owned(), "Beta".to_owned()]);
        assert_eq!(cleaned.len(), MAX_IGNORED_TERMS);
    }

    #[test]
    fn decisions_preserve_dictionary_and_ignored_order() {
        let mut settings = UserSettings::default();
        settings.dictionary = vec![" Existing ".to_owned()];
        settings.auto_dictionary_ignored =
            vec!["Existing".to_owned(), "New".to_owned(), "Never".to_owned()];

        let accepted = SuggestionDecision::Accept.apply(settings, "New");
        assert_eq!(accepted.dictionary, vec!["Existing", "New"]);
        assert_eq!(accepted.auto_dictionary_ignored, vec!["Never"]);

        let rejected = SuggestionDecision::Reject.apply(accepted, "  THIRD!  ");
        assert_eq!(rejected.dictionary, vec!["Existing", "New"]);
        assert_eq!(rejected.auto_dictionary_ignored, vec!["Never", "THIRD"]);
    }

    #[test]
    fn toast_payload_keeps_frontend_action_and_retry_wire_contract() {
        assert_eq!(
            serde_json::to_value(suggestion_toast("McKenzie")).expect("serialize toast"),
            json!({
                "type": "info",
                "title": null,
                "message": "Add \"McKenzie\" to dictionary?",
                "autoDismiss": false,
                "duration": null,
                "retryId": "McKenzie",
                "mode": null,
                "action": "accept_auto_dictionary_suggestion",
                "actionLabel": "Add",
                "secondaryAction": "reject_auto_dictionary_suggestion",
                "secondaryActionLabel": "Never"
            })
        );
    }

    #[test]
    fn dictionary_sync_clears_only_matching_runtime_ignores() {
        let term = "SessionOnlyNoNo";
        remember_ignored(term);
        remember_ignored("KeepIgnoringThis");
        sync_ignored_dictionary_entries(&[term.to_owned()]);

        assert!(!runtime_ignores(term));
        assert!(runtime_ignores("KeepIgnoringThis"));
    }
}
