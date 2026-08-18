use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use chrono::Utc;
use looper_ts::VadMode;
use parking_lot::RwLock;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::{
    local_transcription::LocalTranscriber, model_manager::ReadyModel, AppRuntime, AppState,
};

use super::types::{
    MeetingCaptureHealthStatus, MeetingCaptureState, MeetingTranscriptSegment,
    MeetingTranscriptSource, MeetingTranscriptUpdate, EVENT_MEETING_CAPTURE_STATE,
    EVENT_MEETING_DETAILS_CHANGED, EVENT_MEETING_TRANSCRIPT_UPDATE, TARGET_SAMPLE_RATE,
};

const AUDIO_QUEUE_CAPACITY: usize = 48;
const UTTERANCE_QUEUE_CAPACITY: usize = 16;
const PRE_ROLL_CHUNKS: usize = 2;
const ENDPOINT_SILENCE_MS: u64 = 700;
const MIN_UTTERANCE_MS: u64 = 300;
const MAX_UTTERANCE_MS: u64 = 15_000;

#[derive(Clone)]
pub(crate) struct MeetingLiveAudioSink {
    sender: SyncSender<AudioMessage>,
    system_audio_enabled: bool,
}

pub(crate) struct MeetingLiveTranscriptionSession {
    sink: Option<MeetingLiveAudioSink>,
    stop_signal: Arc<AtomicBool>,
    handles: Vec<JoinHandle<()>>,
}

#[derive(Clone)]
struct AudioChunk {
    samples: Vec<f32>,
    start_ms: u64,
    end_ms: u64,
}

struct AudioMessage {
    source: MeetingTranscriptSource,
    chunk: AudioChunk,
}

struct Utterance {
    source: MeetingTranscriptSource,
    samples: Vec<f32>,
    start_ms: u64,
    end_ms: u64,
}

struct UtteranceAssembler {
    pre_roll: VecDeque<AudioChunk>,
    pending: Vec<f32>,
    utterance_start_ms: Option<u64>,
    last_end_ms: u64,
    silence_ms: u64,
}

impl UtteranceAssembler {
    fn new() -> Self {
        Self {
            pre_roll: VecDeque::with_capacity(PRE_ROLL_CHUNKS),
            pending: Vec::new(),
            utterance_start_ms: None,
            last_end_ms: 0,
            silence_ms: 0,
        }
    }

    fn push(&mut self, chunk: AudioChunk, has_speech: bool) -> bool {
        self.last_end_ms = chunk.end_ms;
        if self.utterance_start_ms.is_none() {
            if !has_speech {
                self.push_pre_roll(chunk);
                return false;
            }
            let start_ms = self
                .pre_roll
                .front()
                .map(|entry| entry.start_ms)
                .unwrap_or(chunk.start_ms);
            self.utterance_start_ms = Some(start_ms);
            while let Some(pre_roll) = self.pre_roll.pop_front() {
                self.pending.extend_from_slice(&pre_roll.samples);
            }
        }

        self.pending.extend_from_slice(&chunk.samples);
        self.silence_ms = if has_speech {
            0
        } else {
            self.silence_ms
                .saturating_add(chunk.end_ms.saturating_sub(chunk.start_ms))
        };
        let duration_ms = self
            .utterance_start_ms
            .map(|start_ms| self.last_end_ms.saturating_sub(start_ms))
            .unwrap_or(0);
        self.silence_ms >= ENDPOINT_SILENCE_MS || duration_ms >= MAX_UTTERANCE_MS
    }

    fn push_pre_roll(&mut self, chunk: AudioChunk) {
        if self.pre_roll.len() == PRE_ROLL_CHUNKS {
            self.pre_roll.pop_front();
        }
        self.pre_roll.push_back(chunk);
    }

    fn finish(&mut self) -> Option<(u64, u64, Vec<f32>)> {
        let start_ms = self.utterance_start_ms.take()?;
        let end_ms = self.last_end_ms;
        self.silence_ms = 0;
        self.pre_roll.clear();
        let pending = std::mem::take(&mut self.pending);
        (end_ms.saturating_sub(start_ms) >= MIN_UTTERANCE_MS).then_some((start_ms, end_ms, pending))
    }
}

struct SourceAssemblers {
    you: UtteranceAssembler,
    them: UtteranceAssembler,
}

impl SourceAssemblers {
    fn new() -> Self {
        Self {
            you: UtteranceAssembler::new(),
            them: UtteranceAssembler::new(),
        }
    }

    fn push(&mut self, message: AudioMessage, has_speech: bool) -> Option<Utterance> {
        let source = message.source;
        let assembler = self.for_source(source);
        assembler
            .push(message.chunk, has_speech)
            .then(|| Self::finish(source, assembler))
            .flatten()
    }

    fn finish_all(&mut self) -> Vec<Utterance> {
        [MeetingTranscriptSource::You, MeetingTranscriptSource::Them]
            .into_iter()
            .filter_map(|source| {
                let assembler = self.for_source(source);
                Self::finish(source, assembler)
            })
            .collect()
    }

    fn for_source(&mut self, source: MeetingTranscriptSource) -> &mut UtteranceAssembler {
        match source {
            MeetingTranscriptSource::You => &mut self.you,
            MeetingTranscriptSource::Them => &mut self.them,
        }
    }

    fn finish(
        source: MeetingTranscriptSource,
        assembler: &mut UtteranceAssembler,
    ) -> Option<Utterance> {
        assembler
            .finish()
            .map(|(start_ms, end_ms, samples)| Utterance {
                source,
                samples,
                start_ms,
                end_ms,
            })
    }
}

impl MeetingLiveTranscriptionSession {
    pub(crate) fn start(
        app: &AppHandle<AppRuntime>,
        capture_state: Arc<RwLock<MeetingCaptureState>>,
        meeting_id: String,
        model: ReadyModel,
        system_audio_enabled: bool,
    ) -> anyhow::Result<Self> {
        let state = app.state::<AppState>();
        let settings = state.current_settings_unmasked();
        let dictionary = crate::dictionary::dictionary_entries_for_model(&model, &settings);
        let language = settings.language;
        let transcriber = state.local_transcriber();
        let (audio_tx, audio_rx) = mpsc::sync_channel(AUDIO_QUEUE_CAPACITY);
        let (utterance_tx, utterance_rx) = mpsc::sync_channel(UTTERANCE_QUEUE_CAPACITY);
        let stop_signal = Arc::new(AtomicBool::new(false));

        let inference = spawn_inference_worker(
            app.clone(),
            capture_state,
            meeting_id,
            model,
            transcriber,
            dictionary,
            language,
            utterance_rx,
        )?;
        let assembler = spawn_assembler_worker(audio_rx, utterance_tx, stop_signal.clone())?;

        Ok(Self {
            sink: Some(MeetingLiveAudioSink {
                sender: audio_tx,
                system_audio_enabled,
            }),
            stop_signal,
            handles: vec![assembler, inference],
        })
    }

    pub(crate) fn sink(&self) -> MeetingLiveAudioSink {
        self.sink.as_ref().expect("live session is active").clone()
    }

    pub(crate) fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        if self.sink.is_none() {
            return;
        }
        self.stop_signal.store(true, Ordering::Release);
        self.sink.take();
        for handle in self.handles.drain(..) {
            let _ = handle.join();
        }
    }
}

impl Drop for MeetingLiveTranscriptionSession {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl MeetingLiveAudioSink {
    pub(crate) fn push(&self, mic: &[f32], speaker: &[f32], start_ms: u64, end_ms: u64) {
        self.send(MeetingTranscriptSource::You, mic, start_ms, end_ms);
        if self.system_audio_enabled {
            self.send(MeetingTranscriptSource::Them, speaker, start_ms, end_ms);
        }
    }

    fn send(&self, source: MeetingTranscriptSource, samples: &[f32], start_ms: u64, end_ms: u64) {
        let message = AudioMessage {
            source,
            chunk: AudioChunk {
                samples: samples.to_vec(),
                start_ms,
                end_ms,
            },
        };
        match self.sender.try_send(message) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => tracing::warn!(
                "Meeting near-live audio queue is full; dropping {} chunk",
                source.as_str()
            ),
            Err(TrySendError::Disconnected(_)) => {
                tracing::debug!("Meeting near-live audio worker disconnected")
            }
        }
    }
}

fn spawn_assembler_worker(
    receiver: Receiver<AudioMessage>,
    utterance_sender: SyncSender<Utterance>,
    stop_signal: Arc<AtomicBool>,
) -> anyhow::Result<JoinHandle<()>> {
    std::thread::Builder::new()
        .name("meeting-live-vad".to_string())
        .spawn(move || run_assembler_worker(receiver, utterance_sender, stop_signal))
        .map_err(Into::into)
}

fn run_assembler_worker(
    receiver: Receiver<AudioMessage>,
    utterance_sender: SyncSender<Utterance>,
    stop_signal: Arc<AtomicBool>,
) {
    let mut assemblers = SourceAssemblers::new();
    loop {
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(message) => process_audio_message(&mut assemblers, &utterance_sender, message),
            Err(RecvTimeoutError::Timeout) if stop_signal.load(Ordering::Acquire) => break,
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    while let Ok(message) = receiver.try_recv() {
        process_audio_message(&mut assemblers, &utterance_sender, message);
    }
    for utterance in assemblers.finish_all() {
        if utterance_sender.send(utterance).is_err() {
            break;
        }
    }
}

fn process_audio_message(
    assemblers: &mut SourceAssemblers,
    sender: &SyncSender<Utterance>,
    message: AudioMessage,
) {
    let has_speech = chunk_has_speech(&message.chunk.samples);
    if let Some(utterance) = assemblers.push(message, has_speech) {
        if sender.send(utterance).is_err() {
            tracing::debug!("Meeting near-live inference worker disconnected");
        }
    }
}

fn spawn_inference_worker(
    app: AppHandle<AppRuntime>,
    capture_state: Arc<RwLock<MeetingCaptureState>>,
    meeting_id: String,
    model: ReadyModel,
    transcriber: Arc<LocalTranscriber>,
    dictionary: Vec<String>,
    language: String,
    receiver: Receiver<Utterance>,
) -> anyhow::Result<JoinHandle<()>> {
    std::thread::Builder::new()
        .name("meeting-live-inference".to_string())
        .spawn(move || {
            if let Err(error) = transcriber.preload_and_warm(&model) {
                tracing::error!("Failed to warm meeting near-live model: {error}");
                return;
            }
            while let Ok(utterance) = receiver.recv() {
                transcribe_utterance(
                    &app,
                    &capture_state,
                    &meeting_id,
                    &model,
                    &transcriber,
                    &dictionary,
                    &language,
                    utterance,
                );
            }
        })
        .map_err(Into::into)
}

fn transcribe_utterance(
    app: &AppHandle<AppRuntime>,
    capture_state: &Arc<RwLock<MeetingCaptureState>>,
    meeting_id: &str,
    model: &ReadyModel,
    transcriber: &LocalTranscriber,
    dictionary: &[String],
    language: &str,
    utterance: Utterance,
) {
    let samples = utterance
        .samples
        .iter()
        .map(|sample| super::meeting_capture::float_to_pcm16(*sample))
        .collect::<Vec<_>>();
    let result = transcriber.transcribe(
        model,
        &samples,
        TARGET_SAMPLE_RATE,
        dictionary,
        Some(language),
    );
    let text = match result {
        Ok(result) => result.transcript.trim().to_string(),
        Err(error) => {
            tracing::warn!(
                "Meeting near-live transcription failed for {}: {error}",
                utterance.source.as_str()
            );
            publish_capture_health(app, capture_state, MeetingCaptureHealthStatus::Degraded);
            return;
        }
    };
    if text.is_empty() {
        return;
    }

    let segment = MeetingTranscriptSegment {
        id: Uuid::new_v4().to_string(),
        source: utterance.source,
        text: text.clone(),
        start_ms: utterance.start_ms,
        end_ms: utterance.end_ms,
    };
    let segment_id = segment.id.clone();
    let state = app.state::<AppState>();
    match state
        .storage()
        .append_meeting_transcript_segment(meeting_id, segment)
    {
        Ok(Some(details)) => {
            let _ = app.emit(EVENT_MEETING_DETAILS_CHANGED, details);
        }
        Ok(None) => tracing::warn!("Meeting disappeared before near-live transcript was saved"),
        Err(error) => tracing::warn!("Failed to save meeting near-live transcript: {error}"),
    }
    publish_capture_preview(app, capture_state, utterance.source, &text);
    emit_update(
        app,
        segment_id,
        meeting_id,
        utterance.source,
        text,
        utterance.start_ms,
        utterance.end_ms,
    );
}

fn publish_capture_preview(
    app: &AppHandle<AppRuntime>,
    state: &Arc<RwLock<MeetingCaptureState>>,
    source: MeetingTranscriptSource,
    text: &str,
) {
    let snapshot = {
        let mut next = state.write();
        next.live_transcript = format!("{}: {text}", source.as_str());
        next.capture_health.last_transcript_at = Some(Utc::now().to_rfc3339());
        if next.capture_health.status == MeetingCaptureHealthStatus::Degraded {
            next.capture_health.status = MeetingCaptureHealthStatus::Healthy;
        }
        next.clone()
    };
    let _ = app.emit(EVENT_MEETING_CAPTURE_STATE, snapshot);
}

fn publish_capture_health(
    app: &AppHandle<AppRuntime>,
    state: &Arc<RwLock<MeetingCaptureState>>,
    status: MeetingCaptureHealthStatus,
) {
    let snapshot = {
        let mut next = state.write();
        next.capture_health.status = status;
        next.clone()
    };
    let _ = app.emit(EVENT_MEETING_CAPTURE_STATE, snapshot);
}

fn emit_update(
    app: &AppHandle<AppRuntime>,
    id: String,
    meeting_id: &str,
    source: MeetingTranscriptSource,
    text: String,
    start_ms: u64,
    end_ms: u64,
) {
    let _ = app.emit(
        EVENT_MEETING_TRANSCRIPT_UPDATE,
        MeetingTranscriptUpdate {
            id,
            meeting_id: meeting_id.to_string(),
            source,
            text,
            start_ms,
            end_ms,
            is_final: true,
        },
    );
}

fn chunk_has_speech(samples: &[f32]) -> bool {
    let samples = samples
        .iter()
        .map(|sample| super::meeting_capture::float_to_pcm16(*sample))
        .collect::<Vec<_>>();
    looper_ts::speech_ratio(&samples, TARGET_SAMPLE_RATE, VadMode::VeryAggressive).unwrap_or(1.0)
        >= 0.2
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn chunk(start_ms: u64, value: f32) -> AudioChunk {
        AudioChunk {
            samples: vec![value; 1_600],
            start_ms,
            end_ms: start_ms + 100,
        }
    }

    fn message(source: MeetingTranscriptSource, start_ms: u64, value: f32) -> AudioMessage {
        AudioMessage {
            source,
            chunk: chunk(start_ms, value),
        }
    }

    #[test]
    fn assembler_keeps_preroll_and_finalizes_after_silence() {
        let mut assembler = UtteranceAssembler::new();
        assert!(!assembler.push(chunk(0, 0.0), false));
        assert!(!assembler.push(chunk(100, 0.0), false));
        assert!(!assembler.push(chunk(200, 0.5), true));
        for start in (300..900).step_by(100) {
            assert!(!assembler.push(chunk(start, 0.0), false));
        }
        assert!(assembler.push(chunk(900, 0.0), false));

        let (start_ms, end_ms, samples) = assembler.finish().unwrap();
        assert_eq!(start_ms, 0);
        assert_eq!(end_ms, 1_000);
        assert_eq!(samples.len(), 16_000);
    }

    #[test]
    fn assembler_ignores_short_noise_bursts() {
        let mut assembler = UtteranceAssembler::new();
        assert!(!assembler.push(chunk(0, 0.5), true));
        assert!(assembler.finish().is_none());
    }

    #[test]
    fn source_assemblers_keep_you_and_them_independent() {
        let mut assemblers = SourceAssemblers::new();
        assert!(assemblers
            .push(message(MeetingTranscriptSource::You, 0, 0.5), true)
            .is_none());
        assert!(assemblers
            .push(message(MeetingTranscriptSource::Them, 0, 0.5), true)
            .is_none());

        let mut finalized = Vec::new();
        for start in (100..800).step_by(100) {
            if let Some(utterance) =
                assemblers.push(message(MeetingTranscriptSource::You, start, 0.0), false)
            {
                finalized.push(utterance);
            }
        }
        for start in (100..800).step_by(100) {
            if let Some(utterance) =
                assemblers.push(message(MeetingTranscriptSource::Them, start, 0.0), false)
            {
                finalized.push(utterance);
            }
        }

        assert_eq!(finalized.len(), 2);
        assert_eq!(finalized[0].source, MeetingTranscriptSource::You);
        assert_eq!(finalized[1].source, MeetingTranscriptSource::Them);
        assert_eq!(finalized[0].start_ms, 0);
        assert_eq!(finalized[1].start_ms, 0);
    }

    #[test]
    fn assembler_bounds_continuous_speech_utterances() {
        let mut assembler = UtteranceAssembler::new();
        let mut finalized_at = None;
        for start in (0..=MAX_UTTERANCE_MS).step_by(100) {
            if assembler.push(chunk(start, 0.5), true) {
                finalized_at = Some(start + 100);
                break;
            }
        }

        assert_eq!(finalized_at, Some(MAX_UTTERANCE_MS));
        let (_, end_ms, samples) = assembler.finish().unwrap();
        assert_eq!(end_ms, MAX_UTTERANCE_MS);
        assert_eq!(samples.len(), TARGET_SAMPLE_RATE as usize * 15);
    }

    #[test]
    #[ignore = "requires a downloaded Parakeet model"]
    fn parakeet_transcribes_a_real_near_live_utterance() {
        let cache_dir = PathBuf::from(
            std::env::var("LOOPER_MODEL_CACHE_DIR")
                .expect("set LOOPER_MODEL_CACHE_DIR to the models directory"),
        );
        assert!(crate::model_manager::check_model_installed_at(
            &cache_dir,
            "parakeet_tdt_int8"
        ));
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../test-support/fixtures/audio/harvard.wav");
        let (samples, sample_rate) = crate::transcribe::load_audio_for_transcription(&fixture)
            .expect("load Harvard fixture");
        let utterance_samples = &samples[..samples.len().min(sample_rate as usize * 15)];
        let model = ReadyModel {
            key: "parakeet_tdt_int8".to_string(),
            path: cache_dir.join("parakeet_tdt_int8"),
            engine: crate::model_manager::LocalModelEngine::Parakeet,
        };
        let transcriber = LocalTranscriber::new(cache_dir);

        let result = transcriber
            .transcribe(&model, utterance_samples, sample_rate, &[], Some("en"))
            .expect("Parakeet near-live transcription");
        let normalized = result.transcript.to_ascii_lowercase();

        assert!(
            ["stale", "smell", "beer", "heat", "odor", "pickle", "ham"]
                .iter()
                .any(|word| normalized.contains(word)),
            "unexpected transcript: {}",
            result.transcript
        );
        println!("{}", result.transcript);
    }
}
