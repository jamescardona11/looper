use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use looper_ts::{
    AudioInput, Engine, ExecutionProvider, LongFormOptions, TimedSegment, TimestampMode,
    TranscribeOptions,
};
use parking_lot::{Condvar, Mutex};

use crate::{
    model_manager::{self, LocalModelEngine, ReadyModel},
    transcription_api::{normalize_transcript, TranscriptionSuccess},
};

const IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const STREAM_SAMPLE_RATE: u32 = 16_000;
const ENGINE_MISSING: &str = "Local speech model was not loaded";

/// Owns the single local inference runtime and the coordination required to
/// keep batch, long-form, and live transcription from interleaving.
pub struct LocalTranscriber {
    models: ModelSlot,
    activity: ActivityClock,
    warming: WarmGate,
    live_text: LiveTranscript,
    execution: Mutex<()>,
}

struct ResidentModel {
    key: String,
    engine: Engine,
}

#[derive(Default)]
struct ModelSlot {
    resident: Mutex<Option<ResidentModel>>,
}

impl ModelSlot {
    fn current_key(&self) -> Option<String> {
        self.resident
            .lock()
            .as_ref()
            .map(|resident| resident.key.clone())
    }

    fn has_model(&self) -> bool {
        self.resident.lock().is_some()
    }

    fn discard(&self) {
        self.resident.lock().take();
    }

    fn warm(&self, model: &ReadyModel) -> Result<()> {
        let mut resident = self.resident.lock();
        if resident
            .as_ref()
            .is_some_and(|loaded| loaded.key == model.key)
        {
            return resident
                .as_mut()
                .expect("resident was checked above")
                .engine
                .warm()
                .with_context(|| warm_error(model));
        }

        let mut engine = Engine::load(model.engine.model_kind(), &model.path, provider(model))
            .with_context(|| load_error(model))?;
        engine.warm().with_context(|| warm_error(model))?;
        *resident = Some(ResidentModel {
            key: model.key.clone(),
            engine,
        });
        Ok(())
    }

    fn run<R>(&self, operation: impl FnOnce(&mut Engine) -> Result<R>) -> Result<R> {
        let mut resident = self.resident.lock();
        let engine = &mut resident
            .as_mut()
            .ok_or_else(|| anyhow!(ENGINE_MISSING))?
            .engine;
        operation(engine)
    }
}

struct ActivityClock {
    last: Mutex<Option<Instant>>,
    changed: Condvar,
}

impl Default for ActivityClock {
    fn default() -> Self {
        Self {
            last: Mutex::new(None),
            changed: Condvar::new(),
        }
    }
}

impl ActivityClock {
    fn mark_now(&self) {
        *self.last.lock() = Some(Instant::now());
        self.changed.notify_one();
    }

    fn clear(&self) {
        *self.last.lock() = None;
        self.changed.notify_one();
    }

    fn has_expired(&self, timeout: Duration) -> bool {
        self.last
            .lock()
            .is_some_and(|seen| seen.elapsed() >= timeout)
    }

    fn wait_until_expired(&self, timeout: Duration) {
        let mut last = self.last.lock();
        loop {
            while last.is_none() {
                self.changed.wait(&mut last);
            }
            let remaining =
                timeout.saturating_sub(last.expect("activity exists after waiting").elapsed());
            if remaining.is_zero() {
                return;
            }
            self.changed.wait_for(&mut last, remaining);
        }
    }
}

#[derive(Default)]
struct WarmGate {
    active_key: Mutex<Option<String>>,
}

impl WarmGate {
    fn claim(&self, requested_key: &str) -> std::result::Result<WarmLease<'_>, String> {
        let mut active = self.active_key.lock();
        if let Some(key) = active.as_ref() {
            return Err(key.clone());
        }
        *active = Some(requested_key.to_owned());
        Ok(WarmLease {
            gate: self,
            key: requested_key.to_owned(),
        })
    }
}

struct WarmLease<'a> {
    gate: &'a WarmGate,
    key: String,
}

impl Drop for WarmLease<'_> {
    fn drop(&mut self) {
        let mut active = self.gate.active_key.lock();
        if active.as_deref() == Some(self.key.as_str()) {
            active.take();
        }
    }
}

#[derive(Default)]
struct LiveTranscript {
    text: Mutex<String>,
}

impl LiveTranscript {
    fn append(&self, chunk: &str) -> String {
        let mut transcript = self.text.lock();
        let trimmed = chunk.trim();
        if !trimmed.is_empty() {
            if !transcript.is_empty() {
                transcript.push(' ');
            }
            transcript.push_str(trimmed);
        }
        transcript.clone()
    }

    fn clear(&self) {
        self.text.lock().clear();
    }

    fn take(&self) -> String {
        std::mem::take(&mut *self.text.lock())
    }
}

struct InferenceOutput {
    text: String,
    segments: Option<Vec<TimedSegment>>,
    words: Option<Vec<TimedSegment>>,
}

impl InferenceOutput {
    fn short_success(self, model: &ReadyModel, include_timing: bool) -> TranscriptionSuccess {
        TranscriptionSuccess {
            transcript: normalize_transcript(&self.text),
            speech_model: Some(model_manager::model_label(&model.key)),
            segments: include_timing.then_some(self.segments).flatten(),
            words: include_timing.then_some(self.words).flatten(),
        }
    }
}

impl LocalTranscriber {
    pub fn new(_model_cache_dir: std::path::PathBuf) -> Self {
        Self {
            models: ModelSlot::default(),
            activity: ActivityClock::default(),
            warming: WarmGate::default(),
            live_text: LiveTranscript::default(),
            execution: Mutex::new(()),
        }
    }

    pub fn start_idle_monitor(self: &Arc<Self>) {
        let transcriber = Arc::clone(self);
        std::thread::spawn(move || loop {
            transcriber.activity.wait_until_expired(IDLE_TIMEOUT);
            transcriber.unload_if_idle();
        });
    }

    fn unload_if_idle(&self) {
        if self.models.has_model() && self.activity.has_expired(IDLE_TIMEOUT) {
            tracing::info!(
                "[LocalTranscriber] Unloading model after {} seconds of inactivity",
                IDLE_TIMEOUT.as_secs()
            );
            self.unload();
        }
    }

    pub fn preload_and_warm(&self, model: &ReadyModel) -> Result<()> {
        let _execution = self.execution.lock();
        self.warm_while_exclusive(model)
    }

    // `execution` is held either directly by a public operation or by a
    // StreamingGuard for the complete live session.
    fn warm_while_exclusive(&self, model: &ReadyModel) -> Result<()> {
        let already_had_model = self.models.has_model();
        let started = Instant::now();
        self.models.warm(model)?;
        tracing::info!(
            "[LocalTranscriber] warm {} took {:.2}s (was_loaded={})",
            model.key,
            started.elapsed().as_secs_f32(),
            already_had_model
        );
        self.activity.mark_now();
        Ok(())
    }

    pub fn preload_and_warm_if_needed(&self, model: &ReadyModel) -> Result<()> {
        if self.loaded_model_id().as_deref() == Some(model.key.as_str()) {
            tracing::debug!(
                "[LocalTranscriber] warm {} skipped (already loaded)",
                model.key
            );
            return Ok(());
        }

        let _lease = match self.warming.claim(&model.key) {
            Ok(lease) => lease,
            Err(active_key) => {
                tracing::debug!(
                    "[LocalTranscriber] warm {} skipped (warm already in flight for {})",
                    model.key,
                    active_key
                );
                return Ok(());
            }
        };
        self.preload_and_warm(model)
    }

    pub fn loaded_model_id(&self) -> Option<String> {
        self.models.current_key()
    }

    pub fn transcribe(
        &self,
        model: &ReadyModel,
        samples: &[i16],
        sample_rate: u32,
        dictionary: &[String],
        language: Option<&str>,
    ) -> Result<TranscriptionSuccess> {
        self.transcribe_pcm(model, samples, sample_rate, dictionary, language, false)
            .map(|output| output.short_success(model, false))
    }

    pub fn transcribe_with_segments(
        &self,
        model: &ReadyModel,
        samples: &[i16],
        sample_rate: u32,
        dictionary: &[String],
        language: Option<&str>,
    ) -> Result<TranscriptionSuccess> {
        self.transcribe_pcm(model, samples, sample_rate, dictionary, language, true)
            .map(|output| output.short_success(model, true))
    }

    pub fn transcribe_long<C>(
        &self,
        model: &ReadyModel,
        samples: &[i16],
        sample_rate: u32,
        options: &LongFormOptions,
        is_cancelled: C,
    ) -> Result<TranscriptionSuccess>
    where
        C: Fn() -> bool,
    {
        let _execution = self.execution.lock();
        let already_had_model = self.models.has_model();
        let started = Instant::now();
        self.ensure_model(model)?;

        let response = self.models.run(|engine| {
            engine
                .transcribe_long(pcm_i16(samples, sample_rate), options, |_| {}, is_cancelled)
                .context("Local long-form transcription failed")
        })?;

        tracing::info!(
            "[LocalTranscriber] long-form transcribe took {:.2}s (audio {:.2}s, was_loaded={})",
            started.elapsed().as_secs_f32(),
            response.duration_ms as f32 / 1000.0,
            already_had_model
        );
        self.activity.mark_now();
        let speech_model =
            (!response.text.trim().is_empty()).then(|| model_manager::model_label(&model.key));
        Ok(TranscriptionSuccess {
            transcript: response.text,
            speech_model,
            segments: response.segments,
            words: response.words,
        })
    }

    pub fn with_long_form_session<R, F>(
        &self,
        model: &ReadyModel,
        sample_rate: u32,
        options: LongFormOptions,
        run: F,
    ) -> Result<R>
    where
        F: FnOnce(&mut looper_ts::LongFormSession<'_>) -> Result<R>,
    {
        let _execution = self.execution.lock();
        self.ensure_model(model)?;
        let result = self.models.run(|engine| {
            let mut session = engine
                .long_form_session(sample_rate, options)
                .context("Failed to start local long-form transcription")?;
            run(&mut session)
        });
        self.activity.mark_now();
        result
    }

    fn transcribe_pcm(
        &self,
        model: &ReadyModel,
        samples: &[i16],
        sample_rate: u32,
        _dictionary: &[String],
        language: Option<&str>,
        include_timing: bool,
    ) -> Result<InferenceOutput> {
        let _execution = self.execution.lock();
        let already_had_model = self.models.has_model();
        let started = Instant::now();
        self.ensure_model(model)?;

        let options = TranscribeOptions {
            language: language.map(str::to_owned),
            timestamps: timestamp_request(model.engine, include_timing),
        };
        let response = self.models.run(|engine| {
            engine
                .transcribe(pcm_i16(samples, sample_rate), &options)
                .context("Local speech transcription failed")
        })?;

        tracing::info!(
            "[LocalTranscriber] transcribe took {:.2}s (audio {:.2}s, was_loaded={})",
            started.elapsed().as_secs_f32(),
            response.duration_ms as f32 / 1000.0,
            already_had_model
        );
        self.activity.mark_now();
        Ok(InferenceOutput {
            text: response.text,
            segments: response.segments,
            words: response.words,
        })
    }

    fn ensure_model(&self, model: &ReadyModel) -> Result<()> {
        if self.loaded_model_id().as_deref() != Some(model.key.as_str()) {
            self.warm_while_exclusive(model)?;
        }
        Ok(())
    }

    #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
    pub fn begin_streaming_session(&self) -> StreamingGuard<'_> {
        StreamingGuard {
            transcriber: self,
            _execution: self.execution.lock(),
        }
    }

    pub fn unload(&self) {
        let _execution = self.execution.lock();
        self.models.discard();
        self.live_text.clear();
        self.activity.clear();
    }
}

/// Returns the model-owned long-audio chunking contract used by every caller.
pub fn chunk_policy(engine: LocalModelEngine) -> looper_ts::ChunkPolicy {
    engine.capabilities().chunking
}

fn timestamp_request(engine: LocalModelEngine, include_timing: bool) -> TimestampMode {
    if include_timing && engine.capabilities().timestamps {
        TimestampMode::Word
    } else {
        TimestampMode::None
    }
}

fn pcm_i16(samples: &[i16], sample_rate: u32) -> AudioInput {
    AudioInput::PcmI16 {
        samples: samples.to_vec(),
        sample_rate,
    }
}

fn model_name(model: &ReadyModel) -> String {
    model_manager::model_label(&model.key)
}

fn load_error(model: &ReadyModel) -> String {
    format!("Failed to load {}", model_name(model))
}

fn warm_error(model: &ReadyModel) -> String {
    format!("Failed to warm {}", model_name(model))
}

fn provider(model: &ReadyModel) -> ExecutionProvider {
    #[cfg(target_os = "windows")]
    if model.engine == LocalModelEngine::Cohere {
        return ExecutionProvider::DirectMl;
    }

    let _ = model;
    ExecutionProvider::Cpu
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{chunk_policy, timestamp_request, LiveTranscript, LocalTranscriber, WarmGate};
    use crate::model_manager::{LocalModelEngine, ReadyModel};
    use looper_ts::TimestampMode;

    #[test]
    fn live_transcript_normalizes_chunk_boundaries() {
        let transcript = LiveTranscript::default();
        assert_eq!(transcript.append(" hello "), "hello");
        assert_eq!(transcript.append(" \n "), "hello");
        assert_eq!(transcript.append("world."), "hello world.");
        assert_eq!(transcript.take(), "hello world.");
        assert_eq!(transcript.take(), "");
    }

    #[test]
    fn warm_gate_allows_only_one_claim_and_reopens_on_drop() {
        let gate = WarmGate::default();
        let lease = gate.claim("first").expect("first claim");
        let active_key = match gate.claim("second") {
            Ok(_) => panic!("second claim must be rejected"),
            Err(active_key) => active_key,
        };
        assert_eq!(active_key, "first");
        drop(lease);
        assert!(gate.claim("second").is_ok());
    }

    #[test]
    fn timestamp_request_respects_both_caller_and_model_capability() {
        for engine in [LocalModelEngine::Parakeet, LocalModelEngine::Cohere] {
            assert!(matches!(
                timestamp_request(engine, false),
                TimestampMode::None
            ));
            let requested = timestamp_request(engine, true);
            if engine.capabilities().timestamps {
                assert!(matches!(requested, TimestampMode::Word));
            } else {
                assert!(matches!(requested, TimestampMode::None));
            }
        }
    }

    #[test]
    fn chunk_policy_is_the_engine_capability_contract() {
        for engine in [LocalModelEngine::Parakeet, LocalModelEngine::Cohere] {
            let policy = chunk_policy(engine);
            let capability = engine.capabilities().chunking;
            assert_eq!(policy.chunk_seconds, capability.chunk_seconds);
            assert_eq!(policy.overlap_seconds, capability.overlap_seconds);
            assert_eq!(
                policy.minimum_new_audio_ratio,
                capability.minimum_new_audio_ratio
            );
        }
    }

    #[test]
    #[ignore = "requires LOOPER_COHERE_MODEL_DIR and the real Cohere INT4 weights"]
    fn cohere_transcribes_english_spanish_and_portuguese() {
        let model_dir = PathBuf::from(
            std::env::var("LOOPER_COHERE_MODEL_DIR").expect("set LOOPER_COHERE_MODEL_DIR"),
        );
        let ready = ReadyModel {
            key: "cohere_transcribe_int4".to_string(),
            path: model_dir.clone(),
            engine: LocalModelEngine::Cohere,
        };
        let transcriber = LocalTranscriber::new(
            model_dir
                .parent()
                .expect("model directory has a parent")
                .to_path_buf(),
        );
        transcriber.preload_and_warm(&ready).expect("warm Cohere");

        let fixture_dir =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../test-support/fixtures/audio");
        for (language, fixture, expected) in [
            (
                "en",
                "harvard.wav",
                "The stale smell of old beer lingers. It takes heat to bring out the odor. A cold dip restores health and zest. A salt pickle tastes fine with ham. Tacos al pastor are my favorite. A zestful food is the hot cross bun.",
            ),
            (
                "es",
                "es-voxforge.wav",
                "de unas parras artificiales cuyas hojas parecían retazos de terciopelo.",
            ),
            (
                "pt",
                "pt-voxforge.wav",
                "Na festa, todo mundo estava muito contente.",
            ),
        ] {
            let audio_path = fixture_dir.join(fixture);
            let (samples, sample_rate) = load_fixture(&audio_path);
            let result = transcriber
                .transcribe(&ready, &samples, sample_rate, &[], Some(language))
                .unwrap_or_else(|error| panic!("transcribe {language}: {error:#}"));
            println!("{language}: {}", result.transcript);
            assert_eq!(result.transcript, expected, "{language} transcript diverged");
        }
    }

    fn load_fixture(path: &Path) -> (Vec<i16>, u32) {
        crate::transcribe::load_audio_for_transcription(path)
            .unwrap_or_else(|error| panic!("load {}: {error:#}", path.display()))
    }
}

/// Keeps the inference lock for the lifetime of one live dictation session.
#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
pub struct StreamingGuard<'a> {
    transcriber: &'a LocalTranscriber,
    _execution: parking_lot::MutexGuard<'a, ()>,
}

#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
impl StreamingGuard<'_> {
    pub fn warm(&self, model: &ReadyModel) -> Result<()> {
        self.transcriber.warm_while_exclusive(model)
    }

    pub fn reset(&self) {
        self.transcriber.live_text.clear();
    }

    pub fn transcribe_chunk(&self, model: &ReadyModel, chunk: &[f32]) -> Result<String> {
        self.transcriber.ensure_model(model)?;
        let response = self.transcriber.models.run(|engine| {
            Ok(engine.transcribe(
                AudioInput::PcmF32 {
                    samples: chunk.to_vec(),
                    sample_rate: STREAM_SAMPLE_RATE,
                },
                &TranscribeOptions::default(),
            )?)
        })?;
        let transcript = self.transcriber.live_text.append(&response.text);
        self.transcriber.activity.mark_now();
        Ok(transcript)
    }

    pub fn finish(&self) -> String {
        self.transcriber.live_text.take()
    }
}
