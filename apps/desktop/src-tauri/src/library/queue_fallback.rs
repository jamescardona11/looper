use crate::storage::StorageManager;
use crate::transcribe::count_words;

use super::super::types::{
    MeetingTranscriptSegment, MeetingTranscriptSource, Speaker, TranscriptSegment,
};

pub(super) struct LiveMeetingTranscriptFallback {
    pub(super) transcript: String,
    pub(super) segments: Vec<TranscriptSegment>,
    pub(super) speakers: Vec<Speaker>,
}

pub(super) fn load_live_meeting_fallback(
    storage: &StorageManager,
    id: &str,
) -> Option<LiveMeetingTranscriptFallback> {
    match storage.get_meeting_details(id) {
        Ok(Some(details)) => build_fallback(&details.live_transcript),
        Ok(None) => None,
        Err(error) => {
            tracing::warn!("Failed to read persisted live transcript for {id}: {error}");
            None
        }
    }
}

fn build_fallback(
    live_transcript: &[MeetingTranscriptSegment],
) -> Option<LiveMeetingTranscriptFallback> {
    let mut spoken = live_transcript
        .iter()
        .filter(|segment| count_words(segment.text.trim()) > 0)
        .collect::<Vec<_>>();
    spoken.sort_by_key(|segment| (segment.start_ms, segment.end_ms, segment.id.as_str()));
    if spoken.is_empty() {
        return None;
    }

    let transcript = spoken
        .iter()
        .map(|segment| segment.text.trim())
        .collect::<Vec<_>>()
        .join(" ");
    let segments = spoken
        .iter()
        .map(|segment| TranscriptSegment {
            start_ms: segment.start_ms,
            end_ms: segment.end_ms,
            text: segment.text.trim().to_string(),
            speaker_id: Some(segment.source.as_str().to_string()),
        })
        .collect();
    let speakers = [
        (MeetingTranscriptSource::You, "You"),
        (MeetingTranscriptSource::Them, "Them"),
    ]
    .into_iter()
    .filter(|(source, _)| spoken.iter().any(|segment| segment.source == *source))
    .map(|(source, name)| Speaker {
        id: source.as_str().to_string(),
        name: name.to_string(),
        color: None,
    })
    .collect();

    Some(LiveMeetingTranscriptFallback {
        transcript,
        segments,
        speakers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persisted_speech_builds_a_chronological_fallback() {
        let fallback = build_fallback(&[
            MeetingTranscriptSegment {
                id: "them-2".to_string(),
                source: MeetingTranscriptSource::Them,
                text: "Second decision.".to_string(),
                start_ms: 2_000,
                end_ms: 3_000,
            },
            MeetingTranscriptSegment {
                id: "blank".to_string(),
                source: MeetingTranscriptSource::You,
                text: "  ".to_string(),
                start_ms: 500,
                end_ms: 800,
            },
            MeetingTranscriptSegment {
                id: "you-1".to_string(),
                source: MeetingTranscriptSource::You,
                text: "First point.".to_string(),
                start_ms: 1_000,
                end_ms: 1_800,
            },
        ])
        .expect("persisted speech should produce a fallback");

        assert_eq!(fallback.transcript, "First point. Second decision.");
        assert_eq!(fallback.segments.len(), 2);
        assert_eq!(fallback.segments[0].speaker_id.as_deref(), Some("you"));
        assert_eq!(fallback.segments[1].speaker_id.as_deref(), Some("them"));
        assert_eq!(
            fallback
                .speakers
                .iter()
                .map(|speaker| speaker.id.as_str())
                .collect::<Vec<_>>(),
            vec!["you", "them"]
        );
    }

    #[test]
    fn silence_cannot_replace_a_real_no_speech_error() {
        assert!(build_fallback(&[]).is_none());
        assert!(build_fallback(&[MeetingTranscriptSegment {
            id: "blank".to_string(),
            source: MeetingTranscriptSource::You,
            text: "   ".to_string(),
            start_ms: 0,
            end_ms: 100,
        }])
        .is_none());
    }
}
