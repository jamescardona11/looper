use std::{path::PathBuf, sync::Arc};

use chrono::{DateTime, Local};
use parking_lot::Mutex;
use rusqlite::Connection;

mod library_api;
mod schema;
mod transcriptions;

#[cfg(test)]
mod meeting_tests;

macro_rules! storage_model {
    (
        $(#[$model_attribute:meta])*
        $visibility:vis $name:ident {
            $(
                $(#[$field_attribute:meta])*
                $field:ident: $field_type:ty
            ),* $(,)?
        }
    ) => {
        $(#[$model_attribute])*
        $visibility struct $name {
            $(
                $(#[$field_attribute])*
                pub $field: $field_type,
            )*
        }
    };
}

storage_model! {
    #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
    pub TranscriptionRecord {
        id: String,
        timestamp: DateTime<Local>,
        /// The final text (cleaned if LLM was used, otherwise raw)
        text: String,
        /// The raw transcription before LLM cleanup (if applicable)
        #[serde(default)]
        raw_text: Option<String>,
        audio_path: String,
        #[serde(default)]
        audio_available: bool,
        status: TranscriptionStatus,
        error_message: Option<String>,
        /// Whether LLM cleanup was applied
        #[serde(default)]
        llm_cleaned: bool,
        #[serde(default)]
        speech_model: String,
        #[serde(default)]
        llm_model: Option<String>,
        #[serde(default)]
        word_count: u32,
        #[serde(default)]
        audio_duration_seconds: f32,
        #[serde(default)]
        synced: bool,
        #[serde(default)]
        mode_id: Option<String>,
        #[serde(default)]
        mode_name: Option<String>,
        #[serde(default)]
        app_id: Option<String>,
    }
}

storage_model! {
    #[derive(Debug, Clone, Default)]
    pub LifetimeStats {
        words: u64,
        duration_ms: u64,
        dictations: u64,
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TranscriptionStatus {
    Success,
    Error,
}

impl TranscriptionStatus {
    fn as_str(&self) -> &'static str {
        if matches!(self, Self::Success) {
            "success"
        } else {
            "error"
        }
    }

    fn from_str(stored: &str) -> std::result::Result<Self, &'static str> {
        let normalized = stored.to_ascii_lowercase();
        if normalized == "success" {
            Ok(Self::Success)
        } else if normalized == "error" {
            Ok(Self::Error)
        } else {
            Err("Unknown transcription status")
        }
    }
}

pub struct StorageManager {
    connection: Arc<Mutex<Connection>>,
    library_root: PathBuf,
}

storage_model! {
    #[derive(Debug, Clone, Default)]
    pub TranscriptionMetadata {
        speech_model: String,
        llm_model: Option<String>,
        word_count: u32,
        audio_duration_seconds: f32,
        synced: bool,
        mode_id: Option<String>,
        mode_name: Option<String>,
        app_id: Option<String>,
    }
}

storage_model! {
    #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
    pub ImportedTranscription {
        text: String,
        timestamp_ms: i64,
    }
}
