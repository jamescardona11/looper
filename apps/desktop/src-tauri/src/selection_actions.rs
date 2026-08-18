//! Selection Mode action/preset vocabulary (F2).
//!
//! Selection Mode (formerly "Edit Mode") captures a text selection via
//! `pill.rs::capture_selected_text_if_enabled`, records a voice instruction,
//! and runs `llm_cleanup::edit_transcription` on it. This module defines the
//! two small, pure enums that describe *what happens to the result*:
//!
//! - [`EditAction`]: where the transformed text goes (replace the selection,
//!   insert after it, show it in the pill, or copy it) - chosen by the user
//!   in the pill's action selector, see
//!   `transcribe.rs::await_edit_action_selection`.
//! - [`TransformPreset`]: an optional named system-prompt swap ("Write
//!   Better" / "Prompt Better") in place of following the spoken instruction
//!   verbatim - see the preset prompts in `llm_cleanup.rs`.
//! - [`parse_preset_command`]: detects a spoken preset command at the start
//!   of the voice instruction ("modo email, hazlo más profesional"), so a
//!   preset can be activated by voice instead of through the pill's buttons.
//!
//! All of it is plain data with no I/O, which keeps it cheap to unit test -
//! notably [`EditAction::permits_insertion`], which is the single predicate
//! `transcribe.rs` uses to gate its only call site for
//! `assistive::insert_text`, guaranteeing `Ask` (and `Copy`) can never reach
//! it.

use serde::{Deserialize, Serialize};

/// What happens to the transformed text once Selection Mode finishes
/// producing it. Chosen by the user in the pill's action selector; default
/// is [`EditAction::Replace`] (today's only behavior, now explicit).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditAction {
    /// Overwrite the original selection with the transformed text. Goes
    /// through the normal verified/undoable insertion path.
    #[default]
    Replace,
    /// Insert the transformed text right after the selection, leaving the
    /// original selected text in place.
    Insert,
    /// Show the transformed text in the pill only. Structurally never
    /// reaches `assistive::insert_text` - see `permits_insertion`.
    Ask,
    /// Copy the transformed text to the clipboard. Also never reaches
    /// `assistive::insert_text`.
    Copy,
}

impl EditAction {
    // Only consumed by tests today (here and in transcribe.rs) - kept
    // `pub` for when the pill UI needs the full option list from Rust.
    #[allow(dead_code)]
    pub const ALL: [EditAction; 4] = [Self::Replace, Self::Insert, Self::Ask, Self::Copy];

    /// `true` only for the two actions allowed to reach
    /// `assistive::insert_text`. `transcribe.rs::process_transcript_text`
    /// gates its only insertion call site on this predicate, so `Ask` (and
    /// `Copy`) never insert by construction - see the tests below and
    /// `transcribe.rs`'s `ask_action_never_reaches_insertion` test.
    pub fn permits_insertion(self) -> bool {
        matches!(self, Self::Replace | Self::Insert)
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Replace => "Replace",
            Self::Insert => "Insert",
            Self::Ask => "Ask",
            Self::Copy => "Copy",
        }
    }
}

/// A named system-prompt swap for Selection Mode, used instead of the
/// default freeform "follow the spoken instruction" behavior. `Polish` /
/// `Literal` / `Chat` / `Email` are the "Write Better" family; `PromptBetter`
/// restructures the selection into an LLM-ready prompt. `None` (the caller
/// uses `Option<TransformPreset>`) keeps today's freeform behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransformPreset {
    Polish,
    Literal,
    Chat,
    Email,
    PromptBetter,
}

impl TransformPreset {
    // Only consumed by tests today (here and in llm_cleanup.rs) - kept
    // `pub` for when the pill UI needs the full option list from Rust.
    #[allow(dead_code)]
    pub const ALL: [TransformPreset; 5] = [
        Self::Polish,
        Self::Literal,
        Self::Chat,
        Self::Email,
        Self::PromptBetter,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Polish => "Write Better \u{2013} Polish",
            Self::Literal => "Write Better \u{2013} Literal",
            Self::Chat => "Write Better \u{2013} Chat",
            Self::Email => "Write Better \u{2013} Email",
            Self::PromptBetter => "Prompt Better",
        }
    }
}

// Voice preset commands: names a user can say for each preset, as
// "modo <name>" (Spanish) or "<name> mode" (English). Stored lowercase;
// matching is Unicode-case-insensitive. Multi-word names must come before
// their prefixes ("correo electrónico" before "correo", "prompt better"
// before "prompt") since `parse_preset_command` returns the first hit.
const PRESET_COMMAND_NAMES: &[(&str, TransformPreset)] = &[
    ("correo electrónico", TransformPreset::Email),
    ("correo electronico", TransformPreset::Email),
    ("prompt better", TransformPreset::PromptBetter),
    ("polished", TransformPreset::Polish),
    ("pulido", TransformPreset::Polish),
    ("polish", TransformPreset::Polish),
    ("pulir", TransformPreset::Polish),
    ("literal", TransformPreset::Literal),
    ("correo", TransformPreset::Email),
    ("prompt", TransformPreset::PromptBetter),
    ("e-mail", TransformPreset::Email),
    ("email", TransformPreset::Email),
    ("chat", TransformPreset::Chat),
    ("mail", TransformPreset::Email),
];

/// Strips `keyword` (stored lowercase) from the start of `text`, comparing
/// case-insensitively via Unicode lowercasing, and returns the remainder.
fn strip_keyword_ci<'a>(text: &'a str, keyword: &str) -> Option<&'a str> {
    let mut rest = text;
    for expected in keyword.chars() {
        let ch = rest.chars().next()?;
        if !ch.to_lowercase().eq(expected.to_lowercase()) {
            return None;
        }
        rest = &rest[ch.len_utf8()..];
    }
    Some(rest)
}

/// A command keyword only counts when it ends at a word boundary ("modo
/// emails" is not a command). Returns the instruction that follows, with
/// the separating punctuation/whitespace stripped.
fn strip_command_separator(after: &str) -> Option<&str> {
    match after.chars().next() {
        None => Some(""),
        Some(ch) if ch.is_alphanumeric() => None,
        Some(_) => Some(after.trim_start_matches(|c: char| {
            c.is_whitespace()
                || matches!(c, ',' | '.' | ';' | ':' | '!' | '?' | '…' | '-' | '–' | '—')
        })),
    }
}

/// Detects a spoken preset command at the START of a Selection Mode voice
/// instruction - "modo email, hazlo más profesional" / "email mode, make it
/// formal" - and returns the activated preset plus the rest of the
/// transcript as the instruction (empty when the transcript was only the
/// command; `llm_cleanup::preset_instruction` then runs the preset's own
/// task alone). Case-insensitive, and tolerates punctuation right after the
/// command. Returns `None` - leaving the freeform flow untouched - when
/// there is no command; notably a transcript that merely starts with a
/// preset word ("email John about...") is not a command without the
/// "modo"/"mode" marker.
pub fn parse_preset_command(transcript: &str) -> Option<(TransformPreset, String)> {
    let text = transcript.trim_start();

    // Spanish: "modo <preset>". Whitespace required after "modo" so
    // "modelo"/"modos" never match.
    if let Some(after_modo) = strip_keyword_ci(text, "modo") {
        if after_modo.starts_with(char::is_whitespace) {
            let name_start = after_modo.trim_start();
            for (name, preset) in PRESET_COMMAND_NAMES {
                if let Some(instruction) =
                    strip_keyword_ci(name_start, name).and_then(strip_command_separator)
                {
                    return Some((*preset, instruction.trim().to_string()));
                }
            }
        }
    }

    // English: "<preset> mode".
    for (name, preset) in PRESET_COMMAND_NAMES {
        let Some(after_name) = strip_keyword_ci(text, name) else {
            continue;
        };
        if !after_name.starts_with(char::is_whitespace) {
            continue;
        }
        if let Some(instruction) =
            strip_keyword_ci(after_name.trim_start(), "mode").and_then(strip_command_separator)
        {
            return Some((*preset, instruction.trim().to_string()));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_replace_and_insert_permit_insertion() {
        assert!(EditAction::Replace.permits_insertion());
        assert!(EditAction::Insert.permits_insertion());
        assert!(!EditAction::Ask.permits_insertion());
        assert!(!EditAction::Copy.permits_insertion());
    }

    #[test]
    fn default_action_is_replace() {
        assert_eq!(EditAction::default(), EditAction::Replace);
    }

    #[test]
    fn all_actions_have_distinct_labels() {
        let labels: std::collections::HashSet<_> =
            EditAction::ALL.iter().map(|a| a.label()).collect();
        assert_eq!(labels.len(), EditAction::ALL.len());
    }

    #[test]
    fn write_better_and_prompt_better_meet_the_minimum_preset_counts() {
        // F2 acceptance: "Write Better" needs >= 4 presets (Polish/Literal/
        // Chat/Email), "Prompt Better" needs >= 1.
        let write_better_presets = TransformPreset::ALL
            .iter()
            .filter(|p| p.label().starts_with("Write Better"))
            .count();
        let prompt_better_presets = TransformPreset::ALL
            .iter()
            .filter(|p| **p == TransformPreset::PromptBetter)
            .count();
        assert!(write_better_presets >= 4);
        assert!(prompt_better_presets >= 1);
    }

    #[test]
    fn serializes_to_lower_snake_case_for_the_frontend() {
        assert_eq!(serde_json::to_string(&EditAction::Ask).unwrap(), "\"ask\"");
        assert_eq!(
            serde_json::to_string(&TransformPreset::PromptBetter).unwrap(),
            "\"prompt_better\""
        );
    }

    // ---- parse_preset_command ----

    fn parsed(transcript: &str) -> Option<(TransformPreset, String)> {
        parse_preset_command(transcript)
    }

    #[test]
    fn spanish_command_with_instruction() {
        assert_eq!(
            parsed("modo email, hazlo más profesional"),
            Some((TransformPreset::Email, "hazlo más profesional".to_string()))
        );
    }

    #[test]
    fn english_command_with_instruction() {
        assert_eq!(
            parsed("email mode, make it more professional"),
            Some((
                TransformPreset::Email,
                "make it more professional".to_string()
            ))
        );
    }

    #[test]
    fn command_alone_yields_an_empty_instruction() {
        assert_eq!(
            parsed("modo pulido"),
            Some((TransformPreset::Polish, String::new()))
        );
        assert_eq!(
            parsed("Polished mode."),
            Some((TransformPreset::Polish, String::new()))
        );
    }

    #[test]
    fn every_preset_is_reachable_in_both_languages() {
        let cases = [
            ("modo pulido", "polished mode", TransformPreset::Polish),
            ("modo literal", "literal mode", TransformPreset::Literal),
            ("modo chat", "chat mode", TransformPreset::Chat),
            ("modo correo", "email mode", TransformPreset::Email),
            (
                "modo prompt",
                "prompt better mode",
                TransformPreset::PromptBetter,
            ),
        ];
        for (spanish, english, preset) in cases {
            assert_eq!(parsed(spanish), Some((preset, String::new())), "{spanish}");
            assert_eq!(parsed(english), Some((preset, String::new())), "{english}");
        }
    }

    #[test]
    fn matching_is_case_insensitive_including_accents() {
        assert_eq!(
            parsed("MODO CORREO ELECTRÓNICO revisa esto"),
            Some((TransformPreset::Email, "revisa esto".to_string()))
        );
        assert_eq!(
            parsed("Email Mode shorten it"),
            Some((TransformPreset::Email, "shorten it".to_string()))
        );
    }

    #[test]
    fn tolerates_punctuation_after_the_command() {
        assert_eq!(
            parsed("Modo chat. sé breve"),
            Some((TransformPreset::Chat, "sé breve".to_string()))
        );
        assert_eq!(
            parsed("email mode: shorter please"),
            Some((TransformPreset::Email, "shorter please".to_string()))
        );
        assert_eq!(
            parsed("modo literal - no cambies nada"),
            Some((TransformPreset::Literal, "no cambies nada".to_string()))
        );
    }

    #[test]
    fn multi_word_preset_names_win_over_their_prefixes() {
        assert_eq!(
            parsed("modo correo electrónico más formal"),
            Some((TransformPreset::Email, "más formal".to_string()))
        );
        assert_eq!(
            parsed("prompt better mode tighten it"),
            Some((TransformPreset::PromptBetter, "tighten it".to_string()))
        );
    }

    #[test]
    fn tolerates_leading_whitespace_and_preserves_instruction_casing() {
        assert_eq!(
            parsed("  modo email Dile a Ana que sí"),
            Some((TransformPreset::Email, "Dile a Ana que sí".to_string()))
        );
    }

    #[test]
    fn a_preset_word_without_the_mode_marker_is_not_a_command() {
        assert_eq!(parsed("email John about the meeting"), None);
        assert_eq!(parsed("chat con el equipo sobre esto"), None);
        assert_eq!(parsed("literalmente cambia esto"), None);
        assert_eq!(parsed("polish this up a bit"), None);
        assert_eq!(parsed("prompt the user for a name"), None);
    }

    #[test]
    fn the_command_must_be_at_the_start() {
        assert_eq!(parsed("hazlo más profesional, modo email"), None);
        assert_eq!(parsed("switch to email mode please"), None);
    }

    #[test]
    fn modo_requires_a_known_preset_and_a_word_boundary() {
        assert_eq!(parsed("modo avión, ponte serio"), None);
        assert_eq!(parsed("modo emails para todos"), None);
        assert_eq!(parsed("modelo email no es un comando"), None);
        assert_eq!(parsed("modos email tampoco"), None);
        assert_eq!(parsed("modo"), None);
    }

    #[test]
    fn plain_instructions_and_empty_input_pass_through() {
        assert_eq!(parsed("hazlo más profesional"), None);
        assert_eq!(parsed("make this sound friendlier"), None);
        assert_eq!(parsed(""), None);
        assert_eq!(parsed("   "), None);
    }
}
