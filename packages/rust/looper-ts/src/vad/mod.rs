use webrtc_vad::{SampleRate, Vad};

use crate::{Error, Result};

mod quiet_cut;
mod silero;

pub use quiet_cut::quiet_cut_index;

const ANALYSIS_RATE: u32 = 16_000;
const DETECTOR_FRAME_MS: usize = 20;
const REGION_JOIN_GAP_MS: usize = 180;
const REGION_LEAD_CONTEXT_MS: usize = 200;
const REGION_TRAIL_CONTEXT_MS: usize = 280;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VadMode {
    Quality,
    LowBitrate,
    Aggressive,
    VeryAggressive,
}

impl VadMode {
    fn engine_mode(self) -> webrtc_vad::VadMode {
        match self {
            Self::Quality => webrtc_vad::VadMode::Quality,
            Self::LowBitrate => webrtc_vad::VadMode::LowBitrate,
            Self::Aggressive => webrtc_vad::VadMode::Aggressive,
            Self::VeryAggressive => webrtc_vad::VadMode::VeryAggressive,
        }
    }
}

pub struct VoiceActivityDetector {
    inner: Vad,
}

impl VoiceActivityDetector {
    pub fn new(sample_rate: u32, mode: VadMode) -> Result<Self> {
        let engine_rate = engine_rate(sample_rate).ok_or_else(|| {
            Error::Validation(format!(
                "VAD sample rate must be 8000, 16000, 32000, or 48000 Hz; got {sample_rate}"
            ))
        })?;
        Ok(Self {
            inner: Vad::new_with_rate_and_mode(engine_rate, mode.engine_mode()),
        })
    }

    pub fn is_speech(&mut self, frame: &[i16]) -> Result<bool> {
        self.inner
            .is_voice_segment(frame)
            .map_err(|()| Error::Validation("invalid VAD audio frame".to_string()))
    }
}

/// Returns padded speech intervals in seconds.
///
/// Silero is the primary detector. If its embedded runtime is unavailable, a
/// WebRTC timeline groups voiced frames and adds separate onset/release context
/// so that fallback detection remains conservative about dropping speech.
pub fn speech_regions(audio: &[i16], sample_rate: u32) -> Option<Vec<(f32, f32)>> {
    if sample_rate == 0 {
        return None;
    }
    silero::speech_regions(audio, sample_rate)
        .or_else(|| web_rtc_speech_regions(audio, sample_rate))
}

/// Returns the fraction of complete detector frames classified as speech.
///
/// Unsupported source rates are converted to 16 kHz before classification.
/// Runtime detector failures return `1.0`: audio must not be discarded merely
/// because the optional gate could not run.
pub fn speech_ratio(audio: &[i16], sample_rate: u32, mode: VadMode) -> Result<f32> {
    if sample_rate == 0 {
        return Err(Error::Validation(
            "VAD sample rate must be greater than zero".to_string(),
        ));
    }
    if audio.is_empty() {
        return Ok(0.0);
    }

    match FrameTimeline::analyze(audio, sample_rate, mode) {
        Ok(timeline) => Ok(timeline.speech_share()),
        Err(_) => Ok(1.0),
    }
}

fn web_rtc_speech_regions(audio: &[i16], sample_rate: u32) -> Option<Vec<(f32, f32)>> {
    if sample_rate == 0 {
        return None;
    }
    if audio.is_empty() {
        return Some(Vec::new());
    }

    FrameTimeline::analyze(audio, sample_rate, VadMode::Quality)
        .ok()
        .map(|timeline| timeline.speech_regions(RegionPolicy::fallback()))
}

#[derive(Debug)]
struct FrameTimeline {
    voiced: Vec<bool>,
    seconds_per_frame: f32,
    source_duration_seconds: f32,
}

impl FrameTimeline {
    fn analyze(audio: &[i16], source_rate: u32, mode: VadMode) -> Result<Self> {
        let (analysis, analysis_rate) = analysis_audio(audio, source_rate).ok_or_else(|| {
            Error::Validation("VAD sample rate must be greater than zero".to_string())
        })?;
        let frame_samples = analysis_rate as usize * DETECTOR_FRAME_MS / 1_000;
        let mut detector = VoiceActivityDetector::new(analysis_rate, mode)?;
        let mut voiced = Vec::with_capacity(analysis.len() / frame_samples.max(1));
        if frame_samples > 0 {
            for frame in analysis.chunks_exact(frame_samples) {
                voiced.push(detector.is_speech(frame)?);
            }
        }

        Ok(Self {
            voiced,
            seconds_per_frame: DETECTOR_FRAME_MS as f32 / 1_000.0,
            source_duration_seconds: audio.len() as f32 / source_rate as f32,
        })
    }

    fn speech_share(&self) -> f32 {
        if self.voiced.is_empty() {
            return 0.0;
        }
        let speech_frames = self.voiced.iter().filter(|voiced| **voiced).count();
        speech_frames as f32 / self.voiced.len() as f32
    }

    fn speech_regions(&self, policy: RegionPolicy) -> Vec<(f32, f32)> {
        let mut spans: Vec<VoicedSpan> = Vec::new();
        for frame in self
            .voiced
            .iter()
            .enumerate()
            .filter_map(|(index, voiced)| voiced.then_some(index))
        {
            match spans.last_mut() {
                Some(span) if span.accepts(frame, policy.join_gap_frames) => {
                    span.last = frame;
                }
                _ => spans.push(VoicedSpan {
                    first: frame,
                    last: frame,
                }),
            }
        }

        let mut contextualized: Vec<(usize, usize)> = Vec::with_capacity(spans.len());
        for span in spans {
            let start = span.first.saturating_sub(policy.lead_context_frames);
            let end = span
                .last
                .saturating_add(1)
                .saturating_add(policy.trail_context_frames)
                .min(self.voiced.len());
            match contextualized.last_mut() {
                Some((_, previous_end)) if start <= *previous_end => {
                    *previous_end = (*previous_end).max(end);
                }
                _ => contextualized.push((start, end)),
            }
        }

        contextualized
            .into_iter()
            .filter_map(|(start_frame, end_frame)| {
                let start = start_frame as f32 * self.seconds_per_frame;
                let end =
                    (end_frame as f32 * self.seconds_per_frame).min(self.source_duration_seconds);
                (start < end).then_some((start, end))
            })
            .collect()
    }
}

#[derive(Debug, Clone, Copy)]
struct VoicedSpan {
    first: usize,
    last: usize,
}

impl VoicedSpan {
    fn accepts(self, frame: usize, allowed_gap: usize) -> bool {
        frame.saturating_sub(self.last).saturating_sub(1) <= allowed_gap
    }
}

#[derive(Debug, Clone, Copy)]
struct RegionPolicy {
    join_gap_frames: usize,
    lead_context_frames: usize,
    trail_context_frames: usize,
}

impl RegionPolicy {
    fn fallback() -> Self {
        Self {
            join_gap_frames: REGION_JOIN_GAP_MS.div_ceil(DETECTOR_FRAME_MS),
            lead_context_frames: REGION_LEAD_CONTEXT_MS.div_ceil(DETECTOR_FRAME_MS),
            trail_context_frames: REGION_TRAIL_CONTEXT_MS.div_ceil(DETECTOR_FRAME_MS),
        }
    }
}

fn engine_rate(sample_rate: u32) -> Option<SampleRate> {
    [
        (8_000, SampleRate::Rate8kHz),
        (16_000, SampleRate::Rate16kHz),
        (32_000, SampleRate::Rate32kHz),
        (48_000, SampleRate::Rate48kHz),
    ]
    .into_iter()
    .find_map(|(candidate, rate)| (sample_rate == candidate).then_some(rate))
}

/// Converts PCM to the detector's rate using the crate's band-limited resampler.
pub(super) fn to_rate(audio: &[i16], source_rate: u32, target_rate: u32) -> Option<Vec<i16>> {
    if source_rate == 0 || target_rate == 0 {
        return None;
    }
    if audio.is_empty() || source_rate == target_rate {
        return Some(audio.to_vec());
    }
    Some(crate::audio::resample_i16(audio, source_rate, target_rate))
}

fn analysis_audio(audio: &[i16], source_rate: u32) -> Option<(Vec<i16>, u32)> {
    let rate = engine_rate(source_rate)
        .map(|_| source_rate)
        .unwrap_or(ANALYSIS_RATE);
    to_rate(audio, source_rate, rate).map(|converted| (converted, rate))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn timeline(voiced: Vec<bool>) -> FrameTimeline {
        let duration = voiced.len() as f32 * DETECTOR_FRAME_MS as f32 / 1_000.0;
        FrameTimeline {
            voiced,
            seconds_per_frame: DETECTOR_FRAME_MS as f32 / 1_000.0,
            source_duration_seconds: duration,
        }
    }

    #[test]
    fn silence_has_no_speech_regions() {
        let audio = vec![0i16; ANALYSIS_RATE as usize];
        assert_eq!(
            web_rtc_speech_regions(&audio, ANALYSIS_RATE),
            Some(Vec::new())
        );
    }

    #[test]
    fn invalid_rate_returns_none_or_validation_error() {
        assert_eq!(speech_regions(&[0; 100], 0), None);
        assert!(speech_ratio(&[0; 100], 0, VadMode::Quality).is_err());
    }

    #[test]
    fn unsupported_rates_are_resampled() {
        let audio = vec![0i16; 44_100];
        assert_eq!(web_rtc_speech_regions(&audio, 44_100), Some(Vec::new()));
    }

    #[test]
    fn fallback_regions_join_brief_pauses_and_use_release_context() {
        let mut voiced = vec![false; 100];
        voiced[20..25].fill(true);
        voiced[30..35].fill(true);
        voiced[80..85].fill(true);

        let regions = timeline(voiced).speech_regions(RegionPolicy::fallback());

        assert_eq!(regions.len(), 2);
        let expected = [(0.2, 0.98), (1.4, 1.98)];
        for (region, expected) in regions.iter().zip(expected) {
            assert!((region.0 - expected.0).abs() < 1e-5);
            assert!((region.1 - expected.1).abs() < 1e-5);
        }
    }

    #[test]
    fn fallback_regions_split_pauses_outside_the_join_policy() {
        let mut voiced = vec![false; 70];
        voiced[2..4].fill(true);
        voiced[40..42].fill(true);

        assert_eq!(
            timeline(voiced)
                .speech_regions(RegionPolicy::fallback())
                .len(),
            2
        );
    }

    #[test]
    fn overlapping_context_is_returned_as_one_region() {
        let mut voiced = vec![false; 50];
        voiced[2..4].fill(true);
        voiced[20..22].fill(true);

        assert_eq!(
            timeline(voiced)
                .speech_regions(RegionPolicy::fallback())
                .len(),
            1
        );
    }

    #[test]
    fn speech_share_is_based_on_complete_detector_frames() {
        assert_eq!(timeline(vec![true, false, true, false]).speech_share(), 0.5);
        assert_eq!(timeline(Vec::new()).speech_share(), 0.0);
    }

    #[test]
    fn resampling_preserves_duration() {
        let input = vec![0i16; 44_100];
        let output = to_rate(&input, 44_100, 16_000).unwrap();
        assert_eq!(output.len(), 16_000);
    }

    #[test]
    fn speech_ratio_is_zero_for_silence_and_short_audio() {
        assert_eq!(
            speech_ratio(&vec![0; 16_000], 16_000, VadMode::VeryAggressive).unwrap(),
            0.0
        );
        assert_eq!(
            speech_ratio(&[0; 100], 16_000, VadMode::VeryAggressive).unwrap(),
            0.0
        );
    }
}
