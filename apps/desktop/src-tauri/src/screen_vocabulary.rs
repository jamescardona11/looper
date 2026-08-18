//! Screen-as-dictionary: turns the visible text of the active window
//! (captured via `accessibility_context::capture_screen_context`, gated by
//! the same `use_screen_context` setting as F5.3's page context) into
//! ephemeral vocabulary for the dictation in flight. The extracted terms are
//! merged into the dictionary passed to the speech model for that one
//! transcription and are NEVER persisted - see `pill.rs`'s
//! `spawn_screen_vocabulary_capture` (producer) and `transcribe.rs`'s
//! `queue_transcription` (consumer).

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

/// Cap on the ephemeral terms handed to the model: enough to cover the
/// unusual names on one screen without drowning the user's own dictionary
/// (the engine biases on a small prompt budget).
pub const MAX_SCREEN_TERMS: usize = 40;

const MIN_TERM_CHARS: usize = 3;
/// Guards against minified/encoded blobs that sometimes appear as a single
/// giant "word" in AX values.
const MAX_TERM_CHARS: usize = 64;
/// All-caps runs longer than this read as shouted prose ("IMPORTANT"), not
/// acronyms.
const MAX_ACRONYM_CHARS: usize = 6;

/// Everyday English/Spanish words plus ubiquitous UI labels: none of these
/// are worth biasing the model toward, even when they show up capitalized
/// mid-line (menu bars capitalize everything).
const COMMON_WORDS: &[&str] = &[
    // English function/common words.
    "about", "after", "all", "also", "and", "another", "any", "are", "back", "been", "before",
    "being", "but", "can", "come", "could", "day", "does", "done", "down", "each", "even", "first",
    "for", "from", "get", "good", "had", "has", "have", "her", "here", "him", "his", "how", "into",
    "its", "just", "know", "last", "let", "like", "long", "make", "many", "more", "most", "much",
    "new", "next", "not", "now", "off", "old", "one", "only", "other", "our", "out", "over", "own",
    "put", "say", "see", "she", "should", "some", "such", "take", "than", "that", "the", "their",
    "them", "then", "there", "these", "they", "this", "those", "time", "too", "two", "under",
    "use", "very", "want", "was", "way", "well", "were", "what", "when", "where", "which", "while",
    "who", "why", "will", "with", "would", "yes", "you", "your",
    // Spanish function/common words.
    "ahora", "algo", "antes", "aqui", "aquí", "aunque", "cada", "como", "con", "cual", "cuando",
    "cuándo", "del", "desde", "donde", "dónde", "durante", "ella", "ellos", "entre", "era", "ese",
    "esa", "eso", "esta", "este", "esto", "estos", "estas", "estar", "fue", "hay", "han", "hasta",
    "los", "las", "mas", "más", "mientras", "muy", "nada", "para", "pero", "por", "porque", "que",
    "qué", "quien", "quién", "ser", "sin", "sobre", "son", "sus", "también", "tambien", "toda",
    "todas", "todo", "todos", "una", "unas", "uno", "unos", "otra", "otro",
    // Ubiquitous UI labels (menus, buttons, form fields) in both languages.
    "add", "account", "button", "cancel", "click", "close", "copy", "create", "cut", "date",
    "delete", "edit", "error", "file", "help", "home", "info", "login", "logout", "menu", "name",
    "none", "note", "open", "page", "paste", "redo", "remove", "save", "search", "settings",
    "sign", "size", "tab", "todo", "type", "undo", "update", "user", "view", "warning", "window",
    "abrir", "ajustes", "archivo", "ayuda", "buscar", "cerrar", "correo", "cuenta", "editar",
    "fecha", "guardar", "inicio", "nombre", "nueva", "nuevo", "pagina", "página", "tipo",
    "usuario", "ventana",
];

fn common_words() -> &'static HashSet<&'static str> {
    static SET: OnceLock<HashSet<&'static str>> = OnceLock::new();
    SET.get_or_init(|| COMMON_WORDS.iter().copied().collect())
}

/// Whether a token is the kind of term a speech model is likely to miss:
/// identifiers, words with internal digits/symbols, acronyms, and proper
/// nouns (capitalized outside a sentence start).
fn is_salient(term: &str, sentence_start: bool) -> bool {
    if term
        .chars()
        .any(|c| matches!(c, '_' | '-' | '@' | '.' | '/'))
    {
        return true;
    }
    if term.chars().any(|c| c.is_ascii_digit()) {
        return true;
    }
    // camelCase / PascalCase / iPhone-style internal capitals.
    if term.chars().skip(1).any(|c| c.is_uppercase()) && term.chars().any(|c| c.is_lowercase()) {
        return true;
    }
    // Short all-caps runs read as acronyms (STT, HTTP).
    if term.chars().count() <= MAX_ACRONYM_CHARS && term.chars().all(|c| c.is_uppercase()) {
        return true;
    }
    // Proper noun: Capitalized-then-lowercase outside a sentence start. Bare
    // UI labels ("File", "Edit") land here too - the stoplist filters those.
    if !sentence_start {
        let mut chars = term.chars();
        let first_upper = chars.next().is_some_and(|c| c.is_uppercase());
        if first_upper && chars.all(|c| c.is_lowercase()) {
            return true;
        }
    }
    false
}

/// Extracts the on-screen terms worth biasing the speech model toward.
/// Pure text analysis: dedups case-insensitively (first-seen casing wins),
/// drops short/common words and letterless tokens, and returns at most
/// [`MAX_SCREEN_TERMS`] terms ranked by how often they appear on screen.
pub fn extract_salient_terms(text: &str) -> Vec<String> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    // (lowercased key, first-seen casing), in qualification order.
    let mut qualified: Vec<(String, String)> = Vec::new();
    let mut qualified_keys: HashSet<String> = HashSet::new();
    let mut sentence_start = true;

    for raw in text.split_whitespace() {
        let term = raw.trim_matches(|c: char| !c.is_alphanumeric());
        // The stripped trailing punctuation decides whether the NEXT token
        // starts a sentence; AX text is newline-joined labels, so newlines
        // themselves don't count as sentence breaks.
        let stripped_tail = &raw[raw.trim_end_matches(|c: char| !c.is_alphanumeric()).len()..];
        let next_sentence_start = stripped_tail.contains(['.', '!', '?', ':']);

        let char_count = term.chars().count();
        if !(MIN_TERM_CHARS..=MAX_TERM_CHARS).contains(&char_count)
            || !term.chars().any(|c| c.is_alphabetic())
        {
            sentence_start = next_sentence_start;
            continue;
        }
        let key = term.to_lowercase();
        if common_words().contains(key.as_str()) {
            sentence_start = next_sentence_start;
            continue;
        }

        *counts.entry(key.clone()).or_insert(0) += 1;
        if is_salient(term, sentence_start) && qualified_keys.insert(key.clone()) {
            qualified.push((key, term.to_string()));
        }
        sentence_start = next_sentence_start;
    }

    let mut ranked: Vec<(usize, usize, String)> = qualified
        .into_iter()
        .enumerate()
        .map(|(index, (key, term))| (counts[&key], index, term))
        .collect();
    ranked.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    ranked
        .into_iter()
        .take(MAX_SCREEN_TERMS)
        .map(|(_, _, term)| term)
        .collect()
}

/// Appends the screen terms to the user's dictionary entries, skipping any
/// term already covered case-insensitively. The user's entries stay first so
/// an engine-side prompt budget truncates the ephemeral tail, never the
/// dictionary the user curated.
pub fn merge_screen_terms(mut vocabulary: Vec<String>, screen_terms: &[String]) -> Vec<String> {
    let mut seen: HashSet<String> = vocabulary.iter().map(|term| term.to_lowercase()).collect();
    for term in screen_terms {
        if seen.insert(term.to_lowercase()) {
            vocabulary.push(term.clone());
        }
    }
    vocabulary
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_code_identifiers() {
        let terms = extract_salient_terms(
            "let user_count = fetchUsers(); render <PillOverlay /> via backend-api",
        );
        assert!(terms.contains(&"user_count".to_string()));
        assert!(terms.contains(&"fetchUsers".to_string()));
        assert!(terms.contains(&"PillOverlay".to_string()));
        assert!(terms.contains(&"backend-api".to_string()));
    }

    #[test]
    fn extracts_words_with_internal_digits_and_symbols() {
        let terms = extract_salient_terms("compare GPT-4 against IPv6 and web3 tooling");
        assert!(terms.contains(&"GPT-4".to_string()));
        assert!(terms.contains(&"IPv6".to_string()));
        assert!(terms.contains(&"web3".to_string()));
    }

    #[test]
    fn extracts_acronyms_but_not_long_all_caps_prose() {
        let terms = extract_salient_terms("the STT engine returned HTTP errors. IMPORTANT!");
        assert!(terms.contains(&"STT".to_string()));
        assert!(terms.contains(&"HTTP".to_string()));
        assert!(!terms.contains(&"IMPORTANT".to_string()));
    }

    #[test]
    fn extracts_proper_nouns_outside_sentence_start() {
        let terms =
            extract_salient_terms("Deploy went out today. We shipped Looper to production.");
        assert!(terms.contains(&"Looper".to_string()));
        // Sentence-initial capitalized words are not proper-noun evidence.
        assert!(!terms.contains(&"Deploy".to_string()));
    }

    #[test]
    fn sentence_start_applies_after_terminal_punctuation_and_colons() {
        let terms = extract_salient_terms("nota: Ayer llegó tarde. Preguntó por el informe");
        assert!(!terms.contains(&"Ayer".to_string()));
        assert!(!terms.contains(&"Preguntó".to_string()));
    }

    #[test]
    fn extracts_spanish_proper_nouns_and_skips_common_words() {
        let terms = extract_salient_terms(
            "El servidor de Telepatía usa PostgreSQL y María lo administra. Todos los reportes van para el equipo.",
        );
        assert!(terms.contains(&"Telepatía".to_string()));
        assert!(terms.contains(&"PostgreSQL".to_string()));
        assert!(terms.contains(&"María".to_string()));
        assert!(!terms.contains(&"Todos".to_string()));
        assert!(!terms.contains(&"reportes".to_string()));
    }

    #[test]
    fn extracts_email_addresses() {
        let terms = extract_salient_terms("Escríbeme a jjcardonao@gmail.com cuando puedas");
        assert!(terms.contains(&"jjcardonao@gmail.com".to_string()));
    }

    #[test]
    fn strips_surrounding_punctuation() {
        let terms = extract_salient_terms("call (fetchUsers), then \"backend-api\".");
        assert!(terms.contains(&"fetchUsers".to_string()));
        assert!(terms.contains(&"backend-api".to_string()));
    }

    #[test]
    fn dedups_case_insensitively_keeping_first_casing() {
        let terms = extract_salient_terms("useState USESTATE UseState useState");
        assert_eq!(terms, vec!["useState".to_string()]);
    }

    #[test]
    fn excludes_short_words_pure_numbers_and_capitalized_common_words() {
        let terms = extract_salient_terms("v2 el AX 2024 saw File Edit View THE AND");
        assert!(terms.is_empty(), "unexpected terms: {terms:?}");
    }

    #[test]
    fn skips_giant_tokens() {
        let blob = "x".repeat(200);
        let terms = extract_salient_terms(&format!("prefix_{blob} normal_token"));
        assert_eq!(terms, vec!["normal_token".to_string()]);
    }

    #[test]
    fn treats_ui_label_lines_as_mid_sentence() {
        // AX capture joins element texts with newlines; a bare label line is
        // not a sentence start, so app names surface as proper nouns.
        let terms = extract_salient_terms("File\nEdit\nLooper\nHelp");
        assert_eq!(terms, vec!["Looper".to_string()]);
    }

    #[test]
    fn caps_at_max_terms_prioritizing_frequency() {
        let mut text = String::new();
        for i in 0..MAX_SCREEN_TERMS + 10 {
            text.push_str(&format!("uniqueTerm{i} "));
        }
        for _ in 0..3 {
            text.push_str("repeatedTerm ");
        }
        let terms = extract_salient_terms(&text);
        assert_eq!(terms.len(), MAX_SCREEN_TERMS);
        assert_eq!(terms[0], "repeatedTerm");
        // Frequency ties keep first-seen order.
        assert_eq!(terms[1], "uniqueTerm0");
    }

    #[test]
    fn counts_frequency_across_casings_and_non_qualifying_occurrences() {
        // "Tauri" qualifies mid-sentence once; sentence-start occurrences
        // still add to its frequency.
        let terms = extract_salient_terms(
            "onceTerm appears with Tauri. Tauri starts here. Tauri again. Tauri closes.",
        );
        assert_eq!(terms[0], "Tauri");
        assert!(terms.contains(&"onceTerm".to_string()));
    }

    #[test]
    fn empty_and_whitespace_input_yield_nothing() {
        assert!(extract_salient_terms("").is_empty());
        assert!(extract_salient_terms("   \n\t  ").is_empty());
    }

    #[test]
    fn merge_appends_new_terms_after_user_dictionary() {
        let merged = merge_screen_terms(
            vec!["Looper".to_string(), "Telepatía".to_string()],
            &[
                "useState".to_string(),
                "looper".to_string(),
                "GPT-4".to_string(),
            ],
        );
        assert_eq!(
            merged,
            vec![
                "Looper".to_string(),
                "Telepatía".to_string(),
                "useState".to_string(),
                "GPT-4".to_string(),
            ]
        );
    }

    #[test]
    fn merge_with_no_screen_terms_is_identity() {
        let merged = merge_screen_terms(vec!["Looper".to_string()], &[]);
        assert_eq!(merged, vec!["Looper".to_string()]);
    }
}
