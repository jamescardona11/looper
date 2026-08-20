// Adapted from parakeet-rs 0.3.6 at revision
// 7deba612fc9a30c4a7182f4eaa53554cb2fa42c8.
// Copyright (c) 2025 Enes Altun. Licensed under MIT; see the root THIRD_PARTY_NOTICES.md.

use crate::TimedSegment;

pub(super) fn group_words(tokens: &[TimedSegment]) -> Vec<TimedSegment> {
    tokens
        .iter()
        .enumerate()
        .fold(WordAssembler::default(), |mut assembler, (index, token)| {
            assembler.accept(index, token);
            assembler
        })
        .finish()
}

pub(super) fn attach_punctuation(words: Vec<TimedSegment>) -> Vec<TimedSegment> {
    words
        .into_iter()
        .fold(PunctuationBinder::default(), |mut binder, word| {
            binder.accept(word);
            binder
        })
        .finish()
}

pub(super) fn group_segments(words: &[TimedSegment]) -> Vec<TimedSegment> {
    words
        .iter()
        .fold(SentenceAssembler::default(), |mut assembler, word| {
            assembler.accept(word);
            assembler
        })
        .finish()
}

#[derive(Default)]
struct WordAssembler {
    completed: Vec<TimedSegment>,
    draft: Option<TimedSegment>,
}

impl WordAssembler {
    fn accept(&mut self, index: usize, token: &TimedSegment) {
        let spelling = token.text.trim_start_matches('▁').trim_start_matches(' ');
        if token.text.trim().is_empty() {
            self.commit();
            return;
        }

        let begins_boundary = index == 0
            || ((token.text.starts_with(['▁', ' ']) || is_ascii_punctuation(spelling))
                && !continues_previous_word(spelling));
        if begins_boundary {
            self.commit();
        }

        match &mut self.draft {
            Some(draft) => {
                draft.text.push_str(spelling);
                draft.end = token.end;
            }
            None => {
                self.draft = Some(TimedSegment {
                    start: token.start,
                    end: token.end,
                    text: spelling.to_string(),
                });
            }
        }
    }

    fn commit(&mut self) {
        if let Some(word) = self.draft.take().filter(|word| !word.text.is_empty()) {
            self.completed.push(word);
        }
    }

    fn finish(mut self) -> Vec<TimedSegment> {
        self.commit();
        self.completed
    }
}

fn is_ascii_punctuation(text: &str) -> bool {
    !text.is_empty()
        && text
            .chars()
            .all(|character| character.is_ascii_punctuation())
}

fn continues_previous_word(text: &str) -> bool {
    text.starts_with(['\'', '-'])
}

#[derive(Default)]
struct PunctuationBinder {
    completed: Vec<TimedSegment>,
    tail: Option<TimedSegment>,
}

impl PunctuationBinder {
    fn accept(&mut self, word: TimedSegment) {
        if is_punctuation_only(&word.text) {
            if let Some(tail) = &mut self.tail {
                tail.text.push_str(&word.text);
                tail.end = word.end;
                return;
            }
        }

        if let Some(previous) = self.tail.replace(word) {
            self.completed.push(previous);
        }
    }

    fn finish(mut self) -> Vec<TimedSegment> {
        if let Some(tail) = self.tail.take() {
            self.completed.push(tail);
        }
        self.completed
    }
}

fn is_punctuation_only(text: &str) -> bool {
    text.chars().all(|character| !character.is_alphanumeric())
}

#[derive(Default)]
struct SentenceAssembler {
    completed: Vec<TimedSegment>,
    draft: Option<TimedSegment>,
}

impl SentenceAssembler {
    fn accept(&mut self, word: &TimedSegment) {
        match &mut self.draft {
            Some(draft) => {
                if !is_standalone_punctuation(&word.text) {
                    draft.text.push(' ');
                }
                draft.text.push_str(&word.text);
                draft.end = word.end;
            }
            None => self.draft = Some(word.clone()),
        }

        if ends_segment(&word.text) {
            self.commit();
        }
    }

    fn commit(&mut self) {
        if let Some(segment) = self.draft.take() {
            self.completed.push(segment);
        }
    }

    fn finish(mut self) -> Vec<TimedSegment> {
        self.commit();
        self.completed
    }
}

fn is_standalone_punctuation(text: &str) -> bool {
    text.len() == 1
        && text
            .chars()
            .all(|character| matches!(character, '.' | ',' | '!' | '?' | ';' | ':' | ')'))
}

fn ends_segment(text: &str) -> bool {
    text.chars()
        .last()
        .is_some_and(|character| matches!(character, '.' | '?' | '!' | '…'))
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

    #[test]
    fn keeps_contractions_and_hyphenated_subwords_inside_their_word() {
        let words = group_words(&[
            token(" we", 0.0, 0.1),
            token("'re", 0.1, 0.2),
            token(" re", 0.2, 0.3),
            token("-entering", 0.3, 0.5),
        ]);

        assert_eq!(
            words
                .iter()
                .map(|word| (word.text.as_str(), word.start, word.end))
                .collect::<Vec<_>>(),
            [("we're", 0.0, 0.2), ("re-entering", 0.2, 0.5)]
        );
    }

    #[test]
    fn punctuation_cluster_extends_the_previous_word_timestamp() {
        let words = attach_punctuation(vec![
            token("Wait", 0.0, 0.2),
            token("!", 0.2, 0.3),
            token("?", 0.3, 0.4),
        ]);

        assert_eq!(words, [token("Wait!?", 0.0, 0.4)]);
    }

    #[test]
    fn leading_punctuation_remains_a_timed_item() {
        let words = attach_punctuation(vec![
            token("(", 0.0, 0.1),
            token("Hello", 0.1, 0.3),
            token(")", 0.3, 0.4),
        ]);

        assert_eq!(
            words
                .iter()
                .map(|word| (word.text.as_str(), word.start, word.end))
                .collect::<Vec<_>>(),
            [("(", 0.0, 0.1), ("Hello)", 0.1, 0.4)]
        );
    }

    #[test]
    fn ellipsis_closes_a_segment_and_unfinished_text_is_retained() {
        let segments = group_segments(&[
            token("First…", 0.0, 0.3),
            token("still", 0.3, 0.5),
            token("speaking", 0.5, 0.8),
        ]);

        assert_eq!(
            segments
                .iter()
                .map(|segment| (segment.text.as_str(), segment.start, segment.end))
                .collect::<Vec<_>>(),
            [("First…", 0.0, 0.3), ("still speaking", 0.3, 0.8)]
        );
    }
}
