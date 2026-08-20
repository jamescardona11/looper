use tauri::{async_runtime, AppHandle, Emitter, Manager};

use crate::{llm_cleanup, AppRuntime, AppState};

use super::types::{MeetingDetails, MeetingSummaryStatus, EVENT_MEETING_DETAILS_CHANGED};

pub(crate) fn schedule_meeting_summary(
    app: &AppHandle<AppRuntime>,
    id: String,
) -> Result<Option<MeetingDetails>, String> {
    let state = app.state::<AppState>();
    let settings = state.current_settings_unmasked();
    let current = state
        .storage()
        .get_meeting_details(&id)
        .map_err(|err| format!("Failed to load meeting details: {err}"))?
        .ok_or_else(|| "Meeting details not found".to_string())?;
    if current.summary_status == MeetingSummaryStatus::Running {
        return Ok(Some(current));
    }
    if !llm_cleanup::is_meeting_ai_available(app, &settings) {
        return Ok(Some(current));
    }

    let item = state
        .storage()
        .get_library_item(&id)
        .map_err(|err| format!("Failed to load meeting transcript: {err}"))?
        .ok_or_else(|| "Meeting not found".to_string())?;
    let final_transcript = item
        .transcript
        .filter(|text| !text.trim().is_empty())
        .ok_or_else(|| "Meeting transcript is not ready yet".to_string())?;
    let transcript = meeting_summary_transcript(&final_transcript, &current.live_transcript);

    let running = state
        .storage()
        .claim_meeting_summary(&id)
        .map_err(|err| format!("Failed to start meeting summary: {err}"))?;
    let Some(running) = running else {
        return Ok(Some(current));
    };
    let _ = app.emit(EVENT_MEETING_DETAILS_CHANGED, &running);

    let task_app = app.clone();
    let notes = current.notes;
    async_runtime::spawn(async move {
        let state = task_app.state::<AppState>();
        let result = llm_cleanup::generate_meeting_summary(
            &task_app,
            &state.http(),
            &notes,
            &transcript,
            &settings,
        )
        .await;
        let details = match result {
            Ok(summary) => state.storage().update_meeting_summary(
                &id,
                MeetingSummaryStatus::Complete,
                Some(summary.trim()),
                None,
            ),
            Err(err) => state.storage().update_meeting_summary(
                &id,
                MeetingSummaryStatus::Error,
                None,
                Some(&llm_cleanup::llm_issue_message(&err)),
            ),
        };
        match details {
            Ok(Some(details)) => {
                if let Err(err) = crate::markdown_mirror::mirror_library_by_id(
                    &state.current_settings_unmasked(),
                    &state.storage(),
                    &id,
                ) {
                    tracing::warn!("Failed to update Markdown mirror for meeting summary: {err}");
                }
                let _ = task_app.emit(EVENT_MEETING_DETAILS_CHANGED, details);
            }
            Ok(None) => {}
            Err(err) => tracing::error!("Failed to save meeting summary result: {err}"),
        }
        state.meeting_capture().finish_processing(&task_app, &id);
    });

    Ok(Some(running))
}

fn meeting_summary_transcript(
    final_transcript: &str,
    live_transcript: &[super::types::MeetingTranscriptSegment],
) -> String {
    if live_transcript.is_empty() {
        return final_transcript.to_string();
    }

    let mut transcript = final_transcript.trim().to_string();
    transcript.push_str("\n\nTimestamped live transcript:\n");
    for segment in live_transcript {
        let seconds = segment.start_ms / 1_000;
        transcript.push_str(&format!(
            "[{:02}:{:02}] {}: {}\n",
            seconds / 60,
            seconds % 60,
            segment.source.as_str(),
            segment.text.trim()
        ));
    }
    transcript
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summary_context_keeps_persisted_live_transcript() {
        let live = vec![super::super::types::MeetingTranscriptSegment {
            id: "live-1".to_string(),
            source: super::super::types::MeetingTranscriptSource::Them,
            text: "Ship on Friday.".to_string(),
            start_ms: 65_000,
            end_ms: 70_000,
        }];

        let context = meeting_summary_transcript("Final transcript.", &live);

        assert!(context.contains("Final transcript."));
        assert!(context.contains("[01:05] them: Ship on Friday."));
    }
}
