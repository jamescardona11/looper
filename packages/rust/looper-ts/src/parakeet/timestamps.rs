// Adapted from parakeet-rs 0.3.6 at revision
// 7deba612fc9a30c4a7182f4eaa53554cb2fa42c8.
// Copyright (c) 2025 Enes Altun. Licensed under MIT; see THIRD_PARTY_NOTICES.md.

use crate::TimedSegment;

pub(super) fn group_words(tokens: &[TimedSegment]) -> Vec<TimedSegment> {
    let mut words = Vec::new();
    let mut current_text = String::new();
    let mut current_start = 0.0;
    let mut current_end = 0.0;

    for (index, token) in tokens.iter().enumerate() {
        if token.text.trim().is_empty() {
            flush_word(&mut words, &mut current_text, current_start, current_end);
            continue;
        }

        let trimmed = token.text.trim_start_matches('▁').trim_start_matches(' ');
        let punctuation = !trimmed.is_empty()
            && trimmed
                .chars()
                .all(|character| character.is_ascii_punctuation());
        let attaches_to_previous = trimmed.starts_with('\'') || trimmed.starts_with('-');
        let starts_word = index == 0
            || ((token.text.starts_with('▁') || token.text.starts_with(' ') || punctuation)
                && !attaches_to_previous);

        if starts_word && !current_text.is_empty() {
            flush_word(&mut words, &mut current_text, current_start, current_end);
        }
        if current_text.is_empty() {
            current_start = token.start;
        }
        current_text.push_str(trimmed);
        current_end = token.end;
    }

    flush_word(&mut words, &mut current_text, current_start, current_end);
    words
}

pub(super) fn attach_punctuation(words: Vec<TimedSegment>) -> Vec<TimedSegment> {
    let mut attached: Vec<TimedSegment> = Vec::new();
    for word in words {
        let punctuation_only = word
            .text
            .chars()
            .all(|character| !character.is_alphanumeric());
        match attached.last_mut() {
            Some(previous) if punctuation_only => {
                previous.text.push_str(&word.text);
                previous.end = word.end;
            }
            _ => attached.push(word),
        }
    }
    attached
}

pub(super) fn group_segments(words: &[TimedSegment]) -> Vec<TimedSegment> {
    let mut segments = Vec::new();
    let mut current = Vec::new();

    for word in words {
        current.push(word);
        if word
            .text
            .chars()
            .last()
            .is_some_and(|character| matches!(character, '.' | '?' | '!' | '…'))
        {
            flush_segment(&mut segments, &mut current);
        }
    }
    flush_segment(&mut segments, &mut current);
    segments
}

fn flush_word(words: &mut Vec<TimedSegment>, text: &mut String, start: f32, end: f32) {
    if text.is_empty() {
        return;
    }
    words.push(TimedSegment {
        start,
        end,
        text: std::mem::take(text),
    });
}

fn flush_segment(segments: &mut Vec<TimedSegment>, words: &mut Vec<&TimedSegment>) {
    let (Some(first), Some(last)) = (words.first(), words.last()) else {
        return;
    };
    segments.push(TimedSegment {
        start: first.start,
        end: last.end,
        text: format_words(words),
    });
    words.clear();
}

fn format_words(words: &[&TimedSegment]) -> String {
    let mut output = String::new();
    for (index, word) in words.iter().enumerate() {
        let standalone_punctuation = word.text.len() == 1
            && word
                .text
                .chars()
                .all(|character| matches!(character, '.' | ',' | '!' | '?' | ';' | ':' | ')'));
        if index > 0 && !standalone_punctuation {
            output.push(' ');
        }
        output.push_str(&word.text);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token(text: &str, start: f32, end: f32) -> TimedSegment {
        TimedSegment {
            text: text.to_string(),
            start,
            end,
        }
    }

    #[test]
    fn groups_subwords_without_dropping_repetitions() {
        let words = group_words(&[
            token(" hello", 0.0, 0.2),
            token(" hello", 0.2, 0.4),
            token(" world", 0.4, 0.6),
            token(".", 0.6, 0.7),
        ]);

        assert_eq!(
            words
                .iter()
                .map(|word| word.text.as_str())
                .collect::<Vec<_>>(),
            ["hello", "hello", "world", "."]
        );
    }

    #[test]
    fn builds_sentence_segments_with_natural_punctuation() {
        let words = attach_punctuation(vec![
            token("Hello", 0.0, 0.2),
            token("world", 0.2, 0.4),
            token(".", 0.4, 0.5),
            token("Again", 0.5, 0.7),
        ]);

        let segments = group_segments(&words);

        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].text, "Hello world.");
        assert_eq!(segments[1].text, "Again");
        assert_eq!(
            words
                .iter()
                .map(|word| word.text.as_str())
                .collect::<Vec<_>>(),
            ["Hello", "world.", "Again"]
        );
    }
}
