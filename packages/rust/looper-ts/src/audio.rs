use rubato::{audioadapter_buffers::direct::SequentialSlice, Fft, FixedSync, Resampler};

use crate::{AudioInput, Error, Result};

pub(crate) const MODEL_SAMPLE_RATE: u32 = 16_000;

pub(crate) struct PreparedAudio {
    pub samples: Vec<f32>,
    pub duration_ms: u128,
}

impl PreparedAudio {
    fn from_input(input: AudioInput) -> Result<Self> {
        let (samples, sample_rate) = decode_pcm(input);
        validate_pcm(&samples, sample_rate)?;

        let duration_ms = samples.len() as u128 * 1_000 / sample_rate as u128;
        let samples = RateConversion::new(sample_rate, MODEL_SAMPLE_RATE).apply(&samples);

        Ok(Self {
            samples,
            duration_ms,
        })
    }
}

pub(crate) fn prepare(input: AudioInput) -> Result<PreparedAudio> {
    PreparedAudio::from_input(input)
}

pub(crate) fn resample_i16(input: &[i16], input_rate: u32, output_rate: u32) -> Vec<i16> {
    let normalized = input
        .iter()
        .map(|sample| f32::from(*sample) / f32::from(i16::MAX))
        .collect::<Vec<_>>();

    RateConversion::new(input_rate, output_rate)
        .apply(&normalized)
        .into_iter()
        .map(|sample| (sample.clamp(-1.0, 1.0) * f32::from(i16::MAX)).round() as i16)
        .collect()
}

fn decode_pcm(input: AudioInput) -> (Vec<f32>, u32) {
    match input {
        AudioInput::PcmI16 {
            samples,
            sample_rate,
        } => (
            samples
                .into_iter()
                .map(|sample| f32::from(sample) / 32_768.0)
                .collect(),
            sample_rate,
        ),
        AudioInput::PcmF32 {
            samples,
            sample_rate,
        } => (samples, sample_rate),
    }
}

fn validate_pcm(samples: &[f32], sample_rate: u32) -> Result<()> {
    if sample_rate == 0 {
        return Err(Error::Validation(
            "sample rate must be greater than zero".to_string(),
        ));
    }
    if samples.iter().any(|sample| !sample.is_finite()) {
        return Err(Error::Validation(
            "PCM samples must contain only finite values".to_string(),
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy)]
struct RateConversion {
    source_hz: u32,
    target_hz: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConversionRoute {
    Empty,
    Identity,
    BandLimited,
}

impl RateConversion {
    fn new(input_rate: u32, output_rate: u32) -> Self {
        Self {
            source_hz: input_rate,
            target_hz: output_rate,
        }
    }

    fn apply(self, input: &[f32]) -> Vec<f32> {
        match self.route(input.len()) {
            ConversionRoute::Empty => Vec::new(),
            ConversionRoute::Identity => input.to_vec(),
            ConversionRoute::BandLimited => self
                .band_limited(input)
                .unwrap_or_else(|| self.linear_projection(input)),
        }
    }

    fn route(self, sample_count: usize) -> ConversionRoute {
        match (sample_count, self.source_hz == self.target_hz) {
            (0, _) => ConversionRoute::Empty,
            (_, true) => ConversionRoute::Identity,
            _ => ConversionRoute::BandLimited,
        }
    }

    fn band_limited(self, input: &[f32]) -> Option<Vec<f32>> {
        const WINDOW_FRAMES: usize = 1_024;
        const MONO: usize = 1;

        let mut filter = Fft::<f32>::new(
            self.source_hz as usize,
            self.target_hz as usize,
            WINDOW_FRAMES,
            1,
            MONO,
            FixedSync::Both,
        )
        .ok()?;

        let capacity = filter.process_all_needed_output_len(input.len());
        let mut rendered = vec![0.0; capacity];
        let written = {
            let source = SequentialSlice::new(input, MONO, input.len()).ok()?;
            let mut destination =
                SequentialSlice::new_mut(rendered.as_mut_slice(), MONO, capacity).ok()?;
            filter
                .process_all_into_buffer(&source, &mut destination, input.len(), None)
                .ok()?
                .1
        };

        rendered.resize(written, 0.0);
        Some(rendered)
    }

    fn linear_projection(self, input: &[f32]) -> Vec<f32> {
        SourceTimeline::new(self.source_hz, self.target_hz, self.output_len(input.len()))
            .map(|position| sample_at(input, position))
            .collect()
    }

    fn output_len(self, input_len: usize) -> usize {
        ((input_len as f64 * f64::from(self.target_hz) / f64::from(self.source_hz)).round()
            as usize)
            .max(1)
    }
}

struct SourceTimeline {
    position: f64,
    step: f64,
    remaining: usize,
}

impl SourceTimeline {
    fn new(source_hz: u32, target_hz: u32, output_len: usize) -> Self {
        Self {
            position: 0.0,
            step: f64::from(source_hz) / f64::from(target_hz),
            remaining: output_len,
        }
    }
}

impl Iterator for SourceTimeline {
    type Item = f64;

    fn next(&mut self) -> Option<Self::Item> {
        if self.remaining == 0 {
            return None;
        }

        let current = self.position;
        self.position += self.step;
        self.remaining -= 1;
        Some(current)
    }
}

fn sample_at(input: &[f32], position: f64) -> f32 {
    let lower = (position.floor() as usize).min(input.len() - 1);
    let upper = lower.saturating_add(1).min(input.len() - 1);
    let upper_weight = position - lower as f64;
    let lower_weight = 1.0 - upper_weight;

    (f64::from(input[lower]) * lower_weight + f64::from(input[upper]) * upper_weight) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_signed_pcm_without_changing_its_duration() {
        let prepared = prepare(AudioInput::PcmI16 {
            samples: vec![i16::MIN, 0, i16::MAX],
            sample_rate: MODEL_SAMPLE_RATE,
        })
        .unwrap();

        assert_eq!(prepared.samples, vec![-1.0, 0.0, 32767.0 / 32768.0]);
        assert_eq!(prepared.duration_ms, 0);
    }

    #[test]
    fn converts_clip_length_to_the_model_rate() {
        let prepared = prepare(AudioInput::PcmF32 {
            samples: vec![0.25; 8_000],
            sample_rate: 8_000,
        })
        .unwrap();

        assert_eq!(prepared.samples.len(), 16_000);
        assert_eq!(prepared.duration_ms, 1_000);
    }

    #[test]
    fn linear_fallback_uses_source_time_not_output_index() {
        let conversion = RateConversion::new(2, 4);

        assert_eq!(
            conversion.linear_projection(&[0.0, 1.0]),
            vec![0.0, 0.5, 1.0, 1.0]
        );
    }

    #[test]
    fn routing_skips_filter_work_for_empty_and_matching_rates() {
        assert_eq!(
            RateConversion::new(8_000, 16_000).route(0),
            ConversionRoute::Empty
        );
        assert_eq!(
            RateConversion::new(16_000, 16_000).route(32),
            ConversionRoute::Identity
        );
        assert_eq!(
            RateConversion::new(48_000, 16_000).route(32),
            ConversionRoute::BandLimited
        );
    }

    #[test]
    fn source_timeline_advances_by_the_rate_ratio() {
        let positions = SourceTimeline::new(2, 4, 4).collect::<Vec<_>>();

        assert_eq!(positions, vec![0.0, 0.5, 1.0, 1.5]);
    }

    #[test]
    fn one_sample_linear_projection_repeats_the_only_value() {
        assert_eq!(
            RateConversion::new(2, 1).linear_projection(&[0.75]),
            vec![0.75]
        );
    }

    #[test]
    fn i16_identity_conversion_keeps_the_existing_quantization_contract() {
        let samples = [i16::MIN, -123, 0, 123, i16::MAX];

        assert_eq!(
            resample_i16(&samples, MODEL_SAMPLE_RATE, MODEL_SAMPLE_RATE),
            vec![-32_767, -123, 0, 123, 32_767]
        );
    }

    #[test]
    fn rejects_invalid_audio_metadata() {
        assert!(prepare(AudioInput::PcmF32 {
            samples: vec![0.0],
            sample_rate: 0,
        })
        .is_err());
        assert!(prepare(AudioInput::PcmF32 {
            samples: vec![f32::NAN],
            sample_rate: MODEL_SAMPLE_RATE,
        })
        .is_err());
    }
}
