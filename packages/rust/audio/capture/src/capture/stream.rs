use std::collections::VecDeque;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::{panic::AssertUnwindSafe, panic::catch_unwind};

use futures_util::{Stream, StreamExt};
use looper_aec::{AEC, ResidualConfig, ResidualSuppressor};
use looper_audio_sync::{SyncProbe, SyncProbeConfig, SyncProbeEvent, SyncProbeState};
use looper_resampler::ResampleExt;
use tokio::task::JoinHandle;
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;

use looper_audio_core::{CaptureFrame, CaptureStream, EchoCancelled, Error};

use crate::mic::MicInput;
use crate::speaker::SpeakerInput;

use super::joiner::Joiner;

pub(crate) type ChunkStream =
    Pin<Box<dyn Stream<Item = Result<Vec<f32>, looper_resampler::Error>> + Send>>;

const AUDIO_SYNC_PROBE_ENV: &str = "AUDIO_SYNC_PROBE";
const AEC_MAX_REFERENCE_LAG_MS: u32 = 100;

struct CaptureStreamInner {
    inner: ReceiverStream<Result<CaptureFrame, Error>>,
    cancel_token: CancellationToken,
    task: JoinHandle<()>,
}

impl Stream for CaptureStreamInner {
    type Item = Result<CaptureFrame, Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.inner).poll_next(cx)
    }
}

impl Drop for CaptureStreamInner {
    fn drop(&mut self) {
        self.cancel_token.cancel();
        self.task.abort();
    }
}

pub(crate) fn setup_mic_stream(
    sample_rate: u32,
    chunk_size: usize,
    mic_device: Option<String>,
) -> Result<ChunkStream, Error> {
    let mic = MicInput::new(mic_device).map_err(|_| Error::MicOpenFailed)?;
    mic.stream()
        .map_err(|_| Error::MicStreamSetupFailed)?
        .resampled_chunks(sample_rate, chunk_size)
        .map(|stream| Box::pin(stream) as ChunkStream)
        .map_err(|_| Error::MicStreamSetupFailed)
}

pub(crate) fn setup_speaker_stream(
    sample_rate: u32,
    chunk_size: usize,
) -> Result<ChunkStream, Error> {
    let speaker = SpeakerInput::new().map_err(|_| Error::SpeakerStreamSetupFailed)?;
    speaker
        .stream()
        .map_err(|_| Error::SpeakerStreamSetupFailed)?
        .resampled_chunks(sample_rate, chunk_size)
        .map(|stream| Box::pin(stream) as ChunkStream)
        .map_err(|_| Error::SpeakerStreamSetupFailed)
}

pub(crate) fn open_dual(
    sample_rate: u32,
    mic_stream: ChunkStream,
    speaker_stream: ChunkStream,
    enable_aec: bool,
) -> CaptureStream {
    let cancel_token = CancellationToken::new();
    let (tx, rx) = tokio::sync::mpsc::channel(32);
    let task = tokio::spawn(run_dual_loop(
        tx,
        cancel_token.clone(),
        sample_rate,
        enable_aec,
        mic_stream,
        speaker_stream,
    ));

    CaptureStream::new(CaptureStreamInner {
        inner: ReceiverStream::new(rx),
        cancel_token,
        task,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CaptureSide {
    Mic,
    Speaker,
}

pub(crate) fn open_single(chunk_stream: ChunkStream, side: CaptureSide) -> CaptureStream {
    let cancel_token = CancellationToken::new();
    let (tx, rx) = tokio::sync::mpsc::channel(32);
    let task = tokio::spawn(run_single_loop(
        tx,
        cancel_token.clone(),
        chunk_stream,
        side,
    ));

    CaptureStream::new(CaptureStreamInner {
        inner: ReceiverStream::new(rx),
        cancel_token,
        task,
    })
}

enum StreamResult {
    Continue,
    Stop,
    Failed(Error),
}

async fn run_dual_loop(
    tx: tokio::sync::mpsc::Sender<Result<CaptureFrame, Error>>,
    cancel_token: CancellationToken,
    sample_rate: u32,
    enable_aec: bool,
    mut mic_stream: ChunkStream,
    mut speaker_stream: ChunkStream,
) {
    let mut joiner = Joiner::new();
    let mut aec = if enable_aec { build_aec() } else { None };
    let mut residual = ResidualSuppressor::new(ResidualConfig::default());
    let mut aec_reference = if aec.is_some() {
        Some(AecReferenceAligner::new(sample_rate))
    } else {
        None
    };

    loop {
        let result = tokio::select! {
            _ = cancel_token.cancelled() => StreamResult::Stop,
            item = mic_stream.next() => {
                handle_stream_item(item, CaptureSide::Mic, &mut joiner)
            }
            item = speaker_stream.next() => {
                handle_stream_item(item, CaptureSide::Speaker, &mut joiner)
            }
        };

        match result {
            StreamResult::Continue => {
                while let Some((raw_mic, raw_speaker)) = joiner.pop_pair() {
                    let raw_mic = Arc::<[f32]>::from(raw_mic);
                    let raw_speaker = Arc::<[f32]>::from(raw_speaker);
                    let aligned = aec_reference
                        .as_mut()
                        .map(|aligner| aligner.align(&raw_speaker, &raw_mic))
                        .unwrap_or_else(|| AecAlignedPair {
                            mic: Arc::clone(&raw_mic),
                            speaker: Arc::clone(&raw_speaker),
                            alignment_changed: false,
                        });
                    if aligned.alignment_changed {
                        if let Some(processor) = aec.as_mut() {
                            processor.reset();
                        }
                        residual.reset();
                    }
                    // The cancelled mic and the speaker it was cancelled
                    // against share the aligned timeline, so they leave here as
                    // one value.
                    let echo_cancelled = process_aec(
                        &mut aec,
                        &mut residual,
                        &aligned.mic,
                        &aligned.speaker,
                    )
                    .map(|mic| EchoCancelled {
                        mic,
                        speaker: Arc::clone(&aligned.speaker),
                    });
                    if tx
                        .send(Ok(CaptureFrame {
                            raw_mic,
                            raw_speaker,
                            echo_cancelled,
                        }))
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
            }
            StreamResult::Stop => return,
            StreamResult::Failed(err) => {
                let _ = tx.send(Err(err)).await;
                return;
            }
        }
    }
}

struct AecReferenceAligner {
    probe: SyncProbe,
    mic_delay_line: SampleDelayLine,
    speaker_delay_line: SampleDelayLine,
    last_alignment: AecAlignment,
    last_logged_state: Option<SyncProbeState>,
    last_logged_stable_lag_samples: Option<isize>,
    log_probe_events: bool,
    probe_failed: bool,
}

struct AecAlignedPair {
    mic: Arc<[f32]>,
    speaker: Arc<[f32]>,
    alignment_changed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AecAlignment {
    None,
    DelayMic(usize),
    DelaySpeaker(usize),
}

impl AecAlignment {
    fn from_lag_samples(lag_samples: Option<isize>) -> Self {
        match lag_samples {
            Some(lag) if lag > 0 => Self::DelaySpeaker(lag as usize),
            Some(lag) if lag < 0 => Self::DelayMic(lag.unsigned_abs()),
            _ => Self::None,
        }
    }

    fn mic_delay_samples(self) -> usize {
        match self {
            Self::DelayMic(samples) => samples,
            Self::None | Self::DelaySpeaker(_) => 0,
        }
    }

    fn speaker_delay_samples(self) -> usize {
        match self {
            Self::DelaySpeaker(samples) => samples,
            Self::None | Self::DelayMic(_) => 0,
        }
    }
}

impl AecReferenceAligner {
    fn new(sample_rate: u32) -> Self {
        let max_lag_samples = ((sample_rate as usize) * (AEC_MAX_REFERENCE_LAG_MS as usize)) / 1000;
        let mut config = SyncProbeConfig::new(sample_rate);
        config.max_lag_samples = max_lag_samples.max(config.max_lag_samples);
        let max_delay_samples = config.max_lag_samples;

        Self {
            probe: SyncProbe::new(config),
            mic_delay_line: SampleDelayLine::new(max_delay_samples),
            speaker_delay_line: SampleDelayLine::new(max_delay_samples),
            last_alignment: AecAlignment::None,
            last_logged_state: None,
            last_logged_stable_lag_samples: None,
            log_probe_events: std::env::var(AUDIO_SYNC_PROBE_ENV).ok().as_deref() == Some("1"),
            probe_failed: false,
        }
    }

    fn align(&mut self, raw_speaker: &[f32], raw_mic: &[f32]) -> AecAlignedPair {
        // A panicked probe holds indeterminate state, so it is retired rather
        // than consulted again: the recording continues unaligned instead of
        // being realigned on a number nobody can vouch for.
        let event = if self.probe_failed {
            None
        } else {
            match catch_unwind(AssertUnwindSafe(|| self.probe.observe(raw_speaker, raw_mic))) {
                Ok(event) => event,
                Err(_) => {
                    tracing::error!("audio_sync_probe_panicked; alignment disabled for this run");
                    self.probe_failed = true;
                    self.last_alignment = AecAlignment::None;
                    None
                }
            }
        };

        let alignment_changed = if let Some(event) = event {
            let alignment_changed = self.update_alignment(&event);
            if self.log_probe_events {
                self.log_probe_event(event);
            }
            alignment_changed
        } else {
            false
        };

        let aligned_mic = self
            .mic_delay_line
            .process(raw_mic, self.last_alignment.mic_delay_samples());
        let aligned_speaker = self
            .speaker_delay_line
            .process(raw_speaker, self.last_alignment.speaker_delay_samples());

        AecAlignedPair {
            mic: Arc::from(aligned_mic),
            speaker: Arc::from(aligned_speaker),
            alignment_changed,
        }
    }

    fn update_alignment(&mut self, event: &SyncProbeEvent) -> bool {
        let snapshot = event.snapshot();
        // Whether a lag is trustworthy is the probe's judgement, not ours.
        let next_alignment = AecAlignment::from_lag_samples(self.probe.alignment());

        if next_alignment != self.last_alignment {
            tracing::info!(
                previous_alignment = ?self.last_alignment,
                alignment = ?next_alignment,
                mic_delay_samples = next_alignment.mic_delay_samples(),
                speaker_delay_samples = next_alignment.speaker_delay_samples(),
                mic_delay_ms = next_alignment.mic_delay_samples() as f32
                    / self.probe.config().sample_rate as f32
                    * 1000.0,
                speaker_delay_ms = next_alignment.speaker_delay_samples() as f32
                    / self.probe.config().sample_rate as f32
                    * 1000.0,
                stable_lag_samples = snapshot.stable_lag_samples,
                state = ?snapshot.state,
                "aec_reference_alignment_changed"
            );
            self.last_alignment = next_alignment;
            return true;
        }

        false
    }

    fn log_probe_event(&mut self, event: SyncProbeEvent) {
        let snapshot = event.snapshot();
        let should_log = self.last_logged_state != Some(snapshot.state)
            || self.last_logged_stable_lag_samples != snapshot.stable_lag_samples;

        if !should_log {
            return;
        }

        match event {
            SyncProbeEvent::Measured(measurement) => {
                tracing::info!(
                    capture_time_sec = measurement.capture_time_sec,
                    state = ?measurement.snapshot.state,
                    stable_lag_samples = measurement.snapshot.stable_lag_samples,
                    candidate_lag_samples = measurement.snapshot.candidate_lag_samples,
                    accepted_window_count = measurement.snapshot.accepted_window_count,
                    confidence = measurement.snapshot.confidence,
                    peak_ratio = measurement.estimate.peak_ratio,
                    distinctiveness = measurement.estimate.distinctiveness,
                    drift_ppm = measurement.trend.drift_ppm,
                    "audio_sync_probe"
                );
            }
            SyncProbeEvent::SkippedLowConfidence(skip) => {
                tracing::info!(
                    capture_time_sec = skip.capture_time_sec,
                    state = ?skip.snapshot.state,
                    stable_lag_samples = skip.snapshot.stable_lag_samples,
                    candidate_lag_samples = skip.snapshot.candidate_lag_samples,
                    accepted_window_count = skip.snapshot.accepted_window_count,
                    confidence = skip.snapshot.confidence,
                    reason = ?skip.reason,
                    peak_ratio = skip.estimate.peak_ratio,
                    distinctiveness = skip.estimate.distinctiveness,
                    "audio_sync_probe"
                );
            }
            SyncProbeEvent::SkippedLowEnergy(skip) => {
                tracing::info!(
                    capture_time_sec = skip.capture_time_sec,
                    state = ?skip.snapshot.state,
                    stable_lag_samples = skip.snapshot.stable_lag_samples,
                    accepted_window_count = skip.snapshot.accepted_window_count,
                    reference_rms = skip.reference_rms,
                    observed_rms = skip.observed_rms,
                    "audio_sync_probe"
                );
            }
        }

        self.last_logged_state = Some(snapshot.state);
        self.last_logged_stable_lag_samples = snapshot.stable_lag_samples;
    }
}

struct SampleDelayLine {
    history: VecDeque<f32>,
    max_delay_samples: usize,
}

impl SampleDelayLine {
    fn new(max_delay_samples: usize) -> Self {
        Self {
            history: VecDeque::with_capacity(max_delay_samples + 1),
            max_delay_samples,
        }
    }

    fn process(&mut self, input: &[f32], delay_samples: usize) -> Vec<f32> {
        let delay_samples = delay_samples.min(self.max_delay_samples);
        let mut output = Vec::with_capacity(input.len());

        for &sample in input {
            self.history.push_back(sample);
            let delayed = self
                .history
                .len()
                .checked_sub(delay_samples + 1)
                .and_then(|idx| self.history.get(idx))
                .copied()
                .unwrap_or(0.0);
            output.push(delayed);

            while self.history.len() > self.max_delay_samples + 1 {
                self.history.pop_front();
            }
        }

        output
    }
}

async fn run_single_loop(
    tx: tokio::sync::mpsc::Sender<Result<CaptureFrame, Error>>,
    cancel_token: CancellationToken,
    mut chunk_stream: ChunkStream,
    side: CaptureSide,
) {
    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => return,
            item = chunk_stream.next() => {
                match item {
                    Some(Ok(data)) => {
                        let data = Arc::<[f32]>::from(data);
                        let silence = Arc::<[f32]>::from(vec![0.0f32; data.len()]);
                        let frame = match side {
                            CaptureSide::Mic => CaptureFrame {
                                raw_mic: data,
                                raw_speaker: silence,
                                echo_cancelled: None,
                            },
                            CaptureSide::Speaker => CaptureFrame {
                                raw_mic: silence,
                                raw_speaker: data,
                                echo_cancelled: None,
                            },
                        };
                        if tx.send(Ok(frame)).await.is_err() {
                            return;
                        }
                    }
                    Some(Err(_)) => {
                        let err = match side {
                            CaptureSide::Mic => Error::MicResampleFailed,
                            CaptureSide::Speaker => Error::SpeakerResampleFailed,
                        };
                        let _ = tx.send(Err(err)).await;
                        return;
                    }
                    None => {
                        let err = match side {
                            CaptureSide::Mic => Error::MicStreamEnded,
                            CaptureSide::Speaker => Error::SpeakerStreamEnded,
                        };
                        let _ = tx.send(Err(err)).await;
                        return;
                    }
                }
            }
        }
    }
}

fn handle_stream_item(
    item: Option<Result<Vec<f32>, looper_resampler::Error>>,
    side: CaptureSide,
    joiner: &mut Joiner,
) -> StreamResult {
    match item {
        Some(Ok(data)) => {
            match side {
                CaptureSide::Mic => joiner.push_mic(data),
                CaptureSide::Speaker => joiner.push_speaker(data),
            }
            StreamResult::Continue
        }
        Some(Err(_)) => StreamResult::Failed(match side {
            CaptureSide::Mic => Error::MicResampleFailed,
            CaptureSide::Speaker => Error::SpeakerResampleFailed,
        }),
        None => StreamResult::Failed(match side {
            CaptureSide::Mic => Error::MicStreamEnded,
            CaptureSide::Speaker => Error::SpeakerStreamEnded,
        }),
    }
}

fn build_aec() -> Option<AEC> {
    AEC::new()
        .map_err(|error| tracing::warn!(error.message = ?error, "aec_init_failed"))
        .ok()
}

fn process_aec(
    aec: &mut Option<AEC>,
    residual: &mut ResidualSuppressor,
    mic: &[f32],
    speaker: &[f32],
) -> Option<Arc<[f32]>> {
    let processor = aec.as_mut()?;
    match processor.process_streaming(mic, speaker) {
        Ok(processed) => Some(Arc::<[f32]>::from(residual.suppress(processed, speaker))),
        Err(error) => {
            tracing::warn!(error.message = ?error, "aec_failed");
            None
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_aec_returns_instance() {
        let aec = build_aec();
        assert!(aec.is_some());
    }

    #[test]
    fn process_aec_returns_output_when_enabled() {
        let mut aec = build_aec();
        let mut residual = ResidualSuppressor::new(ResidualConfig::default());
        let mic = Arc::<[f32]>::from(vec![0.1_f32; 160]);
        let speaker = Arc::<[f32]>::from(vec![0.2_f32; 160]);

        let processed = process_aec(&mut aec, &mut residual, &mic, &speaker);
        assert_eq!(processed.as_ref().map(|data| data.len()), Some(160));
    }

    #[test]
    fn sample_delay_line_outputs_current_samples_with_zero_delay() {
        let mut delay = SampleDelayLine::new(4);

        let output = delay.process(&[1.0, 2.0, 3.0], 0);

        assert_eq!(output, vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn sample_delay_line_outputs_delayed_samples() {
        let mut delay = SampleDelayLine::new(4);

        let first = delay.process(&[1.0, 2.0, 3.0], 2);
        let second = delay.process(&[4.0, 5.0], 2);

        assert_eq!(first, vec![0.0, 0.0, 1.0]);
        assert_eq!(second, vec![2.0, 3.0]);
    }

    #[test]
    fn sample_delay_line_clamps_to_max_delay() {
        let mut delay = SampleDelayLine::new(2);

        let first = delay.process(&[1.0, 2.0, 3.0], 10);
        let second = delay.process(&[4.0], 10);

        assert_eq!(first, vec![0.0, 0.0, 1.0]);
        assert_eq!(second, vec![2.0]);
    }

    #[test]
    fn aec_alignment_delays_speaker_for_positive_lag() {
        let alignment = AecAlignment::from_lag_samples(Some(320));

        assert_eq!(alignment, AecAlignment::DelaySpeaker(320));
        assert_eq!(alignment.mic_delay_samples(), 0);
        assert_eq!(alignment.speaker_delay_samples(), 320);
    }

    #[test]
    fn aec_alignment_delays_mic_for_negative_lag() {
        let alignment = AecAlignment::from_lag_samples(Some(-320));

        assert_eq!(alignment, AecAlignment::DelayMic(320));
        assert_eq!(alignment.mic_delay_samples(), 320);
        assert_eq!(alignment.speaker_delay_samples(), 0);
    }
}
