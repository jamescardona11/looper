use std::cmp::Reverse;

const MIN_AUDIO_MS: usize = 1_500;
const MIN_TAIL_MS: usize = 750;
const MAX_TAIL_MS: usize = 12_000;
const CONTEXT_MS: usize = 120;
const CANDIDATE_STEP_MS: usize = 40;

/// Finds a stable boundary near the end of a PCM block.
///
/// A boundary is judged from audio on both sides rather than from a trailing
/// frame alone. That keeps a single zero crossing inside loud speech from
/// looking like a useful cut. Equally quiet candidates prefer the later one so
/// chunking retains as much new audio as possible.
pub fn quiet_cut_index(samples: &[i16], sample_rate: u32) -> usize {
    let Some(search) = BoundarySearch::new(samples.len(), sample_rate) else {
        return samples.len();
    };

    search
        .candidates()
        .map(|center| {
            (
                BoundaryScore::measure(samples, center, search.radius),
                center,
            )
        })
        .min_by_key(|(score, center)| (*score, Reverse(*center)))
        .map(|(_, center)| center)
        .unwrap_or(samples.len())
}

#[derive(Debug, Clone, Copy)]
struct BoundarySearch {
    first: usize,
    last: usize,
    step: usize,
    radius: usize,
}

impl BoundarySearch {
    fn new(sample_count: usize, sample_rate: u32) -> Option<Self> {
        let rate = usize::try_from(sample_rate).ok()?.max(1);
        let minimum_audio = rate.saturating_mul(MIN_AUDIO_MS) / 1_000;
        if sample_rate == 0 || sample_count < minimum_audio {
            return None;
        }

        let radius = (rate.saturating_mul(CONTEXT_MS) / 2_000).max(1);
        let step = (rate.saturating_mul(CANDIDATE_STEP_MS) / 1_000).max(1);
        let minimum_tail = rate.saturating_mul(MIN_TAIL_MS) / 1_000;
        let maximum_tail = rate.saturating_mul(MAX_TAIL_MS) / 1_000;
        let tail = (sample_count / 4)
            .max(minimum_tail)
            .min(maximum_tail)
            .min(sample_count);
        let first = sample_count.saturating_sub(tail).max(radius);
        let last = sample_count.saturating_sub(radius);
        (first <= last).then_some(Self {
            first,
            last,
            step,
            radius,
        })
    }

    fn candidates(self) -> impl Iterator<Item = usize> {
        (self.first..=self.last).step_by(self.step)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct BoundaryScore {
    mean_square: u128,
    peak: u16,
    discontinuity: u16,
}

impl BoundaryScore {
    fn measure(samples: &[i16], center: usize, radius: usize) -> Self {
        let window = &samples[center - radius..center + radius];
        let mut square_sum = 0u128;
        let mut peak = 0u16;
        for sample in window {
            let magnitude = sample.unsigned_abs();
            peak = peak.max(magnitude);
            square_sum = square_sum.saturating_add(u128::from(magnitude).pow(2));
        }
        let discontinuity = samples[center - 1].abs_diff(samples[center]);
        Self {
            mean_square: square_sum / window.len() as u128,
            peak,
            discontinuity,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_audio_intact_when_a_boundary_search_would_be_unreliable() {
        assert_eq!(quiet_cut_index(&[0; 1_499], 1_000), 1_499);
        assert_eq!(quiet_cut_index(&[0; 2_000], 0), 2_000);
    }

    #[test]
    fn chooses_a_quiet_region_with_context_on_both_sides() {
        let mut audio = vec![900i16; 2_400];
        audio[1_720..2_000].fill(0);

        let cut = quiet_cut_index(&audio, 1_000);

        assert!((1_780..=1_940).contains(&cut), "unexpected cut: {cut}");
    }

    #[test]
    fn rejects_an_isolated_zero_inside_loud_audio() {
        let mut audio = vec![1_200i16; 2_400];
        audio[1_650] = 0;
        audio[1_880..2_080].fill(20);

        let cut = quiet_cut_index(&audio, 1_000);

        assert!(cut >= 1_880, "isolated zero attracted cut to {cut}");
    }

    #[test]
    fn equally_quiet_boundaries_keep_the_latest_candidate() {
        let audio = vec![0i16; 4_000];

        let cut = quiet_cut_index(&audio, 1_000);

        assert!((3_880..4_000).contains(&cut), "unexpected cut: {cut}");
    }
}
