// Adapted from parakeet-rs 0.3.6 at revision
// 7deba612fc9a30c4a7182f4eaa53554cb2fa42c8.
// Copyright (c) 2025 Enes Altun. Licensed under MIT; see THIRD_PARTY_NOTICES.md.

use std::f32::consts::PI;
use std::sync::Arc;

use ndarray::Array2;
use realfft::RealToComplex;

use crate::{Error, Result};

const FEATURE_SIZE: usize = 128;
const HOP_LENGTH: usize = 160;
const N_FFT: usize = 512;
const PREEMPHASIS: f32 = 0.97;
const SAMPLE_RATE: usize = 16_000;
const WIN_LENGTH: usize = 400;

pub(super) struct FeatureExtractor {
    mel_basis: Array2<f32>,
    fft_plan: Arc<dyn RealToComplex<f32>>,
}

impl FeatureExtractor {
    pub fn new() -> Self {
        let mel_basis = create_mel_filterbank(N_FFT, FEATURE_SIZE, SAMPLE_RATE);
        let mut planner = realfft::RealFftPlanner::<f32>::new();
        let fft_plan = planner.plan_fft_forward(N_FFT);
        Self {
            mel_basis,
            fft_plan,
        }
    }

    pub fn extract(&self, audio: &[f32]) -> Result<Array2<f32>> {
        let audio = apply_preemphasis(audio, PREEMPHASIS);
        let spectrogram = stft_with_plan(&audio, &self.fft_plan, N_FFT, HOP_LENGTH, WIN_LENGTH)?;

        let mel_spectrogram = self.mel_basis.dot(&spectrogram);
        let log_zero_guard = 2.0f32.powi(-24);
        let mut features = mel_spectrogram
            .mapv(|value| (value + log_zero_guard).ln())
            .t()
            .to_owned();

        normalize_per_feature(&mut features);
        Ok(features)
    }
}

fn apply_preemphasis(audio: &[f32], coefficient: f32) -> Vec<f32> {
    let Some(first) = audio.first().copied() else {
        return Vec::new();
    };

    let mut result = Vec::with_capacity(audio.len());
    result.push(first);
    result.extend(
        audio
            .windows(2)
            .map(|window| window[1] - coefficient * window[0]),
    );
    result
}

fn hann_window(length: usize) -> Vec<f32> {
    (0..length)
        .map(|index| 0.5 - 0.5 * ((2.0 * PI * index as f32) / (length as f32 - 1.0)).cos())
        .collect()
}

fn stft_with_plan(
    audio: &[f32],
    plan: &Arc<dyn RealToComplex<f32>>,
    n_fft: usize,
    hop_length: usize,
    win_length: usize,
) -> Result<Array2<f32>> {
    let pad_amount = n_fft / 2;
    let mut padded = vec![0.0; pad_amount];
    padded.extend_from_slice(audio);
    padded.resize(padded.len() + pad_amount, 0.0);

    let window = hann_window(win_length);
    let frame_count = (padded.len() - n_fft) / hop_length + 1;
    let frequency_bins = n_fft / 2 + 1;
    let mut spectrogram = Array2::zeros((frequency_bins, frame_count));

    let mut input = vec![0.0; n_fft];
    let mut output = plan.make_output_vec();
    let mut scratch = plan.make_scratch_vec();

    for frame_index in 0..frame_count {
        let start = frame_index * hop_length;
        input.fill(0.0);
        for index in 0..win_length.min(padded.len() - start) {
            input[index] = padded[start + index] * window[index];
        }

        plan.process_with_scratch(&mut input, &mut output, &mut scratch)
            .map_err(|error| Error::Audio(format!("FFT failed: {error}")))?;

        for frequency_bin in 0..frequency_bins {
            spectrogram[[frequency_bin, frame_index]] = output[frequency_bin].norm_sqr();
        }
    }

    Ok(spectrogram)
}

const F_SP: f64 = 200.0 / 3.0;
const MIN_LOG_HZ: f64 = 1_000.0;
const MIN_LOG_MEL: f64 = MIN_LOG_HZ / F_SP;
const LOG_STEP: f64 = 0.068_751_777_420_949_12;

fn hz_to_mel_slaney(hz: f64) -> f64 {
    if hz < MIN_LOG_HZ {
        hz / F_SP
    } else {
        MIN_LOG_MEL + (hz / MIN_LOG_HZ).ln() / LOG_STEP
    }
}

fn mel_to_hz_slaney(mel: f64) -> f64 {
    if mel < MIN_LOG_MEL {
        mel * F_SP
    } else {
        MIN_LOG_HZ * ((mel - MIN_LOG_MEL) * LOG_STEP).exp()
    }
}

fn create_mel_filterbank(n_fft: usize, mel_count: usize, sample_rate: usize) -> Array2<f32> {
    let frequency_bins = n_fft / 2 + 1;
    let mut filterbank = Array2::zeros((mel_count, frequency_bins));
    let mel_min = hz_to_mel_slaney(0.0);
    let mel_max = hz_to_mel_slaney(sample_rate as f64 / 2.0);
    let mel_points = (0..=mel_count + 1)
        .map(|index| {
            mel_to_hz_slaney(mel_min + (mel_max - mel_min) * index as f64 / (mel_count + 1) as f64)
        })
        .collect::<Vec<_>>();
    let fft_frequencies = (0..frequency_bins)
        .map(|index| index as f64 * sample_rate as f64 / n_fft as f64)
        .collect::<Vec<_>>();
    let frequency_differences = mel_points
        .windows(2)
        .map(|window| window[1] - window[0])
        .collect::<Vec<_>>();

    for mel_index in 0..mel_count {
        for (frequency_index, frequency) in fft_frequencies.iter().enumerate() {
            let lower = (frequency - mel_points[mel_index]) / frequency_differences[mel_index];
            let upper =
                (mel_points[mel_index + 2] - frequency) / frequency_differences[mel_index + 1];
            filterbank[[mel_index, frequency_index]] = 0.0f64.max(lower.min(upper)) as f32;
        }

        let slaney_normalization = 2.0 / (mel_points[mel_index + 2] - mel_points[mel_index]);
        for frequency_index in 0..frequency_bins {
            filterbank[[mel_index, frequency_index]] *= slaney_normalization as f32;
        }
    }

    filterbank
}

fn normalize_per_feature(features: &mut Array2<f32>) {
    let frame_count = features.shape()[0];
    if frame_count <= 1 {
        return;
    }

    for feature_index in 0..features.shape()[1] {
        let mut column = features.column_mut(feature_index);
        let mean = column.iter().sum::<f32>() / frame_count as f32;
        let variance = column
            .iter()
            .map(|value| (value - mean).powi(2))
            .sum::<f32>()
            / (frame_count as f32 - 1.0);
        let standard_deviation = variance.sqrt() + 1e-5;

        for value in column.iter_mut() {
            *value = (*value - mean) / standard_deviation;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_shape_matches_parakeet_contract() {
        let extractor = FeatureExtractor::new();
        let audio = vec![0.0; SAMPLE_RATE];
        let features = extractor.extract(&audio).unwrap();

        assert_eq!(features.shape()[1], FEATURE_SIZE);
        assert_eq!(features.shape()[0], 101);
        assert!(features.iter().all(|value| value.is_finite()));
    }

    #[test]
    fn preemphasis_preserves_length_and_first_sample() {
        let emphasized = apply_preemphasis(&[0.25, 0.5, -0.25], PREEMPHASIS);

        assert_eq!(emphasized.len(), 3);
        assert_eq!(emphasized[0], 0.25);
        assert!((emphasized[1] - 0.2575).abs() < 1e-6);
    }
}
