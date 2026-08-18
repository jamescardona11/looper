use std::path::PathBuf;

use looper_ts::speech_regions;

#[test]
fn neural_vad_detects_real_speech_inside_audio_bounds() {
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../test-support/fixtures/audio/harvard.wav");
    let mut reader = hound::WavReader::open(&fixture).expect("open speech fixture");
    let spec = reader.spec();
    assert_eq!(spec.bits_per_sample, 16, "VAD fixture must use PCM i16");
    let interleaved = reader
        .samples::<i16>()
        .collect::<std::result::Result<Vec<_>, _>>()
        .expect("decode speech fixture");
    let channels = spec.channels as usize;
    let samples = interleaved
        .chunks_exact(channels)
        .map(|frame| {
            let sum = frame.iter().map(|sample| *sample as i32).sum::<i32>();
            (sum / channels as i32) as i16
        })
        .collect::<Vec<_>>();
    let duration_seconds = samples.len() as f32 / spec.sample_rate as f32;

    let regions =
        speech_regions(&samples, spec.sample_rate).expect("a valid WAV must produce VAD output");

    assert!(!regions.is_empty(), "speech fixture must contain speech");
    assert!(regions
        .iter()
        .all(|(start, end)| *start >= 0.0 && start < end && *end <= duration_seconds));
}
