//! `looper mcp` — read-only, local MCP access to dictation history and Library.

use std::sync::Arc;

use anyhow::{bail, Context, Result};
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::*;
use rmcp::schemars::{self, JsonSchema};
use rmcp::{tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler, ServiceExt};
use serde::{Deserialize, Serialize};

use super::open_storage;
use crate::library::{LibraryFilter, LibraryItem, LibraryItemStatus};
use crate::memory::{MemorySearchFilter, MemorySearchResult, MemorySource};
use crate::storage::{StorageManager, TranscriptionRecord, TranscriptionStatus};

const DEFAULT_SEARCH_LIMIT: u32 = 20;
const MAX_SEARCH_LIMIT: u32 = 50;
const MAX_SEARCH_OFFSET: u32 = 10_000;
const MAX_QUERY_CHARACTERS: usize = 256;
const DEFAULT_TRANSCRIPT_LIMIT: u32 = 4_000;
const MAX_TRANSCRIPT_LIMIT: u32 = 12_000;

#[derive(Clone)]
struct LooperMcpServer {
    storage: Arc<StorageManager>,
}

impl LooperMcpServer {
    fn new(storage: Arc<StorageManager>) -> Self {
        Self { storage }
    }
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
struct SearchInput {
    #[schemars(description = "Optional case-insensitive text query; omit to list recent items")]
    query: Option<String>,
    #[schemars(description = "Maximum results; defaults to 20 and is capped at 50")]
    #[schemars(range(min = 1, max = 50))]
    limit: Option<u32>,
    #[schemars(description = "Number of matching results to skip; capped at 10000")]
    offset: Option<u32>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetDictationInput {
    #[schemars(description = "Dictation id returned by search_dictations")]
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetLibraryTranscriptInput {
    #[schemars(description = "Library item id returned by search_library")]
    id: String,
    #[schemars(description = "Unicode character offset; defaults to 0")]
    offset: Option<u32>,
    #[schemars(
        description = "Maximum Unicode characters; defaults to 4000 and is capped at 12000"
    )]
    #[schemars(range(min = 1, max = 12000))]
    limit: Option<u32>,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
struct SearchMemoryInput {
    #[schemars(description = "Optional local query; omit to list recent results")]
    query: Option<String>,
    #[schemars(description = "Optional sources: dictation, library, meeting")]
    sources: Option<Vec<String>>,
    since_ms: Option<i64>,
    until_ms: Option<i64>,
    app_id: Option<String>,
    workflow_id: Option<String>,
    #[schemars(description = "Maximum results; defaults to 20 and is capped at 50")]
    #[schemars(range(min = 1, max = 50))]
    limit: Option<u32>,
}

#[derive(Debug, Serialize)]
struct Pagination {
    offset: u32,
    limit: u32,
    returned: usize,
    next_offset: Option<u32>,
}

#[derive(Debug, Serialize)]
struct DictationSummary {
    id: String,
    occurred_at: String,
    excerpt: String,
    word_count: u32,
    mode_name: Option<String>,
}

#[derive(Debug, Serialize)]
struct DictationPage {
    dictations: Vec<DictationSummary>,
    pagination: Pagination,
}

#[derive(Debug, Serialize)]
struct DictationDetail {
    id: String,
    occurred_at: String,
    text: String,
    raw_text: Option<String>,
    status: &'static str,
    llm_cleaned: bool,
    speech_model: String,
    llm_model: Option<String>,
    mode_name: Option<String>,
    word_count: u32,
    audio_duration_seconds: f32,
}

#[derive(Debug, Serialize)]
struct LibrarySummary {
    id: String,
    name: String,
    status: String,
    created_at: String,
    transcribed_at: Option<String>,
    duration_seconds: f32,
    tags: Vec<String>,
    excerpt: Option<String>,
}

#[derive(Debug, Serialize)]
struct LibraryPage {
    items: Vec<LibrarySummary>,
    pagination: Pagination,
}

#[derive(Debug, Serialize)]
struct LibraryTranscriptPage {
    id: String,
    name: String,
    text: String,
    total_characters: u32,
    pagination: Pagination,
}

#[derive(Debug, Serialize)]
struct MemoryPage {
    results: Vec<MemorySummary>,
}

#[derive(Debug, Serialize)]
struct MemorySummary {
    id: String,
    source: MemorySource,
    title: String,
    occurred_at: String,
    final_excerpt: String,
    raw_excerpt: Option<String>,
    score: f32,
    app_id: Option<String>,
    workflow_id: Option<String>,
    workflow_name: Option<String>,
    open_target: &'static str,
}

#[tool_router]
impl LooperMcpServer {
    #[tool(
        description = "Search local Looper dictation history, or list recent dictations when query is omitted. Results contain bounded excerpts; call get_dictation for full text.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn search_dictations(
        &self,
        Parameters(input): Parameters<SearchInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        structured(&search_dictations(&self.storage, input).map_err(internal_error)?)
    }

    #[tool(
        description = "Get one local Looper dictation by id. Returns transcript metadata and text, never audio or filesystem paths.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_dictation(
        &self,
        Parameters(input): Parameters<GetDictationInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let record = self
            .storage
            .get_by_id(input.id.trim())
            .ok_or_else(|| McpError::invalid_params("dictation not found", None))?;
        structured(&dictation_detail(record))
    }

    #[tool(
        description = "Search local Looper Library item names and transcripts, or list recent items when query is omitted. Results contain bounded excerpts.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn search_library(
        &self,
        Parameters(input): Parameters<SearchInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        structured(&search_library(&self.storage, input).map_err(internal_error)?)
    }

    #[tool(
        description = "Read a bounded page of one local Looper Library transcript. Continue with pagination.next_offset until it is null.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_library_transcript(
        &self,
        Parameters(input): Parameters<GetLibraryTranscriptInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let page = library_transcript_page(&self.storage, input)?;
        structured(&page)
    }

    #[tool(
        description = "Search unified local Looper Memory across dictations, Library recordings and meetings. Supports date, app, workflow and source filters; results distinguish raw and final text and contain source ids.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn search_memory(
        &self,
        Parameters(input): Parameters<SearchMemoryInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let sources = input
            .sources
            .unwrap_or_default()
            .into_iter()
            .filter_map(|source| match source.trim().to_ascii_lowercase().as_str() {
                "dictation" => Some(MemorySource::Dictation),
                "library" | "recording" => Some(MemorySource::Library),
                "meeting" => Some(MemorySource::Meeting),
                _ => None,
            })
            .collect();
        let results = crate::memory::search(
            &self.storage,
            MemorySearchFilter {
                query: input.query.unwrap_or_default(),
                sources,
                since_ms: input.since_ms,
                until_ms: input.until_ms,
                app_id: input.app_id,
                workflow_id: input.workflow_id,
                limit: input.limit.map(|limit| limit.min(50) as usize),
            },
        )
        .map_err(internal_error)?;
        structured(&MemoryPage {
            results: results.into_iter().map(memory_summary).collect(),
        })
    }
}

#[tool_handler]
impl ServerHandler for LooperMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
        .with_protocol_version(ProtocolVersion::V_2024_11_05)
        .with_server_info(Implementation::new("looper", env!("CARGO_PKG_VERSION")))
        .with_instructions(
            "Read-only, local access to Looper Memory, dictation history and Library transcripts. Start with search_memory for unified recall, or use the source-specific search tools to resolve ids. Use get_dictation for one complete dictation and get_library_transcript for bounded Library pages. Every operation is local, idempotent, and non-destructive. The server never exposes audio, API keys, or filesystem paths and cannot write or delete data.",
        )
    }
}

pub(crate) fn run(identifier: &str, args: &[String]) -> Result<()> {
    if args.iter().any(|arg| arg == "-h" || arg == "--help") {
        super::print_command_help(
            "Expose local History and Library to MCP clients over stdio.",
            "looper mcp",
            &[(
                "NOTES",
                &[
                    ("read-only", "No tool can modify Looper data."),
                    ("local", "Transcript data stays on this machine."),
                    ("stdio", "Configure this command in your MCP client."),
                ],
            )],
        );
        return Ok(());
    }
    if !args.is_empty() {
        bail!("looper mcp does not accept options; run 'looper mcp --help'");
    }

    let storage = Arc::new(open_storage(identifier)?);
    let runtime = tokio::runtime::Runtime::new().context("Failed to start the MCP runtime")?;
    runtime.block_on(serve(storage))
}

async fn serve(storage: Arc<StorageManager>) -> Result<()> {
    let running = LooperMcpServer::new(storage)
        .serve(rmcp::transport::stdio())
        .await
        .context("Failed to start the Looper MCP server")?;
    running
        .waiting()
        .await
        .context("The Looper MCP server stopped unexpectedly")?;
    Ok(())
}

fn search_dictations(storage: &StorageManager, input: SearchInput) -> Result<DictationPage> {
    let limit = bounded_search_limit(input.limit);
    let offset = bounded_search_offset(input.offset);
    let query = normalized_query(input.query);
    let mut records = if let Some(query) = query {
        storage.search_transcriptions_page(&query, limit as usize + 1, offset as usize)?
    } else {
        storage.get_recent_transcriptions_page(limit as usize + 1, offset as usize)?
    };
    let has_more = records.len() > limit as usize;
    records.truncate(limit as usize);
    let dictations = records
        .into_iter()
        .map(dictation_summary)
        .collect::<Vec<_>>();
    let returned = dictations.len();

    Ok(DictationPage {
        dictations,
        pagination: Pagination {
            offset,
            limit,
            returned,
            next_offset: next_search_offset(offset, limit, has_more),
        },
    })
}

fn search_library(storage: &StorageManager, input: SearchInput) -> Result<LibraryPage> {
    let limit = bounded_search_limit(input.limit);
    let offset = bounded_search_offset(input.offset);
    let filter = LibraryFilter {
        search: normalized_query(input.query),
        ..Default::default()
    };
    let (items, has_more) =
        storage.get_library_items_page(filter, limit as usize, offset as usize)?;
    let items = items.into_iter().map(library_summary).collect::<Vec<_>>();
    let returned = items.len();

    Ok(LibraryPage {
        items,
        pagination: Pagination {
            offset,
            limit,
            returned,
            next_offset: next_search_offset(offset, limit, has_more),
        },
    })
}

fn library_transcript_page(
    storage: &StorageManager,
    input: GetLibraryTranscriptInput,
) -> std::result::Result<LibraryTranscriptPage, McpError> {
    let item = storage
        .get_library_item(input.id.trim())
        .map_err(internal_error)?
        .ok_or_else(|| McpError::invalid_params("library item not found", None))?;
    let transcript = item
        .transcript
        .as_deref()
        .filter(|text| !text.is_empty())
        .ok_or_else(|| McpError::invalid_params("library item has no transcript", None))?;
    let total = transcript.chars().count().min(u32::MAX as usize) as u32;
    let offset = input.offset.unwrap_or(0).min(total);
    let limit = input
        .limit
        .unwrap_or(DEFAULT_TRANSCRIPT_LIMIT)
        .clamp(1, MAX_TRANSCRIPT_LIMIT);
    let text = transcript
        .chars()
        .skip(offset as usize)
        .take(limit as usize)
        .collect::<String>();
    let returned = text.chars().count();
    let next = offset.saturating_add(returned as u32);

    Ok(LibraryTranscriptPage {
        id: item.id,
        name: item.name,
        text,
        total_characters: total,
        pagination: Pagination {
            offset,
            limit,
            returned,
            next_offset: (next < total).then_some(next),
        },
    })
}

fn dictation_summary(record: TranscriptionRecord) -> DictationSummary {
    DictationSummary {
        id: record.id,
        occurred_at: record.timestamp.to_rfc3339(),
        excerpt: one_line(&record.text, 300),
        word_count: record.word_count,
        mode_name: record.mode_name,
    }
}

fn dictation_detail(record: TranscriptionRecord) -> DictationDetail {
    DictationDetail {
        id: record.id,
        occurred_at: record.timestamp.to_rfc3339(),
        text: record.text,
        raw_text: record.raw_text,
        status: match record.status {
            TranscriptionStatus::Success => "success",
            TranscriptionStatus::Error => "error",
        },
        llm_cleaned: record.llm_cleaned,
        speech_model: record.speech_model,
        llm_model: record.llm_model,
        mode_name: record.mode_name,
        word_count: record.word_count,
        audio_duration_seconds: record.audio_duration_seconds,
    }
}

fn library_summary(item: LibraryItem) -> LibrarySummary {
    let status = match &item.status {
        LibraryItemStatus::Pending => "pending",
        LibraryItemStatus::Recording => "recording",
        LibraryItemStatus::Importing { .. } => "importing",
        LibraryItemStatus::Transcribing { .. } => "transcribing",
        LibraryItemStatus::Complete => "complete",
        LibraryItemStatus::Cancelling => "cancelling",
        LibraryItemStatus::Cancelled => "cancelled",
        LibraryItemStatus::Error { .. } => "error",
    };
    LibrarySummary {
        id: item.id,
        name: item.name,
        status: status.to_string(),
        created_at: item.created_at,
        transcribed_at: item.transcribed_at,
        duration_seconds: item.duration_seconds,
        tags: item.tags,
        excerpt: item.transcript.as_deref().map(|text| one_line(text, 300)),
    }
}

fn memory_summary(result: MemorySearchResult) -> MemorySummary {
    MemorySummary {
        id: result.id,
        source: result.source,
        title: result.title,
        occurred_at: result.occurred_at,
        final_excerpt: one_line(&result.final_text, 500),
        raw_excerpt: result.raw_text.as_deref().map(|text| one_line(text, 500)),
        score: result.score,
        app_id: result.app_id,
        workflow_id: result.workflow_id,
        workflow_name: result.workflow_name,
        open_target: result.open_target,
    }
}

fn normalized_query(query: Option<String>) -> Option<String> {
    query
        .map(|query| {
            query
                .trim()
                .chars()
                .take(MAX_QUERY_CHARACTERS)
                .collect::<String>()
        })
        .filter(|query| !query.is_empty())
}

fn bounded_search_limit(limit: Option<u32>) -> u32 {
    limit
        .unwrap_or(DEFAULT_SEARCH_LIMIT)
        .clamp(1, MAX_SEARCH_LIMIT)
}

fn bounded_search_offset(offset: Option<u32>) -> u32 {
    offset.unwrap_or(0).min(MAX_SEARCH_OFFSET)
}

fn next_search_offset(offset: u32, limit: u32, has_more: bool) -> Option<u32> {
    has_more
        .then(|| offset.saturating_add(limit))
        .filter(|next| *next <= MAX_SEARCH_OFFSET)
}

fn one_line(text: &str, max: usize) -> String {
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= max {
        return collapsed;
    }
    let truncated = collapsed
        .chars()
        .take(max.saturating_sub(1))
        .collect::<String>();
    format!("{truncated}…")
}

fn structured(value: &impl Serialize) -> std::result::Result<CallToolResult, McpError> {
    serde_json::to_value(value)
        .map(CallToolResult::structured)
        .map_err(internal_error)
}

fn internal_error(_error: impl std::fmt::Display) -> McpError {
    McpError::internal_error("Local storage operation failed", None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Local, TimeZone};
    use rmcp::ServiceExt;
    use tempfile::TempDir;

    use crate::library::LibraryItemStatus;
    use crate::storage::TranscriptionMetadata;

    struct Fixture {
        storage: Arc<StorageManager>,
        _dir: TempDir,
    }

    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let storage = Arc::new(StorageManager::new(dir.path().join("transcriptions.db")).unwrap());
        storage
            .save_transcription(
                "Launch pricing should stay at twenty dollars.".to_string(),
                "/private/audio.wav".to_string(),
                TranscriptionStatus::Success,
                None,
                TranscriptionMetadata {
                    word_count: 7,
                    ..Default::default()
                },
                Some("dictation-1".to_string()),
                Some(Local.timestamp_millis_opt(1_700_000_000_000).unwrap()),
            )
            .unwrap();
        storage
            .insert_library_item(LibraryItem {
                id: "library-1".to_string(),
                name: "Launch notes".to_string(),
                audio_path: "/private/library.wav".to_string(),
                source_path: String::new(),
                store_original: false,
                status: LibraryItemStatus::Complete,
                transcript: Some("Alpha beta gamma delta".to_string()),
                segments: None,
                words: None,
                duration_seconds: 12.0,
                file_size_bytes: 100,
                original_format: "wav".to_string(),
                created_at: "2023-11-14T22:13:20Z".to_string(),
                transcribed_at: Some("2023-11-14T22:14:00Z".to_string()),
                tags: vec!["launch".to_string()],
                llm_cleanup_enabled: false,
                denoise_enabled: false,
                speech_model: "test".to_string(),
                show_timestamps: false,
                detect_speakers: false,
                kind: "import".to_string(),
                speakers: None,
            })
            .unwrap();
        Fixture { storage, _dir: dir }
    }

    #[tokio::test]
    async fn tools_return_bounded_local_text_without_paths() {
        let fixture = fixture();
        let server = LooperMcpServer::new(fixture.storage);

        let search = server
            .search_dictations(Parameters(SearchInput {
                query: Some("pricing".to_string()),
                limit: None,
                offset: None,
            }))
            .await
            .unwrap()
            .structured_content
            .unwrap();
        assert_eq!(search["dictations"][0]["id"], "dictation-1");
        assert!(!search.to_string().contains("audio.wav"));

        let library = server
            .search_library(Parameters(SearchInput {
                query: Some("launch".to_string()),
                limit: None,
                offset: None,
            }))
            .await
            .unwrap()
            .structured_content
            .unwrap();
        assert_eq!(library["items"][0]["id"], "library-1");
        assert!(!library.to_string().contains("library.wav"));

        let detail = server
            .get_dictation(Parameters(GetDictationInput {
                id: "dictation-1".to_string(),
            }))
            .await
            .unwrap()
            .structured_content
            .unwrap();
        assert_eq!(
            detail["text"],
            "Launch pricing should stay at twenty dollars."
        );
        assert!(detail.get("audio_path").is_none());

        let transcript = server
            .get_library_transcript(Parameters(GetLibraryTranscriptInput {
                id: "library-1".to_string(),
                offset: Some(6),
                limit: Some(4),
            }))
            .await
            .unwrap()
            .structured_content
            .unwrap();
        assert_eq!(transcript["text"], "beta");
        assert_eq!(transcript["pagination"]["next_offset"], 10);
        assert!(!transcript.to_string().contains("library.wav"));

        let memory = server
            .search_memory(Parameters(SearchMemoryInput {
                query: Some("pricing".to_string()),
                ..Default::default()
            }))
            .await
            .unwrap()
            .structured_content
            .unwrap();
        assert_eq!(memory["results"][0]["id"], "dictation-1");
        assert!(memory["results"][0].get("final_excerpt").is_some());
        assert!(memory["results"][0].get("final_text").is_none());
        assert!(memory["results"][0].get("raw_text").is_none());
    }

    #[tokio::test]
    async fn handshake_advertises_only_read_only_tools() {
        let fixture = fixture();
        let server = LooperMcpServer::new(fixture.storage);
        let (server_transport, client_transport) = tokio::io::duplex(64 * 1024);
        let server_handle = tokio::spawn(async move { server.serve(server_transport).await });

        let client = ().serve(client_transport).await.unwrap();
        let tools = client.list_all_tools().await.unwrap();
        let mut names = tools
            .iter()
            .map(|tool| tool.name.to_string())
            .collect::<Vec<_>>();
        names.sort();
        assert_eq!(
            names,
            [
                "get_dictation",
                "get_library_transcript",
                "search_dictations",
                "search_library",
                "search_memory",
            ]
        );
        for tool in tools {
            let annotations = tool.annotations.expect("read-only annotations");
            assert_eq!(annotations.read_only_hint, Some(true));
            assert_eq!(annotations.destructive_hint, Some(false));
            assert_eq!(annotations.idempotent_hint, Some(true));
            assert_eq!(annotations.open_world_hint, Some(false));
        }

        client.cancel().await.unwrap();
        let server = server_handle.await.unwrap().unwrap();
        server.cancel().await.unwrap();
    }

    #[test]
    fn internal_errors_do_not_expose_storage_details() {
        let error = internal_error("database failed at /private/looper/transcriptions.db");
        let serialized = serde_json::to_string(&error).unwrap();

        assert!(serialized.contains("Local storage operation failed"));
        assert!(!serialized.contains("/private/looper"));
    }

    #[test]
    fn search_pagination_stops_at_the_offset_cap() {
        assert_eq!(next_search_offset(9_950, 50, true), Some(10_000));
        assert_eq!(next_search_offset(10_000, 50, true), None);
        assert_eq!(next_search_offset(100, 50, false), None);
    }
}
