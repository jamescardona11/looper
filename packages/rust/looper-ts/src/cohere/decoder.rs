// Adapted from transcribe-rs 0.3.11 at revision
// 343768c100d566b135fbb7a2441e61fa8aa177f2.
// Copyright (c) 2025 Ilya Stupakov. Licensed under MIT; see THIRD_PARTY_NOTICES.md.

const MAX_CONSECUTIVE_REPEATS: usize = 8;

pub(super) struct GreedyDecoder {
    eos_id: i64,
    last_token: Option<i64>,
    consecutive_count: usize,
}

impl GreedyDecoder {
    pub fn new(eos_id: i64) -> Self {
        Self {
            eos_id,
            last_token: None,
            consecutive_count: 0,
        }
    }

    pub fn next_token(&mut self, logits: &[f32]) -> Option<i64> {
        let token = argmax(logits)? as i64;
        if token == self.eos_id {
            return None;
        }

        if self.last_token == Some(token) {
            self.consecutive_count += 1;
            if self.consecutive_count > MAX_CONSECUTIVE_REPEATS {
                return None;
            }
        } else {
            self.last_token = Some(token);
            self.consecutive_count = 1;
        }

        Some(token)
    }
}

fn argmax(values: &[f32]) -> Option<usize> {
    values
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| {
            left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(index, _)| index)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stops_at_eos_and_empty_logits() {
        let mut decoder = GreedyDecoder::new(2);
        assert_eq!(decoder.next_token(&[0.0, 1.0, 2.0]), None);
        assert_eq!(decoder.next_token(&[]), None);
    }

    #[test]
    fn stops_runaway_repetition() {
        let mut decoder = GreedyDecoder::new(99);
        for _ in 0..MAX_CONSECUTIVE_REPEATS {
            assert_eq!(decoder.next_token(&[0.0, 1.0]), Some(1));
        }
        assert_eq!(decoder.next_token(&[0.0, 1.0]), None);
    }
}
