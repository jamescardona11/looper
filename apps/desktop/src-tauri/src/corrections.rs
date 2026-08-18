//! Corrections learning (F5.2): after a VERIFIED insertion, re-read the same
//! AX element once (~30s later), diff the inserted text against what the user
//! left in that region, and count word-level `from -> to` corrections locally.
//! A pair observed at least [`SUGGESTION_THRESHOLD`] times shows up in the
//! settings UI as a suggestion queue ("Suggested corrections"): accepting adds
//! the corrected term to the local dictionary via the existing dictionary
//! command, dismissing hides that pair forever. Nothing is ever auto-applied,
//! and everything stays in the local settings DB (`read_app_value` /
//! `write_app_value`) - none of this syncs to the backend.

use std::{sync::OnceLock, thread, time::Duration};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::{
    assistive::{self, FocusedTextSnapshot},
    auto_dictionary, AppRuntime, AppState,
};

const RECHECK_DELAY: Duration = Duration::from_secs(30);
const SUGGESTION_THRESHOLD: u32 = 2;
const MAX_TRACKED_PAIRS: usize = 128;
const MAX_DISMISSED_PAIRS: usize = 128;
/// A changed span wider than this many words is treated as a rewrite (noise),
/// not a correction.
const MAX_CHANGED_WORDS: usize = 3;
const MAX_WORD_LEN: usize = 64;

const KEY_CORRECTION_COUNTERS: &str = "correction_counters";
const KEY_DISMISSED_CORRECTIONS: &str = "dismissed_corrections";

// Serializes the read-modify-write cycles on the two persisted lists so two
// overlapping deferred rechecks (or a recheck racing an accept/dismiss
// command) can't drop each other's update.
static STORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn store_lock() -> &'static Mutex<()> {
    STORE_LOCK.get_or_init(|| Mutex::new(()))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct WordCorrection {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CorrectionCounter {
    from: String,
    to: String,
    count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CorrectionPair {
    from: String,
    to: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuggestedCorrection {
    pub from: String,
    pub to: String,
    pub count: u32,
}

fn pair_matches(a_from: &str, a_to: &str, b_from: &str, b_to: &str) -> bool {
    a_from.eq_ignore_ascii_case(b_from) && a_to.eq_ignore_ascii_case(b_to)
}

/// Extracts word-level `from -> to` corrections between the text we inserted
/// and what that region of the field contains now. Pure and deliberately
/// conservative: anything that doesn't look like an in-place word replacement
/// (insertions, deletions, wide rewrites, punctuation-only edits) yields
/// nothing rather than a guess.
pub(crate) fn extract_word_corrections(inserted: &str, current: &str) -> Vec<WordCorrection> {
    if inserted == current {
        return Vec::new();
    }

    let old_words: Vec<&str> = inserted.split_whitespace().collect();
    let new_words: Vec<&str> = current.split_whitespace().collect();
    if old_words.is_empty() || new_words.is_empty() {
        return Vec::new();
    }

    let mut prefix = 0;
    while prefix < old_words.len()
        && prefix < new_words.len()
        && old_words[prefix] == new_words[prefix]
    {
        prefix += 1;
    }

    let mut suffix = 0;
    while suffix + prefix < old_words.len()
        && suffix + prefix < new_words.len()
        && old_words[old_words.len() - 1 - suffix] == new_words[new_words.len() - 1 - suffix]
    {
        suffix += 1;
    }

    let old_changed = &old_words[prefix..old_words.len() - suffix];
    let new_changed = &new_words[prefix..new_words.len() - suffix];

    // A pure insertion or deletion has no reliable word-to-word alignment,
    // and differing span lengths (or a wide span) read as a rewrite - all
    // noise, not corrections.
    if old_changed.is_empty()
        || new_changed.is_empty()
        || old_changed.len() != new_changed.len()
        || old_changed.len() > MAX_CHANGED_WORDS
    {
        return Vec::new();
    }

    let mut corrections: Vec<WordCorrection> = Vec::new();
    for (old_word, new_word) in old_changed.iter().zip(new_changed.iter()) {
        let from = trim_word_edges(old_word);
        let to = trim_word_edges(new_word);
        if from.is_empty() || to.is_empty() || from == to {
            continue;
        }
        if from.chars().count() > MAX_WORD_LEN || to.chars().count() > MAX_WORD_LEN {
            continue;
        }
        if !from.chars().any(char::is_alphanumeric) || !to.chars().any(char::is_alphanumeric) {
            continue;
        }
        let correction = WordCorrection {
            from: from.to_string(),
            to: to.to_string(),
        };
        if !corrections.contains(&correction) {
            corrections.push(correction);
        }
    }

    corrections
}

fn trim_word_edges(word: &str) -> &str {
    word.trim_matches(|ch: char| {
        matches!(
            ch,
            '.' | ','
                | ';'
                | ':'
                | '!'
                | '?'
                | '"'
                | '\''
                | '“'
                | '”'
                | '‘'
                | '’'
                | '('
                | ')'
                | '['
                | ']'
        )
    })
}

/// Schedules the single deferred re-read of the element the verified
/// insertion landed in. Every failure path (element gone, app no longer
/// frontmost, unreadable value) aborts silently - this must never surface to
/// the user or the logs as an error.
pub(crate) fn schedule_recheck_after_verified_insert(
    app: AppHandle<AppRuntime>,
    pre_paste: FocusedTextSnapshot,
    inserted_text: String,
) {
    if inserted_text.trim().is_empty() {
        return;
    }

    thread::spawn(move || {
        thread::sleep(RECHECK_DELAY);

        let Some(snapshot) = assistive::focused_text_snapshot() else {
            return;
        };
        if !auto_dictionary::same_target(&pre_paste, &snapshot) {
            return;
        }
        let Some(region) = auto_dictionary::changed_current_span(&pre_paste.value, &snapshot.value)
        else {
            return;
        };

        let corrections = extract_word_corrections(&inserted_text, region);
        if corrections.is_empty() {
            return;
        }

        let state = app.state::<AppState>();
        record_observed_corrections(&state, &corrections);
    });
}

fn read_counters(state: &AppState) -> Vec<CorrectionCounter> {
    state
        .settings_store
        .read_app_value(KEY_CORRECTION_COUNTERS, Vec::new())
        .unwrap_or_default()
}

fn write_counters(state: &AppState, counters: &Vec<CorrectionCounter>) {
    if let Err(err) = state
        .settings_store
        .write_app_value(KEY_CORRECTION_COUNTERS, counters)
    {
        tracing::error!("Failed to persist correction counters: {err}");
    }
}

fn read_dismissed(state: &AppState) -> Vec<CorrectionPair> {
    state
        .settings_store
        .read_app_value(KEY_DISMISSED_CORRECTIONS, Vec::new())
        .unwrap_or_default()
}

fn write_dismissed(state: &AppState, dismissed: &Vec<CorrectionPair>) {
    if let Err(err) = state
        .settings_store
        .write_app_value(KEY_DISMISSED_CORRECTIONS, dismissed)
    {
        tracing::error!("Failed to persist dismissed corrections: {err}");
    }
}

fn record_observed_corrections(state: &AppState, corrections: &[WordCorrection]) {
    let _guard = store_lock().lock();

    let dictionary = state.current_settings().dictionary;
    let dismissed = read_dismissed(state);
    let mut counters = read_counters(state);
    let mut changed = false;

    for correction in corrections {
        if dismissed
            .iter()
            .any(|pair| pair_matches(&pair.from, &pair.to, &correction.from, &correction.to))
        {
            continue;
        }
        if dictionary
            .iter()
            .any(|entry| entry.trim().eq_ignore_ascii_case(&correction.to))
        {
            continue;
        }

        if let Some(counter) = counters.iter_mut().find(|counter| {
            pair_matches(&counter.from, &counter.to, &correction.from, &correction.to)
        }) {
            counter.count = counter.count.saturating_add(1);
            // Keep the most recently observed casing for display/accept.
            counter.from = correction.from.clone();
            counter.to = correction.to.clone();
            changed = true;
            continue;
        }

        if counters.len() >= MAX_TRACKED_PAIRS {
            // Evict the least-observed pair to make room; ties resolve to the
            // oldest entry, which `min_by_key` picks first.
            let Some(evict_index) = counters
                .iter()
                .enumerate()
                .min_by_key(|(_, counter)| counter.count)
                .map(|(index, _)| index)
            else {
                continue;
            };
            counters.remove(evict_index);
        }
        counters.push(CorrectionCounter {
            from: correction.from.clone(),
            to: correction.to.clone(),
            count: 1,
        });
        changed = true;
    }

    if changed {
        write_counters(state, &counters);
    }
}

fn list_suggestions(state: &AppState) -> Vec<SuggestedCorrection> {
    let dictionary = state.current_settings().dictionary;
    read_counters(state)
        .into_iter()
        .filter(|counter| counter.count >= SUGGESTION_THRESHOLD)
        .filter(|counter| {
            !dictionary
                .iter()
                .any(|entry| entry.trim().eq_ignore_ascii_case(&counter.to))
        })
        .map(|counter| SuggestedCorrection {
            from: counter.from,
            to: counter.to,
            count: counter.count,
        })
        .collect()
}

fn remove_counter(state: &AppState, from: &str, to: &str) {
    let _guard = store_lock().lock();
    let mut counters = read_counters(state);
    let before = counters.len();
    counters.retain(|counter| !pair_matches(&counter.from, &counter.to, from, to));
    if counters.len() != before {
        write_counters(state, &counters);
    }
}

#[tauri::command]
pub(crate) fn get_suggested_corrections(
    state: tauri::State<AppState>,
) -> Result<Vec<SuggestedCorrection>, String> {
    Ok(list_suggestions(&state))
}

#[tauri::command]
pub(crate) fn accept_suggested_correction(
    from: String,
    to: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<Vec<SuggestedCorrection>, String> {
    let to = to.trim().to_string();
    if !to.is_empty() {
        let entries = move_correction_to_front(state.current_settings().dictionary, &to);
        // The existing dictionary command owns sanitizing, persisting, and
        // emitting the settings change - reuse it instead of re-implementing.
        crate::dictionary::set_dictionary(entries, app, state.clone())?;
    }
    remove_counter(&state, &from, &to);
    Ok(list_suggestions(&state))
}

fn move_correction_to_front(entries: Vec<String>, correction: &str) -> Vec<String> {
    let mut reordered = Vec::with_capacity(entries.len() + 1);
    reordered.push(correction.to_string());
    reordered.extend(
        entries
            .into_iter()
            .filter(|entry| !entry.eq_ignore_ascii_case(correction)),
    );
    reordered
}

#[tauri::command]
pub(crate) fn dismiss_suggested_correction(
    from: String,
    to: String,
    state: tauri::State<AppState>,
) -> Result<Vec<SuggestedCorrection>, String> {
    {
        let _guard = store_lock().lock();
        let mut dismissed = read_dismissed(&state);
        if !dismissed
            .iter()
            .any(|pair| pair_matches(&pair.from, &pair.to, &from, &to))
        {
            if dismissed.len() >= MAX_DISMISSED_PAIRS {
                dismissed.remove(0);
            }
            dismissed.push(CorrectionPair {
                from: from.clone(),
                to: to.clone(),
            });
            write_dismissed(&state, &dismissed);
        }
    }
    remove_counter(&state, &from, &to);
    Ok(list_suggestions(&state))
}

#[cfg(test)]
mod tests {
    use super::{extract_word_corrections, move_correction_to_front, WordCorrection};

    fn pairs(inserted: &str, current: &str) -> Vec<(String, String)> {
        extract_word_corrections(inserted, current)
            .into_iter()
            .map(|WordCorrection { from, to }| (from, to))
            .collect()
    }

    #[test]
    fn unchanged_text_yields_nothing() {
        assert!(pairs("I met Mackenzie today.", "I met Mackenzie today.").is_empty());
    }

    #[test]
    fn single_changed_word_yields_one_correction() {
        assert_eq!(
            pairs("I met Mackenzie today.", "I met McKenzie today."),
            vec![("Mackenzie".to_string(), "McKenzie".to_string())]
        );
    }

    #[test]
    fn inserted_word_yields_nothing() {
        assert!(pairs("I met John today.", "I met John Smith today.").is_empty());
    }

    #[test]
    fn deleted_word_yields_nothing() {
        assert!(pairs("I met John Smith today.", "I met John today.").is_empty());
    }

    #[test]
    fn full_rewrite_is_discarded_as_noise() {
        assert!(pairs(
            "I met Mackenzie today.",
            "We should ship the release notes before the demo."
        )
        .is_empty());
        // Same word count, but too many changed words to be a correction.
        assert!(pairs("one two three four five", "uno dos tres cuatro cinco").is_empty());
    }

    #[test]
    fn punctuation_only_change_yields_nothing() {
        assert!(pairs("Hello world.", "Hello world!").is_empty());
    }

    #[test]
    fn keeps_word_level_pairs_and_skips_unchanged_middles() {
        assert_eq!(
            pairs("send to john and mary", "send to Jon and Marie"),
            vec![
                ("john".to_string(), "Jon".to_string()),
                ("mary".to_string(), "Marie".to_string()),
            ]
        );
    }

    #[test]
    fn strips_edge_punctuation_from_both_sides() {
        assert_eq!(
            pairs("I met Mackenzie.", "I met McKenzie."),
            vec![("Mackenzie".to_string(), "McKenzie".to_string())]
        );
    }

    #[test]
    fn deduplicates_repeated_pairs_within_one_observation() {
        assert_eq!(
            pairs("mackenzie and mackenzie", "McKenzie and McKenzie"),
            vec![("mackenzie".to_string(), "McKenzie".to_string())]
        );
    }

    #[test]
    fn empty_sides_yield_nothing() {
        assert!(pairs("", "Anything at all").is_empty());
        assert!(pairs("Anything at all", "").is_empty());
    }

    #[test]
    fn accepted_correction_moves_to_the_front_without_duplicates() {
        assert_eq!(
            move_correction_to_front(
                vec!["Looper".to_string(), "Mackenzie".to_string()],
                "mackenzie",
            ),
            vec!["mackenzie".to_string(), "Looper".to_string()]
        );
    }
}
