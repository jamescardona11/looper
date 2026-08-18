//! CLI access to background imports and the local Library catalog.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use anyhow::{bail, Result};
use serde_json::{json, Value};

use super::{
    client, coded, has_flag, open_storage, output, positionals, str_flag, usize_flag, wants_help,
};
use crate::library::{
    build_export_content, ExportFormat, LibraryFilter, LibraryItem, LibraryItemStatus,
};
use crate::storage::StorageManager;

const COMPLETION_LIMIT: Duration = Duration::from_secs(3600);
const COMPLETION_INTERVAL: Duration = Duration::from_secs(1);
const IMPORT_VALUE_FLAGS: &[&str] = &["--model"];
const EXPORT_VALUE_FLAGS: &[&str] = &["--to", "--output"];

const SUBCOMMAND_HELP: &[(&str, &str)] = &[
    ("import <file>...", "Import and transcribe files."),
    ("status <id>...", "Show import status."),
    ("list", "List library items."),
    ("export <id>", "Export a transcript to a file."),
];
const OPTION_HELP: &[(&str, &str)] = &[
    (
        "--store-original",
        "Keep a copy of the source file (import).",
    ),
    ("--model <id>", "Speech model to use (import)."),
    ("--open", "Open the library when done (import)."),
    ("--wait", "Wait for transcription to finish (import)."),
    (
        "--to <format>",
        "Export format: txt, md, srt, vtt (export).",
    ),
    ("--output <path>", "Export destination (export)."),
    ("--limit <n>", "Maximum results (list)."),
    ("--status <state>", "Filter by status (list)."),
    ("--json", "Output machine-readable JSON."),
];

pub(crate) fn run(identifier: &str, args: &[String], json_output: bool) -> Result<()> {
    let command = LibraryCommand::parse(args)?;
    command.execute(identifier, Presenter::new(json_output))
}

enum LibraryCommand {
    Help,
    Import(ImportPlan),
    Status(Vec<String>),
    List(ListQuery),
    Export(ExportPlan),
}

impl LibraryCommand {
    fn parse(args: &[String]) -> Result<Self> {
        if args.is_empty() || wants_help(args) {
            return Ok(Self::Help);
        }

        let tail = &args[1..];
        match args[0].as_str() {
            "import" => Ok(Self::Import(ImportPlan::parse(tail)?)),
            "status" => Ok(Self::Status(required_values(
                tail,
                &[],
                "library status expects at least one id",
            )?)),
            "list" => Ok(Self::List(ListQuery::parse(tail)?)),
            "export" => Ok(Self::Export(ExportPlan::parse(tail)?)),
            other => bail!("Unknown library subcommand: {other}. Run 'looper library --help'."),
        }
    }

    fn execute(self, identifier: &str, presenter: Presenter) -> Result<()> {
        match self {
            Self::Help => show_help(),
            Self::Import(plan) => execute_import(identifier, plan, presenter)?,
            Self::Status(ids) => {
                let storage = open_storage(identifier)?;
                presenter.status(&load_items(&storage, &ids)?);
            }
            Self::List(query) => {
                let storage = open_storage(identifier)?;
                presenter.list(&load_page(&storage, &query)?);
            }
            Self::Export(plan) => {
                let storage = open_storage(identifier)?;
                export_item(&storage, &plan)?;
                presenter.exported(&plan.destination);
            }
        }
        Ok(())
    }
}

fn show_help() {
    super::print_command_help(
        "Import and transcribe audio and video files.",
        "looper library <subcommand> [options]",
        &[("SUBCOMMANDS", SUBCOMMAND_HELP), ("OPTIONS", OPTION_HELP)],
    );
}

fn required_values(args: &[String], value_flags: &[&str], error: &str) -> Result<Vec<String>> {
    let values = positionals(args, value_flags)
        .into_iter()
        .cloned()
        .collect::<Vec<_>>();
    if values.is_empty() {
        bail!(error.to_owned());
    }
    Ok(values)
}

#[derive(Debug, PartialEq, Eq)]
struct ImportPlan {
    files: Vec<String>,
    store_original: bool,
    model: Option<String>,
    open_after: bool,
    wait: bool,
}

impl ImportPlan {
    fn parse(args: &[String]) -> Result<Self> {
        Ok(Self {
            files: required_values(
                args,
                IMPORT_VALUE_FLAGS,
                "library import expects at least one file",
            )?,
            store_original: has_flag(args, "--store-original"),
            model: str_flag(args, "--model")?.map(str::to_owned),
            open_after: has_flag(args, "--open"),
            wait: has_flag(args, "--wait"),
        })
    }

    fn payload(&self, absolute_path: &Path) -> Value {
        let mut payload = json!({
            "path": absolute_path.to_string_lossy(),
            "store_original": self.store_original,
        });
        if let Some(model) = &self.model {
            payload["model"] = json!(model);
        }
        payload
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ListQuery {
    limit: usize,
    status: Option<String>,
}

impl ListQuery {
    fn parse(args: &[String]) -> Result<Self> {
        Ok(Self {
            limit: usize_flag(args, "--limit", 20)?,
            status: str_flag(args, "--status")?.map(str::to_owned),
        })
    }

    fn filter(&self) -> LibraryFilter {
        LibraryFilter {
            status: self.status.clone(),
            ..Default::default()
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ExportKind {
    Text,
    Markdown,
    SubRip,
    WebVtt,
}

impl ExportKind {
    fn parse(value: &str) -> Result<Self> {
        match value.to_lowercase().as_str() {
            "txt" => Ok(Self::Text),
            "md" => Ok(Self::Markdown),
            "srt" => Ok(Self::SubRip),
            "vtt" => Ok(Self::WebVtt),
            other => bail!("Unknown export format: {other} (expected txt|md|srt|vtt)"),
        }
    }

    fn library_format(self) -> ExportFormat {
        match self {
            Self::Text => ExportFormat::Txt,
            Self::Markdown => ExportFormat::Md,
            Self::SubRip => ExportFormat::Srt,
            Self::WebVtt => ExportFormat::Vtt,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ExportPlan {
    id: String,
    kind: ExportKind,
    destination: PathBuf,
}

impl ExportPlan {
    fn parse(args: &[String]) -> Result<Self> {
        let id = positionals(args, EXPORT_VALUE_FLAGS)
            .into_iter()
            .next()
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("library export expects an id"))?;
        let kind = ExportKind::parse(str_flag(args, "--to")?.unwrap_or("txt"))?;
        let destination = str_flag(args, "--output")?
            .map(PathBuf::from)
            .ok_or_else(|| anyhow::anyhow!("--output <path> is required"))?;
        Ok(Self {
            id,
            kind,
            destination,
        })
    }
}

trait ControlChannel {
    fn send(&mut self, command: &str, payload: Value) -> Result<Value>;
}

struct LiveControlChannel;

impl ControlChannel for LiveControlChannel {
    fn send(&mut self, command: &str, payload: Value) -> Result<Value> {
        client::request_data(command, payload)
    }
}

fn submit_imports<C: ControlChannel>(plan: &ImportPlan, channel: &mut C) -> Result<Vec<Value>> {
    let mut jobs = Vec::with_capacity(plan.files.len());
    for file in &plan.files {
        let absolute =
            std::fs::canonicalize(file).map_err(|_| coded(1, format!("File not found: {file}")))?;
        jobs.push(channel.send("library.import", plan.payload(&absolute))?);
    }
    Ok(jobs)
}

fn execute_import(identifier: &str, plan: ImportPlan, presenter: Presenter) -> Result<()> {
    let mut channel = LiveControlChannel;
    let mut jobs = submit_imports(&plan, &mut channel)?;
    if plan.open_after {
        let _ = channel.send("open", json!({ "target": "library" }));
    }
    if plan.wait {
        let storage = open_storage(identifier)?;
        update_completed_jobs(&storage, &mut jobs)?;
    }
    presenter.jobs(&jobs);
    Ok(())
}

fn update_completed_jobs(storage: &StorageManager, jobs: &mut [Value]) -> Result<()> {
    for job in jobs {
        let Some(id) = job.get("id").and_then(Value::as_str).map(str::to_owned) else {
            continue;
        };
        let complete = wait_for_completion(storage, &id)?;
        let (status, _, _) = complete.status.as_fields();
        job["status"] = Value::String(status);
    }
    Ok(())
}

trait CompletionSource {
    fn item(&mut self, id: &str) -> Result<Option<LibraryItem>>;
    fn now(&self) -> Instant;
    fn pause(&mut self, duration: Duration);
}

struct StorageCompletionSource<'a> {
    storage: &'a StorageManager,
}

impl CompletionSource for StorageCompletionSource<'_> {
    fn item(&mut self, id: &str) -> Result<Option<LibraryItem>> {
        self.storage.get_library_item(id)
    }

    fn now(&self) -> Instant {
        Instant::now()
    }

    fn pause(&mut self, duration: Duration) {
        std::thread::sleep(duration);
    }
}

#[derive(Clone, Copy)]
struct CompletionPolicy {
    timeout: Duration,
    interval: Duration,
}

impl CompletionPolicy {
    const fn standard() -> Self {
        Self {
            timeout: COMPLETION_LIMIT,
            interval: COMPLETION_INTERVAL,
        }
    }

    fn wait<S: CompletionSource>(self, source: &mut S, id: &str) -> Result<LibraryItem> {
        let deadline = source.now() + self.timeout;
        loop {
            let item = source
                .item(id)?
                .ok_or_else(|| coded(3, format!("Library item {id} disappeared")))?;
            if terminal_status(&item.status) {
                return Ok(item);
            }
            if source.now() >= deadline {
                return Err(coded(4, format!("Timed out waiting for library item {id}")));
            }
            source.pause(self.interval);
        }
    }
}

fn terminal_status(status: &LibraryItemStatus) -> bool {
    matches!(
        status,
        LibraryItemStatus::Complete
            | LibraryItemStatus::Error { .. }
            | LibraryItemStatus::Cancelled
    )
}

fn wait_for_completion(storage: &StorageManager, id: &str) -> Result<LibraryItem> {
    CompletionPolicy::standard().wait(&mut StorageCompletionSource { storage }, id)
}

fn load_items(storage: &StorageManager, ids: &[String]) -> Result<Vec<LibraryItem>> {
    ids.iter()
        .map(|id| {
            storage
                .get_library_item(id)?
                .ok_or_else(|| coded(1, format!("No library item with id {id}")))
        })
        .collect()
}

fn load_page(storage: &StorageManager, query: &ListQuery) -> Result<Vec<LibraryItem>> {
    storage
        .get_library_items_page(query.filter(), query.limit, 0)
        .map(|(items, _)| items)
}

fn export_item(storage: &StorageManager, plan: &ExportPlan) -> Result<()> {
    let item = storage
        .get_library_item(&plan.id)?
        .ok_or_else(|| coded(1, format!("No library item with id {}", plan.id)))?;
    let content = build_export_content(&item, plan.kind.library_format())
        .map_err(|error| coded(3, error.to_string()))?;
    if let Some(parent) = plan.destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&plan.destination, content)?;
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

    fn jobs(self, jobs: &[Value]) {
        if self.json {
            output::print_json(&json!({ "ok": true, "jobs": jobs }));
        } else {
            for job in jobs {
                println!("{}", job_line(job));
            }
        }
    }

    fn status(self, items: &[LibraryItem]) {
        if self.json {
            let items = items.iter().map(item_summary).collect::<Vec<_>>();
            output::print_json(&json!({ "ok": true, "items": items }));
        } else {
            for item in items {
                println!("{}", detailed_item_line(item));
            }
        }
    }

    fn list(self, items: &[LibraryItem]) {
        if self.json {
            let items = items.iter().map(item_summary).collect::<Vec<_>>();
            output::print_json(&json!({ "ok": true, "count": items.len(), "items": items }));
        } else {
            for item in items {
                println!("{}", item_line(item));
            }
        }
    }

    fn exported(self, destination: &Path) {
        if self.json {
            output::print_json(&json!({
                "ok": true,
                "output": destination.to_string_lossy(),
            }));
        } else {
            println!("{}", destination.display());
        }
    }
}

fn job_line(job: &Value) -> String {
    let id = job.get("id").and_then(Value::as_str).unwrap_or("");
    let name = job.get("name").and_then(Value::as_str).unwrap_or("");
    let status = job
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("pending");
    format!("{id}\t{status}\t{name}")
}

fn detailed_item_line(item: &LibraryItem) -> String {
    let (status, progress, _) = item.status.as_fields();
    format!(
        "{}\t{}\t{:.0}%\t{}",
        item.id,
        status,
        progress * 100.0,
        item.name
    )
}

fn item_line(item: &LibraryItem) -> String {
    let (status, _, _) = item.status.as_fields();
    format!("{}\t{}\t{}", item.id, status, item.name)
}

fn item_summary(item: &LibraryItem) -> Value {
    let (status, progress, error) = item.status.as_fields();
    json!({
        "id": item.id,
        "name": item.name,
        "status": status,
        "progress": progress,
        "error": error,
        "transcript": item.transcript,
        "duration_seconds": item.duration_seconds,
        "speech_model": item.speech_model,
        "created_at": item.created_at,
        "transcribed_at": item.transcribed_at,
    })
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;

    use super::*;
    use crate::integrations::CodedError;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    fn item(id: &str, status: LibraryItemStatus, created_at: &str) -> LibraryItem {
        LibraryItem {
            id: id.to_owned(),
            name: format!("Item {id}"),
            audio_path: String::new(),
            source_path: String::new(),
            store_original: false,
            status,
            transcript: Some(format!("Transcript {id}")),
            segments: None,
            words: None,
            duration_seconds: 12.5,
            file_size_bytes: 100,
            original_format: "wav".to_owned(),
            created_at: created_at.to_owned(),
            transcribed_at: Some("2026-08-17T12:30:00Z".to_owned()),
            tags: Vec::new(),
            llm_cleanup_enabled: false,
            denoise_enabled: false,
            speech_model: "parakeet".to_owned(),
            show_timestamps: false,
            detect_speakers: false,
            kind: "import".to_owned(),
            speakers: None,
        }
    }

    fn coded_error(error: &anyhow::Error) -> &CodedError {
        error.downcast_ref::<CodedError>().unwrap()
    }

    #[test]
    fn command_parser_keeps_help_precedence_and_public_errors() {
        assert!(matches!(
            LibraryCommand::parse(&args(&["unknown", "--help"])).unwrap(),
            LibraryCommand::Help
        ));
        assert_eq!(
            LibraryCommand::parse(&args(&["unknown"]))
                .err()
                .unwrap()
                .to_string(),
            "Unknown library subcommand: unknown. Run 'looper library --help'."
        );
        assert_eq!(
            LibraryCommand::parse(&args(&["status"]))
                .err()
                .unwrap()
                .to_string(),
            "library status expects at least one id"
        );
    }

    #[test]
    fn import_plan_preserves_files_flags_model_and_payload() {
        let plan = ImportPlan::parse(&args(&[
            "first.wav",
            "--model",
            "parakeet",
            "second.mp3",
            "--store-original",
            "--open",
            "--wait",
        ]))
        .unwrap();

        assert_eq!(plan.files, ["first.wav", "second.mp3"]);
        assert!(plan.store_original && plan.open_after && plan.wait);
        assert_eq!(plan.model.as_deref(), Some("parakeet"));
        assert_eq!(
            plan.payload(Path::new("/tmp/audio.wav")),
            json!({
                "path": "/tmp/audio.wav",
                "store_original": true,
                "model": "parakeet",
            })
        );
    }

    struct RecordingChannel {
        requests: Vec<(String, Value)>,
        replies: VecDeque<Value>,
    }

    impl ControlChannel for RecordingChannel {
        fn send(&mut self, command: &str, payload: Value) -> Result<Value> {
            self.requests.push((command.to_owned(), payload));
            Ok(self.replies.pop_front().unwrap())
        }
    }

    #[test]
    fn imports_are_canonicalized_and_submitted_in_input_order() {
        let directory = tempfile::tempdir().unwrap();
        let first = directory.path().join("first.wav");
        let second = directory.path().join("second.wav");
        std::fs::write(&first, []).unwrap();
        std::fs::write(&second, []).unwrap();
        let plan = ImportPlan {
            files: vec![first.display().to_string(), second.display().to_string()],
            store_original: false,
            model: None,
            open_after: false,
            wait: false,
        };
        let mut channel = RecordingChannel {
            requests: Vec::new(),
            replies: VecDeque::from([json!({ "id": "one" }), json!({ "id": "two" })]),
        };

        let jobs = submit_imports(&plan, &mut channel).unwrap();

        assert_eq!(jobs[0]["id"], "one");
        assert_eq!(jobs[1]["id"], "two");
        assert_eq!(channel.requests[0].0, "library.import");
        assert_eq!(
            channel.requests[0].1["path"].as_str(),
            first.canonicalize().unwrap().to_str()
        );
        assert_eq!(
            channel.requests[1].1["path"].as_str(),
            second.canonicalize().unwrap().to_str()
        );
    }

    #[test]
    fn missing_import_file_keeps_exit_code_one_and_original_spelling() {
        let plan = ImportPlan {
            files: vec!["missing.wav".to_owned()],
            store_original: false,
            model: None,
            open_after: false,
            wait: false,
        };
        let mut channel = RecordingChannel {
            requests: Vec::new(),
            replies: VecDeque::new(),
        };

        let error = submit_imports(&plan, &mut channel).unwrap_err();

        assert_eq!(coded_error(&error).code, 1);
        assert_eq!(coded_error(&error).message, "File not found: missing.wav");
        assert!(channel.requests.is_empty());
    }

    struct FakeCompletion {
        items: VecDeque<Option<LibraryItem>>,
        clock: Instant,
        pauses: usize,
    }

    impl CompletionSource for FakeCompletion {
        fn item(&mut self, _id: &str) -> Result<Option<LibraryItem>> {
            Ok(self.items.pop_front().flatten())
        }

        fn now(&self) -> Instant {
            self.clock
        }

        fn pause(&mut self, duration: Duration) {
            self.pauses += 1;
            self.clock += duration;
        }
    }

    #[test]
    fn completion_polling_returns_terminal_items_and_preserves_failure_codes() {
        let pending = item("job", LibraryItemStatus::Pending, "2026-08-17T10:00:00Z");
        let complete = item("job", LibraryItemStatus::Complete, "2026-08-17T10:00:00Z");
        let mut source = FakeCompletion {
            items: VecDeque::from([Some(pending), Some(complete)]),
            clock: Instant::now(),
            pauses: 0,
        };
        let policy = CompletionPolicy {
            timeout: Duration::from_secs(1),
            interval: Duration::from_millis(100),
        };
        assert!(matches!(
            policy.wait(&mut source, "job").unwrap().status,
            LibraryItemStatus::Complete
        ));
        assert_eq!(source.pauses, 1);

        let mut missing = FakeCompletion {
            items: VecDeque::from([None]),
            clock: Instant::now(),
            pauses: 0,
        };
        let error = policy.wait(&mut missing, "job").unwrap_err();
        assert_eq!(coded_error(&error).code, 3);
        assert_eq!(coded_error(&error).message, "Library item job disappeared");

        let mut timeout = FakeCompletion {
            items: VecDeque::from([Some(item(
                "job",
                LibraryItemStatus::Pending,
                "2026-08-17T10:00:00Z",
            ))]),
            clock: Instant::now(),
            pauses: 0,
        };
        let immediate = CompletionPolicy {
            timeout: Duration::ZERO,
            interval: Duration::from_secs(1),
        };
        let error = immediate.wait(&mut timeout, "job").unwrap_err();
        assert_eq!(coded_error(&error).code, 4);
        assert_eq!(
            coded_error(&error).message,
            "Timed out waiting for library item job"
        );
    }

    #[test]
    fn list_and_export_parsers_keep_defaults_case_folding_and_error_order() {
        assert_eq!(
            ListQuery::parse(&args(&[])).unwrap(),
            ListQuery {
                limit: 20,
                status: None
            }
        );
        assert_eq!(ExportKind::parse("MD").unwrap(), ExportKind::Markdown);
        assert_eq!(
            ExportKind::parse("PDF").unwrap_err().to_string(),
            "Unknown export format: pdf (expected txt|md|srt|vtt)"
        );
        assert_eq!(
            ExportPlan::parse(&args(&["item-1", "--to", "txt"]))
                .unwrap_err()
                .to_string(),
            "--output <path> is required"
        );
    }

    #[test]
    fn wire_summary_and_plain_rows_keep_status_progress_and_fallbacks() {
        let item = item(
            "job",
            LibraryItemStatus::Transcribing { progress: 0.425 },
            "2026-08-17T10:00:00Z",
        );
        assert_eq!(
            item_summary(&item),
            json!({
                "id": "job",
                "name": "Item job",
                "status": "transcribing",
                "progress": 0.425_f32,
                "error": null,
                "transcript": "Transcript job",
                "duration_seconds": 12.5,
                "speech_model": "parakeet",
                "created_at": "2026-08-17T10:00:00Z",
                "transcribed_at": "2026-08-17T12:30:00Z",
            })
        );
        assert_eq!(
            detailed_item_line(&item),
            "job\ttranscribing\t42%\tItem job"
        );
        assert_eq!(item_line(&item), "job\ttranscribing\tItem job");
        assert_eq!(job_line(&json!({ "id": "job" })), "job\tpending\t");
    }

    #[test]
    fn sqlite_queries_keep_requested_order_filter_and_missing_item_code() {
        let directory = tempfile::tempdir().unwrap();
        let storage = StorageManager::new(directory.path().join("library.sqlite3")).unwrap();
        storage
            .insert_library_item(item(
                "old",
                LibraryItemStatus::Complete,
                "2026-08-17T10:00:00Z",
            ))
            .unwrap();
        storage
            .insert_library_item(item(
                "new",
                LibraryItemStatus::Pending,
                "2026-08-17T11:00:00Z",
            ))
            .unwrap();

        let requested = load_items(&storage, &["old".to_owned(), "new".to_owned()]).unwrap();
        assert_eq!(requested[0].id, "old");
        assert_eq!(requested[1].id, "new");
        let page = load_page(
            &storage,
            &ListQuery {
                limit: 5,
                status: Some("pending".to_owned()),
            },
        )
        .unwrap();
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].id, "new");

        let error = load_items(&storage, &["missing".to_owned()]).unwrap_err();
        assert_eq!(coded_error(&error).code, 1);
        assert_eq!(
            coded_error(&error).message,
            "No library item with id missing"
        );
    }

    #[test]
    fn export_reads_storage_creates_parents_and_writes_selected_format() {
        let directory = tempfile::tempdir().unwrap();
        let storage = StorageManager::new(directory.path().join("library.sqlite3")).unwrap();
        storage
            .insert_library_item(item(
                "export-me",
                LibraryItemStatus::Complete,
                "2026-08-17T10:00:00Z",
            ))
            .unwrap();
        let destination = directory.path().join("nested").join("item.txt");
        let plan = ExportPlan {
            id: "export-me".to_owned(),
            kind: ExportKind::Text,
            destination: destination.clone(),
        };

        export_item(&storage, &plan).unwrap();

        let content = std::fs::read_to_string(destination).unwrap();
        assert!(content.starts_with("Item export-me\nTranscribed: 2026-08-17T12:30:00Z"));
        assert!(content.ends_with("Transcript export-me"));
    }
}
