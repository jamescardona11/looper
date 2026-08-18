//! Residual echo suppression.
//!
//! The neural stage removes most of the echo but leaves a linearly-correlated
//! remainder. This stage estimates how much of the speaker signal is still
//! present in the mic and subtracts that much of it.
//!
//! The hard part is not the subtraction, it is knowing when *not* to: while
//! both sides talk at once, the correlation between mic and speaker no longer
//! measures echo, and subtracting on that estimate eats the near-end voice.

/// Thresholds governing when suppression applies and how hard.
#[derive(Debug, Clone, Copy)]
pub struct ResidualConfig {
    /// Below this mic level there is nothing worth suppressing.
    pub min_mic_rms: f32,
    /// Below this speaker level there is no echo to have leaked.
    pub min_reference_rms: f32,
    /// Correlation below this means the two signals are unrelated; whatever is
    /// in the mic is not echo.
    pub min_correlation: f32,
    /// Ceiling on the subtraction, so a bad estimate cannot invert the signal.
    pub max_gain: f32,
    /// How fast the gain may move between frames while both sides talk.
    pub gain_smoothing: f32,
    /// Energy left unexplained by the speaker, above which the frame is
    /// treated as double talk.
    pub double_talk_residual_ratio: f32,
    /// Segments the frame is split into for the robust estimate.
    pub robust_segments: usize,
    /// Usable segments below which the robust estimate is not trustworthy.
    pub robust_min_segments: usize,
}

impl Default for ResidualConfig {
    fn default() -> Self {
        Self {
            min_mic_rms: 1e-4,
            min_reference_rms: 1e-4,
            min_correlation: 0.12,
            max_gain: 1.25,
            gain_smoothing: 0.12,
            double_talk_residual_ratio: 0.08,
            robust_segments: 8,
            robust_min_segments: 3,
        }
    }
}

/// Second-order statistics of a mic/speaker pair over one frame.
struct Correlation {
    mic_energy: f32,
    speaker_energy: f32,
    cross_energy: f32,
    len: usize,
}

impl Correlation {
    fn measure(mic: &[f32], speaker: &[f32]) -> Self {
        let len = mic.len().min(speaker.len());
        let mut mic_energy = 0.0;
        let mut speaker_energy = 0.0;
        let mut cross_energy = 0.0;
        for index in 0..len {
            mic_energy += mic[index] * mic[index];
            speaker_energy += speaker[index] * speaker[index];
            cross_energy += mic[index] * speaker[index];
        }
        Self {
            mic_energy,
            speaker_energy,
            cross_energy,
            len,
        }
    }

    fn mic_rms(&self) -> f32 {
        (self.mic_energy / self.len.max(1) as f32).sqrt()
    }

    fn speaker_rms(&self) -> f32 {
        (self.speaker_energy / self.len.max(1) as f32).sqrt()
    }

    /// How much of the mic is explained by the speaker, from 0 to 1.
    fn coefficient(&self) -> f32 {
        self.cross_energy.abs() / (self.mic_energy * self.speaker_energy).sqrt().max(1e-6)
    }

    /// The scale that best cancels the speaker out of the mic.
    fn best_gain(&self, ceiling: f32) -> f32 {
        (self.cross_energy / self.speaker_energy.max(1e-6)).clamp(-ceiling, ceiling)
    }

    /// The share of mic energy the speaker does not account for. High values
    /// mean someone is talking over the echo.
    fn unexplained_ratio(&self) -> f32 {
        let residual = (self.mic_energy
            - (self.cross_energy * self.cross_energy / self.speaker_energy.max(1e-6)))
        .max(0.0);
        (residual / self.len.max(1) as f32).sqrt() / self.mic_rms().max(1e-6)
    }
}

pub struct ResidualSuppressor {
    config: ResidualConfig,
    smoothed_gain: Option<f32>,
}

impl ResidualSuppressor {
    pub fn new(config: ResidualConfig) -> Self {
        Self {
            config,
            smoothed_gain: None,
        }
    }

    /// Forget the running gain. Call this whenever the alignment between the
    /// two channels changes, since the old estimate no longer describes them.
    pub fn reset(&mut self) {
        self.smoothed_gain = None;
    }

    /// Subtract whatever of `speaker` still shows up in `mic`.
    ///
    /// Returns `mic` untouched when there is no measurable echo to remove.
    pub fn suppress(&mut self, mic: Vec<f32>, speaker: &[f32]) -> Vec<f32> {
        let stats = Correlation::measure(&mic, speaker);
        if stats.len == 0
            || stats.mic_rms() < self.config.min_mic_rms
            || stats.speaker_rms() < self.config.min_reference_rms
            || stats.coefficient() < self.config.min_correlation
        {
            return mic;
        }

        let gain = self.gain_for(&stats, &mic, speaker);
        subtract(mic, speaker, stats.len, gain)
    }

    fn gain_for(&mut self, stats: &Correlation, mic: &[f32], speaker: &[f32]) -> f32 {
        let instant = stats.best_gain(self.config.max_gain);
        let double_talk = stats.unexplained_ratio() > self.config.double_talk_residual_ratio;

        // While both sides talk, a whole-frame estimate is skewed by the near
        // voice, so fall back to the per-segment one and move the gain slowly.
        let measured = if double_talk {
            self.robust_gain(mic, speaker, stats.len, instant)
        } else {
            instant
        };

        let smoothed = self
            .smoothed_gain
            .map(|previous| previous + (measured - previous) * self.config.gain_smoothing)
            .unwrap_or(measured);
        self.smoothed_gain = Some(smoothed);

        if double_talk { smoothed } else { measured }
    }

    /// An energy-weighted, trimmed mean of per-segment gains.
    ///
    /// Splitting the frame lets stretches dominated by echo outvote the ones
    /// dominated by the near voice; trimming drops the extremes either way.
    fn robust_gain(&self, mic: &[f32], speaker: &[f32], len: usize, fallback: f32) -> f32 {
        let segment_len = (len / self.config.robust_segments).max(1);
        let mut candidates: Vec<(f32, f32)> = Vec::with_capacity(self.config.robust_segments);

        for start in (0..len).step_by(segment_len) {
            let end = (start + segment_len).min(len);
            let segment = Correlation::measure(&mic[start..end], &speaker[start..end]);
            if segment.mic_energy > 1e-8
                && segment.speaker_energy > 1e-8
                && segment.coefficient() >= self.config.min_correlation
            {
                candidates.push((
                    segment.best_gain(self.config.max_gain),
                    segment.speaker_energy,
                ));
            }
        }

        if candidates.len() < self.config.robust_min_segments {
            return fallback;
        }

        candidates.sort_by(|left, right| left.0.total_cmp(&right.0));
        let trim = if candidates.len() >= 6 {
            candidates.len() / 6
        } else {
            0
        };
        let kept = &candidates[trim..candidates.len() - trim];

        let weighted: f32 = kept.iter().map(|(gain, energy)| gain * energy).sum();
        let total: f32 = kept.iter().map(|(_, energy)| energy).sum();
        if total <= 1e-8 {
            return fallback;
        }
        (weighted / total).clamp(-self.config.max_gain, self.config.max_gain)
    }
}

fn subtract(mic: Vec<f32>, speaker: &[f32], len: usize, gain: f32) -> Vec<f32> {
    let mut output = Vec::with_capacity(mic.len());
    output.extend(
        mic.iter()
            .zip(speaker)
            .take(len)
            .map(|(sample, reference)| (sample - gain * reference).clamp(-1.0, 1.0)),
    );
    output.extend_from_slice(&mic[len..]);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    const LEN: usize = 1_024;

    fn tone(amplitude: f32, phase: f32) -> Vec<f32> {
        (0..LEN)
            .map(|i| ((i as f32 * 0.05) + phase).sin() * amplitude)
            .collect()
    }

    fn rms(samples: &[f32]) -> f32 {
        (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
    }

    fn suppressor() -> ResidualSuppressor {
        ResidualSuppressor::new(ResidualConfig::default())
    }

    #[test]
    fn a_scaled_copy_of_the_speaker_is_removed() {
        let speaker = tone(0.5, 0.0);
        let echo: Vec<f32> = speaker.iter().map(|s| s * 0.4).collect();

        let cleaned = suppressor().suppress(echo.clone(), &speaker);

        assert!(
            rms(&cleaned) < rms(&echo) * 0.1,
            "echo survived: {} vs {}",
            rms(&cleaned),
            rms(&echo)
        );
    }

    #[test]
    fn audio_unrelated_to_the_speaker_is_left_alone() {
        let speaker = tone(0.5, 0.0);
        let voice = tone(0.5, 1.7);

        let cleaned = suppressor().suppress(voice.clone(), &speaker);

        assert_eq!(cleaned, voice, "an uncorrelated mic must pass through");
    }

    #[test]
    fn near_silence_passes_through_untouched() {
        let speaker = tone(0.5, 0.0);
        let quiet = vec![1e-6_f32; LEN];

        assert_eq!(suppressor().suppress(quiet.clone(), &speaker), quiet);
        assert_eq!(
            suppressor().suppress(quiet.clone(), &vec![0.0; LEN]),
            quiet,
            "a silent speaker means there is no echo to remove"
        );
    }

    #[test]
    fn a_talking_near_end_survives_the_echo_being_removed() {
        let speaker = tone(0.5, 0.0);
        let voice = tone(0.35, 2.2);
        let mixed: Vec<f32> = speaker
            .iter()
            .zip(&voice)
            .map(|(reference, near)| reference * 0.4 + near)
            .collect();

        let cleaned = suppressor().suppress(mixed, &speaker);

        // The near voice has to still be there afterwards.
        assert!(
            rms(&cleaned) > rms(&voice) * 0.5,
            "double talk was over-suppressed: {} vs {}",
            rms(&cleaned),
            rms(&voice)
        );
    }

    #[test]
    fn the_output_never_clips() {
        let speaker = tone(1.0, 0.0);
        let mic = tone(1.0, 3.0);

        for sample in suppressor().suppress(mic, &speaker) {
            assert!((-1.0..=1.0).contains(&sample), "sample {sample} clipped");
        }
    }

    #[test]
    fn a_reset_forgets_the_running_gain() {
        let speaker = tone(0.5, 0.0);
        let echo: Vec<f32> = speaker.iter().map(|s| s * 0.4).collect();

        let mut suppressor = suppressor();
        suppressor.suppress(echo.clone(), &speaker);
        assert!(suppressor.smoothed_gain.is_some());

        suppressor.reset();
        assert!(suppressor.smoothed_gain.is_none());
    }

    #[test]
    fn a_longer_mic_buffer_keeps_its_tail() {
        let speaker = tone(0.5, 0.0);
        let mut mic: Vec<f32> = speaker.iter().map(|s| s * 0.4).collect();
        mic.extend_from_slice(&[0.7, 0.8]);

        let cleaned = suppressor().suppress(mic, &speaker);

        assert_eq!(cleaned.len(), LEN + 2);
        assert_eq!(&cleaned[LEN..], &[0.7, 0.8]);
    }
}
