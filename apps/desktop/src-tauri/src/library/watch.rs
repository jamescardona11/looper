use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};

use anyhow::{Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{async_runtime, AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::{AppRuntime, AppState, LibraryJob, LibraryJobKind};

use super::processing::create_item_from_path_with_id;
use super::queue::schedule_library_job;
use super::types::{LibraryImportOptions, SUPPORTED_AUDIO_FORMATS, SUPPORTED_VIDEO_FORMATS};

pub const EVENT_LIBRARY_WATCH_IMPORTED: &str = "library:watch_imported";
const SCAN_INTERVAL: Duration = Duration::from_secs(5);
const MINIMUM_FILE_AGE: Duration = Duration::from_secs(2);

pub(crate) const fn minimum_file_age() -> Duration {
    MINIMUM_FILE_AGE
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LibraryWatchFolder {
    pub path: String,
    pub options: LibraryImportOptions,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct WatchCandidate {
    pub path: PathBuf,
    pub fingerprint: String,
}

pub fn start_watch_folder_service(app: AppHandle<AppRuntime>) {
    async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(SCAN_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            ticker.tick().await;
            if let Err(err) = scan_watch_folders(&app, MINIMUM_FILE_AGE) {
                tracing::warn!("[watch-folders] Scan failed: {err}");
            }
        }
    });
}

pub(crate) fn scan_watch_folders(
    app: &AppHandle<AppRuntime>,
    minimum_age: Duration,
) -> Result<usize> {
    static SCAN_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let _scan_guard = SCAN_LOCK.get_or_init(|| Mutex::new(())).lock();
    let state = app.state::<AppState>();
    if crate::license::require_license_gate(&state.settings_store, "Library").is_err() {
        return Ok(0);
    }

    let folders = state.storage().get_library_watch_folders()?;
    let mut imported = 0;
    for folder in folders.into_iter().filter(|folder| folder.enabled) {
        let candidates = match discover_watch_candidates(
            Path::new(&folder.path),
            minimum_age,
            SystemTime::now(),
        ) {
            Ok(candidates) => candidates,
            Err(err) => {
                tracing::warn!("[watch-folders] Could not scan {}: {err}", folder.path);
                continue;
            }
        };

        for candidate in candidates {
            let path = candidate.path.to_string_lossy().to_string();
            let item_id = Uuid::new_v4().to_string();
            if !state
                .storage()
                .claim_library_watch_file(&path, &candidate.fingerprint, &item_id)?
            {
                continue;
            }

            let item = match create_item_from_path_with_id(
                app,
                state.storage(),
                &candidate.path,
                &folder.options,
                item_id.clone(),
            ) {
                Ok(item) => item,
                Err(err) => {
                    state.storage().release_library_watch_file(
                        &path,
                        &candidate.fingerprint,
                        &item_id,
                    )?;
                    tracing::warn!(
                        "[watch-folders] Could not queue {}: {err}",
                        candidate.path.display()
                    );
                    continue;
                }
            };

            state
                .storage()
                .complete_library_watch_file(&path, &candidate.fingerprint, &item.id)?;
            schedule_library_job(
                app,
                &state,
                LibraryJob {
                    id: item.id.clone(),
                    kind: LibraryJobKind::Import {
                        source_path: candidate.path,
                        store_original: folder.options.store_original,
                    },
                },
            );
            let _ = app.emit(EVENT_LIBRARY_WATCH_IMPORTED, &item);
            imported += 1;
        }
    }
    Ok(imported)
}

pub(crate) fn discover_watch_candidates(
    folder: &Path,
    minimum_age: Duration,
    now: SystemTime,
) -> Result<Vec<WatchCandidate>> {
    let mut candidates = Vec::new();
    for entry in fs::read_dir(folder)
        .with_context(|| format!("Could not read watch folder {}", folder.display()))?
    {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if !file_type.is_file() {
            continue;
        }
        let path = entry.path();
        if !is_supported_media_file(&path) {
            continue;
        }
        let metadata = entry.metadata()?;
        if metadata.len() == 0 {
            continue;
        }
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        if now.duration_since(modified).unwrap_or_default() < minimum_age {
            continue;
        }
        let modified_nanos = modified
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        candidates.push(WatchCandidate {
            path,
            fingerprint: format!("{}:{modified_nanos}", metadata.len()),
        });
    }
    candidates.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(candidates)
}

fn is_supported_media_file(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    SUPPORTED_AUDIO_FORMATS.contains(&extension.as_str())
        || SUPPORTED_VIDEO_FORMATS.contains(&extension.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_only_stable_supported_regular_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("one.wav"), [1, 2, 3]).unwrap();
        fs::write(dir.path().join("two.MP4"), [4, 5]).unwrap();
        fs::write(dir.path().join("empty.mp3"), b"").unwrap();
        fs::write(dir.path().join("notes.txt"), b"ignore").unwrap();
        fs::create_dir(dir.path().join("nested.wav")).unwrap();

        let candidates =
            discover_watch_candidates(dir.path(), Duration::ZERO, SystemTime::now()).unwrap();

        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].path.file_name().unwrap(), "one.wav");
        assert_eq!(candidates[1].path.file_name().unwrap(), "two.MP4");
        assert!(candidates
            .iter()
            .all(|candidate| !candidate.fingerprint.is_empty()));
    }

    #[test]
    fn waits_until_a_file_is_old_enough_to_be_stable() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("still-copying.wav"), [1]).unwrap();

        let candidates =
            discover_watch_candidates(dir.path(), Duration::from_secs(60), SystemTime::now())
                .unwrap();

        assert!(candidates.is_empty());
    }

    #[test]
    fn persists_folders_and_claims_each_file_version_once() {
        let dir = tempfile::tempdir().unwrap();
        let storage = crate::storage::StorageManager::new(dir.path().join("data.db")).unwrap();
        let folder = LibraryWatchFolder {
            path: dir.path().join("inbox").to_string_lossy().to_string(),
            options: LibraryImportOptions {
                store_original: true,
                model_key: "parakeet".to_string(),
                llm_cleanup_enabled: false,
                denoise_enabled: false,
                show_timestamps: true,
                detect_speakers: false,
            },
            enabled: true,
        };

        storage.upsert_library_watch_folder(&folder).unwrap();
        assert_eq!(
            storage.get_library_watch_folders().unwrap(),
            vec![folder.clone()]
        );

        assert!(storage
            .claim_library_watch_file("/inbox/a.wav", "10:1", "item-1")
            .unwrap());
        storage
            .release_library_watch_file("/inbox/a.wav", "10:1", "item-1")
            .unwrap();
        assert!(storage
            .claim_library_watch_file("/inbox/a.wav", "10:1", "item-1")
            .unwrap());
        storage
            .complete_library_watch_file("/inbox/a.wav", "10:1", "item-1")
            .unwrap();
        storage
            .release_library_watch_file("/inbox/a.wav", "10:1", "item-1")
            .unwrap();
        assert!(!storage
            .claim_library_watch_file("/inbox/a.wav", "10:1", "item-2")
            .unwrap());
        assert!(storage
            .claim_library_watch_file("/inbox/a.wav", "11:2", "item-3")
            .unwrap());

        storage.remove_library_watch_folder(&folder.path).unwrap();
        assert!(storage.get_library_watch_folders().unwrap().is_empty());
    }
}
