use std::path::PathBuf;

pub(crate) type AppRuntime = tauri::Wry;
pub(crate) type LooperResult<T> = anyhow::Result<T>;

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";
pub(crate) const SETTINGS_WINDOW_LABEL: &str = "settings";
pub(crate) const EVENT_RECORDING_START: &str = "recording:start";
pub(crate) const EVENT_AUDIO_SPECTRUM: &str = "audio:spectrum";
pub(crate) const EVENT_TRANSCRIPTION_COMPLETE: &str = "transcription:complete";
pub(crate) const EVENT_TRANSCRIPTION_ERROR: &str = "transcription:error";
pub(crate) const EVENT_SETTINGS_CHANGED: &str = "settings:changed";
pub(crate) const EVENT_LICENSE_CHECKOUT_RETURNED: &str = "license:checkout-returned";
pub(crate) const FFMPEG_HELP_URL: &str = "https://ffmpeg.org/download.html";

#[derive(Clone)]
pub struct LibraryJob {
    pub id: String,
    pub kind: LibraryJobKind,
}

#[derive(Clone)]
pub enum LibraryJobKind {
    Import {
        source_path: PathBuf,
        store_original: bool,
    },
    ImportYoutube {
        url: String,
        store_original: bool,
    },
    TranscribeExisting,
}

macro_rules! event_payload {
    ($name:ident { $($field:ident : $value:ty),+ $(,)? }) => {
        #[derive(serde::Serialize, Clone)]
        pub(crate) struct $name {
            $(pub(crate) $field: $value),+
        }
    };
}

event_payload!(RecordingStartPayload { started_at: String });
event_payload!(AudioSpectrumPayload { bins: Vec<u8> });
event_payload!(TranscriptionCompletePayload {
    transcript: String,
    auto_paste: bool,
    record: Option<crate::storage::TranscriptionRecord>,
});
event_payload!(TranscriptionErrorPayload {
    message: String,
    stage: String,
});

#[cfg(test)]
mod tests {
    use super::{
        AudioSpectrumPayload, LibraryJobKind, RecordingStartPayload, TranscriptionErrorPayload,
    };
    use std::path::PathBuf;

    #[test]
    fn event_payloads_keep_the_existing_wire_keys() {
        let start = serde_json::to_value(RecordingStartPayload {
            started_at: "2026-08-17T12:00:00Z".into(),
        })
        .unwrap();
        let spectrum = serde_json::to_value(AudioSpectrumPayload {
            bins: vec![1, 2, 3],
        })
        .unwrap();
        let failure = serde_json::to_value(TranscriptionErrorPayload {
            message: "offline".into(),
            stage: "speech".into(),
        })
        .unwrap();

        assert_eq!(
            start,
            serde_json::json!({ "started_at": "2026-08-17T12:00:00Z" })
        );
        assert_eq!(spectrum, serde_json::json!({ "bins": [1, 2, 3] }));
        assert_eq!(
            failure,
            serde_json::json!({ "message": "offline", "stage": "speech" })
        );
    }

    #[test]
    fn import_job_retains_source_and_storage_policy() {
        let kind = LibraryJobKind::Import {
            source_path: PathBuf::from("/tmp/interview.wav"),
            store_original: true,
        };
        match kind {
            LibraryJobKind::Import {
                source_path,
                store_original,
            } => {
                assert_eq!(source_path, PathBuf::from("/tmp/interview.wav"));
                assert!(store_original);
            }
            _ => panic!("import job changed variant"),
        }
    }
}
