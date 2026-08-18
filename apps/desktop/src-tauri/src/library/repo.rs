use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::library::{
    LibraryItem, LibraryTranslation, LibraryWatchFolder, MeetingDetails, MeetingNoteMarker,
    MeetingNotesUpdate, MeetingSummaryStatus,
};

mod items;

pub(crate) use items::{
    delete_library_item, get_library_item, get_library_items_page, get_library_tags,
    get_recoverable_library_items, insert_library_item, update_library_item,
};

pub(crate) fn upsert_library_watch_folder(
    conn: &Connection,
    folder: &LibraryWatchFolder,
) -> Result<()> {
    conn.execute(
        "INSERT INTO library_watch_folders (
            path, model_key, store_original, llm_cleanup_enabled, denoise_enabled,
            show_timestamps, detect_speakers, enabled
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(path) DO UPDATE SET
            model_key = excluded.model_key,
            store_original = excluded.store_original,
            llm_cleanup_enabled = excluded.llm_cleanup_enabled,
            denoise_enabled = excluded.denoise_enabled,
            show_timestamps = excluded.show_timestamps,
            detect_speakers = excluded.detect_speakers,
            enabled = excluded.enabled",
        params![
            folder.path,
            folder.options.model_key,
            folder.options.store_original as i64,
            folder.options.llm_cleanup_enabled as i64,
            folder.options.denoise_enabled as i64,
            folder.options.show_timestamps as i64,
            folder.options.detect_speakers as i64,
            folder.enabled as i64,
        ],
    )?;
    Ok(())
}

pub(crate) fn get_library_watch_folders(conn: &Connection) -> Result<Vec<LibraryWatchFolder>> {
    let mut statement = conn.prepare(
        "SELECT path, model_key, store_original, llm_cleanup_enabled, denoise_enabled,
                show_timestamps, detect_speakers, enabled
         FROM library_watch_folders ORDER BY path",
    )?;
    let folders = statement
        .query_map([], |row| {
            Ok(LibraryWatchFolder {
                path: row.get("path")?,
                options: crate::library::LibraryImportOptions {
                    model_key: row.get("model_key")?,
                    store_original: row.get::<_, i64>("store_original")? == 1,
                    llm_cleanup_enabled: row.get::<_, i64>("llm_cleanup_enabled")? == 1,
                    denoise_enabled: row.get::<_, i64>("denoise_enabled")? == 1,
                    show_timestamps: row.get::<_, i64>("show_timestamps")? == 1,
                    detect_speakers: row.get::<_, i64>("detect_speakers")? == 1,
                },
                enabled: row.get::<_, i64>("enabled")? == 1,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(folders)
}

pub(crate) fn remove_library_watch_folder(conn: &Connection, path: &str) -> Result<()> {
    conn.execute("DELETE FROM library_watch_folders WHERE path = ?1", [path])?;
    Ok(())
}

pub(crate) fn claim_library_watch_file(
    conn: &Connection,
    path: &str,
    fingerprint: &str,
    library_item_id: &str,
) -> Result<bool> {
    conn.execute(
        "UPDATE library_watch_files SET completed = 1
         WHERE path = ?1 AND fingerprint = ?2 AND completed = 0
           AND library_item_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM library_items WHERE id = library_watch_files.library_item_id
           )",
        params![path, fingerprint],
    )?;
    conn.execute(
        "DELETE FROM library_watch_files
         WHERE path = ?1 AND fingerprint = ?2 AND completed = 0
           AND (
             library_item_id IS NULL OR NOT EXISTS (
               SELECT 1 FROM library_items WHERE id = library_watch_files.library_item_id
             )
           )",
        params![path, fingerprint],
    )?;
    Ok(conn.execute(
        "INSERT OR IGNORE INTO library_watch_files (
            path, fingerprint, library_item_id, completed
         ) VALUES (?1, ?2, ?3, 0)",
        params![path, fingerprint, library_item_id],
    )? == 1)
}

pub(crate) fn complete_library_watch_file(
    conn: &Connection,
    path: &str,
    fingerprint: &str,
    library_item_id: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE library_watch_files SET library_item_id = ?3, completed = 1
         WHERE path = ?1 AND fingerprint = ?2 AND library_item_id = ?3",
        params![path, fingerprint, library_item_id],
    )?;
    Ok(())
}

pub(crate) fn release_library_watch_file(
    conn: &Connection,
    path: &str,
    fingerprint: &str,
    library_item_id: &str,
) -> Result<()> {
    conn.execute(
        "DELETE FROM library_watch_files
         WHERE path = ?1 AND fingerprint = ?2 AND library_item_id = ?3 AND completed = 0",
        params![path, fingerprint, library_item_id],
    )?;
    Ok(())
}

pub(crate) fn upsert_library_translation(
    conn: &Connection,
    translation: &LibraryTranslation,
) -> Result<()> {
    conn.execute(
        "INSERT INTO library_translations (item_id, language, text, model, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(item_id, language) DO UPDATE SET
           text = excluded.text,
           model = excluded.model,
           created_at = excluded.created_at",
        params![
            translation.item_id,
            translation.language,
            translation.text,
            translation.model,
            translation.created_at,
        ],
    )?;
    Ok(())
}

pub(crate) fn get_library_translations(
    conn: &Connection,
    item_id: &str,
) -> Result<Vec<LibraryTranslation>> {
    let mut statement = conn.prepare(
        "SELECT item_id, language, text, model, created_at
         FROM library_translations
         WHERE item_id = ?1
         ORDER BY language",
    )?;
    let translations = statement
        .query_map([item_id], |row| {
            Ok(LibraryTranslation {
                item_id: row.get("item_id")?,
                language: row.get("language")?,
                text: row.get("text")?,
                model: row.get("model")?,
                created_at: row.get("created_at")?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(translations)
}

pub(crate) fn delete_library_translation(
    conn: &Connection,
    item_id: &str,
    language: &str,
) -> Result<()> {
    conn.execute(
        "DELETE FROM library_translations WHERE item_id = ?1 AND language = ?2",
        params![item_id, language],
    )?;
    Ok(())
}

pub(crate) fn insert_meeting_item(
    conn: &mut Connection,
    item: LibraryItem,
    details: &MeetingDetails,
) -> Result<LibraryItem> {
    let tx = conn.transaction()?;
    let item = insert_library_item(&tx, item)?;
    tx.execute(
        "INSERT INTO meeting_details (
            library_item_id,
            started_at,
            ended_at,
            notes,
            notes_revision,
            summary,
            summary_status,
            summary_error,
            system_audio_enabled,
            recovered,
            calendar_context,
            note_markers,
            live_transcript
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            details.library_item_id,
            details.started_at,
            details.ended_at,
            details.notes,
            details.notes_revision as i64,
            details.summary,
            details.summary_status.as_str(),
            details.summary_error,
            if details.system_audio_enabled { 1 } else { 0 },
            if details.recovered { 1 } else { 0 },
            details
                .calendar_context
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
            serde_json::to_string(&details.note_markers)?,
            serde_json::to_string(&details.live_transcript)?,
        ],
    )?;
    tx.commit()?;
    Ok(item)
}

pub(crate) fn get_meeting_details(
    conn: &Connection,
    library_item_id: &str,
) -> Result<Option<MeetingDetails>> {
    conn.query_row(
        "SELECT library_item_id, started_at, ended_at, notes, notes_revision,
                summary, summary_status, summary_error, system_audio_enabled, recovered,
                calendar_context, note_markers, live_transcript
         FROM meeting_details WHERE library_item_id = ?1",
        params![library_item_id],
        meeting_details_from_row,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn append_meeting_transcript_segment(
    conn: &Connection,
    library_item_id: &str,
    segment: super::types::MeetingTranscriptSegment,
) -> Result<Option<MeetingDetails>> {
    let Some(mut details) = get_meeting_details(conn, library_item_id)? else {
        return Ok(None);
    };
    if details.ended_at.is_some() {
        anyhow::bail!("Meeting recording has already ended.");
    }
    if segment.text.trim().is_empty() {
        return Ok(Some(details));
    }
    details.live_transcript.push(segment);
    details
        .live_transcript
        .sort_by_key(|entry| (entry.start_ms, entry.end_ms));
    conn.execute(
        "UPDATE meeting_details SET live_transcript = ?1 WHERE library_item_id = ?2",
        params![
            serde_json::to_string(&details.live_transcript)?,
            library_item_id
        ],
    )?;
    get_meeting_details(conn, library_item_id)
}

pub(crate) fn append_meeting_note_marker(
    conn: &Connection,
    library_item_id: &str,
    marker: MeetingNoteMarker,
) -> Result<Option<MeetingDetails>> {
    let Some(mut details) = get_meeting_details(conn, library_item_id)? else {
        return Ok(None);
    };
    if details.ended_at.is_some() {
        anyhow::bail!("Meeting recording has already ended.");
    }
    details.note_markers.push(marker);
    conn.execute(
        "UPDATE meeting_details SET note_markers = ?1 WHERE library_item_id = ?2",
        params![
            serde_json::to_string(&details.note_markers)?,
            library_item_id
        ],
    )?;
    get_meeting_details(conn, library_item_id)
}

pub(crate) fn update_meeting_notes(
    conn: &Connection,
    library_item_id: &str,
    update: MeetingNotesUpdate,
) -> Result<Option<MeetingDetails>> {
    let changed = conn.execute(
        "UPDATE meeting_details
         SET notes = ?1, notes_revision = notes_revision + 1
         WHERE library_item_id = ?2 AND notes_revision = ?3",
        params![
            update.notes,
            library_item_id,
            update.expected_revision as i64
        ],
    )?;
    if changed == 0 && get_meeting_details(conn, library_item_id)?.is_some() {
        anyhow::bail!("Meeting notes changed in another view. Reload and try again.");
    }
    get_meeting_details(conn, library_item_id)
}

pub(crate) fn finish_meeting_details(
    conn: &Connection,
    library_item_id: &str,
    ended_at: &str,
    recovered: bool,
) -> Result<Option<MeetingDetails>> {
    conn.execute(
        "UPDATE meeting_details
         SET ended_at = ?1, recovered = CASE WHEN ?2 = 1 THEN 1 ELSE recovered END
         WHERE library_item_id = ?3",
        params![ended_at, if recovered { 1 } else { 0 }, library_item_id],
    )?;
    get_meeting_details(conn, library_item_id)
}

pub(crate) fn update_meeting_summary(
    conn: &Connection,
    library_item_id: &str,
    status: MeetingSummaryStatus,
    summary: Option<&str>,
    error: Option<&str>,
) -> Result<Option<MeetingDetails>> {
    conn.execute(
        "UPDATE meeting_details
         SET summary_status = ?1, summary = ?2, summary_error = ?3
         WHERE library_item_id = ?4",
        params![status.as_str(), summary, error, library_item_id],
    )?;
    get_meeting_details(conn, library_item_id)
}

pub(crate) fn claim_meeting_summary(
    conn: &Connection,
    library_item_id: &str,
) -> Result<Option<MeetingDetails>> {
    let changed = conn.execute(
        "UPDATE meeting_details
         SET summary_status = 'running', summary = NULL, summary_error = NULL
         WHERE library_item_id = ?1 AND summary_status != 'running'",
        params![library_item_id],
    )?;
    if changed == 0 {
        return Ok(None);
    }
    get_meeting_details(conn, library_item_id)
}

fn meeting_details_from_row(row: &Row<'_>) -> rusqlite::Result<MeetingDetails> {
    let summary_status: String = row.get("summary_status")?;
    let note_markers_json: String = row.get("note_markers")?;
    let live_transcript_json: String = row.get("live_transcript")?;
    let calendar_context_json: Option<String> = row.get("calendar_context")?;
    Ok(MeetingDetails {
        library_item_id: row.get("library_item_id")?,
        started_at: row.get("started_at")?,
        ended_at: row.get("ended_at")?,
        notes: row.get("notes")?,
        notes_revision: row.get::<_, i64>("notes_revision")?.max(0) as u64,
        summary: row.get("summary")?,
        summary_status: MeetingSummaryStatus::from_str(&summary_status),
        summary_error: row.get("summary_error")?,
        system_audio_enabled: row.get::<_, i64>("system_audio_enabled")? == 1,
        recovered: row.get::<_, i64>("recovered")? == 1,
        calendar_context: calendar_context_json
            .as_deref()
            .and_then(|value| serde_json::from_str(value).ok()),
        note_markers: serde_json::from_str(&note_markers_json).unwrap_or_default(),
        live_transcript: serde_json::from_str(&live_transcript_json).unwrap_or_default(),
    })
}
