// Adapted from parakeet-rs 0.3.6 at revision
// 7deba612fc9a30c4a7182f4eaa53554cb2fa42c8.
// Copyright (c) 2025 Enes Altun. Licensed under MIT; see the root THIRD_PARTY_NOTICES.md.

mod features;
mod model;
mod timestamps;
mod vocab;

use std::path::Path;

use crate::{Error, Result, TimedSegment, TimestampMode, Transcript};
use features::FeatureExtractor;
use model::ParakeetModel;
use vocab::Vocabulary;

const ENCODER_STRIDE: usize = 8;
const EXTRA_PADDING_SAMPLES: usize = 4_000;
const HOP_LENGTH: usize = 160;
const MINIMUM_SAMPLES: usize = 16_000;
const SAMPLE_RATE: usize = 16_000;

pub(crate) struct ParakeetTdt {
    model: ParakeetModel,
    vocabulary: Vocabulary,
    features: FeatureExtractor,
}

impl ParakeetTdt {
    pub fn load(model_dir: &Path) -> Result<Self> {
        if !model_dir.is_dir() {
            return Err(Error::Model(format!(
                "Parakeet model directory does not exist: {}",
                model_dir.display()
            )));
        }
        let vocabulary = Vocabulary::load(&model_dir.join("vocab.txt"))?;
        let model = ParakeetModel::load(model_dir, vocabulary.len())?;

        Ok(Self {
            model,
            vocabulary,
            features: FeatureExtractor::new(),
        })
    }

    pub fn transcribe(
        &mut self,
        audio: &[f32],
        duration_ms: u128,
        timestamp_mode: TimestampMode,
    ) -> Result<Transcript> {
        let audio = pad_audio(audio);
        let features = self.features.extract(&audio)?;
        let (token_ids, frame_indices, _durations) = self.model.forward(features)?;
        let (text, raw_tokens) = decode_tokens(&self.vocabulary, &token_ids, &frame_indices)?;
        let mut words = timestamps::attach_punctuation(timestamps::group_words(&raw_tokens));
        let mut segments = timestamps::group_segments(&words);
        clamp_timestamps(&mut words, duration_ms);
        clamp_timestamps(&mut segments, duration_ms);
        let (segments, words) = match timestamp_mode {
            TimestampMode::None => (None, None),
            TimestampMode::Word => (
                (!segments.is_empty()).then_some(segments),
                (!words.is_empty()).then_some(words),
            ),
            TimestampMode::Segment => ((!segments.is_empty()).then_some(segments), None),
        };

        Ok(Transcript {
            text,
            duration_ms,
            segments,
            words,
        })
    }
}

fn clamp_timestamps(timestamps: &mut Vec<TimedSegment>, duration_ms: u128) {
    let duration_seconds = duration_ms as f32 / 1_000.0;
    for timestamp in timestamps.iter_mut() {
        timestamp.start = timestamp.start.clamp(0.0, duration_seconds);
        timestamp.end = timestamp.end.clamp(timestamp.start, duration_seconds);
    }
    timestamps.retain(|timestamp| timestamp.start < timestamp.end);
}

fn pad_audio(audio: &[f32]) -> Vec<f32> {
    let padding = MINIMUM_SAMPLES.saturating_sub(audio.len()) + EXTRA_PADDING_SAMPLES;
    let mut padded = Vec::with_capacity(audio.len() + padding);
    padded.extend_from_slice(audio);
    padded.resize(audio.len() + padding, 0.0);
    padded
}

fn decode_tokens(
    vocabulary: &Vocabulary,
    token_ids: &[usize],
    frame_indices: &[usize],
) -> Result<(String, Vec<TimedSegment>)> {
    if token_ids.len() != frame_indices.len() {
        return Err(Error::Model(format!(
            "Parakeet produced {} tokens but {} frame indices",
            token_ids.len(),
            frame_indices.len()
        )));
    }

    let mut text = String::new();
    let mut timed_tokens = Vec::new();
    for (index, (&token_id, &frame_index)) in token_ids.iter().zip(frame_indices.iter()).enumerate()
    {
        let Some(token) = vocabulary.token(token_id) else {
            continue;
        };
        if token.starts_with('<') && token.ends_with('>') && token != "<unk>" {
            continue;
        }

        let mut display_text = token.replace('▁', " ");
        if !text.is_empty()
            && !display_text.starts_with(' ')
            && display_text
                .chars()
                .all(|character| character.is_ascii_digit())
        {
            let trailing_letters = text
                .chars()
                .rev()
                .take_while(|character| character.is_alphabetic())
                .count();
            let is_article_a = trailing_letters == 1 && text.ends_with('a');
            if trailing_letters > 1 || is_article_a {
                display_text.insert(0, ' ');
            }
        }

        text.push_str(&display_text);
        let start = (frame_index * ENCODER_STRIDE * HOP_LENGTH) as f32 / SAMPLE_RATE as f32;
        let end = frame_indices
            .get(index + 1)
            .map(|next_frame| {
                (next_frame * ENCODER_STRIDE * HOP_LENGTH) as f32 / SAMPLE_RATE as f32
            })
            .unwrap_or(start + 0.01);
        timed_tokens.push(TimedSegment {
            start,
            end,
            text: display_text,
        });
    }

    Ok((text.trim().to_string(), timed_tokens))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoder_preserves_product_names_and_spaces_numbers_after_words() {
        let vocabulary = Vocabulary::from_tokens(&["▁Looper", "1", "0", "0", "▁A", "4"]);
        let (text, _) =
            decode_tokens(&vocabulary, &[0, 1, 2, 3, 4, 5], &[0, 1, 2, 3, 4, 5]).unwrap();

        assert_eq!(text, "Looper 100 A4");
    }

    #[test]
    fn decoder_skips_special_tokens() {
        let vocabulary = Vocabulary::from_tokens(&["<blk>", "▁hello", "<unk>"]);
        let (text, tokens) = decode_tokens(&vocabulary, &[0, 1, 2], &[0, 1, 2]).unwrap();

        assert_eq!(text, "hello<unk>");
        assert_eq!(tokens.len(), 2);
    }

    #[test]
    fn pads_short_and_long_audio_for_the_encoder() {
        assert_eq!(pad_audio(&[0.0; 8_000]).len(), 20_000);
        assert_eq!(pad_audio(&[0.0; 32_000]).len(), 36_000);
    }

    #[test]
    fn timestamps_are_clamped_to_original_audio_duration() {
        let mut timestamps = vec![
            TimedSegment {
                start: 0.5,
                end: 1.5,
                text: "inside".to_string(),
            },
            TimedSegment {
                start: 1.8,
                end: 2.5,
                text: "clamped".to_string(),
            },
            TimedSegment {
                start: 2.1,
                end: 2.4,
                text: "padding".to_string(),
            },
        ];

        clamp_timestamps(&mut timestamps, 2_000);

        assert_eq!(timestamps.len(), 2);
        assert_eq!(timestamps[0].end, 1.5);
        assert_eq!(timestamps[1].start, 1.8);
        assert_eq!(timestamps[1].end, 2.0);
    }
}
