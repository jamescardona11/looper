//! Neural voice-activity detection over the embedded Silero v5 ONNX graph.
//!
//! The tensor names, window geometry and state shape below are the model's own
//! interface contract, not tunables: the graph rejects anything else. See
//! the root THIRD_PARTY_NOTICES.md for the model's provenance and license.

use std::sync::{Mutex, OnceLock};

use ort::session::Session;
use ort::value::Tensor;

use super::to_rate;

const MODEL: &[u8] = include_bytes!("silero_vad_16k_op15.onnx");

const RATE: u32 = 16_000;
const WINDOW: usize = 512;
const CONTEXT: usize = 64;
const STATE_LEN: usize = 2 * 128;
const WINDOW_SECONDS: f32 = WINDOW as f32 / RATE as f32;

/// Probability at or above which a window counts as speech.
const SPEECH_PROBABILITY: f32 = 0.5;
/// A silence shorter than this many windows keeps the region open, so a breath
/// mid-sentence does not split one utterance into two.
const MAX_INNER_SILENCE: usize = 4;
/// Slack added to both ends of a region so word onsets survive the cut.
const EDGE_SLACK_SECONDS: f32 = 0.25;

struct Detector {
    session: Session,
    state: [f32; STATE_LEN],
    carry: [f32; CONTEXT],
    window: [f32; CONTEXT + WINDOW],
}

impl Detector {
    fn load() -> crate::Result<Self> {
        Ok(Self {
            session: Session::builder()?.commit_from_memory(MODEL)?,
            state: [0.0; STATE_LEN],
            carry: [0.0; CONTEXT],
            window: [0.0; CONTEXT + WINDOW],
        })
    }

    /// Classify every full window of `samples`, one bool per window.
    ///
    /// The detector is recurrent, so both the hidden state and the context
    /// carried between windows reset before each run.
    fn classify(&mut self, samples: &[f32]) -> crate::Result<Vec<bool>> {
        self.state = [0.0; STATE_LEN];
        self.carry = [0.0; CONTEXT];

        let mut mask = Vec::with_capacity(samples.len() / WINDOW);
        for frame in samples.chunks_exact(WINDOW) {
            self.window[..CONTEXT].copy_from_slice(&self.carry);
            self.window[CONTEXT..].copy_from_slice(frame);

            let outputs = self.session.run(ort::inputs![
                "input" => Tensor::from_array(([1usize, CONTEXT + WINDOW], self.window.to_vec()))?,
                "state" => Tensor::from_array(([2usize, 1, 128], self.state.to_vec()))?,
                "sr" => Tensor::from_array(((), vec![RATE as i64]))?
            ])?;

            let (_, scores) = outputs["output"].try_extract_tensor::<f32>()?;
            mask.push(scores.first().copied().unwrap_or_default() >= SPEECH_PROBABILITY);

            let (_, next) = outputs["stateN"].try_extract_tensor::<f32>()?;
            let next: &[f32; STATE_LEN] = next.try_into().map_err(|_| {
                crate::Error::Model(format!(
                    "Silero returned {} state values; expected {STATE_LEN}",
                    next.len()
                ))
            })?;
            self.state = *next;
            self.carry.copy_from_slice(&frame[WINDOW - CONTEXT..]);
        }
        Ok(mask)
    }
}

static DETECTOR: OnceLock<Option<Mutex<Detector>>> = OnceLock::new();

pub(super) fn speech_regions(audio: &[i16], sample_rate: u32) -> Option<Vec<(f32, f32)>> {
    let resampled = to_rate(audio, sample_rate, RATE)?;
    if resampled.len() < WINDOW {
        return Some(Vec::new());
    }
    let samples = resampled
        .into_iter()
        .map(|sample| f32::from(sample) / 32_768.0)
        .collect::<Vec<_>>();

    let detector = DETECTOR.get_or_init(|| Detector::load().ok().map(Mutex::new));
    let mask = detector.as_ref()?.lock().ok()?.classify(&samples).ok()?;
    Some(to_regions(&mask, audio.len() as f32 / sample_rate as f32))
}

/// Collapse a per-window mask into `(start, end)` second pairs, merging any two
/// regions separated by no more than `MAX_INNER_SILENCE` windows.
fn to_regions(mask: &[bool], total_seconds: f32) -> Vec<(f32, f32)> {
    let mut windows: Vec<(usize, usize)> = Vec::new();

    for (index, _) in mask.iter().enumerate().filter(|(_, speech)| **speech) {
        match windows.last_mut() {
            Some(open) if index - open.1 <= MAX_INNER_SILENCE => open.1 = index + 1,
            _ => windows.push((index, index + 1)),
        }
    }

    windows
        .into_iter()
        .map(|(first, last)| {
            (
                (first as f32 * WINDOW_SECONDS - EDGE_SLACK_SECONDS).max(0.0),
                (last as f32 * WINDOW_SECONDS + EDGE_SLACK_SECONDS).min(total_seconds),
            )
        })
        .filter(|(start, end)| start < end)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regions_bridge_short_gaps_and_stay_inside_audio() {
        let mut mask = vec![false; 40];
        mask[5..8].fill(true);
        mask[11..14].fill(true);

        let regions = to_regions(&mask, 1.0);

        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].0, 0.0);
        assert!(regions[0].1 <= 1.0);
    }

    #[test]
    fn long_silence_splits_regions() {
        let mut mask = vec![false; 60];
        mask[2..5].fill(true);
        mask[40..44].fill(true);

        assert_eq!(to_regions(&mask, 2.0).len(), 2);
    }

    #[test]
    fn embedded_model_loads_and_detects_silence() {
        let mut detector = Detector::load().expect("embedded Silero model should load");
        let mask = detector
            .classify(&vec![0.0; RATE as usize])
            .expect("Silero inference should run");

        assert!(!mask.is_empty());
        assert!(mask.iter().all(|speech| !speech));
    }
}
