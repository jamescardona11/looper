use super::*;
use std::sync::Arc;

#[derive(Default)]
struct SimulatedBackend {
    sink: Mutex<Option<CaptureSink>>,
    requested_devices: Mutex<Vec<Option<String>>>,
}

impl SimulatedBackend {
    fn send(&self, samples: Vec<f32>, sample_rate: u32, channels: u16) {
        self.sink
            .lock()
            .as_ref()
            .expect("the simulated stream should be open")
            .push_interleaved(samples, sample_rate, channels);
    }
}

impl CaptureBackend for SimulatedBackend {
    fn open(
        &self,
        preferred_device: Option<&str>,
        sink: CaptureSink,
    ) -> Result<ActiveInput, RecorderError> {
        self.requested_devices
            .lock()
            .push(preferred_device.map(str::to_owned));
        *self.sink.lock() = Some(sink);
        Ok(ActiveInput {
            _guard: Box::new(()),
        })
    }
}

fn simulated_manager() -> (RecorderManager, Arc<SimulatedBackend>) {
    let backend = Arc::new(SimulatedBackend::default());
    let manager = RecorderManager::from_backend(backend.clone());
    (manager, backend)
}

fn recording(samples: Vec<i16>, speech_percentage: Option<f32>) -> CompletedRecording {
    let ended_at = Local::now();
    let started_at = ended_at
        - ChronoDuration::milliseconds(
            (samples.len() as i64 * 1_000) / i64::from(TARGET_SAMPLE_RATE),
        );
    CompletedRecording {
        samples,
        sample_rate: TARGET_SAMPLE_RATE,
        channels: 1,
        started_at,
        ended_at,
        pending_path: None,
        speech_percentage,
    }
}

fn voiced_fixture() -> Vec<i16> {
    (0..TARGET_SAMPLE_RATE as usize)
        .map(|index| {
            let time = index as f32 / TARGET_SAMPLE_RATE as f32;
            let envelope = 0.42 + 0.3 * (time * std::f32::consts::TAU * 3.0).sin().abs();
            let sample = envelope
                * ((time * std::f32::consts::TAU * 173.0).sin()
                    + 0.35 * (time * std::f32::consts::TAU * 631.0).sin());
            float_to_pcm16(sample * 0.55)
        })
        .collect()
}

#[test]
fn simulated_stereo_noncanonical_capture_is_mono_and_reproducible() {
    let (manager, backend) = simulated_manager();
    manager
        .start(Some("preferred mic".into()), None)
        .expect("start simulated capture");
    let interleaved = vec![-0.6, 0.2, -0.2, 0.6, 0.4, 0.8, -0.8, -0.4];
    backend.send(interleaved.clone(), 8_000, 2);

    let completed = manager
        .stop_after_capture(|| {})
        .expect("stop simulated capture")
        .expect("one completed capture");
    let expected = resample_audio(&downmix_f32(&interleaved, 2), 8_000, TARGET_SAMPLE_RATE)
        .into_iter()
        .map(float_to_pcm16)
        .collect::<Vec<_>>();

    assert_eq!(completed.channels, 1);
    assert_eq!(completed.sample_rate, TARGET_SAMPLE_RATE);
    assert_eq!(completed.samples, expected);
    assert_eq!(
        *backend.requested_devices.lock(),
        vec![Some("preferred mic".into())]
    );
}

#[test]
fn live_reads_are_fifo_cursor_based_and_levels_are_chronological() {
    let (manager, backend) = simulated_manager();
    manager.start(None, None).expect("start simulated capture");
    backend.send(vec![0.2; 64], TARGET_SAMPLE_RATE, 1);

    let (first, rate, cursor) = manager.read_live_samples(0).expect("first live read");
    assert_eq!(rate, TARGET_SAMPLE_RATE);
    assert_eq!(first, vec![0.2; 64]);
    assert_eq!(cursor, 64);
    assert!(manager.read_live_samples(cursor).is_none());

    backend.send(vec![0.3; 3], TARGET_SAMPLE_RATE, 1);
    let (second, _, end) = manager
        .read_live_samples(cursor)
        .expect("incremental live read");
    assert_eq!(second, vec![0.3; 3]);
    assert_eq!(end, 67);

    let levels = manager.level_snapshots();
    assert_eq!(levels.len(), 2);
    assert!(levels[0].sample_offset < levels[1].sample_offset);
    assert!(levels.iter().all(|level| level.peak > 0.0));
}

#[test]
fn validation_uses_a_stable_exclusion_priority() {
    assert_eq!(
        validate_recording(&recording(Vec::new(), Some(1.0))),
        Err(RecordingRejectionReason::EmptyBuffer)
    );
    assert!(matches!(
        validate_recording(&recording(vec![0; 10], Some(0.0))),
        Err(RecordingRejectionReason::TooShort { .. })
    ));
    assert!(matches!(
        validate_recording(&recording(vec![8; TARGET_SAMPLE_RATE as usize], Some(0.0))),
        Err(RecordingRejectionReason::TooQuiet { .. })
    ));
    assert_eq!(
        validate_recording(&recording(
            vec![5_000; TARGET_SAMPLE_RATE as usize],
            Some(0.0)
        )),
        Err(RecordingRejectionReason::NoSpeechDetected)
    );
}

#[test]
fn start_is_exclusive_and_stop_is_idempotent() {
    let (manager, _) = simulated_manager();
    assert!(manager.stop().is_ok());
    manager.start(None, None).expect("first start");
    assert!(matches!(
        manager.start(None, None),
        Err(RecorderError::Stream(_))
    ));
    assert!(manager.stop().is_ok());
    assert!(manager.stop().is_ok());
}

#[test]
fn journal_failure_does_not_block_capture_and_remains_diagnosable() {
    let root = tempfile::tempdir().expect("temporary recording root");
    let blocked_journal = root.path().join("not-a-directory");
    std::fs::write(&blocked_journal, b"block directory creation").expect("journal blocker");
    let (manager, backend) = simulated_manager();

    manager
        .start(None, Some(blocked_journal))
        .expect("capture should start without recovery journal");
    assert!(manager.diagnostic().is_some());
    backend.send(
        vec![0.2; TARGET_SAMPLE_RATE as usize / 2],
        TARGET_SAMPLE_RATE,
        1,
    );

    let completed = manager
        .stop_after_capture(|| {})
        .expect("capture should finish without recovery journal")
        .expect("completed capture");
    assert!(completed.pending_path.is_none());
    assert!(manager.diagnostic().is_some());
}

#[test]
fn recovery_archives_valid_audio_removes_empty_and_quarantines_corruption() {
    let root = tempfile::tempdir().expect("temporary recording root");
    let pending = root.path().join(PENDING_DIR_NAME);
    std::fs::create_dir_all(&pending).expect("pending directory");
    write_pcm16_wav(&pending.join("valid.wav"), &voiced_fixture()).expect("valid recovery wav");
    write_pcm16_wav(&pending.join("empty.wav"), &[]).expect("empty recovery wav");
    std::fs::write(pending.join("corrupt.wav"), b"not a wav").expect("corrupt recovery wav");

    let recovered = recover_pending_recordings(root.path().to_path_buf());

    assert_eq!(recovered.len(), 1);
    assert!(recovered[0].0.path.exists());
    assert!(recovered[0]
        .1
        .pending_path
        .as_ref()
        .is_some_and(|path| path.exists()));
    assert!(!pending.join("empty.wav").exists());
    let quarantined = std::fs::read_dir(pending.join("quarantine"))
        .expect("quarantine directory")
        .count();
    assert_eq!(quarantined, 1);
}
