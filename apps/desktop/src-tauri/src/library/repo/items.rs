use std::{collections::BTreeSet, path::Path};

use anyhow::Result;
use rusqlite::{
    named_params, params_from_iter,
    types::{FromSql, ToSql},
    Connection, OptionalExtension, Row,
};
use serde::{de::DeserializeOwned, Serialize};

use crate::library::{
    LibraryFilter, LibraryItem, LibraryItemPatch, LibraryItemStatus, Speaker, TranscriptSegment,
};

const ITEM_COLUMNS: &str = concat!(
    "id, name, audio_path, source_path, store_original, status, progress, error_message, ",
    "transcript, segments, words, duration_seconds, file_size_bytes, original_format, ",
    "created_at, transcribed_at, tags, llm_cleanup_enabled, denoise_enabled, speech_model, ",
    "show_timestamps, detect_speakers, kind, speakers"
);

const INSERT_ITEM: &str = "INSERT INTO library_items (
    id, name, audio_path, source_path, store_original, status, progress, error_message,
    transcript, segments, words, duration_seconds, file_size_bytes, original_format,
    created_at, transcribed_at, tags, llm_cleanup_enabled, denoise_enabled, speech_model,
    show_timestamps, detect_speakers, kind, speakers
) VALUES (
    :id, :name, :audio_path, :source_path, :store_original, :status, :progress, :error_message,
    :transcript, :segments, :words, :duration_seconds, :file_size_bytes, :original_format,
    :created_at, :transcribed_at, :tags, :llm_cleanup_enabled, :denoise_enabled, :speech_model,
    :show_timestamps, :detect_speakers, :kind, :speakers
)";

const UPDATE_ITEM: &str = "UPDATE library_items SET
    name = :name, audio_path = :audio_path, source_path = :source_path,
    store_original = :store_original, status = :status, progress = :progress,
    error_message = :error_message, transcript = :transcript, segments = :segments,
    words = :words, duration_seconds = :duration_seconds, file_size_bytes = :file_size_bytes,
    original_format = :original_format, created_at = :created_at,
    transcribed_at = :transcribed_at, tags = :tags,
    llm_cleanup_enabled = :llm_cleanup_enabled, denoise_enabled = :denoise_enabled,
    speech_model = :speech_model, show_timestamps = :show_timestamps,
    detect_speakers = :detect_speakers, kind = :kind, speakers = :speakers
WHERE id = :id";

struct EncodedItem {
    status: String,
    progress: f32,
    error: Option<String>,
    segments: Option<String>,
    words: Option<String>,
    tags: String,
    speakers: Option<String>,
}

impl EncodedItem {
    fn capture(item: &LibraryItem) -> Result<Self> {
        let (status, progress, error) = item.status.as_fields();
        Ok(Self {
            status,
            progress,
            error,
            segments: encode_segments(&item.segments)?,
            words: encode_segments(&item.words)?,
            tags: serde_json::to_string(&item.tags)?,
            speakers: encode_speakers(&item.speakers)?,
        })
    }
}

pub(crate) fn insert_library_item(database: &Connection, item: LibraryItem) -> Result<LibraryItem> {
    write_item(database, INSERT_ITEM, &item)?;
    Ok(item)
}

pub(crate) fn get_library_item(
    database: &Connection,
    library_root: &Path,
    identifier: &str,
) -> Result<Option<LibraryItem>> {
    read_item(database, library_root, identifier)
}

pub(crate) fn get_library_items_page(
    database: &Connection,
    library_root: &Path,
    filter: LibraryFilter,
    limit: usize,
    offset: usize,
) -> Result<(Vec<LibraryItem>, bool)> {
    let mut plan = FilterPlan::new(filter);
    let statement_text = select_items(&format!(
        "{} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        plan.where_sql()
    ));
    plan.argument(limit.saturating_add(1) as i64);
    plan.argument(offset as i64);

    let mut statement = database.prepare(&statement_text)?;
    let mapped = statement.query_map(params_from_iter(plan.arguments.iter()), |row| {
        decode_item(library_root, row)
    })?;
    let mut page = mapped.collect::<rusqlite::Result<Vec<_>>>()?;
    let has_more = page.len() > limit;
    page.truncate(limit);
    Ok((page, has_more))
}

pub(crate) fn get_recoverable_library_items(
    database: &Connection,
    library_root: &Path,
) -> Result<Vec<LibraryItem>> {
    let query = select_items(
        "WHERE status IN ('recording', 'pending', 'importing', 'transcribing', 'cancelling') \
         ORDER BY created_at ASC",
    );
    let mut statement = database.prepare(&query)?;
    let rows = statement.query_map([], |row| decode_item(library_root, row))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub(crate) fn update_library_item(
    database: &mut Connection,
    library_root: &Path,
    identifier: &str,
    patch: LibraryItemPatch,
) -> Result<Option<LibraryItem>> {
    let transaction = database.transaction()?;
    let Some(mut current) = read_item(&transaction, library_root, identifier)? else {
        return Ok(None);
    };
    apply_patch(&mut current, patch);
    write_item(&transaction, UPDATE_ITEM, &current)?;
    transaction.commit()?;
    Ok(Some(current))
}

pub(crate) fn delete_library_item(
    database: &Connection,
    library_root: &Path,
    identifier: &str,
) -> Result<Option<String>> {
    let Some(existing) = read_item(database, library_root, identifier)? else {
        return Ok(None);
    };
    database.execute(
        "DELETE FROM library_translations WHERE item_id = ?1",
        [identifier],
    )?;
    database.execute("DELETE FROM library_items WHERE id = ?1", [identifier])?;
    Ok(Some(existing.audio_path))
}

pub(crate) fn get_library_tags(database: &Connection) -> Result<Vec<String>> {
    let mut statement = database.prepare("SELECT tags FROM library_items")?;
    let documents = statement.query_map([], |row| row.get::<_, String>(0))?;
    let mut unique = BTreeSet::new();
    for document in documents {
        let decoded: Vec<String> = serde_json::from_str(&document?).unwrap_or_default();
        unique.extend(
            decoded
                .into_iter()
                .map(|tag| tag.trim().to_owned())
                .filter(|tag| !tag.is_empty()),
        );
    }
    Ok(unique.into_iter().collect())
}

fn write_item(database: &Connection, sql: &str, item: &LibraryItem) -> Result<()> {
    let encoded = EncodedItem::capture(item)?;
    database.execute(
        sql,
        named_params! {
            ":id": &item.id,
            ":name": &item.name,
            ":audio_path": &item.audio_path,
            ":source_path": &item.source_path,
            ":store_original": integer_flag(item.store_original),
            ":status": &encoded.status,
            ":progress": encoded.progress,
            ":error_message": &encoded.error,
            ":transcript": &item.transcript,
            ":segments": &encoded.segments,
            ":words": &encoded.words,
            ":duration_seconds": item.duration_seconds,
            ":file_size_bytes": item.file_size_bytes as i64,
            ":original_format": &item.original_format,
            ":created_at": &item.created_at,
            ":transcribed_at": &item.transcribed_at,
            ":tags": &encoded.tags,
            ":llm_cleanup_enabled": integer_flag(item.llm_cleanup_enabled),
            ":denoise_enabled": integer_flag(item.denoise_enabled),
            ":speech_model": &item.speech_model,
            ":show_timestamps": integer_flag(item.show_timestamps),
            ":detect_speakers": integer_flag(item.detect_speakers),
            ":kind": &item.kind,
            ":speakers": &encoded.speakers,
        },
    )?;
    Ok(())
}

fn read_item(
    database: &Connection,
    library_root: &Path,
    identifier: &str,
) -> Result<Option<LibraryItem>> {
    let query = select_items("WHERE id = ?1");
    database
        .query_row(&query, [identifier], |row| decode_item(library_root, row))
        .optional()
        .map_err(Into::into)
}

fn decode_item(library_root: &Path, row: &Row<'_>) -> rusqlite::Result<LibraryItem> {
    let status_name = column::<String>(row, "status")?;
    let progress = row.get::<_, f64>("progress").unwrap_or_default() as f32;
    let failure = column::<Option<String>>(row, "error_message")?;
    Ok(LibraryItem {
        id: column(row, "id")?,
        name: column(row, "name")?,
        audio_path: relocate_audio(library_root, column(row, "audio_path")?),
        source_path: column(row, "source_path")?,
        store_original: required_flag(row, "store_original")?,
        status: LibraryItemStatus::from_fields(&status_name, progress, failure),
        transcript: column(row, "transcript")?,
        segments: decode_segments(row.get::<_, Option<String>>("segments")?),
        words: decode_segments(row.get::<_, Option<String>>("words").ok().flatten()),
        duration_seconds: column::<f64>(row, "duration_seconds")? as f32,
        file_size_bytes: column::<i64>(row, "file_size_bytes")? as u64,
        original_format: column(row, "original_format")?,
        created_at: column(row, "created_at")?,
        transcribed_at: column(row, "transcribed_at")?,
        tags: json_or_default(column(row, "tags")?),
        llm_cleanup_enabled: required_flag(row, "llm_cleanup_enabled")?,
        denoise_enabled: legacy_flag(row, "denoise_enabled"),
        speech_model: column(row, "speech_model")?,
        show_timestamps: required_flag(row, "show_timestamps")?,
        detect_speakers: legacy_flag(row, "detect_speakers"),
        kind: row
            .get::<_, Option<String>>("kind")
            .ok()
            .flatten()
            .unwrap_or_else(crate::library::default_item_kind),
        speakers: decode_speakers(row.get::<_, Option<String>>("speakers").ok().flatten()),
    })
}

fn apply_patch(item: &mut LibraryItem, patch: LibraryItemPatch) {
    let LibraryItemPatch {
        name,
        audio_path,
        transcript,
        segments,
        words,
        tags,
        status,
        llm_cleanup_enabled,
        denoise_enabled,
        speech_model,
        transcribed_at,
        show_timestamps,
        detect_speakers,
        duration_seconds,
        file_size_bytes,
        kind,
        speakers,
    } = patch;

    replace_when_present(&mut item.name, name);
    replace_when_present(&mut item.audio_path, audio_path);
    set_some_when_present(&mut item.transcript, transcript);
    set_some_when_present(&mut item.segments, segments);
    set_some_when_present(&mut item.words, words);
    replace_when_present(&mut item.tags, tags);
    replace_when_present(&mut item.status, status);
    replace_when_present(&mut item.llm_cleanup_enabled, llm_cleanup_enabled);
    replace_when_present(&mut item.denoise_enabled, denoise_enabled);
    replace_when_present(&mut item.speech_model, speech_model);
    set_some_when_present(&mut item.transcribed_at, transcribed_at);
    replace_when_present(&mut item.show_timestamps, show_timestamps);
    replace_when_present(&mut item.detect_speakers, detect_speakers);
    replace_when_present(&mut item.duration_seconds, duration_seconds);
    replace_when_present(&mut item.file_size_bytes, file_size_bytes);
    replace_when_present(&mut item.kind, kind);
    replace_when_present(&mut item.speakers, speakers);
}

fn replace_when_present<T>(target: &mut T, candidate: Option<T>) {
    if let Some(value) = candidate {
        *target = value;
    }
}

fn set_some_when_present<T>(target: &mut Option<T>, candidate: Option<T>) {
    if let Some(value) = candidate {
        *target = Some(value);
    }
}

fn select_items(suffix: &str) -> String {
    format!("SELECT {ITEM_COLUMNS} FROM library_items {suffix}")
}

fn integer_flag(enabled: bool) -> i64 {
    i64::from(enabled)
}

fn column<T: FromSql>(row: &Row<'_>, name: &str) -> rusqlite::Result<T> {
    row.get(name)
}

fn required_flag(row: &Row<'_>, name: &str) -> rusqlite::Result<bool> {
    column::<i64>(row, name).map(|stored| stored == 1)
}

fn legacy_flag(row: &Row<'_>, name: &str) -> bool {
    column::<i64>(row, name)
        .map(|stored| stored == 1)
        .unwrap_or(false)
}

fn encode_optional_json<T: Serialize>(value: &Option<T>) -> Result<Option<String>> {
    value
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(Into::into)
}

fn encode_segments(value: &Option<Vec<TranscriptSegment>>) -> Result<Option<String>> {
    encode_optional_json(value)
}

fn encode_speakers(value: &Option<Vec<Speaker>>) -> Result<Option<String>> {
    encode_optional_json(value)
}

fn optional_json<T: DeserializeOwned>(document: Option<String>) -> Option<T> {
    document
        .filter(|raw| !raw.trim().is_empty())
        .and_then(|raw| serde_json::from_str(&raw).ok())
}

fn decode_segments(document: Option<String>) -> Option<Vec<TranscriptSegment>> {
    optional_json(document)
}

fn decode_speakers(document: Option<String>) -> Option<Vec<Speaker>> {
    optional_json(document)
}

fn json_or_default<T: DeserializeOwned + Default>(document: String) -> T {
    serde_json::from_str(&document).unwrap_or_default()
}

fn relocate_audio(library_root: &Path, stored: String) -> String {
    let original = Path::new(&stored);
    if original.exists() {
        return stored;
    }
    let fallback = original
        .parent()
        .and_then(Path::file_name)
        .zip(original.file_name())
        .map(|(folder, file)| library_root.join(folder).join(file));
    match fallback.filter(|candidate| candidate.exists()) {
        Some(candidate) => candidate.display().to_string(),
        None => stored,
    }
}

struct FilterPlan {
    predicates: Vec<String>,
    arguments: Vec<Box<dyn ToSql>>,
}

impl FilterPlan {
    fn new(filter: LibraryFilter) -> Self {
        let mut plan = Self {
            predicates: Vec::new(),
            arguments: Vec::new(),
        };
        if let Some(search) = normalized(filter.search) {
            plan.search(search);
        }
        if let Some(status) = normalized(filter.status) {
            plan.status(status);
        }
        if let Some(tag) = normalized(filter.tag) {
            plan.tag(tag);
        }
        if let Some(days) = filter.since_days {
            let earliest = chrono::Utc::now() - chrono::Duration::days(i64::from(days));
            plan.predicate("created_at >= ?");
            plan.argument(earliest.to_rfc3339());
        }
        plan
    }

    fn search(&mut self, request: String) {
        let (text, tags) = split_search(&request);
        if !text.is_empty() {
            self.predicate(
                "(name LIKE ? OR transcript LIKE ? OR EXISTS (
                    SELECT 1 FROM meeting_details AS meeting
                    WHERE meeting.library_item_id = library_items.id
                      AND (meeting.notes LIKE ? OR meeting.summary LIKE ? OR meeting.live_transcript LIKE ?)
                ))",
            );
            let pattern = format!("%{text}%");
            for _ in 0..5 {
                self.argument(pattern.clone());
            }
        }
        for tag in tags {
            self.tag(tag);
        }
    }

    fn status(&mut self, status: String) {
        if status == "active" {
            self.predicate(
                "status IN ('recording', 'pending', 'importing', 'transcribing', 'cancelling')",
            );
        } else {
            self.predicate("status = ?");
            self.argument(status);
        }
    }

    fn tag(&mut self, tag: String) {
        self.predicate("tags LIKE ?");
        self.argument(format!("%\"{tag}\"%"));
    }

    fn predicate(&mut self, sql: impl Into<String>) {
        self.predicates.push(sql.into());
    }

    fn argument(&mut self, value: impl ToSql + 'static) {
        self.arguments.push(Box::new(value));
    }

    fn where_sql(&self) -> String {
        match self.predicates.is_empty() {
            true => String::new(),
            false => format!("WHERE {}", self.predicates.join(" AND ")),
        }
    }
}

fn normalized(value: Option<String>) -> Option<String> {
    value
        .map(|raw| raw.trim().to_owned())
        .filter(|raw| !raw.is_empty())
}

fn split_search(request: &str) -> (String, Vec<String>) {
    let mut tags = Vec::new();
    let mut text = Vec::new();
    for token in request.split_whitespace() {
        if let Some(tag) = token.strip_prefix('#') {
            if !tag.is_empty() {
                tags.push(tag.to_owned());
            }
            continue;
        }
        text.push(token);
    }
    (text.join(" "), tags)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let database = Connection::open_in_memory().unwrap();
        database
            .execute_batch(
                "CREATE TABLE library_items (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, audio_path TEXT NOT NULL,
                    source_path TEXT NOT NULL, store_original INTEGER NOT NULL,
                    status TEXT NOT NULL, progress REAL, error_message TEXT, transcript TEXT,
                    segments TEXT, words TEXT, duration_seconds REAL NOT NULL,
                    file_size_bytes INTEGER NOT NULL, original_format TEXT NOT NULL,
                    created_at TEXT NOT NULL, transcribed_at TEXT, tags TEXT NOT NULL,
                    llm_cleanup_enabled INTEGER NOT NULL, denoise_enabled INTEGER NOT NULL,
                    speech_model TEXT NOT NULL, show_timestamps INTEGER NOT NULL,
                    detect_speakers INTEGER NOT NULL, kind TEXT NOT NULL, speakers TEXT
                );
                CREATE TABLE library_translations (
                    item_id TEXT NOT NULL, language TEXT NOT NULL, text TEXT NOT NULL,
                    model TEXT NOT NULL, created_at TEXT NOT NULL,
                    PRIMARY KEY (item_id, language)
                );
                CREATE TABLE meeting_details (
                    library_item_id TEXT PRIMARY KEY, notes TEXT, summary TEXT, live_transcript TEXT
                );",
            )
            .unwrap();
        database
    }

    fn item(identifier: &str, created_at: &str) -> LibraryItem {
        LibraryItem {
            id: identifier.to_owned(),
            name: format!("Item {identifier}"),
            audio_path: format!("/missing/{identifier}.wav"),
            source_path: format!("/source/{identifier}.wav"),
            store_original: true,
            status: LibraryItemStatus::Complete,
            transcript: Some(format!("Transcript {identifier}")),
            segments: Some(vec![TranscriptSegment {
                start_ms: 0,
                end_ms: 900,
                text: identifier.to_owned(),
                speaker_id: None,
            }]),
            words: None,
            duration_seconds: 0.9,
            file_size_bytes: 42,
            original_format: "wav".to_owned(),
            created_at: created_at.to_owned(),
            transcribed_at: Some(created_at.to_owned()),
            tags: vec!["kept".to_owned()],
            llm_cleanup_enabled: true,
            denoise_enabled: true,
            speech_model: "test-model".to_owned(),
            show_timestamps: true,
            detect_speakers: true,
            kind: "import".to_owned(),
            speakers: Some(vec![Speaker {
                id: "speaker-1".to_owned(),
                name: "Ana".to_owned(),
                color: Some("blue".to_owned()),
            }]),
        }
    }

    #[test]
    fn filter_plan_keeps_active_cancelling_and_meeting_search_contracts() {
        let plan = FilterPlan::new(LibraryFilter {
            search: Some("launch date #planning".to_owned()),
            status: Some("active".to_owned()),
            ..Default::default()
        });
        let sql = plan.where_sql();
        assert!(sql.contains("'cancelling'"));
        assert!(sql.contains("meeting.notes LIKE ?"));
        assert!(sql.contains("meeting.summary LIKE ?"));
        assert!(sql.contains("meeting.live_transcript LIKE ?"));
        assert_eq!(plan.arguments.len(), 6);
    }

    #[test]
    fn page_round_trip_preserves_order_pagination_and_patch_semantics() {
        let mut database = database();
        for (identifier, timestamp) in [
            ("oldest", "2026-08-01T10:00:00Z"),
            ("middle", "2026-08-02T10:00:00Z"),
            ("newest", "2026-08-03T10:00:00Z"),
        ] {
            insert_library_item(&database, item(identifier, timestamp)).unwrap();
        }

        let root = Path::new("/unused-library-root");
        let (first, has_more) =
            get_library_items_page(&database, root, LibraryFilter::default(), 2, 0).unwrap();
        assert_eq!(
            first
                .iter()
                .map(|entry| entry.id.as_str())
                .collect::<Vec<_>>(),
            vec!["newest", "middle"]
        );
        assert!(has_more);

        let updated = update_library_item(
            &mut database,
            root,
            "middle",
            LibraryItemPatch {
                name: Some("Renamed".to_owned()),
                speakers: Some(None),
                ..Default::default()
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(updated.name, "Renamed");
        assert!(updated.speakers.is_none());
        assert_eq!(updated.tags, vec!["kept"]);

        let (last, has_more) =
            get_library_items_page(&database, root, LibraryFilter::default(), 2, 2).unwrap();
        assert_eq!(last[0].id, "oldest");
        assert!(!has_more);
    }

    #[test]
    fn deletion_returns_audio_path_and_removes_translation_rows() {
        let database = database();
        let stored = item("remove-me", "2026-08-01T10:00:00Z");
        let expected_path = stored.audio_path.clone();
        insert_library_item(&database, stored).unwrap();
        database
            .execute(
                "INSERT INTO library_translations VALUES (?1, 'Spanish', 'hola', 'test', 'now')",
                ["remove-me"],
            )
            .unwrap();

        let removed =
            delete_library_item(&database, Path::new("/unused-library-root"), "remove-me").unwrap();
        assert_eq!(removed.as_deref(), Some(expected_path.as_str()));
        let translations: i64 = database
            .query_row("SELECT COUNT(*) FROM library_translations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(translations, 0);
    }
}
