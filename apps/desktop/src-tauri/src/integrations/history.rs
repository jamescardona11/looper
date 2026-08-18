//! Headless access to locally stored dictations.

use std::path::{Path, PathBuf};

use anyhow::{bail, Result};
use serde::Serialize;
use serde_json::{json, Value};

use super::{open_storage, output, positionals, str_flag, usize_flag, wants_help};
use crate::data_export::CompleteExportReport;
use crate::storage::{LifetimeStats, StorageManager, TranscriptionRecord, TranscriptionStatus};

const HISTORY_ACTIONS: &[(&str, &str)] = &[
    ("last", "Show the most recent dictation."),
    ("list", "List recent dictations."),
    ("search <query>", "Search dictation text."),
    ("get <id>", "Show a single dictation."),
    ("stats", "Show lifetime totals."),
    ("export", "Export all History and Library data to ZIP."),
];
const HISTORY_OPTIONS: &[(&str, &str)] = &[
    ("--limit <n>", "Maximum results (list, search)."),
    ("--offset <n>", "Skip results (list)."),
    ("--output <path>", "Complete ZIP destination (export)."),
    ("--json", "Output machine-readable JSON."),
];

pub(crate) fn run(identifier: &str, args: &[String], json_output: bool) -> Result<()> {
    let action = HistoryAction::parse(args)?;
    action.execute(identifier, Presenter::new(json_output))
}

#[derive(Debug, PartialEq, Eq)]
enum HistoryAction {
    Help,
    Last,
    List(PageRequest),
    Search(SearchRequest),
    Get(String),
    Stats,
    Export(PathBuf),
}

impl HistoryAction {
    fn parse(args: &[String]) -> Result<Self> {
        if args.is_empty() || wants_help(args) {
            return Ok(Self::Help);
        }

        let tail = &args[1..];
        match args[0].as_str() {
            "last" => Ok(Self::Last),
            "list" => Ok(Self::List(PageRequest::parse(tail)?)),
            "search" => Ok(Self::Search(SearchRequest::parse(tail)?)),
            "get" => Ok(Self::Get(required_id(tail)?)),
            "stats" => Ok(Self::Stats),
            "export" => Ok(Self::Export(export_destination(tail)?)),
            other => bail!("Unknown history subcommand: {other}. Run 'looper history --help'."),
        }
    }

    fn execute(self, identifier: &str, presenter: Presenter) -> Result<()> {
        match self {
            Self::Help => show_help(),
            Self::Export(path) => export(identifier, &path, presenter)?,
            action => {
                let reader = HistoryReader::open(identifier)?;
                match action {
                    Self::Last => presenter.single(reader.latest()?),
                    Self::List(page) => presenter.batch(&reader.page(page)?),
                    Self::Search(search) => presenter.batch(&reader.search(&search)?),
                    Self::Get(id) => {
                        let record = reader
                            .find(&id)
                            .ok_or_else(|| anyhow::anyhow!("No dictation found with id {id}"))?;
                        presenter.single(Some(record));
                    }
                    Self::Stats => presenter.stats(&reader.stats()?),
                    Self::Help | Self::Export(_) => unreachable!("handled before opening storage"),
                }
            }
        }
        Ok(())
    }
}

fn show_help() {
    super::print_command_help(
        "Read dictation history. Runs without the app.",
        "looper history <subcommand> [options]",
        &[
            ("SUBCOMMANDS", HISTORY_ACTIONS),
            ("OPTIONS", HISTORY_OPTIONS),
        ],
    );
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PageRequest {
    limit: usize,
    offset: usize,
}

impl PageRequest {
    fn parse(args: &[String]) -> Result<Self> {
        Ok(Self {
            limit: usize_flag(args, "--limit", 20)?,
            offset: usize_flag(args, "--offset", 0)?,
        })
    }
}

#[derive(Debug, PartialEq, Eq)]
struct SearchRequest {
    text: String,
    limit: usize,
}

impl SearchRequest {
    fn parse(args: &[String]) -> Result<Self> {
        let limit = usize_flag(args, "--limit", 20)?;
        let joined = positionals(args, &["--limit"])
            .into_iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(" ");
        let text = joined.trim().to_owned();
        if text.is_empty() {
            bail!("history search requires a query");
        }
        Ok(Self { text, limit })
    }
}

fn required_id(args: &[String]) -> Result<String> {
    positionals(args, &[])
        .into_iter()
        .next()
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("history get requires an id"))
}

fn export_destination(args: &[String]) -> Result<PathBuf> {
    let destination = str_flag(args, "--output")?
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("history export requires --output <path.zip>"))?;
    if destination.extension().and_then(|value| value.to_str()) != Some("zip") {
        bail!("history export output must end in .zip");
    }
    Ok(destination)
}

struct HistoryReader {
    storage: StorageManager,
}

impl HistoryReader {
    fn open(identifier: &str) -> Result<Self> {
        Ok(Self {
            storage: open_storage(identifier)?,
        })
    }

    #[cfg(test)]
    fn from_storage(storage: StorageManager) -> Self {
        Self { storage }
    }

    fn latest(&self) -> Result<Option<TranscriptionRecord>> {
        Ok(self
            .storage
            .get_recent_transcriptions(1)?
            .into_iter()
            .next())
    }

    fn page(&self, request: PageRequest) -> Result<Vec<TranscriptionRecord>> {
        self.storage
            .get_recent_transcriptions_page(request.limit, request.offset)
    }

    fn search(&self, request: &SearchRequest) -> Result<Vec<TranscriptionRecord>> {
        self.storage
            .search_transcriptions(&request.text, request.limit)
    }

    fn find(&self, id: &str) -> Option<TranscriptionRecord> {
        self.storage.get_by_id(id)
    }

    fn stats(&self) -> Result<LifetimeStats> {
        self.storage.lifetime_stats()
    }
}

fn export(identifier: &str, destination: &Path, presenter: Presenter) -> Result<()> {
    let storage = open_storage(identifier)?;
    let report = crate::data_export::export_complete_archive(&storage, destination)?;
    presenter.export(destination, &report);
    Ok(())
}

#[derive(Clone, Copy)]
struct Presenter {
    json: bool,
}

impl Presenter {
    fn new(json: bool) -> Self {
        Self { json }
    }

    fn single(self, record: Option<TranscriptionRecord>) {
        if self.json {
            output::print_json(&single_record_json(record.as_ref()));
        } else if let Some(record) = record {
            println!("{}", record.text);
        }
    }

    fn batch(self, records: &[TranscriptionRecord]) {
        if self.json {
            output::print_json(&record_batch_json(records));
            return;
        }
        for record in records {
            println!("{}", table_line(record));
        }
    }

    fn stats(self, stats: &LifetimeStats) {
        let duration_seconds = duration_seconds(stats);
        if self.json {
            output::print_json(&stats_json(stats));
        } else {
            println!("Words:      {}", stats.words);
            println!("Duration:   {duration_seconds:.0}s");
            println!("Dictations: {}", stats.dictations);
        }
    }

    fn export(self, destination: &Path, report: &CompleteExportReport) {
        if self.json {
            output::print_json(&json!({ "ok": true, "export": report }));
        } else {
            println!("{}", destination.display());
        }
    }
}

fn single_record_json(record: Option<&TranscriptionRecord>) -> Value {
    json!({
        "ok": true,
        "record": record.map(WireRecord::from),
    })
}

fn record_batch_json(records: &[TranscriptionRecord]) -> Value {
    let records = records.iter().map(WireRecord::from).collect::<Vec<_>>();
    json!({
        "ok": true,
        "count": records.len(),
        "records": records,
    })
}

fn stats_json(stats: &LifetimeStats) -> Value {
    json!({
        "ok": true,
        "words": stats.words,
        "duration_seconds": duration_seconds(stats),
        "dictations": stats.dictations,
    })
}

fn duration_seconds(stats: &LifetimeStats) -> f64 {
    stats.duration_ms as f64 / 1000.0
}

fn table_line(record: &TranscriptionRecord) -> String {
    format!(
        "{}\t{}\t{}",
        record.id,
        record.timestamp.to_rfc3339(),
        output::one_line(&record.text, 100)
    )
}

#[derive(Debug, PartialEq, Serialize)]
struct WireRecord {
    id: String,
    timestamp_ms: i64,
    text: String,
    raw_text: Option<String>,
    llm_cleaned: bool,
    speech_model: String,
    llm_model: Option<String>,
    mode_name: Option<String>,
    word_count: u32,
    audio_duration_seconds: f32,
    audio_path: String,
    audio_available: bool,
    status: &'static str,
}

impl From<&TranscriptionRecord> for WireRecord {
    fn from(record: &TranscriptionRecord) -> Self {
        let status = match record.status {
            TranscriptionStatus::Success => "success",
            TranscriptionStatus::Error => "error",
        };
        Self {
            id: record.id.clone(),
            timestamp_ms: record.timestamp.timestamp_millis(),
            text: record.text.clone(),
            raw_text: record.raw_text.clone(),
            llm_cleaned: record.llm_cleaned,
            speech_model: record.speech_model.clone(),
            llm_model: record.llm_model.clone(),
            mode_name: record.mode_name.clone(),
            word_count: record.word_count,
            audio_duration_seconds: record.audio_duration_seconds,
            audio_path: record.audio_path.clone(),
            audio_available: record.audio_available,
            status,
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Local, TimeZone};

    use super::*;
    use crate::storage::TranscriptionMetadata;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    fn record(id: &str, text: &str, timestamp_ms: i64) -> TranscriptionRecord {
        TranscriptionRecord {
            id: id.to_owned(),
            timestamp: Local.timestamp_millis_opt(timestamp_ms).unwrap(),
            text: text.to_owned(),
            raw_text: Some("raw words".to_owned()),
            audio_path: "/tmp/audio.wav".to_owned(),
            audio_available: true,
            status: TranscriptionStatus::Success,
            error_message: None,
            llm_cleaned: true,
            speech_model: "parakeet-v3".to_owned(),
            llm_model: Some("cleanup-model".to_owned()),
            word_count: 3,
            audio_duration_seconds: 1.25,
            synced: false,
            mode_id: Some("mode-1".to_owned()),
            mode_name: Some("Notes".to_owned()),
            app_id: None,
        }
    }

    #[test]
    fn help_has_precedence_and_unknown_subcommands_keep_the_cli_error() {
        assert_eq!(
            HistoryAction::parse(&args(&["mystery", "--help"])).unwrap(),
            HistoryAction::Help
        );
        assert_eq!(
            HistoryAction::parse(&args(&["mystery"]))
                .unwrap_err()
                .to_string(),
            "Unknown history subcommand: mystery. Run 'looper history --help'."
        );
    }

    #[test]
    fn list_defaults_and_explicit_page_flags_are_stable() {
        assert_eq!(
            HistoryAction::parse(&args(&["list"])).unwrap(),
            HistoryAction::List(PageRequest {
                limit: 20,
                offset: 0
            })
        );
        assert_eq!(
            HistoryAction::parse(&args(&["list", "--offset", "7", "--limit", "4"])).unwrap(),
            HistoryAction::List(PageRequest {
                limit: 4,
                offset: 7
            })
        );
    }

    #[test]
    fn search_joins_words_but_excludes_the_limit_value() {
        assert_eq!(
            HistoryAction::parse(&args(&["search", "alpha", "--limit", "8", "beta"])).unwrap(),
            HistoryAction::Search(SearchRequest {
                text: "alpha beta".to_owned(),
                limit: 8
            })
        );
        assert_eq!(
            HistoryAction::parse(&args(&["search", "--limit", "2"]))
                .unwrap_err()
                .to_string(),
            "history search requires a query"
        );
    }

    #[test]
    fn get_and_export_validate_required_values_before_storage_access() {
        assert_eq!(
            HistoryAction::parse(&args(&["get"]))
                .unwrap_err()
                .to_string(),
            "history get requires an id"
        );
        assert_eq!(
            HistoryAction::parse(&args(&["export", "--output", "backup.ZIP"]))
                .unwrap_err()
                .to_string(),
            "history export output must end in .zip"
        );
        assert_eq!(
            HistoryAction::parse(&args(&["export", "--output", "backup.zip"])).unwrap(),
            HistoryAction::Export(PathBuf::from("backup.zip"))
        );
    }

    #[test]
    fn wire_record_preserves_fields_and_status_spelling() {
        let record = record("dictation-1", "clean words", 1_700_000_000_000);
        assert_eq!(
            serde_json::to_value(WireRecord::from(&record)).unwrap(),
            json!({
                "id": "dictation-1",
                "timestamp_ms": 1_700_000_000_000_i64,
                "text": "clean words",
                "raw_text": "raw words",
                "llm_cleaned": true,
                "speech_model": "parakeet-v3",
                "llm_model": "cleanup-model",
                "mode_name": "Notes",
                "word_count": 3,
                "audio_duration_seconds": 1.25,
                "audio_path": "/tmp/audio.wav",
                "audio_available": true,
                "status": "success"
            })
        );

        let mut failed = record;
        failed.status = TranscriptionStatus::Error;
        assert_eq!(WireRecord::from(&failed).status, "error");
    }

    #[test]
    fn json_envelopes_and_table_rows_keep_the_public_shape() {
        let record = record("dictation-1", "one\n two", 1_700_000_000_000);
        assert_eq!(
            single_record_json(None),
            json!({ "ok": true, "record": null })
        );
        assert_eq!(record_batch_json(&[record.clone()])["count"], 1);
        assert_eq!(
            stats_json(&LifetimeStats {
                words: 9,
                duration_ms: 1_250,
                dictations: 2,
            }),
            json!({
                "ok": true,
                "words": 9,
                "duration_seconds": 1.25,
                "dictations": 2,
            })
        );

        let line = table_line(&record);
        assert!(line.starts_with(&format!("dictation-1\t{}\t", record.timestamp.to_rfc3339())));
        assert!(line.ends_with("one two"));
    }

    #[test]
    fn reader_uses_storage_order_search_and_lifetime_counters() {
        let directory = tempfile::tempdir().unwrap();
        let storage = StorageManager::new(directory.path().join("history.sqlite3")).unwrap();
        for (id, text, timestamp, words) in [
            ("older", "alpha memo", 1_700_000_000_000, 2),
            ("newer", "beta memo", 1_700_000_001_000, 2),
        ] {
            storage
                .save_transcription(
                    text.to_owned(),
                    String::new(),
                    TranscriptionStatus::Success,
                    None,
                    TranscriptionMetadata {
                        word_count: words,
                        audio_duration_seconds: 0.5,
                        ..Default::default()
                    },
                    Some(id.to_owned()),
                    Some(Local.timestamp_millis_opt(timestamp).unwrap()),
                )
                .unwrap();
        }
        let reader = HistoryReader::from_storage(storage);

        assert_eq!(reader.latest().unwrap().unwrap().id, "newer");
        assert_eq!(
            reader
                .page(PageRequest {
                    limit: 1,
                    offset: 1
                })
                .unwrap()[0]
                .id,
            "older"
        );
        assert_eq!(
            reader
                .search(&SearchRequest {
                    text: "alpha".to_owned(),
                    limit: 5
                })
                .unwrap()[0]
                .id,
            "older"
        );
        assert_eq!(reader.find("newer").unwrap().text, "beta memo");
        let stats = reader.stats().unwrap();
        assert_eq!(
            (stats.words, stats.duration_ms, stats.dictations),
            (4, 1_000, 2)
        );
    }
}
