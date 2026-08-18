use std::time::{Duration, Instant};

use parking_lot::Mutex;
use webrtc_vad::{SampleRate, Vad, VadMode};

use crate::toast;

use super::types::TARGET_SAMPLE_RATE;

pub(crate) const SILENCE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
pub(crate) const SILENCE_GRACE_PERIOD: Duration = Duration::from_secs(45);
pub(crate) const WATCHDOG_POLL_INTERVAL: Duration = Duration::from_secs(1);
pub(crate) const CONTINUE_MEETING_ACTION: &str = "continue_meeting_after_silence";

const VAD_FRAME_DURATION_MS: usize = 30;
const VAD_FRAME_SAMPLES: usize = TARGET_SAMPLE_RATE as usize * VAD_FRAME_DURATION_MS / 1_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SilenceAction {
    None,
    ShowWarning,
    Stop,
}

enum SilencePhase {
    Monitoring { last_voice_at: Instant },
    Warning { started_at: Instant },
    Stopping,
}

pub(crate) struct MeetingSilenceMonitor {
    phase: Mutex<SilencePhase>,
    silence_timeout: Duration,
    grace_period: Duration,
}

impl MeetingSilenceMonitor {
    pub(crate) fn new(now: Instant) -> Self {
        Self::with_policy(now, SILENCE_TIMEOUT, SILENCE_GRACE_PERIOD)
    }

    fn with_policy(now: Instant, silence_timeout: Duration, grace_period: Duration) -> Self {
        Self {
            phase: Mutex::new(SilencePhase::Monitoring { last_voice_at: now }),
            silence_timeout,
            grace_period,
        }
    }

    pub(crate) fn evaluate(&self, now: Instant) -> SilenceAction {
        let mut phase = self.phase.lock();
        match *phase {
            SilencePhase::Monitoring { last_voice_at }
                if now.saturating_duration_since(last_voice_at) >= self.silence_timeout =>
            {
                *phase = SilencePhase::Warning { started_at: now };
                SilenceAction::ShowWarning
            }
            SilencePhase::Warning { started_at }
                if now.saturating_duration_since(started_at) >= self.grace_period =>
            {
                *phase = SilencePhase::Stopping;
                SilenceAction::Stop
            }
            _ => SilenceAction::None,
        }
    }

    pub(crate) fn observe_voice(&self, now: Instant) -> bool {
        self.resume(now, true, false)
    }

    pub(crate) fn continue_recording(&self, now: Instant) -> bool {
        self.resume(now, true, true)
    }

    pub(crate) fn dismiss_warning(&self, now: Instant) -> bool {
        self.resume(now, false, false)
    }

    fn resume(
        &self,
        now: Instant,
        reset_while_monitoring: bool,
        report_monitoring_reset: bool,
    ) -> bool {
        let mut phase = self.phase.lock();
        match *phase {
            SilencePhase::Stopping => false,
            SilencePhase::Warning { .. } => {
                *phase = SilencePhase::Monitoring { last_voice_at: now };
                true
            }
            SilencePhase::Monitoring { .. } if reset_while_monitoring => {
                *phase = SilencePhase::Monitoring { last_voice_at: now };
                report_monitoring_reset
            }
            SilencePhase::Monitoring { .. } => false,
        }
    }
}

pub(crate) struct MeetingVoiceActivityDetector {
    microphone: VoiceActivityChannel,
    system_audio: VoiceActivityChannel,
}

impl MeetingVoiceActivityDetector {
    pub(crate) fn new() -> Self {
        Self {
            microphone: VoiceActivityChannel::new(),
            system_audio: VoiceActivityChannel::new(),
        }
    }

    pub(crate) fn observe(&mut self, microphone: &[f32], system_audio: &[f32]) -> bool {
        let mut microphone_vad =
            Vad::new_with_rate_and_mode(SampleRate::Rate16kHz, VadMode::VeryAggressive);
        let mut system_audio_vad =
            Vad::new_with_rate_and_mode(SampleRate::Rate16kHz, VadMode::VeryAggressive);
        let microphone_has_voice = self.microphone.observe(microphone, &mut microphone_vad);
        let system_audio_has_voice = self
            .system_audio
            .observe(system_audio, &mut system_audio_vad);
        microphone_has_voice || system_audio_has_voice
    }
}

struct VoiceActivityChannel {
    frame: [i16; VAD_FRAME_SAMPLES],
    frame_len: usize,
}

impl VoiceActivityChannel {
    fn new() -> Self {
        Self {
            frame: [0; VAD_FRAME_SAMPLES],
            frame_len: 0,
        }
    }

    fn observe(&mut self, samples: &[f32], vad: &mut Vad) -> bool {
        let mut detected = false;
        for sample in samples {
            self.frame[self.frame_len] = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16;
            self.frame_len += 1;
            if self.frame_len == VAD_FRAME_SAMPLES {
                detected |= vad.is_voice_segment(&self.frame).unwrap_or(false);
                self.frame_len = 0;
            }
        }
        detected
    }
}

pub(crate) fn warning_notification() -> toast::Payload {
    toast::Payload {
        toast_type: "warning".to_string(),
        title: Some("Did the meeting end?".to_string()),
        message: format!(
            "No voice detected for 5 minutes. Recording will stop in {} seconds.",
            SILENCE_GRACE_PERIOD.as_secs()
        ),
        auto_dismiss: Some(false),
        duration: None,
        retry_id: None,
        mode: None,
        action: Some(CONTINUE_MEETING_ACTION.to_string()),
        action_label: Some("Keep recording".to_string()),
        secondary_action: Some("stop_meeting_capture".to_string()),
        secondary_action_label: Some("Stop now".to_string()),
    }
}

pub(crate) fn stopped_notification() -> toast::Payload {
    toast::Payload {
        toast_type: "success".to_string(),
        title: None,
        message: "Meeting recording stopped and saved after 5 minutes without voice.".to_string(),
        auto_dismiss: Some(true),
        duration: Some(8_000),
        retry_id: None,
        mode: None,
        action: None,
        action_label: None,
        secondary_action: None,
        secondary_action_label: None,
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn test_monitor(now: Instant) -> MeetingSilenceMonitor {
        MeetingSilenceMonitor::with_policy(now, Duration::from_secs(300), Duration::from_secs(45))
    }

    #[test]
    fn warns_after_five_minutes_and_stops_after_the_grace_period() {
        let started_at = Instant::now();
        let monitor = test_monitor(started_at);

        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(299)),
            SilenceAction::None
        );
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(300)),
            SilenceAction::ShowWarning
        );
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(344)),
            SilenceAction::None
        );
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(345)),
            SilenceAction::Stop
        );
    }

    #[test]
    fn voice_during_the_warning_cancels_auto_stop_and_restarts_the_timer() {
        let started_at = Instant::now();
        let monitor = test_monitor(started_at);
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(300)),
            SilenceAction::ShowWarning
        );

        assert!(monitor.observe_voice(started_at + Duration::from_secs(320)));
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(619)),
            SilenceAction::None
        );
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(620)),
            SilenceAction::ShowWarning
        );
    }

    #[test]
    fn keep_recording_restarts_the_timer() {
        let started_at = Instant::now();
        let monitor = test_monitor(started_at);
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(300)),
            SilenceAction::ShowWarning
        );

        assert!(monitor.continue_recording(started_at + Duration::from_secs(330)));
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(629)),
            SilenceAction::None
        );
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(630)),
            SilenceAction::ShowWarning
        );
    }

    #[test]
    fn dismissing_the_warning_keeps_recording_and_restarts_the_timer() {
        let started_at = Instant::now();
        let monitor = test_monitor(started_at);
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(300)),
            SilenceAction::ShowWarning
        );

        assert!(monitor.dismiss_warning(started_at + Duration::from_secs(320)));
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(619)),
            SilenceAction::None
        );
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(620)),
            SilenceAction::ShowWarning
        );
    }

    #[test]
    fn dismissing_an_unrelated_toast_does_not_delay_the_silence_warning() {
        let started_at = Instant::now();
        let monitor = test_monitor(started_at);

        assert!(!monitor.dismiss_warning(started_at + Duration::from_secs(250)));
        assert_eq!(
            monitor.evaluate(started_at + Duration::from_secs(300)),
            SilenceAction::ShowWarning
        );
    }

    #[test]
    fn warning_notification_exposes_the_45_second_grace_and_safe_actions() {
        let notification = warning_notification();

        assert_eq!(notification.title.as_deref(), Some("Did the meeting end?"));
        assert!(notification.message.contains("45 seconds"));
        assert_eq!(notification.auto_dismiss, Some(false));
        assert_eq!(
            notification.action.as_deref(),
            Some(CONTINUE_MEETING_ACTION)
        );
        assert_eq!(
            notification.secondary_action.as_deref(),
            Some("stop_meeting_capture")
        );
    }

    #[test]
    fn vad_detects_the_voice_fixture_on_microphone_and_system_audio() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../test-support/fixtures/audio/harvard.wav");
        let (samples, sample_rate) =
            crate::transcribe::load_audio_for_transcription(&fixture).expect("load fixture");
        let samples = samples
            .into_iter()
            .map(|sample| sample as f32 / i16::MAX as f32)
            .collect::<Vec<_>>();
        let samples = crate::recorder::resample_audio(&samples, sample_rate, TARGET_SAMPLE_RATE);

        let mut microphone = MeetingVoiceActivityDetector::new();
        assert!(microphone.observe(&samples, &[]));

        let mut system_audio = MeetingVoiceActivityDetector::new();
        assert!(system_audio.observe(&[], &samples));
    }
}
