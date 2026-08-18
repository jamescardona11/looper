use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Instant,
};

use looper_ts::{
    AudioInput, Engine, ExecutionProvider, ModelKind, TimedSegment, TimestampMode,
    TranscribeOptions,
};
use serde::Deserialize;

const REAL_SPEECH_FIXTURES: [&str; 3] = ["harvard.wav", "es-voxforge.wav", "pt-voxforge.wav"];
const TIMESTAMP_EPSILON_SECONDS: f32 = 0.001;

static REAL_MODEL_GATE: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
struct GoldenDocument {
    fixtures: BTreeMap<String, GoldenFixture>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoldenFixture {
    language: String,
    normalized_text: String,
}

#[test]
#[ignore = "requires LOOPER_PARAKEET_MODEL_DIR and the real Parakeet INT8 weights"]
fn parakeet_real_speech_matches_captured_goldens_and_timestamps() {
    let _model_guard = REAL_MODEL_GATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let goldens = load_goldens();
    let mut engine = load_parakeet_engine();
    let mut results = Vec::new();

    for fixture_name in REAL_SPEECH_FIXTURES {
        let golden = goldens
            .fixtures
            .get(fixture_name)
            .unwrap_or_else(|| panic!("missing captured golden for {fixture_name}"));
        let (samples, sample_rate) = read_pcm16_fixture(fixture_name);
        let started = Instant::now();
        let transcript = engine
            .transcribe(
                AudioInput::PcmI16 {
                    samples,
                    sample_rate,
                },
                &TranscribeOptions {
                    language: Some(golden.language.clone()),
                    timestamps: TimestampMode::Word,
                },
            )
            .unwrap_or_else(|error| panic!("failed to transcribe {fixture_name}: {error}"));
        let elapsed = started.elapsed();

        eprintln!(
            "fixture={fixture_name} elapsed_seconds={:.3} audio_duration_ms={} transcript={:?}",
            elapsed.as_secs_f64(),
            transcript.duration_ms,
            transcript.text,
        );

        results.push((fixture_name, golden.normalized_text.clone(), transcript));
    }

    for (fixture_name, golden_text, transcript) in results {
        assert_eq!(
            normalize_text(&transcript.text),
            normalize_text(&golden_text),
            "{fixture_name} diverged from the captured Parakeet golden"
        );

        let words = transcript
            .words
            .as_deref()
            .unwrap_or_else(|| panic!("{fixture_name} did not return word timestamps"));
        let segments = transcript
            .segments
            .as_deref()
            .unwrap_or_else(|| panic!("{fixture_name} did not return segment timestamps"));
        assert_monotonic_timestamps(fixture_name, "word", words, transcript.duration_ms);
        assert_monotonic_timestamps(fixture_name, "segment", segments, transcript.duration_ms);
    }
}

#[test]
#[ignore = "requires LOOPER_PARAKEET_MODEL_DIR and the real Parakeet INT8 weights"]
fn parakeet_silence_matches_captured_golden() {
    let _model_guard = REAL_MODEL_GATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let goldens = load_goldens();
    let golden = goldens
        .fixtures
        .get("silence")
        .expect("missing captured golden for silence");
    let mut engine = load_parakeet_engine();
    let started = Instant::now();
    let transcript = engine
        .transcribe(
            AudioInput::PcmI16 {
                samples: vec![0; 32_000],
                sample_rate: 16_000,
            },
            &TranscribeOptions {
                language: Some(golden.language.clone()),
                timestamps: TimestampMode::Word,
            },
        )
        .expect("failed to transcribe silence");
    let elapsed = started.elapsed();

    eprintln!(
        "fixture=silence elapsed_seconds={:.3} audio_duration_ms={} transcript={:?}",
        elapsed.as_secs_f64(),
        transcript.duration_ms,
        transcript.text,
    );

    assert_eq!(
        normalize_text(&transcript.text),
        normalize_text(&golden.normalized_text),
        "silence diverged from the captured Parakeet golden"
    );
    assert_eq!(transcript.duration_ms, 2_000);
    assert!(
        transcript.words.as_ref().is_none_or(Vec::is_empty),
        "silence unexpectedly returned word timestamps"
    );
    assert!(
        transcript.segments.as_ref().is_none_or(Vec::is_empty),
        "silence unexpectedly returned segment timestamps"
    );
}

#[test]
#[ignore = "requires LOOPER_COHERE_MODEL_DIR and the real Cohere INT4 weights"]
fn cohere_real_speech_uses_explicit_languages_without_timestamps() {
    let _model_guard = REAL_MODEL_GATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let goldens = load_goldens();
    let mut engine = load_cohere_engine();

    let missing_language = engine
        .transcribe(
            AudioInput::PcmI16 {
                samples: vec![0],
                sample_rate: 16_000,
            },
            &TranscribeOptions {
                language: None,
                timestamps: TimestampMode::Word,
            },
        )
        .expect_err("Cohere must reject transcription without an explicit language");
    assert!(
        missing_language.to_string().contains("language"),
        "unexpected missing-language error: {missing_language}"
    );

    for fixture_name in REAL_SPEECH_FIXTURES {
        let golden = goldens
            .fixtures
            .get(fixture_name)
            .unwrap_or_else(|| panic!("missing language metadata for {fixture_name}"));
        assert!(
            !golden.language.is_empty(),
            "{fixture_name} must declare an explicit language"
        );
        let (samples, sample_rate) = read_pcm16_fixture(fixture_name);
        let started = Instant::now();
        let transcript = engine
            .transcribe(
                AudioInput::PcmI16 {
                    samples,
                    sample_rate,
                },
                &TranscribeOptions {
                    language: Some(golden.language.clone()),
                    timestamps: TimestampMode::Word,
                },
            )
            .unwrap_or_else(|error| panic!("failed to transcribe {fixture_name}: {error}"));
        let elapsed = started.elapsed();

        eprintln!(
            "engine=cohere fixture={fixture_name} language={} elapsed_seconds={:.3} \
             audio_duration_ms={} transcript={:?}",
            golden.language,
            elapsed.as_secs_f64(),
            transcript.duration_ms,
            transcript.text,
        );

        assert_eq!(
            normalize_text(&transcript.text),
            normalize_text(&golden.normalized_text),
            "Cohere diverged from the captured normalized transcript for {fixture_name}"
        );
        assert!(
            transcript.words.is_none(),
            "Cohere unexpectedly returned word timestamps for {fixture_name}"
        );
        assert!(
            transcript.segments.is_none(),
            "Cohere unexpectedly returned segment timestamps for {fixture_name}"
        );
    }
}

fn load_parakeet_engine() -> Engine {
    load_engine_from_env("LOOPER_PARAKEET_MODEL_DIR", ModelKind::ParakeetTdtInt8)
}

fn load_cohere_engine() -> Engine {
    load_engine_from_env("LOOPER_COHERE_MODEL_DIR", ModelKind::CohereInt4)
}

fn load_engine_from_env(variable: &str, kind: ModelKind) -> Engine {
    let model_dir = std::env::var_os(variable)
        .map(PathBuf::from)
        .unwrap_or_else(|| panic!("set {variable} to the model directory"));
    let started = Instant::now();
    let engine = Engine::load(kind, &model_dir, ExecutionProvider::Cpu).unwrap_or_else(|error| {
        panic!(
            "failed to load {kind:?} model from {}: {error}",
            model_dir.display()
        )
    });

    eprintln!(
        "model={kind:?} model_load_seconds={:.3} model_dir={}",
        started.elapsed().as_secs_f64(),
        model_dir.display(),
    );
    assert_eq!(engine.provider(), ExecutionProvider::Cpu);
    engine
}

fn load_goldens() -> GoldenDocument {
    let path = fixture_dir().join("local-speech-golden.json");
    let json = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
    serde_json::from_str(&json)
        .unwrap_or_else(|error| panic!("failed to parse {}: {error}", path.display()))
}

fn read_pcm16_fixture(name: &str) -> (Vec<i16>, u32) {
    let path = fixture_dir().join(name);
    let mut reader = hound::WavReader::open(&path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
    let spec = reader.spec();
    assert_eq!(
        spec.sample_format,
        hound::SampleFormat::Int,
        "{} must contain integer PCM",
        path.display()
    );
    assert_eq!(
        spec.bits_per_sample,
        16,
        "{} must contain PCM16 audio",
        path.display()
    );
    assert!(
        spec.channels > 0,
        "{} must contain at least one channel",
        path.display()
    );

    let interleaved = reader
        .samples::<i16>()
        .collect::<std::result::Result<Vec<_>, _>>()
        .unwrap_or_else(|error| panic!("failed to decode {}: {error}", path.display()));
    let channels = usize::from(spec.channels);
    assert_eq!(
        interleaved.len() % channels,
        0,
        "{} contains an incomplete PCM frame",
        path.display()
    );

    if channels == 1 {
        return (interleaved, spec.sample_rate);
    }

    let mono = interleaved
        .chunks_exact(channels)
        .map(|frame| {
            let sum = frame.iter().map(|&sample| i64::from(sample)).sum::<i64>();
            (sum as f64 / channels as f64)
                .round()
                .clamp(f64::from(i16::MIN), f64::from(i16::MAX)) as i16
        })
        .collect();
    (mono, spec.sample_rate)
}

fn fixture_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../test-support/fixtures/audio")
}

fn normalize_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn assert_monotonic_timestamps(
    fixture_name: &str,
    kind: &str,
    timestamps: &[TimedSegment],
    duration_ms: u128,
) {
    assert!(
        !timestamps.is_empty(),
        "{fixture_name} returned no {kind} timestamps"
    );

    let duration_seconds = duration_ms as f32 / 1_000.0;
    let mut previous_end = 0.0;
    for (index, timestamp) in timestamps.iter().enumerate() {
        assert!(
            timestamp.start.is_finite() && timestamp.end.is_finite(),
            "{fixture_name} {kind} timestamp {index} is not finite"
        );
        assert!(
            timestamp.start >= -TIMESTAMP_EPSILON_SECONDS,
            "{fixture_name} {kind} timestamp {index} starts before zero: {}",
            timestamp.start
        );
        assert!(
            timestamp.end + TIMESTAMP_EPSILON_SECONDS >= timestamp.start,
            "{fixture_name} {kind} timestamp {index} ends before it starts: {}..{}",
            timestamp.start,
            timestamp.end
        );
        assert!(
            timestamp.start + TIMESTAMP_EPSILON_SECONDS >= previous_end,
            "{fixture_name} {kind} timestamp {index} overlaps or regresses: previous end \
             {previous_end}, current start {}",
            timestamp.start
        );
        assert!(
            timestamp.end <= duration_seconds + TIMESTAMP_EPSILON_SECONDS,
            "{fixture_name} {kind} timestamp {index} exceeds audio duration \
             {duration_seconds}s: {}..{}",
            timestamp.start,
            timestamp.end
        );
        assert!(
            !timestamp.text.trim().is_empty(),
            "{fixture_name} {kind} timestamp {index} has empty text"
        );
        previous_end = timestamp.end;
    }
}
