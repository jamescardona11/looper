use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};

use futures_util::Stream;

#[derive(thiserror::Error, Debug, Clone, PartialEq, Eq)]
pub enum Error {
    #[error("no input device found")]
    NoInputDevice,
    #[error("mic_open_failed")]
    MicOpenFailed,
    #[error("mic_stream_setup_failed")]
    MicStreamSetupFailed,
    #[error("speaker_stream_setup_failed")]
    SpeakerStreamSetupFailed,
    #[error("mic_resample_failed")]
    MicResampleFailed,
    #[error("speaker_resample_failed")]
    SpeakerResampleFailed,
    #[error("mic_stream_ended")]
    MicStreamEnded,
    #[error("speaker_stream_ended")]
    SpeakerStreamEnded,
}

#[derive(Debug, Clone)]
pub struct CaptureConfig {
    pub sample_rate: u32,
    pub chunk_size: usize,
    pub mic_device: Option<String>,
    pub enable_aec: bool,
}

/// Echo-cancelled audio and the speaker signal it was cancelled against.
///
/// Cancellation first time-aligns the two channels, so this pair sits on a
/// timeline that can be shifted from the raw one. They travel together because
/// mixing either against a raw channel reintroduces that shift — up to the
/// probe's maximum lag — into whatever is recorded.
#[derive(Debug, Clone)]
pub struct EchoCancelled {
    pub mic: Arc<[f32]>,
    pub speaker: Arc<[f32]>,
}

#[derive(Debug, Clone)]
pub struct CaptureFrame {
    pub raw_mic: Arc<[f32]>,
    pub raw_speaker: Arc<[f32]>,
    pub echo_cancelled: Option<EchoCancelled>,
}

impl CaptureFrame {
    pub fn preferred_mic(&self) -> Arc<[f32]> {
        self.echo_cancelled
            .as_ref()
            .map(|cancelled| Arc::clone(&cancelled.mic))
            .unwrap_or_else(|| Arc::clone(&self.raw_mic))
    }

    pub fn raw_dual(&self) -> (Arc<[f32]>, Arc<[f32]>) {
        (Arc::clone(&self.raw_mic), Arc::clone(&self.raw_speaker))
    }

    /// The best available mic paired with the speaker signal on its own
    /// timeline. Both channels come from the same source, so mixing them keeps
    /// the two sides of the conversation in step.
    pub fn aec_dual(&self) -> (Arc<[f32]>, Arc<[f32]>) {
        match &self.echo_cancelled {
            Some(cancelled) => (Arc::clone(&cancelled.mic), Arc::clone(&cancelled.speaker)),
            None => self.raw_dual(),
        }
    }
}

pub struct CaptureStream(Pin<Box<dyn Stream<Item = Result<CaptureFrame, Error>> + Send>>);

impl CaptureStream {
    pub fn new(stream: impl Stream<Item = Result<CaptureFrame, Error>> + Send + 'static) -> Self {
        Self(Box::pin(stream))
    }
}

impl Stream for CaptureStream {
    type Item = Result<CaptureFrame, Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.0.as_mut().poll_next(cx)
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    /// Cancellation shifts both channels; this frame stands for one where the
    /// mic was delayed to meet the speaker.
    fn cancelled_frame() -> CaptureFrame {
        CaptureFrame {
            raw_mic: Arc::from([0.1_f32, 0.2]),
            raw_speaker: Arc::from([0.3_f32, 0.4]),
            echo_cancelled: Some(EchoCancelled {
                mic: Arc::from([0.0_f32, 0.9]),
                speaker: Arc::from([0.0_f32, 0.3]),
            }),
        }
    }

    #[test]
    fn the_raw_view_is_untouched_by_cancellation() {
        let (mic, speaker) = cancelled_frame().raw_dual();
        assert_eq!(&*mic, &[0.1, 0.2]);
        assert_eq!(&*speaker, &[0.3, 0.4]);
    }

    #[test]
    fn the_cancelled_view_keeps_both_channels_on_one_timeline() {
        let (mic, speaker) = cancelled_frame().aec_dual();

        assert_eq!(&*mic, &[0.0, 0.9]);
        // The speaker must be the shifted one the mic was cancelled against.
        // Handing back the raw speaker here would mix two timelines and offset
        // the recording by the alignment delay.
        assert_eq!(&*speaker, &[0.0, 0.3]);
    }

    #[test]
    fn without_cancellation_both_views_agree() {
        let frame = CaptureFrame {
            raw_mic: Arc::from([0.1_f32, 0.2]),
            raw_speaker: Arc::from([0.3_f32, 0.4]),
            echo_cancelled: None,
        };

        assert_eq!(frame.aec_dual().0, frame.raw_dual().0);
        assert_eq!(frame.aec_dual().1, frame.raw_dual().1);
        assert_eq!(&*frame.preferred_mic(), &[0.1, 0.2]);
    }
}
