#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelKind {
    ParakeetTdtInt8,
    CohereInt4,
}

/// How a local speech model wants long audio fed to it.
///
/// Chunk length is a property of the model — one that degrades past half a
/// minute cannot be handed three — so it is declared here rather than chosen
/// by each caller.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ChunkPolicy {
    pub chunk_seconds: f32,
    pub overlap_seconds: f32,
    /// How much new audio a chunk must carry before a quiet cut may end it.
    ///
    /// Zero lets the cut land anywhere past the overlap, which on long audio
    /// yields many short chunks — more inference calls and more merge seams.
    pub minimum_new_audio_ratio: f32,
}

/// What a model can actually do.
///
/// Callers ask this instead of matching on which model is loaded, so adding a
/// third one does not mean revisiting every site that special-cases the second.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ModelCapabilities {
    /// Whether the model returns segment and word timings, or text only.
    pub timestamps: bool,
    /// Whether a transcription language must be supplied. Models that detect
    /// the language themselves reject being told one.
    pub requires_language: bool,
    pub chunking: ChunkPolicy,
}

impl ModelKind {
    pub fn capabilities(self) -> ModelCapabilities {
        match self {
            Self::ParakeetTdtInt8 => ModelCapabilities {
                timestamps: true,
                requires_language: false,
                chunking: ChunkPolicy {
                    chunk_seconds: 180.0,
                    overlap_seconds: 3.0,
                    minimum_new_audio_ratio: 0.5,
                },
            },
            Self::CohereInt4 => ModelCapabilities {
                timestamps: false,
                requires_language: true,
                chunking: ChunkPolicy {
                    chunk_seconds: 30.0,
                    overlap_seconds: 3.0,
                    minimum_new_audio_ratio: 0.5,
                },
            },
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ExecutionProvider {
    #[default]
    Cpu,
    DirectMl,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum TimestampMode {
    #[default]
    None,
    Word,
    Segment,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AudioInput {
    PcmI16 { samples: Vec<i16>, sample_rate: u32 },
    PcmF32 { samples: Vec<f32>, sample_rate: u32 },
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TranscribeOptions {
    pub language: Option<String>,
    pub timestamps: TimestampMode,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Transcript {
    pub text: String,
    pub duration_ms: u128,
    pub segments: Option<Vec<TimedSegment>>,
    pub words: Option<Vec<TimedSegment>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TimedSegment {
    pub start: f32,
    pub end: f32,
    pub text: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_options_are_rejected_by_a_model_that_needs_a_language() {
        // `TranscribeOptions::default()` leaves the language unset, which used
        // to compile fine and then fail deep inside Cohere at runtime.
        let options = TranscribeOptions::default();
        assert!(options.language.is_none());
        assert!(ModelKind::CohereInt4.capabilities().requires_language);
    }

    #[test]
    fn each_model_declares_what_it_returns() {
        assert!(ModelKind::ParakeetTdtInt8.capabilities().timestamps);
        assert!(!ModelKind::CohereInt4.capabilities().timestamps);
    }

    #[test]
    fn a_model_that_detects_language_is_not_asked_for_one() {
        assert!(!ModelKind::ParakeetTdtInt8.capabilities().requires_language);
    }

    #[test]
    fn chunking_stays_inside_what_each_model_handles() {
        let parakeet = ModelKind::ParakeetTdtInt8.capabilities().chunking;
        let cohere = ModelKind::CohereInt4.capabilities().chunking;

        assert!(
            cohere.chunk_seconds < parakeet.chunk_seconds,
            "Cohere degrades on long chunks and must ask for shorter ones"
        );
        for policy in [parakeet, cohere] {
            assert!(
                (0.0..=1.0).contains(&policy.minimum_new_audio_ratio),
                "the new-audio floor is a ratio"
            );
            assert!(policy.overlap_seconds > 0.0, "overlap stitches chunks back");
            assert!(
                policy.overlap_seconds < policy.chunk_seconds,
                "overlap cannot swallow the chunk"
            );
        }
    }
}
