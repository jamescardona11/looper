#[derive(Debug)]
pub struct TranscriptionSuccess {
    pub transcript: String,
    pub speech_model: Option<String>,
    pub segments: Option<Vec<looper_ts::TimedSegment>>,
    pub words: Option<Vec<looper_ts::TimedSegment>>,
}

const AUTO_PASTE_VARIABLE: &str = "LOOPER_AUTO_PASTE";

pub fn auto_paste_enabled() -> bool {
    environment_switch(AUTO_PASTE_VARIABLE, true)
}

fn environment_switch(key: &str, fallback: bool) -> bool {
    std::env::var(key)
        .map(|value| enabled_token(&value))
        .unwrap_or(fallback)
}

fn enabled_token(value: &str) -> bool {
    matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes")
}

pub fn normalize_transcript(input: &str) -> String {
    input
        .lines()
        .map(normalize_transcript_line)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

fn normalize_transcript_line(line: &str) -> String {
    line.split([' ', '\t'])
        .filter(|fragment| !fragment.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::{enabled_token, normalize_transcript};

    #[test]
    fn switch_accepts_only_the_established_truthy_tokens() {
        for value in ["1", "true", "TRUE", "yes", "YeS"] {
            assert!(enabled_token(value), "{value} should enable the switch");
        }
        for value in ["0", "false", "on", " true ", ""] {
            assert!(!enabled_token(value), "{value:?} should disable the switch");
        }
    }

    #[test]
    fn normalization_collapses_only_spaces_and_tabs_per_line() {
        assert_eq!(
            normalize_transcript("  hello\t  world  \n\n  second\tline  "),
            "hello world\n\nsecond line"
        );
    }

    #[test]
    fn normalization_preserves_unicode_and_non_ascii_spacing() {
        assert_eq!(normalize_transcript("  Olá\u{a0}mundo  "), "Olá\u{a0}mundo");
    }
}
