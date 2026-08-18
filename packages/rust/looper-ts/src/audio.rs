use rubato::{audioadapter_buffers::direct::InterleavedSlice, Fft, FixedSync, Resampler};

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
    input_rate: u32,
    output_rate: u32,
}

impl RateConversion {
    fn new(input_rate: u32, output_rate: u32) -> Self {
        Self {
            input_rate,
            output_rate,
        }
    }

    fn apply(self, input: &[f32]) -> Vec<f32> {
        if input.is_empty() {
            return Vec::new();
        }
        if self.input_rate == self.output_rate {
            return input.to_vec();
        }

        self.with_rubato(input)
            .unwrap_or_else(|| self.with_linear_interpolation(input))
    }

    fn with_rubato(self, input: &[f32]) -> Option<Vec<f32>> {
        let mut converter = Fft::<f32>::new(
            self.input_rate as usize,
            self.output_rate as usize,
            1_024,
            1,
            1,
            FixedSync::Both,
        )
        .ok()?;
        let mono = InterleavedSlice::new(input, 1, input.len()).ok()?;
        let output_len = converter.process_all_needed_output_len(input.len());
        let mut output = vec![0.0; output_len];
        let mut mono_output = InterleavedSlice::new_mut(&mut output, 1, output_len).ok()?;
        let (_, written) = converter
            .process_all_into_buffer(&mono, &mut mono_output, input.len(), None)
            .ok()?;
        output.truncate(written);
        Some(output)
    }

    fn with_linear_interpolation(self, input: &[f32]) -> Vec<f32> {
        let output_len = self.output_len(input.len());
        if output_len == 1 {
            return vec![input[0]];
        }

        (0..output_len)
            .map(|output_index| self.interpolate(input, output_index))
            .collect()
    }

    fn output_len(self, input_len: usize) -> usize {
        ((input_len as f64 * f64::from(self.output_rate) / f64::from(self.input_rate)).round()
            as usize)
            .max(1)
    }

    fn interpolate(self, input: &[f32], output_index: usize) -> f32 {
        let source_position =
            output_index as f64 * f64::from(self.input_rate) / f64::from(self.output_rate);
        let left = source_position.floor() as usize;
        let right = left.saturating_add(1).min(input.len() - 1);
        let fraction = source_position - left as f64;

        (f64::from(input[left]) * (1.0 - fraction) + f64::from(input[right]) * fraction) as f32
    }
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
            conversion.with_linear_interpolation(&[0.0, 1.0]),
            vec![0.0, 0.5, 1.0, 1.0]
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
