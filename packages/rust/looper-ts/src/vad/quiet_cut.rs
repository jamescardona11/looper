const FRAME_DURATION_MS: usize = 150;
const SCAN_INTERVAL_MS: usize = 50;
const MIN_LOOKBACK_SECONDS: usize = 1;
const MAX_LOOKBACK_SECONDS: usize = 20;

/// Chooses a cut near the tail of a PCM chunk where the surrounding frame has
/// the least absolute amplitude. The returned index is the center of that
/// frame, so callers can retain speech before and after the boundary.
pub fn quiet_cut_index(samples: &[i16], sample_rate: u32) -> usize {
    let Some(plan) = QuietCutPlan::for_audio(samples.len(), sample_rate) else {
        return samples.len();
    };

    plan.candidate_ends(samples.len())
        .min_by_key(|end| plan.amplitude_sum(&samples[*end - plan.frame_len..*end]))
        .map(|end| end.saturating_sub(plan.frame_len / 2))
        .unwrap_or(samples.len())
}

#[derive(Debug, Clone, Copy)]
struct QuietCutPlan {
    frame_len: usize,
    step_len: usize,
    first_end: usize,
}

impl QuietCutPlan {
    fn for_audio(sample_count: usize, sample_rate: u32) -> Option<Self> {
        let samples_per_second = sample_rate.max(1) as usize;
        let lookback = (sample_count / 10).clamp(
            samples_per_second.saturating_mul(MIN_LOOKBACK_SECONDS),
            samples_per_second.saturating_mul(MAX_LOOKBACK_SECONDS),
        );
        let frame_len = samples_per_second.saturating_mul(FRAME_DURATION_MS) / 1_000;
        let step_len = samples_per_second.saturating_mul(SCAN_INTERVAL_MS) / 1_000;

        if frame_len == 0 || step_len == 0 || sample_count <= lookback.saturating_add(frame_len) {
            return None;
        }

        Some(Self {
            frame_len,
            step_len,
            first_end: sample_count
                .saturating_sub(lookback)
                .saturating_add(frame_len),
        })
    }

    fn candidate_ends(self, tail_end: usize) -> impl Iterator<Item = usize> {
        std::iter::successors(Some(tail_end), move |end| {
            end.checked_sub(self.step_len)
                .filter(|next| *next >= self.first_end)
        })
    }

    fn amplitude_sum(self, frame: &[i16]) -> u64 {
        frame.iter().fold(0u64, |sum, sample| {
            sum.saturating_add(i64::from(*sample).unsigned_abs())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_short_audio_intact() {
        assert_eq!(quiet_cut_index(&[0; 1_150], 1_000), 1_150);
        assert_eq!(quiet_cut_index(&[0; 500], 0), 500);
    }

    #[test]
    fn centers_the_quietest_tail_frame() {
        let mut audio = vec![900i16; 2_000];
        audio[1_600..1_800].fill(0);

        assert!((1_600..=1_800).contains(&quiet_cut_index(&audio, 1_000)));
    }

    #[test]
    fn resolves_equal_energy_in_favor_of_the_latest_frame() {
        let audio = vec![0i16; 4_000];

        assert_eq!(quiet_cut_index(&audio, 1_000), 3_925);
    }
}
