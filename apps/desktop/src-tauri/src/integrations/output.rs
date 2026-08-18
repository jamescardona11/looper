//! Stable terminal rendering for integration commands.

use serde::Serialize;

#[derive(Clone, Copy)]
enum OutputChannel {
    Standard,
    Diagnostic,
}

pub(crate) fn print_json<T: Serialize>(value: &T) {
    match encode_compact_json(value) {
        Ok(line) => emit_line(OutputChannel::Standard, &line),
        Err(error) => emit_line(
            OutputChannel::Diagnostic,
            &format!("Failed to serialize result: {error}"),
        ),
    }
}

pub(crate) fn print_error_json(message: &str) {
    let failure = serde_json::json!({ "ok": false, "error": message });
    emit_line(OutputChannel::Diagnostic, &failure.to_string());
}

pub(crate) fn one_line(text: &str, max: usize) -> String {
    elide_after(normalize_horizontal_text(text), max)
}

fn encode_compact_json<T: Serialize>(value: &T) -> serde_json::Result<String> {
    serde_json::to_string(value)
}

fn emit_line(channel: OutputChannel, line: &str) {
    match channel {
        OutputChannel::Standard => println!("{line}"),
        OutputChannel::Diagnostic => eprintln!("{line}"),
    }
}

fn normalize_horizontal_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn elide_after(normalized: String, character_limit: usize) -> String {
    if normalized.chars().count() <= character_limit {
        return normalized;
    }

    let content_limit = character_limit.saturating_sub(1);
    let prefix: String = normalized.chars().take(content_limit).collect();
    format!("{prefix}…")
}

#[cfg(test)]
mod tests {
    use super::{encode_compact_json, one_line};

    #[test]
    fn compact_json_remains_single_line() {
        let encoded = encode_compact_json(&serde_json::json!({ "answer": 42 })).unwrap();

        assert_eq!(encoded, r#"{"answer":42}"#);
    }

    #[test]
    fn table_text_collapses_all_whitespace() {
        assert_eq!(one_line("  uno\n\tdos   tres ", 40), "uno dos tres");
    }

    #[test]
    fn truncation_counts_unicode_scalars_and_reserves_the_ellipsis() {
        assert_eq!(one_line("áéíóú", 4), "áéí…");
        assert_eq!(one_line("text", 0), "…");
    }
}
