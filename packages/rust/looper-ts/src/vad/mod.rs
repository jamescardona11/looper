use webrtc_vad::{SampleRate, Vad};

use crate::{Error, Result};

mod quiet_cut;
mod silero;

pub use quiet_cut::quiet_cut_index;

const ANALYSIS_RATE: u32 = 16_000;
const FRAME_MS: usize = 20;
const BRIDGE_SILENCE_MS: usize = 200;
const PADDING_MS: usize = 250;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VadMode {
    Quality,
    LowBitrate,
    Aggressive,
    VeryAggressive,
}

pub struct VoiceActivityDetector {
    inner: Vad,
}

impl VoiceActivityDetector {
    pub fn new(sample_rate: u32, mode: VadMode) -> Result<Self> {
        let rate = supported_rate(sample_rate).ok_or_else(|| {
            Error::Validation(format!(
                "VAD sample rate must be 8000, 16000, 32000, or 48000 Hz; got {sample_rate}"
            ))
        })?;
        Ok(Self {
            inner: Vad::new_with_rate_and_mode(rate, web_rtc_mode(mode)),
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
/// Silero provides the primary neural detector. WebRTC remains an internal
/// fallback so an unavailable neural model never causes Looper to discard
/// speech. `None` means the input sample rate is invalid. An empty vector means
/// detection ran successfully and found no speech.
pub fn speech_regions(audio: &[i16], sample_rate: u32) -> Option<Vec<(f32, f32)>> {
    if sample_rate == 0 {
        return None;
    }
    silero::speech_regions(audio, sample_rate)
        .or_else(|| web_rtc_speech_regions(audio, sample_rate))
}

/// Returns the fraction of complete 30 ms frames classified as speech.
///
/// Unsupported source rates are resampled to 16 kHz. Detection errors fail
/// open with a ratio of `1.0`, matching Looper's policy of never discarding
/// audio merely because VAD is unavailable.
pub fn speech_ratio(audio: &[i16], sample_rate: u32, mode: VadMode) -> Result<f32> {
    if sample_rate == 0 {
        return Err(Error::Validation(
            "VAD sample rate must be greater than zero".to_string(),
        ));
    }
    if audio.is_empty() {
        return Ok(0.0);
    }

    let Some((analysis, analysis_rate)) = for_analysis(audio, sample_rate) else {
        return Ok(0.0);
    };
    let frame_len = analysis_rate as usize * 30 / 1000;
    if frame_len == 0 || analysis.len() < frame_len {
        return Ok(0.0);
    }

    let mut vad = match VoiceActivityDetector::new(analysis_rate, mode) {
        Ok(vad) => vad,
        Err(_) => return Ok(1.0),
    };
    let mut speech_frames = 0usize;
    let mut total_frames = 0usize;
    for frame in analysis.chunks_exact(frame_len) {
        total_frames += 1;
        if vad.is_speech(frame).unwrap_or(false) {
            speech_frames += 1;
        }
    }
    Ok(speech_frames as f32 / total_frames as f32)
}

fn web_rtc_speech_regions(audio: &[i16], sample_rate: u32) -> Option<Vec<(f32, f32)>> {
    if sample_rate == 0 {
        return None;
    }
    if audio.is_empty() {
        return Some(Vec::new());
    }

    let (analysis_audio, analysis_rate) = for_analysis(audio, sample_rate)?;
    let frame_len = analysis_rate as usize * FRAME_MS / 1000;
    if analysis_audio.len() < frame_len {
        return Some(Vec::new());
    }

    let rate = supported_rate(analysis_rate)?;
    let mut vad = Vad::new_with_rate_and_mode(rate, web_rtc_mode(VadMode::Quality));
    let mut mask = Vec::with_capacity(analysis_audio.len() / frame_len);
    for frame in analysis_audio.chunks_exact(frame_len) {
        mask.push(vad.is_voice_segment(frame).ok()?);
    }

    let duration_seconds = audio.len() as f32 / sample_rate as f32;
    Some(mask_to_regions(&mask, duration_seconds))
}

fn web_rtc_mode(mode: VadMode) -> webrtc_vad::VadMode {
    match mode {
        VadMode::Quality => webrtc_vad::VadMode::Quality,
        VadMode::LowBitrate => webrtc_vad::VadMode::LowBitrate,
        VadMode::Aggressive => webrtc_vad::VadMode::Aggressive,
        VadMode::VeryAggressive => webrtc_vad::VadMode::VeryAggressive,
    }
}

fn supported_rate(sample_rate: u32) -> Option<SampleRate> {
    match sample_rate {
        8_000 => Some(SampleRate::Rate8kHz),
        16_000 => Some(SampleRate::Rate16kHz),
        32_000 => Some(SampleRate::Rate32kHz),
        48_000 => Some(SampleRate::Rate48kHz),
        _ => None,
    }
}

/// Bring `audio` to `target_rate`, band-limited.
///
/// Every detector here has a fixed set of rates it accepts, so this is the one
/// place that converts. `None` means the rates were nonsense and there is
/// nothing sensible to analyse.
pub(super) fn to_rate(audio: &[i16], source_rate: u32, target_rate: u32) -> Option<Vec<i16>> {
    if source_rate == 0 || target_rate == 0 {
        return None;
    }
    if audio.is_empty() || source_rate == target_rate {
        return Some(audio.to_vec());
    }
    Some(crate::audio::resample_i16(audio, source_rate, target_rate))
}

/// The rate this audio should be analysed at, and the audio converted to it.
///
/// Detectors accept only a few rates; anything else is brought to
/// [`ANALYSIS_RATE`].
fn for_analysis(audio: &[i16], sample_rate: u32) -> Option<(Vec<i16>, u32)> {
    let analysis_rate = supported_rate(sample_rate)
        .map(|_| sample_rate)
        .unwrap_or(ANALYSIS_RATE);
    to_rate(audio, sample_rate, analysis_rate).map(|audio| (audio, analysis_rate))
}

fn mask_to_regions(mask: &[bool], duration_seconds: f32) -> Vec<(f32, f32)> {
    if mask.is_empty() {
        return Vec::new();
    }

    let bridge_frames = BRIDGE_SILENCE_MS.div_ceil(FRAME_MS);
    let frame_seconds = FRAME_MS as f32 / 1000.0;
    let padding_seconds = PADDING_MS as f32 / 1000.0;
    let mut frame_regions = Vec::new();
    let mut start = None;
    let mut silence_frames = 0usize;

    for (index, speech) in mask.iter().copied().enumerate() {
        if speech {
            start.get_or_insert(index);
            silence_frames = 0;
        } else if let Some(region_start) = start {
            silence_frames += 1;
            if silence_frames > bridge_frames {
                frame_regions.push((region_start, index - silence_frames + 1));
                start = None;
                silence_frames = 0;
            }
        }
    }
    if let Some(region_start) = start {
        frame_regions.push((region_start, mask.len() - silence_frames));
    }

    frame_regions
        .into_iter()
        .filter(|(start, end)| start < end)
        .map(|(start, end)| {
            (
                (start as f32 * frame_seconds - padding_seconds).max(0.0),
                (end as f32 * frame_seconds + padding_seconds).min(duration_seconds),
            )
        })
        .filter(|(start, end)| start < end)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_has_no_speech_regions() {
        let audio = vec![0i16; ANALYSIS_RATE as usize];
        assert_eq!(
            web_rtc_speech_regions(&audio, ANALYSIS_RATE),
            Some(Vec::new())
        );
    }

    #[test]
    fn invalid_rate_returns_none() {
        assert_eq!(speech_regions(&[0; 100], 0), None);
    }

    #[test]
    fn unsupported_rates_are_resampled() {
        let audio = vec![0i16; 44_100];
        assert_eq!(web_rtc_speech_regions(&audio, 44_100), Some(Vec::new()));
    }

    #[test]
    fn regions_bridge_short_gaps_and_apply_bounded_padding() {
        let mut mask = vec![false; 100];
        mask[20..25].fill(true);
        mask[30..35].fill(true);
        mask[80..85].fill(true);

        let regions = mask_to_regions(&mask, 2.0);

        assert_eq!(regions.len(), 2);
        const TOLERANCE: f32 = 1e-5;
        assert!((regions[0].0 - 0.15).abs() < TOLERANCE);
        assert!((regions[0].1 - 0.95).abs() < TOLERANCE);
        assert!((regions[1].0 - 1.35).abs() < TOLERANCE);
        assert!((regions[1].1 - 1.95).abs() < TOLERANCE);
    }

    #[test]
    fn linear_resampling_preserves_duration() {
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
