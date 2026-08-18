mod audio;
mod cohere;
mod error;
mod parakeet;
mod runtime;
mod types;

pub mod long_form;
pub mod model_store;
pub mod vad;

use std::path::Path;

pub use error::{Error, ErrorKind, Result};
pub use long_form::{
    dedupe_overlap_text, estimated_chunk_count, filter_spoken_segments, AudioChunk,
    ChunkTranscriber, LongFormChunker, LongFormConfig, LongFormOptions, LongFormProgress,
    LongFormSession, MergeOptions, MergeUpdate, TranscriptMerger,
};
pub use model_store::{
    InstallEvent, InstallOptions, ModelSpec, ModelStatus, ModelStore, RemoteFile, ResolvedModel,
};
pub use types::{
    AudioInput, ChunkPolicy, ExecutionProvider, ModelCapabilities, ModelKind, TimedSegment,
    TimestampMode, TranscribeOptions, Transcript,
};
pub use vad::{quiet_cut_index, speech_ratio, speech_regions, VadMode, VoiceActivityDetector};

enum Backend {
    Parakeet(parakeet::ParakeetTdt),
    Cohere(cohere::Cohere),
}

pub struct Engine {
    kind: ModelKind,
    provider: ExecutionProvider,
    backend: Backend,
    warmed: bool,
}

impl Engine {
    pub fn load(
        kind: ModelKind,
        model_dir: impl AsRef<Path>,
        provider: ExecutionProvider,
    ) -> Result<Self> {
        let model_dir = model_dir.as_ref();
        let (backend, provider) = match kind {
            ModelKind::ParakeetTdtInt8 => (
                Backend::Parakeet(
                    parakeet::ParakeetTdt::load(model_dir).map_err(Error::during_load)?,
                ),
                ExecutionProvider::Cpu,
            ),
            ModelKind::CohereInt4 => {
                let (model, actual_provider) =
                    cohere::Cohere::load(model_dir, provider).map_err(Error::during_load)?;
                (Backend::Cohere(model), actual_provider)
            }
        };

        Ok(Self {
            kind,
            provider,
            backend,
            warmed: false,
        })
    }

    /// Initializes Parakeet's inference kernels with two seconds of silence.
    ///
    /// Cohere session creation is already its complete warm path. Repeated
    /// calls are idempotent for both models.
    pub fn warm(&mut self) -> Result<()> {
        if self.warmed {
            return Ok(());
        }
        if let Backend::Parakeet(model) = &mut self.backend {
            let silence = vec![0.0; audio::MODEL_SAMPLE_RATE as usize * 2];
            model
                .transcribe(&silence, 2_000, TimestampMode::None)
                .map_err(Error::during_inference)?;
        }
        self.warmed = true;
        Ok(())
    }

    /// Reject options this model cannot honour, before any audio is decoded.
    ///
    /// Without this the mismatch surfaces deep inside inference — or worse,
    /// not at all: a model that ignores `timestamps` would return text and
    /// leave the caller wondering where the timings went.
    fn check_options(&self, options: &TranscribeOptions) -> Result<()> {
        let capabilities = self.capabilities();

        if capabilities.requires_language
            && options
                .language
                .as_deref()
                .map(|language| language.trim().is_empty() || language.eq_ignore_ascii_case("auto"))
                .unwrap_or(true)
        {
            return Err(Error::Validation(format!(
                "{:?} needs an explicit transcription language",
                self.kind
            )));
        }

        if !capabilities.timestamps && options.timestamps != TimestampMode::None {
            return Err(Error::Validation(format!(
                "{:?} does not produce timestamps",
                self.kind
            )));
        }

        Ok(())
    }

    pub fn kind(&self) -> ModelKind {
        self.kind
    }

    /// Returns the provider actually in use after any DirectML-to-CPU fallback.
    pub fn provider(&self) -> ExecutionProvider {
        self.provider
    }

    /// What this model supports. Ask before setting options it will ignore.
    pub fn capabilities(&self) -> ModelCapabilities {
        self.kind.capabilities()
    }

    pub fn transcribe(
        &mut self,
        input: AudioInput,
        options: &TranscribeOptions,
    ) -> Result<Transcript> {
        self.check_options(options)?;
        let prepared = audio::prepare(input)?;
        if prepared.samples.is_empty() {
            return Ok(Transcript {
                duration_ms: prepared.duration_ms,
                ..Transcript::default()
            });
        }

        let transcript = match &mut self.backend {
            Backend::Parakeet(model) => {
                model.transcribe(&prepared.samples, prepared.duration_ms, options.timestamps)
            }
            Backend::Cohere(model) => model.transcribe(
                &prepared.samples,
                prepared.duration_ms,
                options.language.as_deref(),
            ),
        }
        .map_err(Error::during_inference)?;
        self.warmed = true;
        Ok(transcript)
    }
}
