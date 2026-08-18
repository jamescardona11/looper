use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use anyhow::Context;
use chrono::{DateTime, Local};
use tauri::async_runtime;
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use super::contracts::{
    AppRuntime, LooperResult, TranscriptionCompletePayload, EVENT_TRANSCRIPTION_COMPLETE,
};
use super::state::AppState;
use crate::recorder::{self, validate_recording, CompletedRecording, RecordingRejectionReason};
use crate::settings::{self, Personality, RecordingPrunePolicy, UserSettings};
use crate::{analytics, transcribe};

pub(crate) struct BudgetPreview {
    pub current_bytes: u64,
    pub limit_bytes: u64,
    pub candidate_count: u32,
    pub candidate_bytes: u64,
}

struct SavedAudio {
    location: PathBuf,
    bytes: u64,
    modified: SystemTime,
}

struct BudgetPlan {
    total: u64,
    reclaimable: u64,
    removals: Vec<PathBuf>,
}

#[derive(Clone, Copy)]
enum TreeMode {
    Inspect,
    Remove,
}

pub(crate) fn persist_recording_async(
    app: AppHandle<AppRuntime>,
    recording: CompletedRecording,
    settings: UserSettings,
    active_mode: Option<Personality>,
    temporary: bool,
    cancel_token: CancellationToken,
) {
    let input = settings
        .microphone_device
        .as_ref()
        .map_or("default", |_| "selected");
    let destination = match recordings_root(&app) {
        Ok(directory) => directory,
        Err(error) => {
            report_persist_failure(&app, input, &error.to_string());
            emit_error(
                &app,
                format!("Failed to resolve recordings directory: {error}"),
            );
            return;
        }
    };
    if let Err(rejection) = validate_recording(&recording) {
        reject_recording(&app, &recording, rejection);
        return;
    }

    async_runtime::spawn(async move {
        let persistence = async_runtime::spawn_blocking(move || {
            recorder::persist_recording(destination, &recording).map(|saved| (saved, recording))
        })
        .await;
        match persistence {
            Ok(Ok((saved, completed))) => transcribe::queue_transcription(
                &app,
                saved,
                completed,
                settings,
                active_mode,
                temporary,
                cancel_token,
            ),
            Ok(Err(error)) => {
                report_persist_failure(&app, input, &error.to_string());
                emit_error(&app, format!("Unable to save recording: {error}"));
            }
            Err(error) => {
                report_persist_failure(&app, input, &error.to_string());
                emit_error(&app, format!("Recording task failed: {error}"));
            }
        }
    });
}

fn report_persist_failure(app: &AppHandle<AppRuntime>, input: &str, detail: &str) {
    analytics::track_recording_failed(
        app,
        "persist",
        analytics::classify_failure_reason(detail),
        input,
    );
}

fn reject_recording(
    app: &AppHandle<AppRuntime>,
    recording: &CompletedRecording,
    rejection: RecordingRejectionReason,
) {
    let reason = match rejection {
        RecordingRejectionReason::TooShort {
            duration_ms,
            min_ms,
        } => format!("Recording too short ({duration_ms}ms < {min_ms}ms minimum)"),
        RecordingRejectionReason::TooQuiet { rms, threshold } => {
            format!("Recording too quiet (energy {rms:.4} < {threshold} threshold)")
        }
        RecordingRejectionReason::NoSpeechDetected => "No speech detected in recording".into(),
        RecordingRejectionReason::EmptyBuffer => "Recording buffer is empty".into(),
    };
    tracing::error!("Recording rejected: {reason}");
    if let Some(pending) = recording.pending_path.as_deref() {
        let _ = fs::remove_file(pending);
    }
    app.state::<AppState>().pill().finish_processing(app);
}

pub(crate) fn emit_error(app: &AppHandle<AppRuntime>, message: String) {
    app.state::<AppState>()
        .pill()
        .transition_to_error(app, message.as_str());
}

pub(crate) fn emit_event<T>(app: &AppHandle<AppRuntime>, event: &str, payload: T)
where
    T: serde::Serialize + Clone,
{
    if let Err(error) = app.emit(event, payload) {
        tracing::error!("Failed to emit {event}: {error}");
    }
}

pub(crate) fn recordings_root(app: &AppHandle<AppRuntime>) -> LooperResult<PathBuf> {
    app.path()
        .app_data_dir()
        .context("App data directory not found")
        .map(|directory| directory.join("recordings"))
}

pub(crate) fn schedule_recording_prune(app: AppHandle<AppRuntime>, settings: UserSettings) {
    let age_policy = settings::auto_delete_recording_policy(&settings);
    if age_policy == RecordingPrunePolicy::Never && settings.audio_storage_budget_mb == 0 {
        return;
    }
    async_runtime::spawn(async move {
        let worker_app = app.clone();
        let result =
            async_runtime::spawn_blocking(move || prune_for_settings(&worker_app, &settings)).await;
        match result {
            Ok(Ok(removed)) => refresh_history_after_removal(&app, removed),
            Ok(Err(error)) => tracing::error!("Failed to prune recordings: {error}"),
            Err(error) => tracing::error!("Recording prune task failed: {error}"),
        }
    });
}

pub(crate) fn schedule_transcription_prune(app: AppHandle<AppRuntime>, settings: UserSettings) {
    async_runtime::spawn(async move {
        let worker_app = app.clone();
        let result = async_runtime::spawn_blocking(move || {
            transcribe::run_transcription_prune_for_settings(&worker_app, &settings)
        })
        .await;
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => tracing::error!("Failed to prune transcriptions: {error}"),
            Err(error) => tracing::error!("Transcription prune task failed: {error}"),
        }
    });
}

pub(crate) fn inspect_age_policy(
    app: &AppHandle<AppRuntime>,
    policy: RecordingPrunePolicy,
) -> LooperResult<u32> {
    process_age_policy(app, policy, Local::now(), TreeMode::Inspect)
}

pub(crate) fn inspect_budget(
    app: &AppHandle<AppRuntime>,
    budget_mb: u32,
) -> LooperResult<BudgetPreview> {
    let limit = u64::from(budget_mb).saturating_mul(1024 * 1024);
    let plan = plan_budget(&recordings_root(app)?, limit)?;
    Ok(BudgetPreview {
        current_bytes: plan.total,
        limit_bytes: limit,
        candidate_count: plan.removals.len() as u32,
        candidate_bytes: plan.reclaimable,
    })
}

fn prune_for_settings(app: &AppHandle<AppRuntime>, settings: &UserSettings) -> LooperResult<u32> {
    let age = process_age_policy(
        app,
        settings::auto_delete_recording_policy(settings),
        Local::now(),
        TreeMode::Remove,
    )?;
    let limit = u64::from(settings.audio_storage_budget_mb).saturating_mul(1024 * 1024);
    let budget = apply_budget(&recordings_root(app)?, limit)?;
    Ok(age.saturating_add(budget))
}

fn refresh_history_after_removal(app: &AppHandle<AppRuntime>, removed: u32) {
    if removed == 0 {
        return;
    }
    let _ = app.emit(
        EVENT_TRANSCRIPTION_COMPLETE,
        TranscriptionCompletePayload {
            transcript: String::new(),
            auto_paste: false,
            record: None,
        },
    );
}

fn apply_budget(root: &Path, limit: u64) -> LooperResult<u32> {
    let plan = plan_budget(root, limit)?;
    for recording in &plan.removals {
        fs::remove_file(recording)
            .with_context(|| format!("Failed to remove recording {}", recording.display()))?;
    }
    Ok(plan.removals.len() as u32)
}

fn plan_budget(root: &Path, limit: u64) -> LooperResult<BudgetPlan> {
    if limit == 0 || !root.exists() {
        return Ok(BudgetPlan {
            total: 0,
            reclaimable: 0,
            removals: Vec::new(),
        });
    }
    let mut recordings = Vec::new();
    discover_saved_audio(root, &mut recordings)?;
    recordings.sort_by(|left, right| {
        (left.modified, &left.location).cmp(&(right.modified, &right.location))
    });
    let total = recordings
        .iter()
        .map(|recording| recording.bytes)
        .fold(0_u64, u64::saturating_add);
    let mut remaining = total;
    let mut reclaimable = 0_u64;
    let mut removals = Vec::new();
    for recording in recordings {
        if remaining <= limit {
            break;
        }
        remaining = remaining.saturating_sub(recording.bytes);
        reclaimable = reclaimable.saturating_add(recording.bytes);
        removals.push(recording.location);
    }
    Ok(BudgetPlan {
        total,
        reclaimable,
        removals,
    })
}

fn discover_saved_audio(directory: &Path, output: &mut Vec<SavedAudio>) -> LooperResult<()> {
    for item in fs::read_dir(directory).with_context(|| {
        format!(
            "Failed to read recordings directory {}",
            directory.display()
        )
    })? {
        let item = item?;
        let location = item.path();
        let metadata = item.metadata()?;
        if metadata.is_dir() {
            if !is_pending_dir(&location) {
                discover_saved_audio(&location, output)?;
            }
        } else if is_wav(&location, &metadata) {
            output.push(SavedAudio {
                location,
                bytes: metadata.len(),
                modified: metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
            });
        }
    }
    Ok(())
}

fn process_age_policy(
    app: &AppHandle<AppRuntime>,
    policy: RecordingPrunePolicy,
    now: DateTime<Local>,
    mode: TreeMode,
) -> LooperResult<u32> {
    let root = recordings_root(app)?;
    if policy == RecordingPrunePolicy::Never || !root.exists() {
        return Ok(0);
    }
    let cutoff = settings::recording_prune_cutoff(policy, now);
    scan_age_tree(&root, policy, cutoff, mode).map(|result| result.0)
}

fn scan_age_tree(
    directory: &Path,
    policy: RecordingPrunePolicy,
    cutoff: Option<DateTime<Local>>,
    mode: TreeMode,
) -> LooperResult<(u32, bool)> {
    let mut candidates = 0_u32;
    let mut empty_afterwards = true;
    for item in fs::read_dir(directory).with_context(|| {
        format!(
            "Failed to read recordings directory {}",
            directory.display()
        )
    })? {
        let item = item?;
        let location = item.path();
        let metadata = item.metadata()?;
        if metadata.is_dir() {
            if is_pending_dir(&location) {
                empty_afterwards = false;
                continue;
            }
            let (nested_count, nested_empty) = scan_age_tree(&location, policy, cutoff, mode)?;
            candidates = candidates.saturating_add(nested_count);
            if nested_empty && matches!(mode, TreeMode::Remove) {
                fs::remove_dir(&location).with_context(|| {
                    format!(
                        "Failed to remove empty recordings directory {}",
                        location.display()
                    )
                })?;
            } else if !nested_empty {
                empty_afterwards = false;
            }
            continue;
        }
        if eligible_by_age(&location, &metadata, policy, cutoff) {
            candidates = candidates.saturating_add(1);
            if matches!(mode, TreeMode::Remove) {
                fs::remove_file(&location).with_context(|| {
                    format!("Failed to remove recording {}", location.display())
                })?;
            }
        } else {
            empty_afterwards = false;
        }
    }
    Ok((candidates, empty_afterwards))
}

fn is_pending_dir(path: &Path) -> bool {
    path.file_name().and_then(|value| value.to_str()) == Some(recorder::PENDING_DIR_NAME)
}

fn is_wav(path: &Path, metadata: &fs::Metadata) -> bool {
    metadata.is_file()
        && path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("wav"))
}

fn eligible_by_age(
    path: &Path,
    metadata: &fs::Metadata,
    policy: RecordingPrunePolicy,
    cutoff: Option<DateTime<Local>>,
) -> bool {
    if !is_wav(path, metadata) {
        return false;
    }
    if policy == RecordingPrunePolicy::Immediately {
        return true;
    }
    cutoff.is_some_and(|limit| {
        metadata
            .modified()
            .ok()
            .is_some_and(|timestamp| DateTime::<Local>::from(timestamp) <= limit)
    })
}

#[cfg(test)]
mod tests {
    use super::{apply_budget, plan_budget};
    use crate::recorder::PENDING_DIR_NAME;
    use std::fs;

    #[test]
    fn budget_uses_saved_wavs_only_and_orders_equal_timestamps_by_path() {
        let temp = tempfile::tempdir().unwrap();
        let saved = temp.path().join("saved");
        let pending = temp.path().join(PENDING_DIR_NAME);
        fs::create_dir_all(&saved).unwrap();
        fs::create_dir_all(&pending).unwrap();
        fs::write(saved.join("a.wav"), [0_u8; 6]).unwrap();
        fs::write(saved.join("b.wav"), [0_u8; 6]).unwrap();
        fs::write(saved.join("ignored.mp3"), [0_u8; 100]).unwrap();
        fs::write(pending.join("active.wav"), [0_u8; 100]).unwrap();

        let plan = plan_budget(temp.path(), 10).unwrap();
        assert_eq!((plan.total, plan.reclaimable), (12, 6));
        assert_eq!(plan.removals, [saved.join("a.wav")]);
    }

    #[test]
    fn applying_a_budget_removes_only_the_planned_audio() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("a.wav"), [0_u8; 6]).unwrap();
        fs::write(temp.path().join("b.wav"), [0_u8; 6]).unwrap();
        assert_eq!(apply_budget(temp.path(), 10).unwrap(), 1);
        assert!(!temp.path().join("a.wav").exists());
        assert!(temp.path().join("b.wav").exists());
    }

    #[test]
    fn a_zero_budget_disables_budget_removal() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("saved.wav"), [0_u8; 12]).unwrap();
        let plan = plan_budget(temp.path(), 0).unwrap();
        assert_eq!((plan.total, plan.reclaimable), (0, 0));
        assert!(plan.removals.is_empty());
    }
}
