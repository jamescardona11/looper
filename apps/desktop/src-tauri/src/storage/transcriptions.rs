use std::{
    collections::{HashMap, HashSet},
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

use anyhow::Result;
use chrono::{DateTime, Local, TimeZone};
use rusqlite::{
    named_params, params,
    types::{FromSql, Type},
    Connection, OptionalExtension, Params, Row,
};
use uuid::Uuid;

use super::{
    ImportedTranscription, LifetimeStats, StorageManager, TranscriptionMetadata,
    TranscriptionRecord, TranscriptionStatus,
};

const RECORD_COLUMNS: &str = concat!(
    "id, timestamp, text, raw_text, audio_path, status, error_message, llm_cleaned, ",
    "speech_model, llm_model, word_count, audio_duration_seconds, synced, mode_id, mode_name, app_id"
);

const INSERT_RECORD: &str = "INSERT INTO transcriptions (
    id, timestamp, text, raw_text, audio_path, status, error_message, llm_cleaned,
    speech_model, llm_model, word_count, audio_duration_seconds, synced, mode_id, mode_name, app_id
) VALUES (
    :id, :timestamp, :text, :raw_text, :audio_path, :status, :error_message, :llm_cleaned,
    :speech_model, :llm_model, :word_count, :audio_duration_seconds, :synced,
    :mode_id, :mode_name, :app_id
)";

const UPDATE_RESULT: &str = "UPDATE transcriptions SET
    text = :text, raw_text = :raw_text, status = :status, error_message = :error_message,
    llm_cleaned = :llm_cleaned, speech_model = :speech_model, llm_model = :llm_model,
    word_count = :word_count, audio_duration_seconds = :audio_duration_seconds,
    synced = :synced, mode_id = :mode_id, mode_name = :mode_name, app_id = :app_id
WHERE id = :id";

impl StorageManager {
    #[allow(clippy::too_many_arguments)]
    pub fn save_transcription(
        &self,
        text: String,
        audio_path: String,
        status: TranscriptionStatus,
        error_message: Option<String>,
        metadata: TranscriptionMetadata,
        id_override: Option<String>,
        timestamp_override: Option<DateTime<Local>>,
    ) -> Result<TranscriptionRecord> {
        let record = assemble_record(
            text,
            None,
            audio_path,
            status,
            error_message,
            false,
            metadata,
            id_override,
            timestamp_override,
        );
        let database = self.connection.lock();
        insert_record(&database, &record)?;
        if matches!(record.status, TranscriptionStatus::Success) {
            add_lifetime_dictation(&database, record.word_count, record.audio_duration_seconds)?;
        }
        Ok(record)
    }

    pub fn save_transcription_with_cleanup(
        &self,
        raw_text: String,
        cleaned_text: String,
        audio_path: String,
        metadata: TranscriptionMetadata,
        id_override: Option<String>,
        timestamp_override: Option<DateTime<Local>>,
    ) -> Result<TranscriptionRecord> {
        let record = assemble_record(
            cleaned_text,
            Some(raw_text),
            audio_path,
            TranscriptionStatus::Success,
            None,
            true,
            metadata,
            id_override,
            timestamp_override,
        );
        let database = self.connection.lock();
        insert_record(&database, &record)?;
        add_lifetime_dictation(&database, record.word_count, record.audio_duration_seconds)?;
        Ok(record)
    }

    pub fn import_transcriptions(&self, items: &[ImportedTranscription]) -> Result<usize> {
        let mut database = self.connection.lock();
        let transaction = database.transaction()?;
        let mut existing_at =
            transaction.prepare("SELECT text FROM transcriptions WHERE timestamp = ?1")?;
        let mut seen = HashSet::<(i64, String)>::new();
        let mut added = 0;

        for input in items {
            let text = input.text.trim();
            if text.is_empty() {
                continue;
            }
            let timestamp = Local
                .timestamp_millis_opt(input.timestamp_ms)
                .single()
                .unwrap_or_else(Local::now);
            let timestamp_ms = timestamp.timestamp_millis();
            if !seen.insert((timestamp_ms, text.to_owned()))
                || transcription_exists(&mut existing_at, timestamp_ms, text)?
            {
                continue;
            }

            let record = imported_record(text, timestamp);
            insert_record(&transaction, &record)?;
            added += 1;
        }
        drop(existing_at);
        transaction.commit()?;
        Ok(added)
    }

    pub fn update_with_llm_cleanup(
        &self,
        id: &str,
        cleaned_text: String,
        llm_model: Option<String>,
    ) -> Result<Option<TranscriptionRecord>> {
        let database = self.connection.lock();
        apply_cleanup(&database, id, &cleaned_text, llm_model.as_deref())
    }

    pub fn revert_to_raw(&self, id: &str) -> Result<Option<TranscriptionRecord>> {
        let database = self.connection.lock();
        restore_raw_text(&database, id)
    }

    pub fn update_transcription_result(
        &self,
        id: &str,
        text: String,
        raw_text: Option<String>,
        status: TranscriptionStatus,
        error_message: Option<String>,
        metadata: TranscriptionMetadata,
    ) -> Result<Option<TranscriptionRecord>> {
        let database = self.connection.lock();
        let Some(previous) = read_record(&database, id)? else {
            return Ok(None);
        };
        let was_successful = matches!(previous.status, TranscriptionStatus::Success);
        database.execute(
            UPDATE_RESULT,
            named_params! {
                ":id": id,
                ":text": text,
                ":raw_text": raw_text,
                ":status": status.as_str(),
                ":error_message": error_message,
                ":llm_cleaned": integer_flag(raw_text.is_some()),
                ":speech_model": metadata.speech_model,
                ":llm_model": metadata.llm_model,
                ":word_count": i64::from(metadata.word_count),
                ":audio_duration_seconds": f64::from(metadata.audio_duration_seconds),
                ":synced": integer_flag(metadata.synced),
                ":mode_id": metadata.mode_id,
                ":mode_name": metadata.mode_name,
                ":app_id": metadata.app_id,
            },
        )?;
        if !was_successful && matches!(status, TranscriptionStatus::Success) {
            add_lifetime_dictation(
                &database,
                metadata.word_count,
                metadata.audio_duration_seconds,
            )?;
        }
        read_record(&database, id)
    }

    pub fn get_all(&self) -> Result<Vec<TranscriptionRecord>> {
        self.query_records(&select_records("ORDER BY timestamp DESC"), [])
    }

    pub fn get_recent_transcriptions(&self, limit: usize) -> Result<Vec<TranscriptionRecord>> {
        if limit == 0 {
            return Ok(Vec::new());
        }
        self.query_records(
            &select_records("WHERE status = ?1 AND text <> '' ORDER BY timestamp DESC LIMIT ?2"),
            params![TranscriptionStatus::Success.as_str(), limit as i64],
        )
    }

    pub fn get_recent_transcriptions_page(
        &self,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<TranscriptionRecord>> {
        if limit == 0 {
            return Ok(Vec::new());
        }
        self.query_records(
            &select_records(
                "WHERE status = ?1 AND text <> '' \
                 ORDER BY timestamp DESC, id DESC LIMIT ?2 OFFSET ?3",
            ),
            params![
                TranscriptionStatus::Success.as_str(),
                limit as i64,
                offset as i64
            ],
        )
    }

    pub fn search_transcriptions(
        &self,
        needle: &str,
        limit: usize,
    ) -> Result<Vec<TranscriptionRecord>> {
        self.search_transcriptions_page(needle, limit, 0)
    }

    pub fn search_transcriptions_page(
        &self,
        needle: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<TranscriptionRecord>> {
        if limit == 0 {
            return Ok(Vec::new());
        }
        let pattern = like_pattern(needle);
        self.query_records(
            &select_records(
                "WHERE status = ?1 AND text <> '' \
                   AND (text LIKE ?2 ESCAPE '\\' OR raw_text LIKE ?2 ESCAPE '\\') \
                 ORDER BY timestamp DESC LIMIT ?3 OFFSET ?4",
            ),
            params![
                TranscriptionStatus::Success.as_str(),
                pattern,
                limit as i64,
                offset as i64
            ],
        )
    }

    pub fn lifetime_stats(&self) -> Result<LifetimeStats> {
        let database = self.connection.lock();
        let stats = database
            .query_row(
                "SELECT words, duration_ms, dictations FROM lifetime_stats WHERE id = 1",
                [],
                |row| {
                    Ok(LifetimeStats {
                        words: nonnegative_integer(row, 0)?,
                        duration_ms: nonnegative_integer(row, 1)?,
                        dictations: nonnegative_integer(row, 2)?,
                    })
                },
            )
            .optional()?;
        Ok(stats.unwrap_or_default())
    }

    pub fn delete(&self, id: &str) -> Result<Option<String>> {
        let database = self.connection.lock();
        let Some(record) = read_record(&database, id)? else {
            return Ok(None);
        };
        database.execute("DELETE FROM transcriptions WHERE id = ?1", [id])?;
        Ok(Some(record.audio_path))
    }

    pub fn count_prunable_before(&self, cutoff_millis: i64) -> Result<u32> {
        let database = self.connection.lock();
        let count = database.query_row(
            "SELECT COUNT(*) FROM transcriptions WHERE timestamp <= ?1",
            [cutoff_millis],
            |row| row.get::<_, i64>(0),
        )?;
        Ok(count.max(0) as u32)
    }

    pub fn prune_before(&self, cutoff_millis: i64) -> Result<Vec<String>> {
        let database = self.connection.lock();
        let mut statement =
            database.prepare("SELECT audio_path FROM transcriptions WHERE timestamp <= ?1")?;
        let rows = statement.query_map([cutoff_millis], |row| row.get::<_, String>(0))?;
        let audio_paths = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        drop(statement);
        database.execute(
            "DELETE FROM transcriptions WHERE timestamp <= ?1",
            [cutoff_millis],
        )?;
        Ok(audio_paths)
    }

    pub fn prune_before_and_remove_files(&self, cutoff_millis: i64) -> Result<u32> {
        let audio_paths = self.prune_before(cutoff_millis)?;
        let count = audio_paths.len() as u32;
        for path in audio_paths.into_iter().map(PathBuf::from) {
            if path.exists() {
                let _ = fs::remove_file(path);
            }
        }
        Ok(count)
    }

    pub fn get_by_id(&self, id: &str) -> Option<TranscriptionRecord> {
        let database = self.connection.lock();
        match read_record(&database, id) {
            Ok(record) => record,
            Err(error) => {
                tracing::error!("Failed to read transcription {id}: {error}");
                None
            }
        }
    }

    pub fn mark_synced(&self, id: &str) -> Result<bool> {
        let database = self.connection.lock();
        let changed =
            database.execute("UPDATE transcriptions SET synced = 1 WHERE id = ?1", [id])?;
        Ok(changed > 0)
    }

    fn query_records<P: Params>(
        &self,
        query: &str,
        parameters: P,
    ) -> Result<Vec<TranscriptionRecord>> {
        let mut records = {
            let database = self.connection.lock();
            let mut statement = database.prepare(query)?;
            let rows = statement.query_map(parameters, decode_record)?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        AudioAvailability::default().resolve(&mut records);
        Ok(records)
    }
}

#[allow(clippy::too_many_arguments)]
fn assemble_record(
    text: String,
    raw_text: Option<String>,
    audio_path: String,
    status: TranscriptionStatus,
    error_message: Option<String>,
    llm_cleaned: bool,
    metadata: TranscriptionMetadata,
    id_override: Option<String>,
    timestamp_override: Option<DateTime<Local>>,
) -> TranscriptionRecord {
    TranscriptionRecord {
        id: id_override.unwrap_or_else(|| Uuid::new_v4().to_string()),
        timestamp: timestamp_override.unwrap_or_else(Local::now),
        text,
        raw_text,
        audio_available: !audio_path.is_empty(),
        audio_path,
        status,
        error_message,
        llm_cleaned,
        speech_model: metadata.speech_model,
        llm_model: metadata.llm_model,
        word_count: metadata.word_count,
        audio_duration_seconds: metadata.audio_duration_seconds,
        synced: metadata.synced,
        mode_id: metadata.mode_id,
        mode_name: metadata.mode_name,
        app_id: metadata.app_id,
    }
}

fn imported_record(text: &str, timestamp: DateTime<Local>) -> TranscriptionRecord {
    assemble_record(
        text.to_owned(),
        None,
        String::new(),
        TranscriptionStatus::Success,
        None,
        false,
        TranscriptionMetadata {
            word_count: count_words(text),
            ..Default::default()
        },
        None,
        Some(timestamp),
    )
}

fn transcription_exists(
    statement: &mut rusqlite::Statement<'_>,
    timestamp_ms: i64,
    text: &str,
) -> Result<bool> {
    let mut rows = statement.query([timestamp_ms])?;
    while let Some(row) = rows.next()? {
        if row.get::<_, String>(0)?.trim() == text {
            return Ok(true);
        }
    }
    Ok(false)
}

fn insert_record(database: &Connection, record: &TranscriptionRecord) -> Result<()> {
    database.execute(
        INSERT_RECORD,
        named_params! {
            ":id": &record.id,
            ":timestamp": record.timestamp.timestamp_millis(),
            ":text": &record.text,
            ":raw_text": &record.raw_text,
            ":audio_path": &record.audio_path,
            ":status": record.status.as_str(),
            ":error_message": &record.error_message,
            ":llm_cleaned": integer_flag(record.llm_cleaned),
            ":speech_model": &record.speech_model,
            ":llm_model": &record.llm_model,
            ":word_count": i64::from(record.word_count),
            ":audio_duration_seconds": f64::from(record.audio_duration_seconds),
            ":synced": integer_flag(record.synced),
            ":mode_id": &record.mode_id,
            ":mode_name": &record.mode_name,
            ":app_id": &record.app_id,
        },
    )?;
    Ok(())
}

fn apply_cleanup(
    database: &Connection,
    id: &str,
    cleaned_text: &str,
    llm_model: Option<&str>,
) -> Result<Option<TranscriptionRecord>> {
    let Some(mut record) = read_record(database, id)? else {
        return Ok(None);
    };
    record.raw_text.get_or_insert_with(|| record.text.clone());
    record.text = cleaned_text.to_owned();
    record.llm_cleaned = true;
    record.llm_model = llm_model.map(str::to_owned);
    record.word_count = count_words(&record.text);
    record.synced = false;
    database.execute(
        "UPDATE transcriptions SET
            text = ?1, raw_text = ?2, llm_cleaned = 1, llm_model = ?3,
            word_count = ?4, synced = 0
         WHERE id = ?5",
        params![
            record.text,
            record.raw_text,
            record.llm_model,
            i64::from(record.word_count),
            id
        ],
    )?;
    Ok(Some(record))
}

fn restore_raw_text(database: &Connection, id: &str) -> Result<Option<TranscriptionRecord>> {
    let Some(mut record) = read_record(database, id)? else {
        return Ok(None);
    };
    let Some(raw_text) = record.raw_text.take() else {
        return Ok(None);
    };
    record.text = raw_text;
    record.llm_cleaned = false;
    record.word_count = count_words(&record.text);
    record.llm_model = None;
    record.synced = false;
    database.execute(
        "UPDATE transcriptions SET
            text = ?1, raw_text = NULL, llm_cleaned = 0, llm_model = NULL,
            word_count = ?2, synced = 0
         WHERE id = ?3",
        params![record.text, i64::from(record.word_count), id],
    )?;
    Ok(Some(record))
}

fn read_record(database: &Connection, id: &str) -> Result<Option<TranscriptionRecord>> {
    let query = select_records("WHERE id = ?1");
    let mut record = database.query_row(&query, [id], decode_record).optional()?;
    if let Some(record) = record.as_mut() {
        AudioAvailability::default().resolve(std::slice::from_mut(record));
    }
    Ok(record)
}

fn decode_record(row: &Row<'_>) -> rusqlite::Result<TranscriptionRecord> {
    let timestamp_ms = column::<i64>(row, "timestamp")?;
    let timestamp = Local
        .timestamp_millis_opt(timestamp_ms)
        .single()
        .ok_or_else(|| invalid_timestamp(timestamp_ms))?;
    let stored_status = column::<String>(row, "status")?;
    let status = TranscriptionStatus::from_str(&stored_status).map_err(invalid_status)?;

    Ok(TranscriptionRecord {
        id: column(row, "id")?,
        timestamp,
        text: column(row, "text")?,
        raw_text: column(row, "raw_text")?,
        audio_path: column(row, "audio_path")?,
        audio_available: false,
        status,
        error_message: column(row, "error_message")?,
        llm_cleaned: required_flag(row, "llm_cleaned")?,
        speech_model: column(row, "speech_model")?,
        llm_model: column(row, "llm_model")?,
        word_count: column::<i64>(row, "word_count")? as u32,
        audio_duration_seconds: column::<f64>(row, "audio_duration_seconds")? as f32,
        synced: legacy_flag(row, "synced"),
        mode_id: legacy_optional(row, "mode_id"),
        mode_name: legacy_optional(row, "mode_name"),
        app_id: legacy_optional(row, "app_id"),
    })
}

fn invalid_timestamp(timestamp_ms: i64) -> rusqlite::Error {
    conversion_error(
        Type::Integer,
        format!("Invalid timestamp stored in database: {timestamp_ms}"),
    )
}

fn invalid_status(message: &'static str) -> rusqlite::Error {
    conversion_error(Type::Text, message.to_owned())
}

fn conversion_error(source: Type, message: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        source,
        Box::new(io::Error::new(io::ErrorKind::InvalidData, message)),
    )
}

fn add_lifetime_dictation(
    database: &Connection,
    word_count: u32,
    duration_seconds: f32,
) -> Result<()> {
    let duration_ms = (duration_seconds.max(0.0) * 1_000.0).round() as i64;
    database.execute(
        "UPDATE lifetime_stats SET
            words = words + ?1, duration_ms = duration_ms + ?2, dictations = dictations + 1
         WHERE id = 1",
        params![i64::from(word_count), duration_ms],
    )?;
    Ok(())
}

fn select_records(suffix: &str) -> String {
    format!("SELECT {RECORD_COLUMNS} FROM transcriptions {suffix}")
}

fn like_pattern(needle: &str) -> String {
    let escaped = needle
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

fn integer_flag(value: bool) -> i64 {
    i64::from(value)
}

fn column<T: FromSql>(row: &Row<'_>, name: &str) -> rusqlite::Result<T> {
    row.get(name)
}

fn required_flag(row: &Row<'_>, name: &str) -> rusqlite::Result<bool> {
    column::<i64>(row, name).map(|value| value == 1)
}

fn legacy_flag(row: &Row<'_>, name: &str) -> bool {
    column::<i64>(row, name).unwrap_or_default() == 1
}

fn legacy_optional(row: &Row<'_>, name: &str) -> Option<String> {
    column::<Option<String>>(row, name).unwrap_or_default()
}

fn nonnegative_integer(row: &Row<'_>, index: usize) -> rusqlite::Result<u64> {
    row.get::<_, i64>(index).map(|value| value.max(0) as u64)
}

fn count_words(text: &str) -> u32 {
    crate::transcribe::count_words(text)
}

#[derive(Default)]
struct AudioAvailability {
    directories: HashMap<PathBuf, HashSet<OsString>>,
}

impl AudioAvailability {
    fn resolve(&mut self, records: &mut [TranscriptionRecord]) {
        for record in records {
            record.audio_available = self.path_exists(&record.audio_path);
        }
    }

    fn path_exists(&mut self, stored: &str) -> bool {
        if stored.is_empty() {
            return false;
        }
        let path = Path::new(stored);
        let (Some(parent), Some(file_name)) = (path.parent(), path.file_name()) else {
            return path.exists();
        };
        self.directories
            .entry(parent.to_path_buf())
            .or_insert_with(|| directory_names(parent))
            .contains(file_name)
    }
}

fn directory_names(directory: &Path) -> HashSet<OsString> {
    fs::read_dir(directory)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok().map(|value| value.file_name()))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    struct TestStore {
        directory: PathBuf,
        storage: StorageManager,
    }

    impl TestStore {
        fn new() -> Self {
            let directory = std::env::temp_dir().join(format!("looper-storage-{}", Uuid::new_v4()));
            fs::create_dir_all(&directory).unwrap();
            let storage = StorageManager::new(directory.join("history.sqlite3")).unwrap();
            Self { directory, storage }
        }
    }

    impl Drop for TestStore {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.directory);
        }
    }

    fn metadata(words: u32, seconds: f32) -> TranscriptionMetadata {
        TranscriptionMetadata {
            speech_model: "parakeet".to_owned(),
            word_count: words,
            audio_duration_seconds: seconds,
            ..Default::default()
        }
    }

    #[test]
    fn successful_transition_updates_stats_once_and_round_trips_metadata() {
        let store = TestStore::new();
        let failed = store
            .storage
            .save_transcription(
                "retry later".to_owned(),
                String::new(),
                TranscriptionStatus::Error,
                Some("offline".to_owned()),
                metadata(2, 1.5),
                Some("job-1".to_owned()),
                None,
            )
            .unwrap();
        assert_eq!(store.storage.lifetime_stats().unwrap().dictations, 0);

        let completed = store
            .storage
            .update_transcription_result(
                &failed.id,
                "retry worked".to_owned(),
                None,
                TranscriptionStatus::Success,
                None,
                metadata(2, 1.5),
            )
            .unwrap()
            .unwrap();
        assert_eq!(completed.speech_model, "parakeet");
        assert_eq!(store.storage.lifetime_stats().unwrap().dictations, 1);

        store
            .storage
            .update_transcription_result(
                &failed.id,
                "still complete".to_owned(),
                None,
                TranscriptionStatus::Success,
                None,
                metadata(2, 1.5),
            )
            .unwrap();
        assert_eq!(store.storage.lifetime_stats().unwrap().dictations, 1);
    }

    #[test]
    fn import_is_atomic_and_deduplicates_trimmed_timestamp_pairs() {
        let store = TestStore::new();
        let added = store
            .storage
            .import_transcriptions(&[
                ImportedTranscription {
                    text: "  same words  ".to_owned(),
                    timestamp_ms: 1_700_000_000_000,
                },
                ImportedTranscription {
                    text: "same words".to_owned(),
                    timestamp_ms: 1_700_000_000_000,
                },
                ImportedTranscription {
                    text: "  ".to_owned(),
                    timestamp_ms: 1_700_000_000_001,
                },
            ])
            .unwrap();
        assert_eq!(added, 1);
        assert_eq!(store.storage.get_all().unwrap().len(), 1);
        assert_eq!(
            store
                .storage
                .import_transcriptions(&[ImportedTranscription {
                    text: "same words".to_owned(),
                    timestamp_ms: 1_700_000_000_000,
                }])
                .unwrap(),
            0
        );
    }

    #[test]
    fn cleanup_revert_and_search_keep_raw_text_and_literal_wildcards() {
        let store = TestStore::new();
        store
            .storage
            .save_transcription(
                "value 100%_literal".to_owned(),
                String::new(),
                TranscriptionStatus::Success,
                None,
                metadata(2, 0.5),
                Some("literal".to_owned()),
                None,
            )
            .unwrap();
        store.storage.mark_synced("literal").unwrap();
        let cleaned = store
            .storage
            .update_with_llm_cleanup(
                "literal",
                "clean version".to_owned(),
                Some("model".to_owned()),
            )
            .unwrap()
            .unwrap();
        assert_eq!(cleaned.raw_text.as_deref(), Some("value 100%_literal"));
        assert!(!cleaned.synced);
        assert_eq!(
            store.storage.search_transcriptions("%_", 10).unwrap().len(),
            1
        );

        let reverted = store.storage.revert_to_raw("literal").unwrap().unwrap();
        assert_eq!(reverted.text, "value 100%_literal");
        assert!(reverted.raw_text.is_none());
        assert!(!reverted.llm_cleaned);
        assert!(store.storage.revert_to_raw("literal").unwrap().is_none());
    }

    #[test]
    fn recent_page_and_prune_preserve_order_cutoff_and_returned_paths() {
        let store = TestStore::new();
        for (id, timestamp, audio) in [
            ("first", 1_700_000_000_000, "/tmp/first.wav"),
            ("second", 1_700_000_000_100, "/tmp/second.wav"),
            ("third", 1_700_000_000_200, "/tmp/third.wav"),
        ] {
            store
                .storage
                .save_transcription(
                    id.to_owned(),
                    audio.to_owned(),
                    TranscriptionStatus::Success,
                    None,
                    metadata(1, 0.1),
                    Some(id.to_owned()),
                    Local.timestamp_millis_opt(timestamp).single(),
                )
                .unwrap();
        }
        let page = store.storage.get_recent_transcriptions_page(2, 1).unwrap();
        assert_eq!(
            page.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(),
            vec!["second", "first"]
        );
        assert_eq!(
            store
                .storage
                .count_prunable_before(1_700_000_000_100)
                .unwrap(),
            2
        );
        assert_eq!(
            store.storage.prune_before(1_700_000_000_100).unwrap(),
            vec!["/tmp/first.wav", "/tmp/second.wav"]
        );
        assert_eq!(store.storage.get_all().unwrap()[0].id, "third");
    }

    #[test]
    fn status_parser_keeps_case_folding_and_public_error() {
        assert_eq!(
            TranscriptionStatus::from_str("SUCCESS"),
            Ok(TranscriptionStatus::Success)
        );
        assert_eq!(
            TranscriptionStatus::from_str("error"),
            Ok(TranscriptionStatus::Error)
        );
        assert_eq!(
            TranscriptionStatus::from_str("pending"),
            Err("Unknown transcription status")
        );
    }
}
