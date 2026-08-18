//! Local unified search across dictations, Library recordings and meetings.

use std::cmp::Ordering;
use std::collections::HashSet;

use chrono::DateTime;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::library::{LibraryFilter, LibraryItem};
use crate::storage::{StorageManager, TranscriptionRecord};
use crate::AppState;

const DEFAULT_LIMIT: usize = 30;
const MAX_LIMIT: usize = 100;
const MAX_QUERY_CHARS: usize = 256;
const MAX_CANDIDATES: usize = 2_000;
const MAX_INDEXED_CHARS: usize = 80_000;
const MAX_EXCERPT_CHARS: usize = 320;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum MemorySource {
    Dictation,
    Library,
    Meeting,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct MemorySearchFilter {
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub sources: Vec<MemorySource>,
    pub since_ms: Option<i64>,
    pub until_ms: Option<i64>,
    pub app_id: Option<String>,
    pub workflow_id: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemorySearchResult {
    pub id: String,
    pub source: MemorySource,
    pub title: String,
    pub occurred_at: String,
    pub occurred_at_ms: i64,
    pub excerpt: String,
    pub final_text: String,
    pub raw_text: Option<String>,
    pub score: f32,
    pub app_id: Option<String>,
    pub workflow_id: Option<String>,
    pub workflow_name: Option<String>,
    pub open_target: &'static str,
}

#[tauri::command]
pub fn search_memory(
    state: State<'_, AppState>,
    filter: MemorySearchFilter,
) -> Result<Vec<MemorySearchResult>, String> {
    search(&state.storage(), filter).map_err(|error| error.to_string())
}

pub(crate) fn search(
    storage: &StorageManager,
    filter: MemorySearchFilter,
) -> anyhow::Result<Vec<MemorySearchResult>> {
    let query = filter
        .query
        .trim()
        .chars()
        .take(MAX_QUERY_CHARS)
        .collect::<String>();
    let limit = filter.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let selected_sources = filter.sources.into_iter().collect::<HashSet<_>>();
    let app_filter = normalized_optional(filter.app_id);
    let workflow_filter = normalized_optional(filter.workflow_id);
    let mut results = Vec::new();

    if source_enabled(&selected_sources, MemorySource::Dictation) {
        for record in storage.get_all()?.into_iter().take(MAX_CANDIDATES) {
            if !date_matches(
                record.timestamp.timestamp_millis(),
                filter.since_ms,
                filter.until_ms,
            ) || !optional_matches(record.app_id.as_deref(), app_filter.as_deref())
                || !optional_matches(record.mode_id.as_deref(), workflow_filter.as_deref())
            {
                continue;
            }
            if let Some(result) = dictation_result(record, &query) {
                results.push(result);
            }
        }
    }

    if app_filter.is_none()
        && workflow_filter.is_none()
        && (source_enabled(&selected_sources, MemorySource::Library)
            || source_enabled(&selected_sources, MemorySource::Meeting))
    {
        for item in all_library_items(storage)? {
            let source = if item.kind == "meeting" {
                MemorySource::Meeting
            } else {
                MemorySource::Library
            };
            if !source_enabled(&selected_sources, source) {
                continue;
            }
            let occurred_at_ms = parse_timestamp_ms(&item.created_at).unwrap_or_default();
            if !date_matches(occurred_at_ms, filter.since_ms, filter.until_ms) {
                continue;
            }
            if let Some(result) = library_result(storage, item, source, occurred_at_ms, &query) {
                results.push(result);
            }
        }
    }

    results.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| right.occurred_at_ms.cmp(&left.occurred_at_ms))
            .then_with(|| left.id.cmp(&right.id))
    });
    results.truncate(limit);
    Ok(results)
}

fn dictation_result(record: TranscriptionRecord, query: &str) -> Option<MemorySearchResult> {
    let searchable = match record.raw_text.as_deref() {
        Some(raw) => format!("{} {}", record.text, raw),
        None => record.text.clone(),
    };
    let score = rank(query, &searchable)?;
    let title = record
        .mode_name
        .as_deref()
        .or(record.app_id.as_deref())
        .map(|label| format!("Dictation · {label}"))
        .unwrap_or_else(|| "Dictation".to_string());

    Some(MemorySearchResult {
        id: record.id,
        source: MemorySource::Dictation,
        title,
        occurred_at: record.timestamp.to_rfc3339(),
        occurred_at_ms: record.timestamp.timestamp_millis(),
        excerpt: excerpt(&record.text),
        final_text: record.text,
        raw_text: record.raw_text,
        score,
        app_id: record.app_id,
        workflow_id: record.mode_id,
        workflow_name: record.mode_name,
        open_target: "history",
    })
}

fn library_result(
    storage: &StorageManager,
    item: LibraryItem,
    source: MemorySource,
    occurred_at_ms: i64,
    query: &str,
) -> Option<MemorySearchResult> {
    let transcript = item.transcript.clone().unwrap_or_default();
    let mut searchable = format!("{} {} {}", item.name, item.tags.join(" "), transcript);
    if source == MemorySource::Meeting {
        if let Ok(Some(details)) = storage.get_meeting_details(&item.id) {
            searchable.push(' ');
            searchable.push_str(&details.notes);
            if let Some(summary) = details.summary {
                searchable.push(' ');
                searchable.push_str(&summary);
            }
        }
    }
    let score = rank(query, &searchable)?;

    Some(MemorySearchResult {
        id: item.id,
        source,
        title: item.name,
        occurred_at: item.created_at,
        occurred_at_ms,
        excerpt: excerpt(&transcript),
        final_text: transcript,
        raw_text: None,
        score,
        app_id: None,
        workflow_id: None,
        workflow_name: None,
        open_target: "library",
    })
}

fn all_library_items(storage: &StorageManager) -> anyhow::Result<Vec<LibraryItem>> {
    const PAGE_SIZE: usize = 200;
    let mut items = Vec::new();
    let mut offset = 0;
    while items.len() < MAX_CANDIDATES {
        let remaining = MAX_CANDIDATES - items.len();
        let limit = PAGE_SIZE.min(remaining);
        let (mut page, has_more) =
            storage.get_library_items_page(LibraryFilter::default(), limit, offset)?;
        let returned = page.len();
        items.append(&mut page);
        if !has_more || returned == 0 {
            break;
        }
        offset += returned;
    }
    Ok(items)
}

fn rank(query: &str, text: &str) -> Option<f32> {
    if query.is_empty() {
        return Some(0.0);
    }
    let normalized_query = normalize(query);
    let indexed_text = text.chars().take(MAX_INDEXED_CHARS).collect::<String>();
    let normalized_text = normalize(&indexed_text);
    if normalized_query.is_empty() || normalized_text.is_empty() {
        return None;
    }

    let query_tokens = tokens(&normalized_query);
    let text_tokens = tokens(&normalized_text);
    let exact = normalized_text.contains(&normalized_query) as u8 as f32;
    let lexical = overlap(&query_tokens, &text_tokens);
    let semantic = overlap(&concepts(&query_tokens), &concepts(&text_tokens));
    let fuzzy = trigram_overlap(&normalized_query, &normalized_text);
    let score = exact * 4.0 + lexical * 2.0 + semantic * 1.5 + fuzzy * 0.5;
    (score > 0.05).then_some(score)
}

fn normalize(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn tokens(value: &str) -> HashSet<String> {
    value
        .split_whitespace()
        .filter(|token| token.chars().count() > 1)
        .map(str::to_string)
        .collect()
}

fn concepts(input: &HashSet<String>) -> HashSet<String> {
    input
        .iter()
        .map(|token| match token.as_str() {
            "price" | "prices" | "pricing" | "cost" | "costs" | "budget" | "precio" | "precios"
            | "costo" | "costos" | "presupuesto" | "preço" | "custos" | "orçamento" => {
                "concept:pricing"
            }
            "meeting" | "meetings" | "call" | "calls" | "sync" | "reunion" | "reunión"
            | "reuniones" | "llamada" | "llamadas" | "reunião" | "chamada" => "concept:meeting",
            "launch" | "release" | "ship" | "shipping" | "lanzamiento" | "lanzar" | "publicar"
            | "lançamento" => "concept:launch",
            "email" | "mail" | "correo" | "correio" => "concept:email",
            "customer" | "client" | "cliente" | "clientes" => "concept:customer",
            "task" | "tasks" | "todo" | "issue" | "tarea" | "tareas" | "tarefa" | "tarefas" => {
                "concept:task"
            }
            _ => token,
        })
        .map(str::to_string)
        .collect()
}

fn overlap(left: &HashSet<String>, right: &HashSet<String>) -> f32 {
    if left.is_empty() {
        return 0.0;
    }
    left.intersection(right).count() as f32 / left.len() as f32
}

fn trigram_overlap(query: &str, text: &str) -> f32 {
    let query = trigrams(query, 128);
    let text = trigrams(text, 8_000);
    overlap(&query, &text)
}

fn trigrams(value: &str, max: usize) -> HashSet<String> {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() < 3 {
        return [value.to_string()].into_iter().collect();
    }
    chars
        .windows(3)
        .take(max)
        .map(|window| window.iter().collect::<String>())
        .collect()
}

fn excerpt(text: &str) -> String {
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= MAX_EXCERPT_CHARS {
        return collapsed;
    }
    format!(
        "{}…",
        collapsed
            .chars()
            .take(MAX_EXCERPT_CHARS.saturating_sub(1))
            .collect::<String>()
    )
}

fn source_enabled(selected: &HashSet<MemorySource>, source: MemorySource) -> bool {
    selected.is_empty() || selected.contains(&source)
}

fn date_matches(value: i64, since: Option<i64>, until: Option<i64>) -> bool {
    since.is_none_or(|bound| value >= bound) && until.is_none_or(|bound| value <= bound)
}

fn normalized_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
}

fn optional_matches(value: Option<&str>, filter: Option<&str>) -> bool {
    filter.is_none_or(|filter| {
        value.is_some_and(|value| value.trim().to_lowercase().contains(filter))
    })
}

fn parse_timestamp_ms(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.timestamp_millis())
        .or_else(|_| {
            DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S %z")
                .map(|timestamp| timestamp.timestamp_millis())
        })
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Local, TimeZone};
    use tempfile::TempDir;

    use crate::library::{LibraryItemStatus, MeetingDetails, MeetingSummaryStatus};
    use crate::storage::TranscriptionMetadata;

    struct Fixture {
        storage: StorageManager,
        _directory: TempDir,
    }

    fn fixture() -> Fixture {
        let directory = tempfile::tempdir().unwrap();
        let storage = StorageManager::new(directory.path().join("memory.db")).unwrap();
        storage
            .save_transcription_with_cleanup(
                "Pricing should be twenty dollars".to_string(),
                "Pricing should be $20.".to_string(),
                String::new(),
                TranscriptionMetadata {
                    mode_id: Some("email".to_string()),
                    mode_name: Some("Email".to_string()),
                    app_id: Some("com.apple.mail".to_string()),
                    ..Default::default()
                },
                Some("dictation-1".to_string()),
                Some(Local.timestamp_millis_opt(1_700_000_000_000).unwrap()),
            )
            .unwrap();
        storage
            .insert_meeting_item(
                LibraryItem {
                    id: "meeting-1".to_string(),
                    name: "Launch sync".to_string(),
                    audio_path: String::new(),
                    source_path: String::new(),
                    store_original: false,
                    status: LibraryItemStatus::Complete,
                    transcript: Some("We agreed to ship on Friday.".to_string()),
                    segments: None,
                    words: None,
                    duration_seconds: 20.0,
                    file_size_bytes: 0,
                    original_format: "wav".to_string(),
                    created_at: "2023-11-15T10:00:00Z".to_string(),
                    transcribed_at: None,
                    tags: vec!["release".to_string()],
                    llm_cleanup_enabled: false,
                    denoise_enabled: false,
                    speech_model: "test".to_string(),
                    show_timestamps: false,
                    detect_speakers: false,
                    kind: "meeting".to_string(),
                    speakers: None,
                },
                &MeetingDetails {
                    library_item_id: "meeting-1".to_string(),
                    started_at: "2023-11-15T10:00:00Z".to_string(),
                    ended_at: Some("2023-11-15T10:05:00Z".to_string()),
                    notes: "Confirm the release date with the client.".to_string(),
                    notes_revision: 0,
                    summary: None,
                    summary_status: MeetingSummaryStatus::Idle,
                    summary_error: None,
                    system_audio_enabled: true,
                    recovered: false,
                    calendar_context: None,
                    note_markers: vec![],
                    live_transcript: vec![],
                },
            )
            .unwrap();
        Fixture {
            storage,
            _directory: directory,
        }
    }

    #[test]
    fn searches_raw_and_final_text_with_semantic_aliases() {
        let fixture = fixture();
        let results = search(
            &fixture.storage,
            MemorySearchFilter {
                query: "cost".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(results[0].id, "dictation-1");
        assert_eq!(results[0].final_text, "Pricing should be $20.");
        assert_eq!(
            results[0].raw_text.as_deref(),
            Some("Pricing should be twenty dollars")
        );
    }

    #[test]
    fn filters_by_source_app_and_workflow() {
        let fixture = fixture();
        let dictations = search(
            &fixture.storage,
            MemorySearchFilter {
                query: "pricing".to_string(),
                sources: vec![MemorySource::Dictation],
                app_id: Some("apple.mail".to_string()),
                workflow_id: Some("email".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(dictations.len(), 1);

        let meetings = search(
            &fixture.storage,
            MemorySearchFilter {
                query: "customer launch".to_string(),
                sources: vec![MemorySource::Meeting],
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(meetings[0].id, "meeting-1");
        assert_eq!(meetings[0].open_target, "library");
    }
}
