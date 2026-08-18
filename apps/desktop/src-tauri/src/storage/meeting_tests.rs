use std::{fs, path::PathBuf};

use uuid::Uuid;

use super::StorageManager;
use crate::library::{
    LibraryItem, LibraryItemStatus, MeetingCalendarContext, MeetingDetails, MeetingNoteMarker,
    MeetingNotesUpdate, MeetingSummaryStatus, MeetingTranscriptSegment, MeetingTranscriptSource,
};

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("looper-meeting-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn meeting_item(id: &str, audio_path: &str) -> LibraryItem {
    LibraryItem {
        id: id.to_owned(),
        name: "Meeting test".to_owned(),
        audio_path: audio_path.to_owned(),
        source_path: String::new(),
        store_original: false,
        status: LibraryItemStatus::Recording,
        transcript: None,
        segments: None,
        words: None,
        duration_seconds: 0.0,
        file_size_bytes: 0,
        original_format: "wav".to_owned(),
        created_at: "2026-07-18T10:00:00Z".to_owned(),
        transcribed_at: None,
        tags: Vec::new(),
        llm_cleanup_enabled: false,
        denoise_enabled: false,
        speech_model: "test-model".to_owned(),
        show_timestamps: true,
        detect_speakers: false,
        kind: "meeting".to_owned(),
        speakers: None,
    }
}

fn meeting_details(id: &str) -> MeetingDetails {
    MeetingDetails {
        library_item_id: id.to_owned(),
        started_at: "2026-07-18T10:00:00Z".to_owned(),
        ended_at: None,
        notes: String::new(),
        notes_revision: 0,
        summary: None,
        summary_status: MeetingSummaryStatus::Idle,
        summary_error: None,
        system_audio_enabled: true,
        recovered: false,
        calendar_context: None,
        note_markers: Vec::new(),
        live_transcript: Vec::new(),
    }
}

#[test]
fn meeting_details_migrate_and_notes_use_optimistic_revisions() {
    let directory = TestDirectory::new();
    let manager = StorageManager::new(directory.0.join("transcriptions.db")).unwrap();
    let id = Uuid::new_v4().to_string();
    manager
        .insert_meeting_item(
            meeting_item(&id, &directory.0.join("meeting.wav").display().to_string()),
            &meeting_details(&id),
        )
        .unwrap();

    let updated = manager
        .update_meeting_notes(
            &id,
            MeetingNotesUpdate {
                notes: "Decision: ship on Monday".to_owned(),
                expected_revision: 0,
            },
        )
        .unwrap()
        .unwrap();
    assert_eq!(updated.notes, "Decision: ship on Monday");
    assert_eq!(updated.notes_revision, 1);

    let conflict = manager.update_meeting_notes(
        &id,
        MeetingNotesUpdate {
            notes: "Stale edit".to_owned(),
            expected_revision: 0,
        },
    );
    assert!(conflict.is_err());
    assert_eq!(
        manager.get_meeting_details(&id).unwrap().unwrap().notes,
        "Decision: ship on Monday"
    );
}

#[test]
fn meeting_details_preserve_calendar_context() {
    let directory = TestDirectory::new();
    let manager = StorageManager::new(directory.0.join("transcriptions.db")).unwrap();
    let id = Uuid::new_v4().to_string();
    let mut details = meeting_details(&id);
    details.calendar_context = Some(MeetingCalendarContext {
        provider: "apple_event_kit".to_owned(),
        event_id: "event-1".to_owned(),
        external_id: "external-1".to_owned(),
        calendar_id: "calendar-1".to_owned(),
        series_id: Some("series-1".to_owned()),
        occurrence_id: Some("event-1:1784646000".to_owned()),
        title: "Weekly planning".to_owned(),
        meeting_url: Some("https://meet.google.com/abc-defg-hij".to_owned()),
        scheduled_start: "2026-07-21T15:00:00Z".to_owned(),
        scheduled_end: "2026-07-21T15:30:00Z".to_owned(),
        organizer: Some("team@example.com".to_owned()),
        attendee_count: 4,
    });

    manager
        .insert_meeting_item(
            meeting_item(&id, &directory.0.join("meeting.wav").display().to_string()),
            &details,
        )
        .unwrap();
    assert_eq!(
        manager
            .get_meeting_details(&id)
            .unwrap()
            .unwrap()
            .calendar_context,
        details.calendar_context
    );
}

#[test]
fn meeting_note_markers_are_persisted_and_closed_meetings_reject_new_notes() {
    let directory = TestDirectory::new();
    let manager = StorageManager::new(directory.0.join("transcriptions.db")).unwrap();
    let id = Uuid::new_v4().to_string();
    manager
        .insert_meeting_item(
            meeting_item(&id, &directory.0.join("meeting.wav").display().to_string()),
            &meeting_details(&id),
        )
        .unwrap();
    let marker = MeetingNoteMarker {
        id: Uuid::new_v4().to_string(),
        captured_at_ms: 45_000,
        start_ms: 15_000,
        end_ms: 45_000,
        created_at: "2026-07-18T10:00:45Z".to_owned(),
        kind: Default::default(),
    };

    let updated = manager
        .append_meeting_note_marker(&id, marker.clone())
        .unwrap()
        .unwrap();
    assert_eq!(updated.note_markers, vec![marker.clone()]);
    assert_eq!(
        manager
            .get_meeting_details(&id)
            .unwrap()
            .unwrap()
            .note_markers,
        vec![marker.clone()]
    );

    manager
        .finish_meeting_details(&id, "2026-07-18T11:00:00Z", false)
        .unwrap();
    assert!(manager.append_meeting_note_marker(&id, marker).is_err());
}

#[test]
fn live_meeting_segments_are_persisted_in_timeline_order() {
    let directory = TestDirectory::new();
    let manager = StorageManager::new(directory.0.join("transcriptions.db")).unwrap();
    let id = Uuid::new_v4().to_string();
    manager
        .insert_meeting_item(
            meeting_item(&id, &directory.0.join("meeting.wav").display().to_string()),
            &meeting_details(&id),
        )
        .unwrap();

    for (segment_id, source, text, start_ms, end_ms) in [
        (
            "second",
            MeetingTranscriptSource::You,
            "I agree",
            2_000,
            3_000,
        ),
        (
            "first",
            MeetingTranscriptSource::Them,
            "Ship it",
            500,
            1_500,
        ),
    ] {
        manager
            .append_meeting_transcript_segment(
                &id,
                MeetingTranscriptSegment {
                    id: segment_id.to_owned(),
                    source,
                    text: text.to_owned(),
                    start_ms,
                    end_ms,
                },
            )
            .unwrap();
    }

    let details = manager.get_meeting_details(&id).unwrap().unwrap();
    assert_eq!(
        details
            .live_transcript
            .iter()
            .map(|segment| segment.id.as_str())
            .collect::<Vec<_>>(),
        vec!["first", "second"]
    );
}

#[test]
fn deleting_library_item_cascades_meeting_details() {
    let directory = TestDirectory::new();
    let manager = StorageManager::new(directory.0.join("transcriptions.db")).unwrap();
    let id = Uuid::new_v4().to_string();
    manager
        .insert_meeting_item(
            meeting_item(&id, &directory.0.join("meeting.wav").display().to_string()),
            &meeting_details(&id),
        )
        .unwrap();

    manager.delete_library_item(&id).unwrap();
    assert!(manager.get_meeting_details(&id).unwrap().is_none());
}

#[test]
fn meeting_summary_can_only_be_claimed_once_until_it_finishes() {
    let directory = TestDirectory::new();
    let manager = StorageManager::new(directory.0.join("transcriptions.db")).unwrap();
    let id = Uuid::new_v4().to_string();
    manager
        .insert_meeting_item(
            meeting_item(&id, &directory.0.join("meeting.wav").display().to_string()),
            &meeting_details(&id),
        )
        .unwrap();

    let first = manager.claim_meeting_summary(&id).unwrap().unwrap();
    assert_eq!(first.summary_status, MeetingSummaryStatus::Running);
    assert!(manager.claim_meeting_summary(&id).unwrap().is_none());
    manager
        .update_meeting_summary(
            &id,
            MeetingSummaryStatus::Error,
            None,
            Some("provider unavailable"),
        )
        .unwrap();
    assert!(manager.claim_meeting_summary(&id).unwrap().is_some());
}

#[test]
fn interrupted_meeting_summary_becomes_retryable_on_reopen() {
    let directory = TestDirectory::new();
    let database_path = directory.0.join("transcriptions.db");
    let id = Uuid::new_v4().to_string();
    {
        let manager = StorageManager::new(database_path.clone()).unwrap();
        manager
            .insert_meeting_item(
                meeting_item(&id, &directory.0.join("meeting.wav").display().to_string()),
                &meeting_details(&id),
            )
            .unwrap();
        manager.claim_meeting_summary(&id).unwrap().unwrap();
    }

    let reopened = StorageManager::new(database_path).unwrap();
    let details = reopened.get_meeting_details(&id).unwrap().unwrap();
    assert_eq!(details.summary_status, MeetingSummaryStatus::Error);
    assert_eq!(
        details.summary_error.as_deref(),
        Some("Summary generation was interrupted. Retry to continue.")
    );
}
