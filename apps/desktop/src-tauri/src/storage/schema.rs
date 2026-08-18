use std::{fs, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use parking_lot::Mutex;
use rusqlite::Connection;

use super::StorageManager;

const CONNECTION_POLICY: &str = concat!(
    "PRAGMA journal_mode = WAL;",
    "PRAGMA synchronous = NORMAL;",
    "PRAGMA foreign_keys = ON;"
);

const CURRENT_SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS transcriptions (
 id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, text TEXT NOT NULL, raw_text TEXT NULL,
 audio_path TEXT NOT NULL, status TEXT NOT NULL, error_message TEXT NULL,
 llm_cleaned INTEGER NOT NULL DEFAULT 0, speech_model TEXT NOT NULL DEFAULT '',
 llm_model TEXT NULL, word_count INTEGER NOT NULL DEFAULT 0,
 audio_duration_seconds REAL NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0,
 mode_id TEXT NULL, mode_name TEXT NULL, app_id TEXT NULL
);

CREATE TABLE IF NOT EXISTS library_items (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, audio_path TEXT NOT NULL,
 source_path TEXT NOT NULL DEFAULT '', store_original INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'pending', progress REAL DEFAULT 0, error_message TEXT,
 transcript TEXT, segments TEXT, words TEXT, duration_seconds REAL NOT NULL,
 file_size_bytes INTEGER NOT NULL, original_format TEXT NOT NULL, created_at TEXT NOT NULL,
 transcribed_at TEXT, tags TEXT NOT NULL DEFAULT '[]',
 llm_cleanup_enabled INTEGER NOT NULL DEFAULT 0, denoise_enabled INTEGER NOT NULL DEFAULT 0,
 speech_model TEXT NOT NULL, show_timestamps INTEGER NOT NULL DEFAULT 0,
 detect_speakers INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT 'import', speakers TEXT
);

CREATE TABLE IF NOT EXISTS library_translations (
 item_id TEXT NOT NULL, language TEXT NOT NULL, text TEXT NOT NULL, model TEXT NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY (item_id, language),
 FOREIGN KEY (item_id) REFERENCES library_items(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS library_watch_folders (
 path TEXT PRIMARY KEY, model_key TEXT NOT NULL, store_original INTEGER NOT NULL DEFAULT 1,
 llm_cleanup_enabled INTEGER NOT NULL DEFAULT 0, denoise_enabled INTEGER NOT NULL DEFAULT 0,
 show_timestamps INTEGER NOT NULL DEFAULT 0, detect_speakers INTEGER NOT NULL DEFAULT 0,
 enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS library_watch_files (
 path TEXT NOT NULL, fingerprint TEXT NOT NULL, library_item_id TEXT,
 completed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (path, fingerprint)
);
CREATE TABLE IF NOT EXISTS meeting_details (
 library_item_id TEXT PRIMARY KEY REFERENCES library_items(id) ON DELETE CASCADE,
 started_at TEXT NOT NULL, ended_at TEXT, notes TEXT NOT NULL DEFAULT '',
 notes_revision INTEGER NOT NULL DEFAULT 0, summary TEXT,
 summary_status TEXT NOT NULL DEFAULT 'idle', summary_error TEXT,
 system_audio_enabled INTEGER NOT NULL DEFAULT 1, recovered INTEGER NOT NULL DEFAULT 0,
 calendar_context TEXT, note_markers TEXT NOT NULL DEFAULT '[]',
 live_transcript TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS lifetime_stats (
 id INTEGER PRIMARY KEY CHECK (id = 1), words INTEGER NOT NULL DEFAULT 0,
 duration_ms INTEGER NOT NULL DEFAULT 0, dictations INTEGER NOT NULL DEFAULT 0
);
";

const CURRENT_INDEXES: &str = concat!(
    "CREATE INDEX IF NOT EXISTS idx_transcriptions_timestamp ON transcriptions(timestamp);",
    "CREATE INDEX IF NOT EXISTS idx_transcriptions_status ON transcriptions(status);",
    "CREATE INDEX IF NOT EXISTS idx_transcriptions_speech_model ON transcriptions(speech_model);",
    "CREATE INDEX IF NOT EXISTS idx_library_items_created_at ON library_items(created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_library_items_status ON library_items(status);"
);

const INTERRUPTED_SUMMARY_RECOVERY: &str = "
UPDATE meeting_details
SET summary_status = 'error',
    summary_error = 'Summary generation was interrupted. Retry to continue.'
WHERE summary_status = 'running'";

const SEED_LIFETIME_STATS: &str = "
INSERT INTO lifetime_stats (id, words, duration_ms, dictations)
SELECT 1,
       COALESCE(SUM(word_count), 0),
       COALESCE(SUM(CAST(ROUND(audio_duration_seconds * 1000) AS INTEGER)), 0),
       COUNT(*)
FROM transcriptions
WHERE status = 'success'";

struct AddedColumn {
    table: &'static str,
    name: &'static str,
    statement: &'static str,
}

const REQUIRED_COLUMNS: &[AddedColumn] = &[
    AddedColumn::new(
        "library_items",
        "denoise_enabled",
        "ALTER TABLE library_items ADD COLUMN denoise_enabled INTEGER NOT NULL DEFAULT 0",
    ),
    AddedColumn::new(
        "library_watch_folders",
        "denoise_enabled",
        "ALTER TABLE library_watch_folders ADD COLUMN denoise_enabled INTEGER NOT NULL DEFAULT 0",
    ),
    AddedColumn::new(
        "library_watch_files",
        "completed",
        "ALTER TABLE library_watch_files ADD COLUMN completed INTEGER NOT NULL DEFAULT 0",
    ),
    AddedColumn::new(
        "transcriptions",
        "speech_model",
        "ALTER TABLE transcriptions ADD COLUMN speech_model TEXT NOT NULL DEFAULT ''",
    ),
    AddedColumn::new(
        "transcriptions",
        "llm_model",
        "ALTER TABLE transcriptions ADD COLUMN llm_model TEXT NULL",
    ),
    AddedColumn::new(
        "transcriptions",
        "word_count",
        "ALTER TABLE transcriptions ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0",
    ),
    AddedColumn::new(
        "transcriptions",
        "audio_duration_seconds",
        "ALTER TABLE transcriptions ADD COLUMN audio_duration_seconds REAL NOT NULL DEFAULT 0",
    ),
    AddedColumn::new(
        "transcriptions",
        "synced",
        "ALTER TABLE transcriptions ADD COLUMN synced INTEGER NOT NULL DEFAULT 0",
    ),
    AddedColumn::new(
        "transcriptions",
        "mode_id",
        "ALTER TABLE transcriptions ADD COLUMN mode_id TEXT NULL",
    ),
    AddedColumn::new(
        "transcriptions",
        "mode_name",
        "ALTER TABLE transcriptions ADD COLUMN mode_name TEXT NULL",
    ),
    AddedColumn::new(
        "transcriptions",
        "app_id",
        "ALTER TABLE transcriptions ADD COLUMN app_id TEXT NULL",
    ),
    AddedColumn::new(
        "library_items",
        "show_timestamps",
        "ALTER TABLE library_items ADD COLUMN show_timestamps INTEGER NOT NULL DEFAULT 0",
    ),
    AddedColumn::new(
        "library_items",
        "source_path",
        "ALTER TABLE library_items ADD COLUMN source_path TEXT NOT NULL DEFAULT ''",
    ),
    AddedColumn::new(
        "library_items",
        "store_original",
        "ALTER TABLE library_items ADD COLUMN store_original INTEGER NOT NULL DEFAULT 0",
    ),
    AddedColumn::new(
        "library_items",
        "words",
        "ALTER TABLE library_items ADD COLUMN words TEXT",
    ),
    AddedColumn::new(
        "library_items",
        "kind",
        "ALTER TABLE library_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'import'",
    ),
    AddedColumn::new(
        "library_items",
        "speakers",
        "ALTER TABLE library_items ADD COLUMN speakers TEXT",
    ),
    AddedColumn::new(
        "library_items",
        "detect_speakers",
        "ALTER TABLE library_items ADD COLUMN detect_speakers INTEGER NOT NULL DEFAULT 0",
    ),
    AddedColumn::new(
        "meeting_details",
        "calendar_context",
        "ALTER TABLE meeting_details ADD COLUMN calendar_context TEXT",
    ),
    AddedColumn::new(
        "meeting_details",
        "note_markers",
        "ALTER TABLE meeting_details ADD COLUMN note_markers TEXT NOT NULL DEFAULT '[]'",
    ),
    AddedColumn::new(
        "meeting_details",
        "live_transcript",
        "ALTER TABLE meeting_details ADD COLUMN live_transcript TEXT NOT NULL DEFAULT '[]'",
    ),
];

impl AddedColumn {
    const fn new(table: &'static str, name: &'static str, statement: &'static str) -> Self {
        Self {
            table,
            name,
            statement,
        }
    }
}

impl StorageManager {
    pub fn new(database_path: PathBuf) -> Result<Self> {
        prepare_parent_directory(&database_path)?;
        let database = Connection::open(&database_path).with_context(|| {
            format!(
                "Failed to open transcription database at {}",
                database_path.display()
            )
        })?;
        initialize(&database)?;
        let library_root = database_path
            .parent()
            .map(|parent| parent.join("library"))
            .unwrap_or_else(|| PathBuf::from("library"));
        Ok(Self {
            connection: Arc::new(Mutex::new(database)),
            library_root,
        })
    }
}

fn prepare_parent_directory(database_path: &std::path::Path) -> Result<()> {
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!("Failed to create storage directory at {}", parent.display())
        })?;
    }
    Ok(())
}

fn initialize(database: &Connection) -> Result<()> {
    database.execute_batch(CONNECTION_POLICY)?;
    migrate(database)
}

fn migrate(database: &Connection) -> Result<()> {
    database.execute_batch(CURRENT_SCHEMA)?;
    for column in REQUIRED_COLUMNS {
        if !column_exists(database, column.table, column.name)? {
            database.execute(column.statement, [])?;
        }
    }
    database.execute_batch(CURRENT_INDEXES)?;
    database.execute(INTERRUPTED_SUMMARY_RECOVERY, [])?;
    if !stats_are_seeded(database)? {
        database.execute(SEED_LIFETIME_STATS, [])?;
    }
    Ok(())
}

fn stats_are_seeded(database: &Connection) -> Result<bool> {
    Ok(database.query_row(
        "SELECT EXISTS(SELECT 1 FROM lifetime_stats WHERE id = 1)",
        [],
        |row| row.get(0),
    )?)
}

fn column_exists(database: &Connection, table: &str, column: &str) -> Result<bool> {
    let pragma = format!("PRAGMA table_info({table})");
    let mut statement = database.prepare(&pragma)?;
    let names = statement.query_map([], |row| row.get::<_, String>("name"))?;
    for name in names {
        if name? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_adds_legacy_columns_recovers_summary_and_seeds_stats_once() {
        let database = Connection::open_in_memory().unwrap();
        database
            .execute_batch(
                "CREATE TABLE transcriptions (
                    id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, text TEXT NOT NULL,
                    raw_text TEXT, audio_path TEXT NOT NULL, status TEXT NOT NULL,
                    error_message TEXT, llm_cleaned INTEGER NOT NULL DEFAULT 0,
                    word_count INTEGER NOT NULL DEFAULT 0,
                    audio_duration_seconds REAL NOT NULL DEFAULT 0
                );
                INSERT INTO transcriptions (
                    id, timestamp, text, audio_path, status, word_count, audio_duration_seconds
                ) VALUES ('legacy', 1, 'three saved words', '', 'success', 3, 1.25);
                CREATE TABLE library_items (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, audio_path TEXT NOT NULL,
                    status TEXT NOT NULL, progress REAL, error_message TEXT, transcript TEXT,
                    segments TEXT, duration_seconds REAL NOT NULL, file_size_bytes INTEGER NOT NULL,
                    original_format TEXT NOT NULL, created_at TEXT NOT NULL, transcribed_at TEXT,
                    tags TEXT NOT NULL DEFAULT '[]', llm_cleanup_enabled INTEGER NOT NULL DEFAULT 0,
                    speech_model TEXT NOT NULL
                );
                CREATE TABLE library_watch_folders (
                    path TEXT PRIMARY KEY, model_key TEXT NOT NULL,
                    store_original INTEGER NOT NULL DEFAULT 1,
                    llm_cleanup_enabled INTEGER NOT NULL DEFAULT 0,
                    show_timestamps INTEGER NOT NULL DEFAULT 0,
                    detect_speakers INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE library_watch_files (
                    path TEXT NOT NULL, fingerprint TEXT NOT NULL, library_item_id TEXT,
                    PRIMARY KEY (path, fingerprint)
                );
                CREATE TABLE meeting_details (
                    library_item_id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT,
                    notes TEXT NOT NULL DEFAULT '', notes_revision INTEGER NOT NULL DEFAULT 0,
                    summary TEXT, summary_status TEXT NOT NULL DEFAULT 'idle', summary_error TEXT,
                    system_audio_enabled INTEGER NOT NULL DEFAULT 1,
                    recovered INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO library_items (
                    id, name, audio_path, status, duration_seconds, file_size_bytes,
                    original_format, created_at, tags, speech_model
                ) VALUES ('meeting', 'Meeting', '', 'recording', 0, 0, 'wav', 'now', '[]', 'm');
                INSERT INTO meeting_details (
                    library_item_id, started_at, summary_status
                ) VALUES ('meeting', 'now', 'running');",
            )
            .unwrap();

        initialize(&database).unwrap();
        assert!(column_exists(&database, "transcriptions", "app_id").unwrap());
        assert!(column_exists(&database, "library_items", "denoise_enabled").unwrap());
        assert!(column_exists(&database, "meeting_details", "live_transcript").unwrap());

        let stats: (i64, i64, i64) = database
            .query_row(
                "SELECT words, duration_ms, dictations FROM lifetime_stats WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(stats, (3, 1_250, 1));
        let summary: (String, String) = database
            .query_row(
                "SELECT summary_status, summary_error FROM meeting_details WHERE library_item_id = 'meeting'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(summary.0, "error");
        assert_eq!(
            summary.1,
            "Summary generation was interrupted. Retry to continue."
        );

        initialize(&database).unwrap();
        let stats_rows: i64 = database
            .query_row("SELECT COUNT(*) FROM lifetime_stats", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stats_rows, 1);
    }
}
