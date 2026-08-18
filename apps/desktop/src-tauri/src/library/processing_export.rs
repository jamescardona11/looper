use std::collections::HashMap;

use anyhow::{anyhow, Result};

use crate::library::types::{
    ExportFormat, LibraryItem, MeetingDetails, Speaker, TranscriptSegment,
};

pub(crate) fn convert_segments_to_ms(
    segments: &[looper_ts::TimedSegment],
) -> Vec<TranscriptSegment> {
    segments
        .iter()
        .map(|segment| TranscriptSegment {
            start_ms: milliseconds(segment.start),
            end_ms: milliseconds(segment.end),
            text: segment.text.trim().to_owned(),
            speaker_id: None,
        })
        .collect()
}

pub(crate) fn diarize_segments(
    segments: &[crate::remote_api::DiarizedSegment],
) -> (Vec<TranscriptSegment>, Option<Vec<Speaker>>) {
    let roster = SpeakerRoster::from_segments(segments);
    let transcript = segments
        .iter()
        .map(|segment| TranscriptSegment {
            start_ms: milliseconds(segment.start),
            end_ms: milliseconds(segment.end),
            text: segment.text.trim().to_owned(),
            speaker_id: roster.id_for(segment.speaker.as_deref()),
        })
        .collect();
    let speakers = (!roster.speakers.is_empty()).then_some(roster.speakers);
    (transcript, speakers)
}

fn milliseconds(seconds: f32) -> u64 {
    (seconds * 1_000.0).max(0.0) as u64
}

struct SpeakerRoster {
    ids_by_label: HashMap<String, String>,
    speakers: Vec<Speaker>,
}

impl SpeakerRoster {
    fn from_segments(segments: &[crate::remote_api::DiarizedSegment]) -> Self {
        let mut ids_by_label = HashMap::new();
        let mut speakers = Vec::new();
        for label in segments
            .iter()
            .filter_map(|segment| normalized_label(segment.speaker.as_deref()))
        {
            if ids_by_label.contains_key(label) {
                continue;
            }
            let ordinal = speakers.len() + 1;
            let id = format!("speaker_{ordinal}");
            ids_by_label.insert(label.to_owned(), id.clone());
            speakers.push(Speaker {
                id,
                name: format!("Speaker {ordinal}"),
                color: None,
            });
        }
        Self {
            ids_by_label,
            speakers,
        }
    }

    fn id_for(&self, label: Option<&str>) -> Option<String> {
        normalized_label(label).and_then(|label| self.ids_by_label.get(label).cloned())
    }
}

fn normalized_label(label: Option<&str>) -> Option<&str> {
    label.map(str::trim).filter(|value| !value.is_empty())
}

pub(crate) fn build_export_content(item: &LibraryItem, format: ExportFormat) -> Result<String> {
    ExportDocument { item }.render(format)
}

pub(crate) fn build_meeting_export_content(
    item: &LibraryItem,
    details: &MeetingDetails,
    format: ExportFormat,
) -> Result<String> {
    if !matches!(&format, ExportFormat::Md) {
        return build_export_content(item, format);
    }

    let transcript = speaker_transcript(item, true)
        .unwrap_or_else(|| item.transcript.clone().unwrap_or_default());
    let notes = nonempty(&details.notes).unwrap_or("_No notes._");
    let mut markdown = format!(
        "# {}\n\n**Duration:** {}  \n**Started:** {}  \n**Ended:** {}\n\n## Notes\n\n{}",
        item.name,
        display_duration(item.duration_seconds),
        details.started_at,
        details.ended_at.as_deref().unwrap_or("In progress"),
        notes,
    );
    if let Some(summary) = details.summary.as_deref().and_then(nonempty) {
        markdown.push_str("\n\n## Summary\n\n");
        markdown.push_str(summary);
    }
    markdown.push_str("\n\n## Transcript\n\n");
    markdown.push_str(nonempty(&transcript).unwrap_or("_Transcript not available._"));
    Ok(markdown)
}

fn nonempty(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then_some(trimmed)
}

struct ExportDocument<'a> {
    item: &'a LibraryItem,
}

impl ExportDocument<'_> {
    fn render(&self, format: ExportFormat) -> Result<String> {
        match format {
            ExportFormat::Txt => Ok(self.plain_text()),
            ExportFormat::Md => Ok(self.markdown()),
            ExportFormat::Srt => self.subrip(),
            ExportFormat::Vtt => self.webvtt(),
        }
    }

    fn transcript(&self, markdown: bool) -> String {
        speaker_transcript(self.item, markdown)
            .or_else(|| self.item.transcript.clone())
            .unwrap_or_default()
    }

    fn transcription_date(&self) -> &str {
        self.item
            .transcribed_at
            .as_deref()
            .unwrap_or(&self.item.created_at)
    }

    fn plain_text(&self) -> String {
        format!(
            "{}\nTranscribed: {}\n\n{}",
            self.item.name,
            self.transcription_date(),
            self.transcript(false)
        )
    }

    fn markdown(&self) -> String {
        let tags = if self.item.tags.is_empty() {
            "None".to_owned()
        } else {
            self.item.tags.join(", ")
        };
        format!(
            "# {}\n\n**Duration:** {}  \n**Transcribed:** {}  \n**Tags:** {}\n\n---\n\n{}",
            self.item.name,
            display_duration(self.item.duration_seconds),
            self.transcription_date(),
            tags,
            self.transcript(true)
        )
    }

    fn segments(&self) -> Result<&[TranscriptSegment]> {
        self.item
            .segments
            .as_deref()
            .ok_or_else(|| anyhow!("No timestamp segments available"))
    }

    fn subrip(&self) -> Result<String> {
        let mut output = String::new();
        for (index, segment) in self.segments()?.iter().enumerate() {
            let text = match resolved_speaker_name(self.item, segment.speaker_id.as_deref()) {
                Some(name) => format!(
                    "{}: {}",
                    name.replace(['\r', '\n'], " "),
                    segment.text.trim()
                ),
                None => segment.text.trim().to_owned(),
            };
            output.push_str(&(index + 1).to_string());
            output.push('\n');
            output.push_str(&SubtitleCue::new(segment).render(',', &text));
        }
        Ok(output.trim().to_owned())
    }

    fn webvtt(&self) -> Result<String> {
        let mut output = String::from("WEBVTT\n\n");
        for segment in self.segments()? {
            let escaped = escape_vtt_text(segment.text.trim());
            let text = match resolved_speaker_name(self.item, segment.speaker_id.as_deref()) {
                Some(name) => format!("<v {}>{}</v>", escape_vtt_voice(name), escaped),
                None => escaped,
            };
            output.push_str(&SubtitleCue::new(segment).render('.', &text));
        }
        Ok(output.trim().to_owned())
    }
}

struct SubtitleCue {
    start_ms: u64,
    end_ms: u64,
}

impl SubtitleCue {
    fn new(segment: &TranscriptSegment) -> Self {
        Self {
            start_ms: segment.start_ms,
            end_ms: segment.end_ms,
        }
    }

    fn render(&self, separator: char, text: &str) -> String {
        format!(
            "{} --> {}\n{}\n\n",
            subtitle_timestamp(self.start_ms, separator),
            subtitle_timestamp(self.end_ms, separator),
            text
        )
    }
}

fn subtitle_timestamp(milliseconds: u64, separator: char) -> String {
    let seconds_total = milliseconds / 1_000;
    let hours = seconds_total / 3_600;
    let minutes = seconds_total % 3_600 / 60;
    let seconds = seconds_total % 60;
    format!(
        "{hours:02}:{minutes:02}:{seconds:02}{separator}{:03}",
        milliseconds % 1_000
    )
}

fn resolved_speaker_name<'a>(item: &'a LibraryItem, id: Option<&str>) -> Option<&'a str> {
    let id = id?;
    item.speakers
        .as_deref()?
        .iter()
        .find(|speaker| speaker.id == id)
        .map(|speaker| speaker.name.as_str())
}

fn speaker_transcript(item: &LibraryItem, markdown: bool) -> Option<String> {
    let segments = item.segments.as_deref()?;
    let has_speakers = item
        .speakers
        .as_ref()
        .is_some_and(|value| !value.is_empty())
        && segments.iter().any(|segment| segment.speaker_id.is_some());
    if !has_speakers {
        return None;
    }

    let mut output = String::new();
    let mut previous_speaker: Option<Option<&str>> = None;
    for segment in segments {
        let Some(text) = nonempty(&segment.text) else {
            continue;
        };
        let speaker = resolved_speaker_name(item, segment.speaker_id.as_deref());
        if previous_speaker == Some(speaker) {
            output.push(' ');
        } else {
            if !output.is_empty() {
                output.push_str("\n\n");
            }
            if let Some(name) = speaker {
                if markdown {
                    output.push_str(&format!("**{name}:** "));
                } else {
                    output.push_str(&format!("{name}: "));
                }
            }
            previous_speaker = Some(speaker);
        }
        output.push_str(text);
    }
    Some(output)
}

fn escape_vtt_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_vtt_voice(value: &str) -> String {
    value
        .chars()
        .filter(|character| !matches!(character, '\r' | '\n' | '>'))
        .collect()
}

fn display_duration(seconds: f32) -> String {
    if seconds <= 0.0 {
        return "0:00".to_owned();
    }
    let rounded = seconds.round() as u64;
    let hours = rounded / 3_600;
    let minutes = rounded % 3_600 / 60;
    let seconds = rounded % 60;
    if hours == 0 {
        format!("{minutes}:{seconds:02}")
    } else {
        format!("{hours}:{minutes:02}:{seconds:02}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::types::{LibraryItemStatus, MeetingSummaryStatus};

    fn item() -> LibraryItem {
        LibraryItem {
            id: "meeting-1".to_owned(),
            name: "Weekly sync".to_owned(),
            audio_path: "/tmp/meeting.wav".to_owned(),
            source_path: String::new(),
            store_original: false,
            status: LibraryItemStatus::Complete,
            transcript: Some("We approved the release.".to_owned()),
            segments: None,
            words: None,
            duration_seconds: 65.0,
            file_size_bytes: 1,
            original_format: "wav".to_owned(),
            created_at: "2026-07-18T10:00:00Z".to_owned(),
            transcribed_at: Some("2026-07-18T10:02:00Z".to_owned()),
            tags: Vec::new(),
            llm_cleanup_enabled: false,
            denoise_enabled: false,
            speech_model: "local".to_owned(),
            show_timestamps: true,
            detect_speakers: false,
            kind: "meeting".to_owned(),
            speakers: None,
        }
    }

    #[test]
    fn meeting_markdown_keeps_notes_summary_and_transcript_sections() {
        let item = item();
        let details = MeetingDetails {
            library_item_id: item.id.clone(),
            started_at: "2026-07-18T10:00:00Z".to_owned(),
            ended_at: Some("2026-07-18T10:01:05Z".to_owned()),
            notes: "Ship on Monday.".to_owned(),
            notes_revision: 1,
            summary: Some("## Decision\n\nRelease approved.".to_owned()),
            summary_status: MeetingSummaryStatus::Complete,
            summary_error: None,
            system_audio_enabled: true,
            recovered: false,
            calendar_context: None,
            note_markers: Vec::new(),
            live_transcript: Vec::new(),
        };

        let markdown = build_meeting_export_content(&item, &details, ExportFormat::Md).unwrap();
        assert!(markdown.contains("# Weekly sync"));
        assert!(markdown.contains("## Notes\n\nShip on Monday."));
        assert!(markdown.contains("## Summary\n\n## Decision\n\nRelease approved."));
        assert!(markdown.contains("## Transcript\n\nWe approved the release."));
    }

    #[test]
    fn subtitle_clock_uses_the_wire_specific_decimal_separator() {
        assert_eq!(subtitle_timestamp(3_723_045, ','), "01:02:03,045");
        assert_eq!(subtitle_timestamp(3_723_045, '.'), "01:02:03.045");
    }

    #[test]
    fn vtt_escapes_text_and_sanitizes_voice_names() {
        assert_eq!(escape_vtt_text("A & <B>"), "A &amp; &lt;B&gt;");
        assert_eq!(escape_vtt_voice("Alice>\nAdmin"), "AliceAdmin");
    }

    #[test]
    fn duration_rounding_matches_export_contract() {
        assert_eq!(display_duration(-1.0), "0:00");
        assert_eq!(display_duration(65.4), "1:05");
        assert_eq!(display_duration(3_661.0), "1:01:01");
    }

    #[test]
    fn diarization_assigns_ids_by_first_seen_nonempty_label() {
        let input = vec![
            crate::remote_api::DiarizedSegment {
                start: -0.5,
                end: 1.0,
                text: " First ".to_owned(),
                speaker: Some(" B ".to_owned()),
            },
            crate::remote_api::DiarizedSegment {
                start: 1.0,
                end: 2.0,
                text: "Second".to_owned(),
                speaker: Some("A".to_owned()),
            },
            crate::remote_api::DiarizedSegment {
                start: 2.0,
                end: 3.0,
                text: "Third".to_owned(),
                speaker: Some("B".to_owned()),
            },
        ];
        let (segments, speakers) = diarize_segments(&input);
        let speakers = speakers.unwrap();
        assert_eq!(
            speakers
                .iter()
                .map(|speaker| (speaker.id.as_str(), speaker.name.as_str()))
                .collect::<Vec<_>>(),
            vec![("speaker_1", "Speaker 1"), ("speaker_2", "Speaker 2")]
        );
        assert_eq!(segments[0].start_ms, 0);
        assert_eq!(segments[0].text, "First");
        assert_eq!(segments[0].speaker_id.as_deref(), Some("speaker_1"));
        assert_eq!(segments[2].speaker_id.as_deref(), Some("speaker_1"));
    }
}
