use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::Duration,
};

use tauri::{AppHandle, Manager};

#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
use crate::pill;
use crate::{model_manager::ReadyModel, AppRuntime, AppState};

const AUDIO_POLL_PERIOD: Duration = Duration::from_millis(100);
const LOCAL_CHUNK_LENGTH: usize = 8_960;
const STREAM_SAMPLE_RATE: u32 = 16_000;

pub enum StreamingOutcome {
    Transcript(String),
    Fallback(String),
}

pub enum StreamingSession {
    Local(LocalStreamingSession),
    Cloud(crate::cloud_streaming::CloudStreamingSession),
}

pub(crate) struct LocalStreamingSession {
    cancellation: Cancellation,
    worker: Option<JoinHandle<()>>,
    transcript: SharedTranscript,
}

impl StreamingSession {
    pub fn start(app: &AppHandle<AppRuntime>, ready_model: &ReadyModel) -> Self {
        Self::Local(LocalStreamingSession::launch(app, ready_model))
    }

    pub fn start_cloud(app: &AppHandle<AppRuntime>, language: String) -> Self {
        let cloud = crate::cloud_streaming::CloudStreamingSession::start(app, language);
        Self::Cloud(cloud)
    }

    pub fn stop(self, app: &AppHandle<AppRuntime>) -> StreamingOutcome {
        match self {
            Self::Local(local) => StreamingOutcome::Transcript(local.complete(app)),
            Self::Cloud(cloud) => cloud.stop(),
        }
    }
}

#[derive(Clone)]
struct Cancellation(Arc<AtomicBool>);

impl Cancellation {
    fn pending() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }

    fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    fn requested(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

type SharedTranscript = Arc<Mutex<String>>;

impl LocalStreamingSession {
    fn launch(app: &AppHandle<AppRuntime>, ready_model: &ReadyModel) -> Self {
        let cancellation = Cancellation::pending();
        let transcript = Arc::new(Mutex::new(String::new()));
        let job = LocalWorker {
            app: app.clone(),
            model: ready_model.clone(),
            cancellation: cancellation.clone(),
            transcript: Arc::clone(&transcript),
        };
        let worker = std::thread::Builder::new()
            .name("streaming-transcription".to_owned())
            .spawn(move || job.run())
            .expect("failed to spawn streaming transcription thread");

        Self {
            cancellation,
            worker: Some(worker),
            transcript,
        }
    }

    fn complete(mut self, _app: &AppHandle<AppRuntime>) -> String {
        self.finish_worker();
        std::mem::take(&mut *self.transcript.lock().unwrap())
    }

    fn finish_worker(&mut self) {
        self.cancellation.cancel();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for LocalStreamingSession {
    fn drop(&mut self) {
        self.finish_worker();
    }
}

struct LocalWorker {
    app: AppHandle<AppRuntime>,
    model: ReadyModel,
    cancellation: Cancellation,
    transcript: SharedTranscript,
}

impl LocalWorker {
    fn run(self) {
        let state = self.app.state::<AppState>();
        let transcriber = state.local_transcriber();

        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        let _ = (
            &self.model,
            &self.cancellation,
            &self.transcript,
            &transcriber,
        );

        #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
        self.run_supported(state, transcriber);
    }

    #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
    fn run_supported(
        &self,
        state: tauri::State<'_, AppState>,
        transcriber: Arc<crate::local_transcription::LocalTranscriber>,
    ) {
        // The guard serializes the shared runtime for this entire dictation.
        let session = transcriber.begin_streaming_session();
        if let Err(error) = session.warm(&self.model) {
            tracing::error!("[streaming] Failed to preload model: {error}");
            return;
        }
        session.reset();

        let recorder = state.pill().recorder();
        let mut audio = LiveAudio::default();
        let mut preview = PreviewState::default();

        while !self.cancellation.requested() {
            std::thread::sleep(AUDIO_POLL_PERIOD);
            if audio.pull(recorder) {
                transcribe_complete_chunks(
                    &session,
                    &self.model,
                    &mut audio,
                    &mut preview,
                    &self.app,
                );
            }
        }

        if audio.pull(recorder) {
            transcribe_complete_chunks(&session, &self.model, &mut audio, &mut preview, &self.app);
        }

        if let Some(chunk) = audio.take_padded_tail() {
            if let Ok(text) = session.transcribe_chunk(&self.model, &chunk) {
                emit_changed_preview(&self.app, &mut preview, &text);
            }
        }

        *self.transcript.lock().unwrap() = session.finish();
    }
}

#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
fn transcribe_complete_chunks(
    session: &crate::local_transcription::StreamingGuard<'_>,
    model: &ReadyModel,
    audio: &mut LiveAudio,
    preview: &mut PreviewState,
    app: &AppHandle<AppRuntime>,
) {
    audio.drain_complete_chunks(|chunk| match session.transcribe_chunk(model, chunk) {
        Ok(text) => emit_changed_preview(app, preview, &text),
        Err(error) => tracing::error!("[streaming] Chunk transcription failed: {error}"),
    });
}

#[derive(Default)]
struct PreviewState {
    last_emitted: String,
}

impl PreviewState {
    fn accept(&mut self, text: &str) -> bool {
        if self.last_emitted == text {
            return false;
        }
        self.last_emitted.clear();
        self.last_emitted.push_str(text);
        true
    }
}

#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
fn emit_changed_preview(app: &AppHandle<AppRuntime>, preview: &mut PreviewState, text: &str) {
    if preview.accept(text) {
        pill::emit_pill_mode(app, true, text);
    }
}

#[derive(Default)]
struct LiveAudio {
    source_offset: usize,
    pending: Vec<f32>,
    resampler: Option<StreamResampler>,
}

impl LiveAudio {
    fn pull(&mut self, recorder: &crate::recorder::RecorderManager) -> bool {
        let Some((samples, sample_rate, next_offset)) =
            recorder.read_live_samples(self.source_offset)
        else {
            return false;
        };
        if samples.is_empty() {
            return false;
        }

        self.source_offset = next_offset;
        self.append(&samples, sample_rate);
        true
    }

    fn append(&mut self, samples: &[f32], sample_rate: u32) {
        if sample_rate == STREAM_SAMPLE_RATE {
            self.pending.extend_from_slice(samples);
            return;
        }

        let rate_changed = self
            .resampler
            .as_ref()
            .is_none_or(|active| active.in_rate() != sample_rate);
        if rate_changed {
            self.resampler = Some(StreamResampler::new(sample_rate, STREAM_SAMPLE_RATE));
        }
        if let Some(resampler) = &mut self.resampler {
            resampler.process(samples, &mut self.pending);
        }
    }

    fn drain_complete_chunks(&mut self, mut consume: impl FnMut(&[f32])) {
        let complete_length = self.pending.len() / LOCAL_CHUNK_LENGTH * LOCAL_CHUNK_LENGTH;
        for chunk in self.pending[..complete_length].chunks_exact(LOCAL_CHUNK_LENGTH) {
            consume(chunk);
        }
        if complete_length != 0 {
            self.pending.drain(..complete_length);
        }
    }

    fn take_padded_tail(&mut self) -> Option<Vec<f32>> {
        if self.pending.is_empty() {
            return None;
        }
        self.pending.resize(LOCAL_CHUNK_LENGTH, 0.0);
        Some(std::mem::take(&mut self.pending))
    }
}

pub(crate) struct StreamResampler {
    input_rate: u32,
    input_step: f64,
    cursor: f64,
    boundary_sample: Option<f32>,
}

impl StreamResampler {
    pub(crate) fn new(in_rate: u32, out_rate: u32) -> Self {
        Self {
            input_rate: in_rate,
            input_step: f64::from(in_rate) / f64::from(out_rate),
            cursor: 0.0,
            boundary_sample: None,
        }
    }

    pub(crate) fn in_rate(&self) -> u32 {
        self.input_rate
    }

    pub(crate) fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
        if input.is_empty() {
            return;
        }

        let last_index = (input.len() - 1) as f64;
        while self.cursor <= last_index {
            let floor = self.cursor.floor();
            let fraction = (self.cursor - floor) as f32;
            let lower_index = floor as isize;
            let lower = if lower_index < 0 {
                self.boundary_sample.unwrap_or(input[0])
            } else {
                input[lower_index as usize]
            };
            let upper_index = (lower_index + 1).clamp(0, input.len() as isize - 1) as usize;
            let upper = input[upper_index];
            output.push(lower + (upper - lower) * fraction);
            self.cursor += self.input_step;
        }

        self.cursor -= input.len() as f64;
        self.boundary_sample = input.last().copied();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_transitions_once_requested() {
        let cancellation = Cancellation::pending();
        assert!(!cancellation.requested());
        cancellation.cancel();
        assert!(cancellation.requested());
    }

    #[test]
    fn preview_policy_emits_only_changes() {
        let mut preview = PreviewState::default();
        assert!(preview.accept("hello"));
        assert!(!preview.accept("hello"));
        assert!(preview.accept("hello world"));
        assert!(preview.accept(""));
        assert!(!preview.accept(""));
    }

    #[test]
    fn live_audio_drains_whole_chunks_and_pads_only_the_tail() {
        let mut audio = LiveAudio::default();
        let sample_count = LOCAL_CHUNK_LENGTH * 2 + 3;
        let samples = (0..sample_count)
            .map(|index| index as f32)
            .collect::<Vec<_>>();
        audio.append(&samples, STREAM_SAMPLE_RATE);

        let mut boundaries = Vec::new();
        audio.drain_complete_chunks(|chunk| {
            boundaries.push((chunk[0], chunk[LOCAL_CHUNK_LENGTH - 1]));
        });
        assert_eq!(
            boundaries,
            vec![
                (0.0, (LOCAL_CHUNK_LENGTH - 1) as f32),
                (
                    LOCAL_CHUNK_LENGTH as f32,
                    (LOCAL_CHUNK_LENGTH * 2 - 1) as f32
                ),
            ]
        );

        let tail = audio.take_padded_tail().unwrap();
        assert_eq!(&tail[..3], &samples[LOCAL_CHUNK_LENGTH * 2..]);
        assert!(tail[3..].iter().all(|sample| *sample == 0.0));
        assert!(audio.take_padded_tail().is_none());
    }

    #[test]
    fn native_rate_audio_bypasses_resampling() {
        let mut audio = LiveAudio::default();
        audio.append(&[0.25, -0.5, 1.0], STREAM_SAMPLE_RATE);
        assert_eq!(audio.pending, [0.25, -0.5, 1.0]);
        assert!(audio.resampler.is_none());
    }

    #[test]
    fn split_resampling_matches_one_contiguous_input() {
        let mut contiguous = StreamResampler::new(8_000, STREAM_SAMPLE_RATE);
        let mut contiguous_output = Vec::new();
        contiguous.process(&[0.0, 1.0, 2.0, 3.0], &mut contiguous_output);

        let mut split = StreamResampler::new(8_000, STREAM_SAMPLE_RATE);
        let mut split_output = Vec::new();
        split.process(&[0.0, 1.0], &mut split_output);
        split.process(&[2.0, 3.0], &mut split_output);

        assert_eq!(split_output, contiguous_output);
        assert_eq!(split_output, [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]);
    }

    #[test]
    fn input_rate_change_replaces_resampler_state() {
        let mut audio = LiveAudio::default();
        audio.append(&[0.0, 1.0], 8_000);
        assert_eq!(audio.resampler.as_ref().unwrap().in_rate(), 8_000);
        audio.append(&[0.0, 1.0], 48_000);
        assert_eq!(audio.resampler.as_ref().unwrap().in_rate(), 48_000);
    }

    #[test]
    fn empty_resampler_input_is_a_noop() {
        let mut resampler = StreamResampler::new(48_000, STREAM_SAMPLE_RATE);
        let mut output = vec![7.0];
        resampler.process(&[], &mut output);
        assert_eq!(output, [7.0]);
    }
}
