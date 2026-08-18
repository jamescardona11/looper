use crate::{assistive, storage::TranscriptionRecord, toast, AppRuntime, AppState};
use tauri::menu::{MenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager};

pub const MENU_ID_RECENT_TRANSCRIPTION_PREFIX: &str = "menu_recent_transcription_";

const MENU_ID_RECENT_TRANSCRIPTION_EMPTY: &str = "menu_recent_transcription_empty";
const MENU_ID_RECENT_TRANSCRIPTION_ERROR: &str = "menu_recent_transcription_error";
const RECENT_TRANSCRIPTIONS_LIMIT: usize = 5;
const RECENT_TRANSCRIPTIONS_PREVIEW_LEN: usize = 60;

struct MenuOption {
    id: String,
    title: String,
    enabled: bool,
}

impl MenuOption {
    fn transcription(record: TranscriptionRecord) -> Self {
        Self {
            id: format!("{MENU_ID_RECENT_TRANSCRIPTION_PREFIX}{}", record.id),
            title: transcription_preview(&record.text, RECENT_TRANSCRIPTIONS_PREVIEW_LEN),
            enabled: true,
        }
    }

    fn empty() -> Self {
        Self::placeholder(MENU_ID_RECENT_TRANSCRIPTION_EMPTY, "No transcriptions yet")
    }

    fn unavailable() -> Self {
        Self::placeholder(
            MENU_ID_RECENT_TRANSCRIPTION_ERROR,
            "Unable to load transcriptions",
        )
    }

    fn placeholder(id: &str, title: &str) -> Self {
        Self {
            id: id.to_string(),
            title: title.to_string(),
            enabled: false,
        }
    }
}

pub fn build_recent_transcriptions_menu(
    app: &AppHandle<AppRuntime>,
    label: &str,
) -> tauri::Result<tauri::menu::Submenu<AppRuntime>> {
    let options = menu_options(app);
    let builder = options.into_iter().try_fold(
        SubmenuBuilder::new(app, label),
        |builder, option| -> tauri::Result<_> {
            let item =
                MenuItem::with_id(app, option.id, option.title, option.enabled, None::<&str>)?;
            Ok(builder.item(&item))
        },
    )?;
    builder.build()
}

fn menu_options(app: &AppHandle<AppRuntime>) -> Vec<MenuOption> {
    let Some(state) = app.try_state::<AppState>() else {
        return vec![MenuOption::empty()];
    };

    match state
        .storage()
        .get_recent_transcriptions(RECENT_TRANSCRIPTIONS_LIMIT)
    {
        Ok(records) => options_for_records(records),
        Err(error) => {
            tracing::error!("Failed to load recent transcriptions for menu: {error}");
            vec![MenuOption::unavailable()]
        }
    }
}

fn options_for_records(records: Vec<TranscriptionRecord>) -> Vec<MenuOption> {
    if records.is_empty() {
        vec![MenuOption::empty()]
    } else {
        records.into_iter().map(MenuOption::transcription).collect()
    }
}

enum ClipboardRequest<'a> {
    Copy(&'a str),
    Reject(&'static str),
}

impl<'a> ClipboardRequest<'a> {
    fn from_text(text: Option<&'a str>) -> Self {
        match text.map(str::trim) {
            None => Self::Reject("Transcription no longer available"),
            Some("") => Self::Reject("Transcription is empty"),
            Some(text) => Self::Copy(text),
        }
    }
}

pub fn copy_transcription_to_clipboard(app: &AppHandle<AppRuntime>, transcription_id: &str) {
    let record = app
        .state::<AppState>()
        .storage()
        .get_by_id(transcription_id);

    let text = match ClipboardRequest::from_text(record.as_ref().map(|item| item.text.as_str())) {
        ClipboardRequest::Reject(message) => {
            publish_clipboard_toast(app, ClipboardToast::Error(message));
            refresh_recent_menus(app);
            return;
        }
        ClipboardRequest::Copy(text) => text,
    };

    if let Err(error) = assistive::copy_text_to_clipboard(text) {
        tracing::error!("Failed to copy transcription to clipboard: {error}");
        publish_clipboard_toast(app, ClipboardToast::Error("Unable to copy to clipboard"));
        return;
    }

    publish_clipboard_toast(app, ClipboardToast::Copied);
}

enum ClipboardToast<'a> {
    Copied,
    Error(&'a str),
}

fn clipboard_toast_payload(notice: ClipboardToast<'_>) -> toast::Payload {
    let (toast_type, message, duration) = match notice {
        ClipboardToast::Copied => ("success", "Copied to clipboard", 1200),
        ClipboardToast::Error(message) => ("error", message, 1600),
    };

    toast::Payload {
        toast_type: toast_type.to_string(),
        title: None,
        message: message.to_string(),
        auto_dismiss: Some(true),
        duration: Some(duration),
        retry_id: None,
        mode: None,
        action: None,
        action_label: None,
        secondary_action: None,
        secondary_action_label: None,
    }
}

fn publish_clipboard_toast(app: &AppHandle<AppRuntime>, notice: ClipboardToast<'_>) {
    toast::emit_toast(app, clipboard_toast_payload(notice));
}

fn refresh_recent_menus(app: &AppHandle<AppRuntime>) {
    let settings = app.state::<AppState>().current_settings();
    if let Err(error) = crate::tray::refresh_tray_menu(app, &settings) {
        tracing::error!("Failed to refresh tray menu: {error}");
    }
    #[cfg(target_os = "macos")]
    if let Err(error) = crate::set_app_menu(app, &settings) {
        tracing::error!("Failed to refresh app menu: {error}");
    }
}

fn transcription_preview(text: &str, maximum_chars: usize) -> String {
    let normalized = text
        .split_whitespace()
        .fold(String::new(), |mut joined, word| {
            if !joined.is_empty() {
                joined.push(' ');
            }
            joined.push_str(word);
            joined
        });

    if normalized.is_empty() {
        return "Empty transcription".to_string();
    }
    if normalized.chars().count() <= maximum_chars {
        return normalized;
    }

    let visible_chars = maximum_chars.saturating_sub(3);
    normalized
        .chars()
        .take(visible_chars)
        .chain("...".chars())
        .collect()
}

#[cfg(test)]
mod tests {
    use chrono::{Local, TimeZone};
    use serde_json::json;

    use super::*;
    use crate::storage::{StorageManager, TranscriptionMetadata, TranscriptionStatus};

    fn record(id: &str, text: &str) -> TranscriptionRecord {
        let metadata = TranscriptionMetadata::default();
        TranscriptionRecord {
            id: id.to_string(),
            timestamp: Local.timestamp_millis_opt(1_700_000_000_000).unwrap(),
            text: text.to_string(),
            raw_text: None,
            audio_path: String::new(),
            audio_available: false,
            status: TranscriptionStatus::Success,
            error_message: None,
            llm_cleaned: false,
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

    #[test]
    fn preview_collapses_whitespace_and_counts_unicode_scalars() {
        assert_eq!(
            transcription_preview("  uno\n\tdos   tres ", 60),
            "uno dos tres"
        );

        let unicode = "á".repeat(61);
        assert_eq!(
            transcription_preview(&unicode, 60),
            format!("{}...", "á".repeat(57))
        );
        assert_eq!(transcription_preview("   \n ", 60), "Empty transcription");
    }

    #[test]
    fn menu_policy_keeps_storage_order_and_record_ids() {
        let options =
            options_for_records(vec![record("newest", "First"), record("older", "Second")]);
        let contract: Vec<_> = options
            .into_iter()
            .map(|option| (option.id, option.title, option.enabled))
            .collect();

        assert_eq!(
            contract,
            vec![
                (
                    "menu_recent_transcription_newest".to_string(),
                    "First".to_string(),
                    true,
                ),
                (
                    "menu_recent_transcription_older".to_string(),
                    "Second".to_string(),
                    true,
                ),
            ]
        );
    }

    #[test]
    fn sqlite_query_keeps_recent_limit_and_newest_first_order() {
        let directory = tempfile::tempdir().unwrap();
        let storage = StorageManager::new(directory.path().join("history.sqlite3")).unwrap();
        let base_timestamp = 1_700_000_000_000i64;

        for index in 0..6 {
            storage
                .save_transcription(
                    format!("transcript {index}"),
                    String::new(),
                    TranscriptionStatus::Success,
                    None,
                    TranscriptionMetadata::default(),
                    Some(format!("record-{index}")),
                    Some(Local.timestamp_millis_opt(base_timestamp + index).unwrap()),
                )
                .unwrap();
        }

        let records = storage
            .get_recent_transcriptions(RECENT_TRANSCRIPTIONS_LIMIT)
            .unwrap();
        let ids: Vec<_> = records.into_iter().map(|item| item.id).collect();
        assert_eq!(
            ids,
            ["record-5", "record-4", "record-3", "record-2", "record-1"]
        );
    }

    #[test]
    fn empty_menu_and_clipboard_rejections_keep_public_messages() {
        let empty = options_for_records(Vec::new()).pop().unwrap();
        assert_eq!(
            (empty.id.as_str(), empty.title.as_str(), empty.enabled),
            (
                "menu_recent_transcription_empty",
                "No transcriptions yet",
                false,
            )
        );

        assert!(matches!(
            ClipboardRequest::from_text(None),
            ClipboardRequest::Reject("Transcription no longer available")
        ));
        assert!(matches!(
            ClipboardRequest::from_text(Some(" \n ")),
            ClipboardRequest::Reject("Transcription is empty")
        ));
        assert!(matches!(
            ClipboardRequest::from_text(Some("  copied text  ")),
            ClipboardRequest::Copy("copied text")
        ));
    }

    #[test]
    fn clipboard_toast_wire_contract_preserves_durations() {
        let copied = serde_json::to_value(clipboard_toast_payload(ClipboardToast::Copied)).unwrap();
        let error =
            serde_json::to_value(clipboard_toast_payload(ClipboardToast::Error("Nope"))).unwrap();

        assert_eq!(copied["type"], "success");
        assert_eq!(copied["message"], "Copied to clipboard");
        assert_eq!(copied["duration"], 1200);
        assert_eq!(copied["autoDismiss"], true);
        assert_eq!(copied["retryId"], json!(null));
        assert_eq!(error["type"], "error");
        assert_eq!(error["message"], "Nope");
        assert_eq!(error["duration"], 1600);
    }
}
