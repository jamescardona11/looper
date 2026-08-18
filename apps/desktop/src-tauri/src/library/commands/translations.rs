use tauri::AppHandle;

use crate::{AppRuntime, AppState};

use super::super::types::LibraryTranslation;

const TARGET_LANGUAGES: &[&str] = &[
    "Arabic",
    "Chinese (Simplified)",
    "Chinese (Traditional)",
    "Dutch",
    "English",
    "French",
    "German",
    "Hindi",
    "Indonesian",
    "Italian",
    "Japanese",
    "Korean",
    "Polish",
    "Portuguese",
    "Russian",
    "Spanish",
    "Turkish",
    "Ukrainian",
    "Vietnamese",
];

pub(super) fn list(state: &AppState, item_id: String) -> Result<Vec<LibraryTranslation>, String> {
    state
        .storage()
        .get_library_translations(item_id.trim())
        .map_err(|error| format!("Failed to load translations: {error}"))
}

pub(super) async fn translate(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    item_id: String,
    language: String,
) -> Result<LibraryTranslation, String> {
    let language = supported_language(&language)?.to_owned();
    let item = state
        .storage()
        .get_library_item(item_id.trim())
        .map_err(|error| format!("Failed to load library item: {error}"))?
        .ok_or_else(|| "Library item not found".to_owned())?;
    let transcript = item
        .transcript
        .filter(|text| !text.trim().is_empty())
        .ok_or_else(|| "This Library item has no transcript to translate".to_owned())?;
    let settings = state.current_settings();
    let text = crate::llm_cleanup::translate_transcription(
        app,
        &state.http(),
        &transcript,
        &settings,
        &language,
    )
    .await
    .map_err(|error| crate::llm_cleanup::llm_issue_message(&error))?;
    let translation = LibraryTranslation {
        item_id: item.id,
        language,
        text,
        model: crate::llm_cleanup::resolved_model_label(&settings).unwrap_or_default(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state
        .storage()
        .upsert_library_translation(&translation)
        .map_err(|error| format!("Failed to save translation: {error}"))?;
    Ok(translation)
}

pub(super) fn delete(state: &AppState, item_id: String, language: String) -> Result<(), String> {
    let language = supported_language(&language)?;
    state
        .storage()
        .delete_library_translation(item_id.trim(), language)
        .map_err(|error| format!("Failed to delete translation: {error}"))
}

fn supported_language(language: &str) -> Result<&str, String> {
    let normalized = language.trim();
    TARGET_LANGUAGES
        .contains(&normalized)
        .then_some(normalized)
        .ok_or_else(|| "Choose a supported target language".to_owned())
}

#[cfg(test)]
mod tests {
    use super::supported_language;

    #[test]
    fn language_policy_trims_known_names_and_rejects_codes() {
        assert_eq!(supported_language("  Spanish ").unwrap(), "Spanish");
        assert_eq!(
            supported_language("es").unwrap_err(),
            "Choose a supported target language"
        );
    }
}
