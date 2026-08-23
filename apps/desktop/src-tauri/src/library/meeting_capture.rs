use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Local, Utc};
use parking_lot::{Mutex, RwLock};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::{
    model_manager, permissions, pill, remote_speech, AppRuntime, AppState, LibraryJob,
    LibraryJobKind,
};

use super::meeting_silence::{
    stopped_notification, warning_notification, MeetingSilenceMonitor,
    MeetingVoiceActivityDetector, SilenceAction, WATCHDOG_POLL_INTERVAL,
};
use super::processing::{library_root, read_wav_info};
use super::queue::schedule_library_job;
use super::types::{
    CaptureIntent, LibraryItem, LibraryItemPatch, LibraryItemStatus, MeetingCaptureHealth,
    MeetingCaptureHealthStatus, MeetingCapturePhase, MeetingCaptureState, MeetingDetails,
    MeetingImportantMoment, MeetingNoteKind, MeetingNoteMarker, MeetingNoteSelection,
    MeetingStartOptions, MeetingSummaryStatus, EVENT_MEETING_CAPTURE_STATE,
    EVENT_MEETING_DETAILS_CHANGED, TARGET_SAMPLE_RATE,
};

const CAPTURE_CHUNK_SAMPLES: usize = 1_600;
const CAPTURE_START_TIMEOUT: Duration = Duration::from_secs(8);
const CAPTURE_STALL_TIMEOUT: Duration = Duration::from_secs(5);
const CAPTURE_LAG_WARNING_SAMPLES: u64 = TARGET_SAMPLE_RATE as u64 / 2;
const MIN_FREE_DISK_BYTES: u64 = 256 * 1024 * 1024;
/// Por debajo de esto la captura se guarda y se para por su cuenta. Comprobarlo
/// solo al empezar dejaba que una grabación larga muriera a medio escribir y se
/// perdiera entera; parar a tiempo la conserva.
const CAPTURE_LOW_DISK_BYTES: u64 = 128 * 1024 * 1024;
const DISK_CHECK_EVERY_SECONDS: u64 = 15;
const NOTE_CONTEXT_BEFORE_MS: u64 = 30_000;
const NOTE_HOLD_INITIAL_CONTEXT_MS: u64 = 10_000;
const NOTE_HOLD_STEP_MS: u64 = 2_000;
const NOTE_DURATION_STEP_MS: u64 = 5_000;
const NOTE_HOLD_MAX_DURATION_MS: u64 = 60_000;
const NOTE_DOUBLE_TAP_WINDOW: Duration = Duration::from_millis(360);
const NOTE_DOUBLE_TAP_MAX_PRESS: Duration = Duration::from_millis(450);

fn meeting_elapsed_ms_at(
    started_at: Option<&str>,
    fallback_seconds: u64,
    now: DateTime<Utc>,
) -> u64 {
    let fallback_ms = fallback_seconds.saturating_mul(1_000);
    let wall_clock_ms = started_at
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|started| {
            (now - started.with_timezone(&Utc))
                .num_milliseconds()
                .max(0) as u64
        })
        .unwrap_or(0);
    wall_clock_ms.max(fallback_ms)
}

fn note_marker_range(elapsed_ms: u64) -> (u64, u64) {
    (
        elapsed_ms.saturating_sub(NOTE_CONTEXT_BEFORE_MS),
        elapsed_ms,
    )
}

fn note_selection_duration(held_ms: u64) -> u64 {
    NOTE_HOLD_INITIAL_CONTEXT_MS
        .saturating_add(
            held_ms
                .checked_div(NOTE_HOLD_STEP_MS)
                .unwrap_or(0)
                .saturating_mul(NOTE_DURATION_STEP_MS),
        )
        .min(NOTE_HOLD_MAX_DURATION_MS)
}

fn note_selection_range(anchor_ms: u64, elapsed_ms: u64) -> (u64, u64) {
    let end_ms = elapsed_ms.max(anchor_ms);
    let held_ms = end_ms.saturating_sub(anchor_ms);
    let selected_duration_ms = note_selection_duration(held_ms);
    (end_ms.saturating_sub(selected_duration_ms), end_ms)
}

fn qualifies_for_double_tap(held: Duration) -> bool {
    held <= NOTE_DOUBLE_TAP_MAX_PRESS
}

struct CaptureResult {
    samples_written: u64,
}

struct CapturedMeetingNote {
    marker: MeetingNoteMarker,
    details: MeetingDetails,
    state: Option<MeetingCaptureState>,
}

enum MeetingNoteGesture {
    Idle,
    RetrospectiveHolding {
        meeting_id: String,
        anchor_ms: u64,
        pressed_at: Instant,
    },
    RetrospectivePending {
        meeting_id: String,
        anchor_ms: u64,
        released_at_ms: u64,
        token: u64,
    },
    ImportantMoment {
        meeting_id: String,
        start_ms: u64,
        activation_release_pending: bool,
    },
    StopReleasePending,
}

impl Default for MeetingNoteGesture {
    fn default() -> Self {
        Self::Idle
    }
}

struct ActiveCapture {
    id: String,
    partial_path: PathBuf,
    final_path: PathBuf,
    intent: CaptureIntent,
    cancel: CancellationToken,
    task: tauri::async_runtime::JoinHandle<Result<CaptureResult>>,
    silence_monitor: Arc<MeetingSilenceMonitor>,
    #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
    live_transcription: Option<super::meeting_live_transcription::MeetingLiveTranscriptionSession>,
}

/// Reanudar añade audio a una captura que ya terminó, en vez de abrir otra.
/// El wav es siempre mono de 16 bits al mismo ritmo, así que se le escribe
/// detrás y los tiempos de lo ya marcado siguen apuntando al mismo sitio.
#[derive(Clone)]
struct ResumeTarget {
    id: String,
    audio_path: PathBuf,
}

struct CaptureStartOptions {
    model_key: String,
    live_model_key: Option<String>,
    system_audio_enabled: bool,
    calendar_context: Option<super::types::MeetingCalendarContext>,
    intent: CaptureIntent,
    resume: Option<ResumeTarget>,
}

impl From<MeetingStartOptions> for CaptureStartOptions {
    fn from(options: MeetingStartOptions) -> Self {
        Self {
            model_key: options.model_key,
            live_model_key: options.live_model_key,
            system_audio_enabled: options.system_audio_enabled,
            calendar_context: options.calendar_context,
            intent: CaptureIntent::Meeting,
            resume: None,
        }
    }
}

pub(crate) struct MeetingCaptureManager {
    state: Arc<RwLock<MeetingCaptureState>>,
    active: Mutex<Option<ActiveCapture>>,
    note_gesture: Mutex<MeetingNoteGesture>,
    next_note_gesture_token: AtomicU64,
    busy: Arc<AtomicBool>,
    system_audio_start_timed_out: AtomicBool,
}

impl Default for MeetingCaptureManager {
    fn default() -> Self {
        Self {
            state: Arc::new(RwLock::new(MeetingCaptureState::default())),
            active: Mutex::new(None),
            note_gesture: Mutex::new(MeetingNoteGesture::Idle),
            next_note_gesture_token: AtomicU64::new(1),
            busy: Arc::new(AtomicBool::new(false)),
            system_audio_start_timed_out: AtomicBool::new(false),
        }
    }
}

impl MeetingCaptureManager {
    pub(crate) fn state(&self) -> MeetingCaptureState {
        self.state.read().clone()
    }

    pub(crate) fn is_active(&self) -> bool {
        self.busy.load(Ordering::SeqCst)
    }

    /// Cierra la píldora de "procesando" cuando el trabajo de fondo de esa
    /// captura acaba. Se ignora si entretanto empezó otra grabación, para no
    /// apagar la píldora de la captura en curso.
    pub(crate) fn finish_processing(&self, app: &AppHandle<AppRuntime>, id: &str) {
        let current = self.state();
        if current.phase != MeetingCapturePhase::Processing {
            return;
        }
        if current.id.as_deref() != Some(id) {
            return;
        }
        self.set_state(app, MeetingCaptureState::default());
    }

    pub(crate) fn continue_after_silence(
        &self,
        app: &AppHandle<AppRuntime>,
    ) -> Result<MeetingCaptureState, String> {
        let monitor = self
            .active
            .lock()
            .as_ref()
            .map(|active| Arc::clone(&active.silence_monitor))
            .ok_or_else(|| "There is no active meeting recording.".to_string())?;
        if !monitor.continue_recording(Instant::now()) {
            return Err("The meeting recording is already stopping.".to_string());
        }
        crate::toast::hide(app);
        Ok(self.state())
    }

    pub(crate) fn dismiss_silence_warning(&self) {
        let monitor = self
            .active
            .lock()
            .as_ref()
            .map(|active| Arc::clone(&active.silence_monitor));
        if let Some(monitor) = monitor {
            monitor.dismiss_warning(Instant::now());
        }
    }

    pub(crate) fn handle_note_press(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
    ) -> Result<bool, String> {
        let now = Utc::now();
        let current = self.state();
        let anchor_ms =
            meeting_elapsed_ms_at(current.started_at.as_deref(), current.elapsed_seconds, now);
        let mut gesture = self.note_gesture.lock();
        if current.phase != MeetingCapturePhase::Recording {
            *gesture = MeetingNoteGesture::Idle;
            return Ok(self.is_active());
        }
        let previous = std::mem::take(&mut *gesture);

        match previous {
            MeetingNoteGesture::Idle => {
                let meeting_id = current
                    .id
                    .clone()
                    .ok_or_else(|| "The active meeting could not be identified.".to_string())?;
                *gesture = MeetingNoteGesture::RetrospectiveHolding {
                    meeting_id,
                    anchor_ms,
                    pressed_at: Instant::now(),
                };
                drop(gesture);
                self.show_retrospective_selection(app, current, now, anchor_ms);
                Ok(true)
            }
            MeetingNoteGesture::RetrospectivePending {
                meeting_id,
                anchor_ms,
                ..
            } => {
                if current.phase != MeetingCapturePhase::Recording
                    || current.id.as_deref() != Some(meeting_id.as_str())
                {
                    *gesture = MeetingNoteGesture::Idle;
                    return Err("The active meeting changed before the moment started.".to_string());
                }
                let started_at = current
                    .active_note_selection
                    .as_ref()
                    .map(|selection| selection.started_at.clone())
                    .unwrap_or_else(|| now.to_rfc3339());
                *gesture = MeetingNoteGesture::ImportantMoment {
                    meeting_id,
                    start_ms: anchor_ms,
                    activation_release_pending: true,
                };
                drop(gesture);
                let mut next = current;
                next.active_note_selection = None;
                next.active_important_moment = Some(MeetingImportantMoment {
                    started_at,
                    start_ms: anchor_ms,
                });
                self.set_state(app, next);
                Ok(true)
            }
            MeetingNoteGesture::ImportantMoment {
                meeting_id,
                start_ms,
                activation_release_pending: false,
            } => {
                *gesture = MeetingNoteGesture::StopReleasePending;
                drop(gesture);
                if current.id.as_deref() != Some(meeting_id.as_str()) {
                    self.clear_note_ui(app);
                    return Err(
                        "The active meeting changed before the moment was saved.".to_string()
                    );
                }
                self.persist_note_marker(
                    app,
                    app_state,
                    current,
                    now,
                    anchor_ms,
                    start_ms,
                    anchor_ms,
                    MeetingNoteKind::ImportantMoment,
                )?;
                Ok(true)
            }
            other => {
                *gesture = other;
                Ok(true)
            }
        }
    }

    pub(crate) fn handle_note_release(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
    ) -> Result<bool, String> {
        let now = Utc::now();
        let current = self.state();
        let elapsed_ms =
            meeting_elapsed_ms_at(current.started_at.as_deref(), current.elapsed_seconds, now);
        let mut gesture = self.note_gesture.lock();
        if current.phase != MeetingCapturePhase::Recording {
            *gesture = MeetingNoteGesture::Idle;
            return Ok(self.is_active());
        }
        let previous = std::mem::take(&mut *gesture);

        match previous {
            MeetingNoteGesture::RetrospectiveHolding {
                meeting_id,
                anchor_ms,
                pressed_at,
            } if qualifies_for_double_tap(pressed_at.elapsed()) => {
                let token = self.next_note_gesture_token.fetch_add(1, Ordering::Relaxed);
                *gesture = MeetingNoteGesture::RetrospectivePending {
                    meeting_id,
                    anchor_ms,
                    released_at_ms: elapsed_ms,
                    token,
                };
                drop(gesture);
                self.schedule_pending_retrospective(app, token);
                Ok(true)
            }
            MeetingNoteGesture::RetrospectiveHolding {
                meeting_id,
                anchor_ms,
                ..
            } => {
                *gesture = MeetingNoteGesture::Idle;
                drop(gesture);
                if current.id.as_deref() != Some(meeting_id.as_str()) {
                    self.clear_note_ui(app);
                    return Err("The active meeting changed before the note was saved.".to_string());
                }
                let (start_ms, end_ms) = note_selection_range(anchor_ms, elapsed_ms);
                self.persist_note_marker(
                    app,
                    app_state,
                    current,
                    now,
                    anchor_ms,
                    start_ms,
                    end_ms,
                    MeetingNoteKind::Retrospective,
                )?;
                Ok(true)
            }
            MeetingNoteGesture::ImportantMoment {
                meeting_id,
                start_ms,
                activation_release_pending: true,
            } => {
                *gesture = MeetingNoteGesture::ImportantMoment {
                    meeting_id,
                    start_ms,
                    activation_release_pending: false,
                };
                Ok(true)
            }
            MeetingNoteGesture::StopReleasePending => {
                *gesture = MeetingNoteGesture::Idle;
                Ok(true)
            }
            other => {
                let handled = !matches!(other, MeetingNoteGesture::Idle) || self.is_active();
                *gesture = other;
                Ok(handled)
            }
        }
    }

    fn show_retrospective_selection(
        &self,
        app: &AppHandle<AppRuntime>,
        mut current: MeetingCaptureState,
        now: DateTime<Utc>,
        anchor_ms: u64,
    ) {
        current.elapsed_seconds = current.elapsed_seconds.max(anchor_ms / 1_000);
        current.active_important_moment = None;
        current.active_note_selection = Some(MeetingNoteSelection {
            started_at: now.to_rfc3339(),
            anchor_ms,
            initial_duration_ms: NOTE_HOLD_INITIAL_CONTEXT_MS,
            hold_step_ms: NOTE_HOLD_STEP_MS,
            duration_step_ms: NOTE_DURATION_STEP_MS,
            max_duration_ms: NOTE_HOLD_MAX_DURATION_MS,
        });
        self.set_state(app, current);
    }

    fn clear_note_ui(&self, app: &AppHandle<AppRuntime>) {
        let mut next = self.state();
        next.active_note_selection = None;
        next.active_important_moment = None;
        self.set_state(app, next);
    }

    fn schedule_pending_retrospective(&self, app: &AppHandle<AppRuntime>, token: u64) {
        let task_app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(NOTE_DOUBLE_TAP_WINDOW).await;
            let app_state = task_app.state::<AppState>();
            if let Err(message) = app_state
                .meeting_capture()
                .finalize_pending_retrospective(&task_app, &app_state, token)
            {
                crate::toast::show(&task_app, "error", Some("Meeting note"), &message);
            }
        });
    }

    fn finalize_pending_retrospective(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
        token: u64,
    ) -> Result<(), String> {
        let mut gesture = self.note_gesture.lock();
        let previous = std::mem::take(&mut *gesture);
        let MeetingNoteGesture::RetrospectivePending {
            meeting_id,
            anchor_ms,
            released_at_ms,
            token: pending_token,
        } = previous
        else {
            *gesture = previous;
            return Ok(());
        };
        if pending_token != token {
            *gesture = MeetingNoteGesture::RetrospectivePending {
                meeting_id,
                anchor_ms,
                released_at_ms,
                token: pending_token,
            };
            return Ok(());
        }
        *gesture = MeetingNoteGesture::Idle;
        drop(gesture);

        let current = self.state();
        if current.id.as_deref() != Some(meeting_id.as_str()) {
            self.clear_note_ui(app);
            return Ok(());
        }
        let (start_ms, end_ms) = note_selection_range(anchor_ms, released_at_ms);
        self.persist_note_marker(
            app,
            app_state,
            current,
            Utc::now(),
            anchor_ms,
            start_ms,
            end_ms,
            MeetingNoteKind::Retrospective,
        )?;
        Ok(())
    }

    fn finish_open_note_before_stop(&self, app: &AppHandle<AppRuntime>, app_state: &AppState) {
        let gesture = std::mem::take(&mut *self.note_gesture.lock());
        let current = self.state();
        if current.phase != MeetingCapturePhase::Recording {
            return;
        }
        let now = Utc::now();
        let elapsed_ms =
            meeting_elapsed_ms_at(current.started_at.as_deref(), current.elapsed_seconds, now);
        let marker = match gesture {
            MeetingNoteGesture::RetrospectiveHolding { anchor_ms, .. } => {
                let (start_ms, end_ms) = note_selection_range(anchor_ms, elapsed_ms);
                Some((anchor_ms, start_ms, end_ms, MeetingNoteKind::Retrospective))
            }
            MeetingNoteGesture::RetrospectivePending {
                anchor_ms,
                released_at_ms,
                ..
            } => {
                let (start_ms, end_ms) = note_selection_range(anchor_ms, released_at_ms);
                Some((anchor_ms, start_ms, end_ms, MeetingNoteKind::Retrospective))
            }
            MeetingNoteGesture::ImportantMoment { start_ms, .. } => Some((
                elapsed_ms,
                start_ms,
                elapsed_ms,
                MeetingNoteKind::ImportantMoment,
            )),
            MeetingNoteGesture::Idle | MeetingNoteGesture::StopReleasePending => None,
        };

        if let Some((captured_at_ms, start_ms, end_ms, kind)) = marker {
            if let Err(message) = self.persist_note_marker(
                app,
                app_state,
                current,
                now,
                captured_at_ms,
                start_ms,
                end_ms,
                kind,
            ) {
                crate::toast::show(app, "error", Some("Meeting note"), &message);
                self.clear_note_ui(app);
            }
        }
    }

    pub(crate) fn capture_note(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
    ) -> Result<MeetingNoteMarker, String> {
        let storage = app_state.storage();
        let captured = self.capture_note_at(&storage, Utc::now())?;
        if let Some(snapshot) = captured.state {
            let _ = app.emit(EVENT_MEETING_CAPTURE_STATE, snapshot);
        }
        let _ = app.emit(EVENT_MEETING_DETAILS_CHANGED, captured.details);
        Ok(captured.marker)
    }

    fn capture_note_at(
        &self,
        storage: &crate::storage::StorageManager,
        now: DateTime<Utc>,
    ) -> Result<CapturedMeetingNote, String> {
        let current = self.state();
        if current.phase != MeetingCapturePhase::Recording {
            return Err(
                "Wait until the meeting recorder is ready before taking a note.".to_string(),
            );
        }
        let elapsed_ms =
            meeting_elapsed_ms_at(current.started_at.as_deref(), current.elapsed_seconds, now);
        let (start_ms, end_ms) = note_marker_range(elapsed_ms);
        self.persist_note_marker_at(
            storage,
            current,
            now,
            elapsed_ms,
            start_ms,
            end_ms,
            MeetingNoteKind::Retrospective,
        )
    }

    fn persist_note_marker(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
        current: MeetingCaptureState,
        now: DateTime<Utc>,
        captured_at_ms: u64,
        start_ms: u64,
        end_ms: u64,
        kind: MeetingNoteKind,
    ) -> Result<MeetingNoteMarker, String> {
        let captured = match self.persist_note_marker_at(
            &app_state.storage(),
            current,
            now,
            captured_at_ms,
            start_ms,
            end_ms,
            kind,
        ) {
            Ok(captured) => captured,
            Err(message) => {
                self.clear_note_ui(app);
                return Err(message);
            }
        };
        if let Some(snapshot) = captured.state {
            let _ = app.emit(EVENT_MEETING_CAPTURE_STATE, snapshot);
        }
        let _ = app.emit(EVENT_MEETING_DETAILS_CHANGED, captured.details);
        Ok(captured.marker)
    }

    fn persist_note_marker_at(
        &self,
        storage: &crate::storage::StorageManager,
        current: MeetingCaptureState,
        now: DateTime<Utc>,
        captured_at_ms: u64,
        start_ms: u64,
        end_ms: u64,
        kind: MeetingNoteKind,
    ) -> Result<CapturedMeetingNote, String> {
        let meeting_id = current
            .id
            .as_deref()
            .ok_or_else(|| "The active meeting could not be identified.".to_string())?;
        let marker = MeetingNoteMarker {
            id: Uuid::new_v4().to_string(),
            captured_at_ms,
            start_ms,
            end_ms,
            created_at: now.to_rfc3339(),
            kind,
        };

        let details = storage
            .append_meeting_note_marker(meeting_id, marker.clone())
            .map_err(|err| format!("Failed to save the meeting note: {err}"))?
            .ok_or_else(|| "Meeting details not found.".to_string())?;

        let snapshot = {
            let mut next = self.state.write();
            if next.phase != MeetingCapturePhase::Recording
                || next.id.as_deref() != Some(meeting_id)
            {
                None
            } else {
                next.elapsed_seconds = next.elapsed_seconds.max(end_ms / 1_000);
                next.last_note_marker = Some(marker.clone());
                next.active_note_selection = None;
                next.active_important_moment = None;
                Some(next.clone())
            }
        };
        Ok(CapturedMeetingNote {
            marker,
            details,
            state: snapshot,
        })
    }

    pub(crate) async fn start(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
        options: MeetingStartOptions,
    ) -> Result<MeetingCaptureState, String> {
        self.start_capture(app, app_state, options.into()).await
    }

    pub(crate) async fn start_voice_note(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
        model_key: String,
        live_model_key: Option<String>,
    ) -> Result<MeetingCaptureState, String> {
        self.start_capture(
            app,
            app_state,
            CaptureStartOptions {
                model_key,
                live_model_key,
                system_audio_enabled: false,
                calendar_context: None,
                intent: CaptureIntent::VoiceNote,
                resume: None,
            },
        )
        .await
    }

    /// Sigue grabando sobre una captura terminada. El audio nuevo se escribe
    /// detrás del que ya había y se vuelve a transcribir el fichero entero, que
    /// es lo único que mantiene los tiempos coherentes de punta a punta.
    pub(crate) async fn resume_capture(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
        item: &LibraryItem,
        model_key: String,
    ) -> Result<MeetingCaptureState, String> {
        let audio_path = PathBuf::from(&item.audio_path);
        if !audio_path.exists() {
            return Err("The audio for this recording is no longer on disk.".to_string());
        }
        self.start_capture(
            app,
            app_state,
            CaptureStartOptions {
                model_key,
                live_model_key: None,
                system_audio_enabled: false,
                calendar_context: None,
                intent: if item.kind == "meeting" {
                    CaptureIntent::Meeting
                } else {
                    CaptureIntent::VoiceNote
                },
                resume: Some(ResumeTarget {
                    id: item.id.clone(),
                    audio_path,
                }),
            },
        )
        .await
    }

    async fn start_capture(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
        options: CaptureStartOptions,
    ) -> Result<MeetingCaptureState, String> {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            return self.start_supported(app, app_state, options).await;
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let _ = (app, app_state, options);
            Err("Meeting capture is available on macOS and Windows only.".to_string())
        }
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    async fn start_supported(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
        options: CaptureStartOptions,
    ) -> Result<MeetingCaptureState, String> {
        if self
            .busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("A meeting recording is already active.".to_string());
        }

        // A capture left here after `busy` became false has already ended with
        // an error; dropping its completed handle makes room for a retry.
        self.active.lock().take();
        *self.note_gesture.lock() = MeetingNoteGesture::Idle;
        self.set_state(
            app,
            MeetingCaptureState {
                phase: MeetingCapturePhase::Starting,
                system_audio_enabled: options.system_audio_enabled,
                capture_intent: options.intent,
                ..Default::default()
            },
        );

        let system_audio_enabled = options.system_audio_enabled;
        let capture_intent = options.intent;
        let result = self.prepare_capture(app, app_state, options).await;
        if let Err(message) = &result {
            self.busy.store(false, Ordering::SeqCst);
            self.set_state(
                app,
                MeetingCaptureState {
                    phase: MeetingCapturePhase::Error,
                    system_audio_enabled,
                    capture_intent,
                    error: Some(message.clone()),
                    ..Default::default()
                },
            );
        }
        result
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    async fn prepare_capture(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
        options: CaptureStartOptions,
    ) -> Result<MeetingCaptureState, String> {
        ensure_supported_os()?;
        if app_state.pill().is_recording() {
            return Err("Finish the current dictation before recording a meeting.".to_string());
        }
        let has_microphone_permission = permissions::ensure_microphone_permission(app).await?;
        if !has_microphone_permission {
            return Err("Microphone access is required to record a meeting.".to_string());
        }
        validate_model(app, &options.model_key)?;
        // Una nota larga se sigue igual de mal a ciegas que una reunión: si hay
        // modelo en vivo instalado, también transcribe mientras graba.
        #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
        let live_model = resolve_live_model(app, options.live_model_key.as_deref())?;
        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        if options.live_model_key.is_some() {
            return Err("Live meeting transcription requires Apple Silicon.".to_string());
        }

        if options.system_audio_enabled && self.system_audio_start_timed_out.load(Ordering::SeqCst)
        {
            return Err(system_audio_timeout_message());
        }

        let settings = app_state.current_settings_unmasked();
        let stream = open_capture_stream(
            settings.microphone_device.clone(),
            options.system_audio_enabled,
            CAPTURE_START_TIMEOUT,
        )
        .await
        .map_err(|failure| {
            if options.system_audio_enabled && failure.timed_out() {
                self.system_audio_start_timed_out
                    .store(true, Ordering::SeqCst);
            }
            failure.user_message(options.system_audio_enabled)
        })?;

        let resume = options.resume.clone();
        let id = match &resume {
            Some(target) => target.id.clone(),
            None => Uuid::new_v4().to_string(),
        };
        let now = Local::now();
        let started_at = Utc::now().to_rfc3339();
        let root = library_root(app).map_err(|err| err.to_string())?;
        fs::create_dir_all(&root)
            .map_err(|err| format!("Failed to create the meeting library folder: {err}"))?;
        let available = fs2::available_space(&root)
            .map_err(|err| format!("Failed to inspect available disk space: {err}"))?;
        if available < MIN_FREE_DISK_BYTES {
            return Err(format!(
                "At least {} MB of free disk space is required ({} MB available).",
                MIN_FREE_DISK_BYTES / 1024 / 1024,
                available / 1024 / 1024
            ));
        }

        let capture_label = match options.intent {
            CaptureIntent::Meeting => "meeting",
            CaptureIntent::VoiceNote => "note",
        };
        // Al reanudar no se abre carpeta ni fichero nuevos: se escribe detrás
        // del audio que ya existe, y así los momentos marcados y el transcript
        // en vivo de la primera tanda siguen apuntando a lo mismo.
        let (item_dir, partial_path, final_path, writer) = match &resume {
            Some(target) => {
                let writer = append_wav_writer(&target.audio_path).map_err(|err| err.to_string())?;
                let directory = target
                    .audio_path
                    .parent()
                    .map(Path::to_path_buf)
                    .unwrap_or_else(|| root.clone());
                (
                    directory,
                    target.audio_path.clone(),
                    target.audio_path.clone(),
                    writer,
                )
            }
            None => {
                let item_dir = root.join(format!("{capture_label}-{}", &id[..8]));
                fs::create_dir_all(&item_dir)
                    .map_err(|err| format!("Failed to create the meeting folder: {err}"))?;
                let partial_path = item_dir.join(format!("{id}.partial.wav"));
                let final_path = item_dir.join(format!("{id}.wav"));
                let writer = match create_wav_writer(&partial_path) {
                    Ok(writer) => writer,
                    Err(err) => {
                        let _ = fs::remove_dir_all(&item_dir);
                        return Err(err.to_string());
                    }
                };
                (item_dir, partial_path, final_path, writer)
            }
        };

        let calendar_context = options.calendar_context.clone();
        let item = LibraryItem {
            id: id.clone(),
            name: calendar_context
                .as_ref()
                .map(|context| context.title.clone())
                .unwrap_or_else(|| {
                    let title = match options.intent {
                        CaptureIntent::Meeting => "Meeting",
                        CaptureIntent::VoiceNote => "Note",
                    };
                    format!("{title} {}", now.format("%Y-%m-%d %H:%M"))
                }),
            audio_path: partial_path.display().to_string(),
            source_path: String::new(),
            store_original: false,
            status: LibraryItemStatus::Recording,
            transcript: None,
            segments: None,
            words: None,
            duration_seconds: 0.0,
            file_size_bytes: 0,
            original_format: "wav".to_string(),
            created_at: started_at.clone(),
            transcribed_at: None,
            tags: Vec::new(),
            llm_cleanup_enabled: false,
            denoise_enabled: false,
            speech_model: options.model_key.clone(),
            show_timestamps: true,
            detect_speakers: false,
            kind: match options.intent {
                CaptureIntent::Meeting => "meeting",
                CaptureIntent::VoiceNote => "recording",
            }
            .to_string(),
            speakers: None,
        };
        let storage = app_state.storage();
        // Una nota también guarda detalles de captura: sin ellos no hay resumen
        // ni chat, y una nota de media hora los necesita igual que una reunión.
        let details = MeetingDetails {
            library_item_id: id.clone(),
            started_at: started_at.clone(),
            ended_at: None,
            notes: String::new(),
            notes_revision: 0,
            summary: None,
            summary_status: MeetingSummaryStatus::Idle,
            summary_error: None,
            system_audio_enabled: options.system_audio_enabled,
            recovered: false,
            calendar_context,
            note_markers: Vec::new(),
            live_transcript: Vec::new(),
        };
        let insert_result = match &resume {
            // Reanudar no crea nada: solo devuelve el ítem a grabando, para que
            // la recuperación lo reconozca si esta tanda se interrumpe.
            Some(target) => storage
                .update_library_item(
                    &target.id,
                    LibraryItemPatch {
                        status: Some(LibraryItemStatus::Recording),
                        ..Default::default()
                    },
                )
                .map(|_| ()),
            None => storage.insert_meeting_item(item, &details).map(|_| ()),
        };
        if let Err(err) = insert_result {
            drop(writer);
            if resume.is_none() {
                let _ = fs::remove_dir_all(&item_dir);
            }
            return Err(format!("Failed to save the capture: {err}"));
        }

        #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
        let live_model = if resume.is_some() { None } else { live_model };
        #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
        let live_transcription = live_model
            .map(|model| {
                super::meeting_live_transcription::MeetingLiveTranscriptionSession::start(
                    app,
                    Arc::clone(&self.state),
                    id.clone(),
                    model,
                    options.system_audio_enabled,
                )
            })
            .transpose()
            .map_err(|error| format!("Failed to start live meeting transcription: {error}"))?;
        #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
        let live_audio_sink = live_transcription.as_ref().map(|session| session.sink());

        let cancel = CancellationToken::new();
        let silence_monitor = Arc::new(MeetingSilenceMonitor::new(Instant::now()));
        let state = Arc::clone(&self.state);
        let busy = Arc::clone(&self.busy);
        let task_app = app.clone();
        let task_storage = Arc::clone(&storage);
        let task_id = id.clone();
        let task_started_at = started_at.clone();
        let task_cancel = cancel.clone();
        let task_silence_monitor = Arc::clone(&silence_monitor);
        let task_partial_path = partial_path.clone();
        let task_final_path = final_path.clone();
        let (armed_tx, armed_rx) = tokio::sync::oneshot::channel();
        let task = tauri::async_runtime::spawn(async move {
            if armed_rx.await.is_err() {
                return Err(anyhow!("Meeting recorder stopped before it was armed"));
            }
            let result = capture_to_wav(
                stream,
                writer,
                task_cancel.clone(),
                Arc::clone(&state),
                task_app.clone(),
                task_silence_monitor,
                #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
                live_audio_sink,
            )
            .await;
            if let Err(err) = &result {
                task_cancel.cancel();
                let message = format!("Meeting recording stopped unexpectedly: {err}");
                if let Err(save_err) = preserve_failed_capture(
                    &task_storage,
                    &task_id,
                    &task_partial_path,
                    &task_final_path,
                    &message,
                ) {
                    tracing::error!("Failed to preserve interrupted meeting audio: {save_err}");
                    let _ = task_storage.update_library_item(
                        &task_id,
                        LibraryItemPatch {
                            status: Some(LibraryItemStatus::Error {
                                message: message.clone(),
                            }),
                            ..Default::default()
                        },
                    );
                }
                let _ = task_storage.finish_meeting_details(
                    &task_id,
                    &Utc::now().to_rfc3339(),
                    false,
                );
                let previous = state.read().clone();
                *state.write() = MeetingCaptureState {
                    phase: MeetingCapturePhase::Error,
                    id: Some(task_id),
                    started_at: Some(task_started_at),
                    elapsed_seconds: previous.elapsed_seconds,
                    system_audio_enabled: previous.system_audio_enabled,
                    capture_intent: previous.capture_intent,
                    warning: previous.warning,
                    error: Some(message),
                    last_note_marker: previous.last_note_marker,
                    active_note_selection: None,
                    active_important_moment: None,
                    live_transcript: previous.live_transcript,
                    capture_health: previous.capture_health,
                };
                let _ = task_app.emit(EVENT_MEETING_CAPTURE_STATE, state.read().clone());
                busy.store(false, Ordering::SeqCst);
                if let Err(error) = pill::show_idle_sticky(&task_app) {
                    tracing::error!("Failed to restore Dictation after meeting error: {error}");
                }
                crate::toast::show(
                    &task_app,
                    "error",
                    Some("Meeting recording stopped"),
                    state
                        .read()
                        .error
                        .as_deref()
                        .unwrap_or("The audio stream ended unexpectedly."),
                );
                let runtime_state = task_app.state::<AppState>();
                let settings = runtime_state.current_settings();
                if let Err(err) = crate::tray::refresh_tray_menu(&task_app, &settings) {
                    tracing::error!("Failed to refresh tray after meeting error: {err}");
                }
                #[cfg(target_os = "macos")]
                if let Err(err) = crate::set_app_menu(&task_app, &settings) {
                    tracing::error!("Failed to refresh app menu after meeting error: {err}");
                }
            }
            result
        });

        let watchdog_cancel = cancel.clone();
        *self.active.lock() = Some(ActiveCapture {
            id: id.clone(),
            partial_path,
            final_path,
            intent: options.intent,
            cancel,
            task,
            silence_monitor: Arc::clone(&silence_monitor),
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            live_transcription,
        });
        let next = MeetingCaptureState {
            phase: MeetingCapturePhase::Recording,
            id: Some(id.clone()),
            started_at: Some(started_at),
            elapsed_seconds: 0,
            system_audio_enabled: options.system_audio_enabled,
            capture_intent: options.intent,
            warning: None,
            error: None,
            last_note_marker: None,
            active_note_selection: None,
            active_important_moment: None,
            live_transcript: String::new(),
            capture_health: MeetingCaptureHealth::default(),
        };
        self.set_state(app, next.clone());
        pill::show_overlay(app);
        self.refresh_menus(app, app_state);
        spawn_silence_watchdog(app.clone(), id.clone(), silence_monitor, watchdog_cancel);
        let _ = armed_tx.send(());
        Ok(next)
    }

    pub(crate) async fn stop(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
    ) -> Result<MeetingCaptureState, String> {
        self.finish_open_note_before_stop(app, app_state);
        let Some(active) = self.active.lock().take() else {
            return Ok(self.state());
        };

        let current = self.state();
        self.set_state(
            app,
            MeetingCaptureState {
                phase: MeetingCapturePhase::Finalizing,
                id: Some(active.id.clone()),
                started_at: current.started_at,
                elapsed_seconds: current.elapsed_seconds,
                system_audio_enabled: current.system_audio_enabled,
                capture_intent: current.capture_intent,
                warning: current.warning,
                error: None,
                last_note_marker: current.last_note_marker,
                active_note_selection: None,
                active_important_moment: None,
                live_transcript: current.live_transcript,
                capture_health: current.capture_health,
            },
        );
        self.refresh_menus(app, app_state);
        let ActiveCapture {
            id,
            partial_path,
            final_path,
            intent,
            cancel,
            task,
            silence_monitor: _,
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            live_transcription,
        } = active;
        cancel.cancel();

        let captured = match task.await {
            Ok(result) => result.map_err(|err| err.to_string()),
            Err(err) => Err(format!("Meeting recorder task failed: {err}")),
        };
        #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
        if let Some(live_transcription) = live_transcription {
            live_transcription.stop();
        }
        let result = match captured {
            Ok(captured) => self.finalize_capture(
                app,
                app_state,
                &id,
                &partial_path,
                &final_path,
                captured,
            ),
            Err(message) => Err(message),
        };

        self.busy.store(false, Ordering::SeqCst);
        if !app_state.pill().is_recording() {
            if let Err(error) = pill::show_idle_sticky(app) {
                tracing::error!("Failed to restore Dictation after meeting stop: {error}");
            }
        }
        self.refresh_menus(app, app_state);

        match result {
            Ok(()) => {
                let processing = MeetingCaptureState {
                    phase: MeetingCapturePhase::Processing,
                    id: Some(id),
                    capture_intent: intent,
                    ..Default::default()
                };
                self.set_state(app, processing.clone());
                Ok(processing)
            }
            Err(message) => {
                if let Err(save_err) = preserve_failed_capture(
                    &app_state.storage(),
                    &id,
                    &partial_path,
                    &final_path,
                    &message,
                ) {
                    tracing::error!(
                        "Failed to preserve meeting after finalization error: {save_err}"
                    );
                }
                let _ = app_state.storage().finish_meeting_details(
                    &id,
                    &Utc::now().to_rfc3339(),
                    false,
                );
                let failed = MeetingCaptureState {
                    phase: MeetingCapturePhase::Error,
                    id: Some(id),
                    capture_intent: intent,
                    error: Some(message.clone()),
                    ..Default::default()
                };
                self.set_state(app, failed);
                Err(message)
            }
        }
    }

    fn finalize_capture(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
        id: &str,
        partial_path: &Path,
        final_path: &Path,
        captured: CaptureResult,
    ) -> Result<(), String> {
        if captured.samples_written == 0 {
            return self.fail_item(
                app_state,
                id,
                "The meeting recording did not contain audio.",
            );
        }
        let storage = app_state.storage();
        persist_finalized_capture(
            &storage,
            id,
            partial_path,
            final_path,
            captured,
            &Utc::now().to_rfc3339(),
        )
        .map_err(|err| err.to_string())?;
        schedule_library_job(
            app,
            app_state,
            LibraryJob {
                id: id.to_string(),
                kind: LibraryJobKind::TranscribeExisting,
            },
        );
        Ok(())
    }

    pub(crate) fn recover_recording(
        &self,
        app: &AppHandle<AppRuntime>,
        app_state: &AppState,
        item: &LibraryItem,
    ) -> Result<(), String> {
        let partial_path = PathBuf::from(&item.audio_path);
        if !partial_path.exists() {
            return self.fail_item(
                app_state,
                &item.id,
                "The interrupted meeting audio could not be found.",
            );
        }
        let final_path = finalized_path(&partial_path);
        let info = read_wav_info(&partial_path).map_err(|err| {
            format!("The interrupted meeting audio could not be recovered: {err}")
        })?;
        if info.total_samples == 0 {
            return self.fail_item(
                app_state,
                &item.id,
                "The interrupted meeting recording was empty.",
            );
        }
        if partial_path != final_path {
            fs::rename(&partial_path, &final_path)
                .map_err(|err| format!("Failed to recover the meeting audio: {err}"))?;
        }
        let size = fs::metadata(&final_path)
            .map_err(|err| format!("Failed to inspect the recovered meeting audio: {err}"))?
            .len();
        let storage = app_state.storage();
        storage
            .update_library_item(
                &item.id,
                LibraryItemPatch {
                    audio_path: Some(final_path.display().to_string()),
                    duration_seconds: Some(info.duration_seconds),
                    file_size_bytes: Some(size),
                    status: Some(LibraryItemStatus::Pending),
                    ..Default::default()
                },
            )
            .map_err(|err| format!("Failed to recover the meeting: {err}"))?;
        if item.is_capture() {
            storage
                .finish_meeting_details(&item.id, &Utc::now().to_rfc3339(), true)
                .map_err(|err| format!("Failed to recover the meeting details: {err}"))?;
        }
        if crate::license::license_gate_active(&app_state.settings_store) {
            schedule_library_job(
                app,
                app_state,
                LibraryJob {
                    id: item.id.clone(),
                    kind: LibraryJobKind::TranscribeExisting,
                },
            );
        }
        Ok(())
    }

    fn fail_item(&self, app_state: &AppState, id: &str, message: &str) -> Result<(), String> {
        app_state
            .storage()
            .update_library_item(
                id,
                LibraryItemPatch {
                    status: Some(LibraryItemStatus::Error {
                        message: message.to_string(),
                    }),
                    ..Default::default()
                },
            )
            .map_err(|err| format!("Failed to save meeting error: {err}"))?;
        Err(message.to_string())
    }

    fn set_state(&self, app: &AppHandle<AppRuntime>, state: MeetingCaptureState) {
        *self.state.write() = state.clone();
        let _ = app.emit(EVENT_MEETING_CAPTURE_STATE, state);
    }

    fn refresh_menus(&self, app: &AppHandle<AppRuntime>, app_state: &AppState) {
        let settings = app_state.current_settings();
        if let Err(err) = crate::tray::refresh_tray_menu(app, &settings) {
            tracing::error!("Failed to refresh tray menu after meeting state change: {err}");
        }
        #[cfg(target_os = "macos")]
        if let Err(err) = crate::set_app_menu(app, &settings) {
            tracing::error!("Failed to refresh app menu after meeting state change: {err}");
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn spawn_silence_watchdog(
    app: AppHandle<AppRuntime>,
    meeting_id: String,
    monitor: Arc<MeetingSilenceMonitor>,
    cancel: CancellationToken,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                _ = cancel.cancelled() => return,
                _ = tokio::time::sleep(WATCHDOG_POLL_INTERVAL) => {}
            }

            let current = app.state::<AppState>().meeting_capture().state();
            if current.phase != MeetingCapturePhase::Recording
                || current.id.as_deref() != Some(meeting_id.as_str())
            {
                return;
            }

            match monitor.evaluate(Instant::now()) {
                SilenceAction::None => {}
                SilenceAction::ShowWarning => {
                    crate::toast::emit_toast(&app, warning_notification());
                }
                SilenceAction::Stop => {
                    tracing::info!(
                        "Auto-stopping meeting recording after five minutes without speech"
                    );
                    let app_state = app.state::<AppState>();
                    match app_state.meeting_capture().stop(&app, &app_state).await {
                        Ok(_) => crate::toast::emit_toast(&app, stopped_notification()),
                        Err(message) => crate::toast::show(
                            &app,
                            "error",
                            Some("Meeting recording"),
                            &format!("The recording could not be stopped safely: {message}"),
                        ),
                    }
                    return;
                }
            }
        }
    });
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn persist_finalized_capture(
    storage: &crate::storage::StorageManager,
    id: &str,
    partial_path: &Path,
    final_path: &Path,
    captured: CaptureResult,
    ended_at: &str,
) -> Result<()> {
    // Al reanudar se escribió directamente sobre el audio definitivo, así que
    // no hay parcial que renombrar.
    if partial_path != final_path {
        fs::rename(partial_path, final_path)
            .map_err(|err| anyhow!("Failed to finalize the meeting audio: {err}"))?;
    }
    let info = read_wav_info(final_path)
        .map_err(|err| anyhow!("Failed to read the meeting audio: {err}"))?;
    if info.total_samples == 0 || captured.samples_written == 0 {
        return Err(anyhow!("The meeting recording did not contain audio."));
    }
    let size = fs::metadata(final_path)
        .map_err(|err| anyhow!("Failed to read the meeting audio size: {err}"))?
        .len();
    let updated = storage
        .update_library_item(
            id,
            LibraryItemPatch {
                audio_path: Some(final_path.display().to_string()),
                duration_seconds: Some(info.duration_seconds),
                file_size_bytes: Some(size),
                status: Some(LibraryItemStatus::Pending),
                ..Default::default()
            },
        )
        .map_err(|err| anyhow!("Failed to queue the meeting transcription: {err}"))?;
    if updated.is_none() {
        return Err(anyhow!("Meeting item not found while finalizing capture."));
    }
    storage
        .finish_meeting_details(id, ended_at, false)
        .map_err(|err| anyhow!("Failed to finalize the meeting details: {err}"))?;
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn preserve_failed_capture(
    storage: &crate::storage::StorageManager,
    id: &str,
    partial_path: &Path,
    final_path: &Path,
    message: &str,
) -> Result<()> {
    let mut patch = LibraryItemPatch {
        status: Some(LibraryItemStatus::Error {
            message: message.to_string(),
        }),
        ..Default::default()
    };

    let existing_path = if partial_path.exists() {
        Some(partial_path)
    } else if final_path.exists() {
        Some(final_path)
    } else {
        None
    };
    if let Some(existing_path) = existing_path {
        match read_wav_info(existing_path) {
            Ok(info) if info.total_samples > 0 => {
                let audio_path = if existing_path == partial_path && partial_path != final_path {
                    match fs::rename(existing_path, final_path) {
                        Ok(()) => final_path,
                        Err(err) => {
                            tracing::warn!("Failed to rename interrupted meeting audio: {err}");
                            existing_path
                        }
                    }
                } else {
                    existing_path
                };
                patch.audio_path = Some(audio_path.display().to_string());
                patch.duration_seconds = Some(info.duration_seconds);
                patch.file_size_bytes =
                    fs::metadata(audio_path).ok().map(|metadata| metadata.len());
            }
            Ok(_) => {}
            Err(err) => tracing::warn!("Failed to inspect interrupted meeting audio: {err}"),
        }
    }

    storage.update_library_item(id, patch)?;
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn validate_model(app: &AppHandle<AppRuntime>, model_key: &str) -> Result<(), String> {
    if model_key.trim().is_empty() {
        return Err("Choose a transcription model before recording.".to_string());
    }
    if !model_supports_meetings(model_key) {
        return Err(
            "The selected transcription model does not support meeting timestamps.".to_string(),
        );
    }
    if remote_speech::is_remote_model(model_key) {
        return Ok(());
    }
    let status = model_manager::check_model_status(app.clone(), model_key.to_string())?;
    if status.installed {
        Ok(())
    } else {
        Err("The selected transcription model is not installed.".to_string())
    }
}

#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
fn resolve_live_model(
    app: &AppHandle<AppRuntime>,
    model_key: Option<&str>,
) -> Result<Option<model_manager::ReadyModel>, String> {
    let Some(model_key) = model_key.map(str::trim).filter(|key| !key.is_empty()) else {
        return Ok(None);
    };
    if !model_supports_live_meeting_transcript(model_key) {
        return Err("Choose an installed local Parakeet model for live transcript.".to_string());
    }
    let status = model_manager::check_model_status(app.clone(), model_key.to_string())?;
    if !status.installed {
        return Err("The live transcription model is not installed.".to_string());
    }
    model_manager::ensure_model_ready(app, model_key)
        .map(Some)
        .map_err(|error| format!("The live transcription model is not ready: {error}"))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn model_supports_live_meeting_transcript(model_key: &str) -> bool {
    model_manager::definition(model_key).is_some_and(|manifest| {
        manifest.engine == model_manager::LocalModelEngine::Parakeet
            && manifest.engine.capabilities().timestamps
    })
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn model_supports_meetings(model_key: &str) -> bool {
    remote_speech::is_remote_model(model_key)
        || model_manager::definition(model_key)
            .is_some_and(|manifest| manifest.engine.capabilities().timestamps)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[derive(Debug)]
enum CaptureOpenFailure {
    Source(looper_audio_capture::Error),
    Panicked,
    TimedOut,
    Worker(String),
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
impl CaptureOpenFailure {
    fn timed_out(&self) -> bool {
        matches!(self, Self::TimedOut)
    }

    fn user_message(self, system_audio_enabled: bool) -> String {
        match self {
            Self::Source(error) => map_capture_open_error(error),
            Self::TimedOut if system_audio_enabled => system_audio_timeout_message(),
            Self::TimedOut => {
                "The microphone did not respond while starting. Check the selected audio device and try again."
                    .to_string()
            }
            Self::Panicked => {
                "Audio capture could not start. Check microphone and system audio permissions, then try again."
                    .to_string()
            }
            Self::Worker(message) => message,
        }
    }
}

#[cfg(target_os = "macos")]
fn system_audio_timeout_message() -> String {
    "System audio permission did not respond. Grant Looper access in System Settings -> Privacy & Security -> Screen & System Audio Recording, then restart Looper."
        .to_string()
}

#[cfg(target_os = "windows")]
fn system_audio_timeout_message() -> String {
    "System audio did not respond. Check the default output device, then restart Looper."
        .to_string()
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn run_capture_initializer<T, F>(
    initializer: F,
    timeout: Duration,
) -> std::result::Result<T, CaptureOpenFailure>
where
    T: Send + 'static,
    F: FnOnce() -> std::result::Result<T, looper_audio_capture::Error> + Send + 'static,
{
    let runtime = tokio::runtime::Handle::current();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    std::thread::Builder::new()
        .name("meeting-capture-start".to_string())
        .spawn(move || {
            let _runtime_guard = runtime.enter();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(initializer))
                .map_err(|_| CaptureOpenFailure::Panicked)
                .and_then(|result| result.map_err(CaptureOpenFailure::Source));
            let _ = sender.send(result);
        })
        .map_err(|error| {
            CaptureOpenFailure::Worker(format!("Audio capture worker could not start: {error}"))
        })?;

    match tokio::time::timeout(timeout, receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err(CaptureOpenFailure::Worker(
            "Audio capture stopped before startup completed.".to_string(),
        )),
        Err(_) => Err(CaptureOpenFailure::TimedOut),
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn open_capture_stream(
    mic_device: Option<String>,
    system_audio_enabled: bool,
    timeout: Duration,
) -> std::result::Result<looper_audio_capture::CaptureStream, CaptureOpenFailure> {
    run_capture_initializer(
        move || {
            if system_audio_enabled {
                looper_audio_capture::AudioInput::from_mic_and_speaker(
                    looper_audio_capture::CaptureConfig {
                        sample_rate: TARGET_SAMPLE_RATE,
                        chunk_size: CAPTURE_CHUNK_SAMPLES,
                        mic_device,
                        enable_aec: true,
                    },
                )
            } else {
                looper_audio_capture::AudioInput::from_mic_capture(
                    mic_device,
                    TARGET_SAMPLE_RATE,
                    CAPTURE_CHUNK_SAMPLES,
                )
            }
        },
        timeout,
    )
    .await
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn map_capture_open_error(error: looper_audio_capture::Error) -> String {
    match error {
        looper_audio_capture::Error::NoInputDevice
        | looper_audio_capture::Error::MicOpenFailed
        | looper_audio_capture::Error::MicStreamSetupFailed => {
            "The selected microphone could not be opened.".to_string()
        }
        looper_audio_capture::Error::SpeakerStreamSetupFailed => {
            "System audio could not be captured. Grant system audio recording access or start with system audio disabled.".to_string()
        }
        other => format!("Audio capture could not start: {other}"),
    }
}

/// Continúa escribiendo en un wav que ya existe. El formato de captura es
/// siempre el mismo, así que `hound` puede seguir detrás de sus muestras sin
/// reescribir el fichero.
fn append_wav_writer(path: &Path) -> Result<hound::WavWriter<std::io::BufWriter<fs::File>>> {
    hound::WavWriter::append(path)
        .map_err(|err| anyhow!("Failed to reopen the recording to continue it: {err}"))
}

fn create_wav_writer(path: &Path) -> Result<hound::WavWriter<std::io::BufWriter<fs::File>>> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    hound::WavWriter::create(path, spec)
        .map_err(|err| anyhow!("Failed to create the meeting WAV file: {err}"))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn capture_to_wav(
    stream: looper_audio_capture::CaptureStream,
    writer: hound::WavWriter<std::io::BufWriter<fs::File>>,
    cancel: CancellationToken,
    state: Arc<RwLock<MeetingCaptureState>>,
    app: AppHandle<AppRuntime>,
    silence_monitor: Arc<MeetingSilenceMonitor>,
    #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))] live_audio_sink: Option<
        super::meeting_live_transcription::MeetingLiveAudioSink,
    >,
) -> Result<CaptureResult> {
    let progress_state = Arc::clone(&state);
    let progress_app = app.clone();
    let voice_app = app.clone();
    let disk_app = app.clone();
    let disk_root = library_root(&app).ok();
    let low_disk_handled = Arc::new(AtomicBool::new(false));
    write_capture_stream(
        stream,
        writer,
        cancel,
        #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
        live_audio_sink,
        move |elapsed, lag_samples| {
            let snapshot = {
                let mut next = progress_state.write();
                next.elapsed_seconds = elapsed;
                next.capture_health.audio_lag_ms =
                    lag_samples.saturating_mul(1_000) / TARGET_SAMPLE_RATE as u64;
                next.capture_health.last_audio_at = Some(Utc::now().to_rfc3339());
                if lag_samples > CAPTURE_LAG_WARNING_SAMPLES {
                    next.capture_health.status = MeetingCaptureHealthStatus::Delayed;
                } else {
                    if next.capture_health.status != MeetingCaptureHealthStatus::Degraded {
                        next.capture_health.status = MeetingCaptureHealthStatus::Healthy;
                    }
                }
                next.warning = None;
                next.clone()
            };
            let _ = progress_app.emit(EVENT_MEETING_CAPTURE_STATE, snapshot);

            if elapsed > 0 && elapsed % DISK_CHECK_EVERY_SECONDS == 0 {
                let running_out = disk_root.as_ref().is_some_and(|root| {
                    fs2::available_space(root)
                        .is_ok_and(|available| available < CAPTURE_LOW_DISK_BYTES)
                });
                if running_out && !low_disk_handled.swap(true, Ordering::SeqCst) {
                    let app = disk_app.clone();
                    tauri::async_runtime::spawn(async move {
                        crate::toast::show(
                            &app,
                            "error",
                            Some("Recording saved"),
                            "The disk is nearly full, so the recording was closed before it could be lost.",
                        );
                        let state = app.state::<AppState>();
                        if let Err(error) = state.meeting_capture().stop(&app, &state).await {
                            tracing::error!("Failed to stop on a full disk: {error}");
                        }
                    });
                }
            }
        },
        move || {
            if silence_monitor.observe_voice(Instant::now()) {
                crate::toast::hide(&voice_app);
            }
        },
    )
    .await
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn write_capture_stream(
    stream: looper_audio_capture::CaptureStream,
    writer: hound::WavWriter<std::io::BufWriter<fs::File>>,
    cancel: CancellationToken,
    #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))] live_audio_sink: Option<
        super::meeting_live_transcription::MeetingLiveAudioSink,
    >,
    on_progress: impl FnMut(u64, u64),
    on_voice: impl FnMut(),
) -> Result<CaptureResult> {
    write_capture_stream_with_timing(
        stream,
        writer,
        cancel,
        #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
        live_audio_sink,
        CAPTURE_STALL_TIMEOUT,
        Instant::now(),
        on_progress,
        on_voice,
    )
    .await
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn write_capture_stream_with_timing(
    mut stream: looper_audio_capture::CaptureStream,
    mut writer: hound::WavWriter<std::io::BufWriter<fs::File>>,
    cancel: CancellationToken,
    #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))] live_audio_sink: Option<
        super::meeting_live_transcription::MeetingLiveAudioSink,
    >,
    stall_timeout: Duration,
    started: Instant,
    mut on_progress: impl FnMut(u64, u64),
    mut on_voice: impl FnMut(),
) -> Result<CaptureResult> {
    use futures_util::StreamExt;

    let mut samples_written = 0u64;
    let mut last_flush = Instant::now();
    let mut last_elapsed = 0u64;
    let mut voice_activity_detector = MeetingVoiceActivityDetector::new();
    let capture_result: Result<()> = 'capture: loop {
        let frame = tokio::select! {
            _ = cancel.cancelled() => break Ok(()),
            frame = tokio::time::timeout(stall_timeout, stream.next()) => {
                match frame {
                    Ok(frame) => frame,
                    Err(_) => break Err(anyhow!(
                        "Audio capture stalled for five seconds. Check the active audio devices and try again."
                    )),
                }
            },
        };
        let frame = match frame {
            Some(Ok(frame)) => frame,
            Some(Err(err)) => break Err(anyhow!(err)),
            None => break Err(anyhow!("audio stream ended")),
        };
        let (mic, speaker) = frame.aec_dual();
        if voice_activity_detector.observe(&mic, &speaker) {
            on_voice();
        }
        #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
        if let Some(sink) = &live_audio_sink {
            let start_ms = samples_written.saturating_mul(1_000) / TARGET_SAMPLE_RATE as u64;
            let frame_samples = mic.len().max(speaker.len()) as u64;
            let end_ms = start_ms
                .saturating_add(frame_samples.saturating_mul(1_000) / TARGET_SAMPLE_RATE as u64);
            sink.push(&mic, &speaker, start_ms, end_ms);
        }
        for index in 0..mic.len().max(speaker.len()) {
            let sample = mix_sample(
                mic.get(index).copied().unwrap_or_default(),
                speaker.get(index).copied().unwrap_or_default(),
            );
            let sample = float_to_pcm16(sample);
            if let Err(err) = writer.write_sample(sample) {
                break 'capture Err(anyhow!("Failed to write meeting audio: {err}"));
            }
            samples_written = samples_written.saturating_add(1);
        }
        let lag_samples = capture_lag_samples(started.elapsed(), samples_written);
        if last_flush.elapsed() >= Duration::from_secs(1) {
            if let Err(err) = writer.flush() {
                break Err(anyhow!("Failed to flush meeting audio: {err}"));
            }
            last_flush = Instant::now();
        }
        let elapsed = started.elapsed().as_secs();
        if elapsed != last_elapsed {
            last_elapsed = elapsed;
            on_progress(elapsed, lag_samples);
        }
    };

    let flush_result = writer
        .flush()
        .context("Failed to flush the final meeting audio");
    let finalize_result = writer
        .finalize()
        .context("Failed to finalize the meeting WAV file");
    capture_result?;
    flush_result?;
    finalize_result?;
    Ok(CaptureResult { samples_written })
}

fn mix_sample(mic: f32, speaker: f32) -> f32 {
    (mic + speaker).clamp(-1.0, 1.0)
}

fn capture_lag_samples(elapsed: Duration, samples_written: u64) -> u64 {
    let expected_samples = (elapsed.as_secs_f64() * TARGET_SAMPLE_RATE as f64) as u64;
    expected_samples.saturating_sub(samples_written)
}

pub(super) fn float_to_pcm16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16
}

fn finalized_path(path: &Path) -> PathBuf {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return path.to_path_buf();
    };
    match name.strip_suffix(".partial.wav") {
        Some(stem) => path.with_file_name(format!("{stem}.wav")),
        None => path.to_path_buf(),
    }
}

#[cfg(target_os = "macos")]
fn ensure_supported_os() -> Result<(), String> {
    let output = std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .map_err(|err| format!("Failed to detect the macOS version: {err}"))?;
    let version = String::from_utf8_lossy(&output.stdout);
    if macos_supports_system_audio(&version) {
        Ok(())
    } else {
        Err("Meeting recording requires macOS 14.2 or later.".to_string())
    }
}

#[cfg(target_os = "windows")]
fn ensure_supported_os() -> Result<(), String> {
    #[repr(C)]
    struct OsVersionInfo {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform_id: u32,
        service_pack: [u16; 128],
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(version: *mut OsVersionInfo) -> i32;
    }

    let mut version = OsVersionInfo {
        size: std::mem::size_of::<OsVersionInfo>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform_id: 0,
        service_pack: [0; 128],
    };
    let status = unsafe { RtlGetVersion(&mut version) };
    if status >= 0 && version.major >= 10 {
        Ok(())
    } else {
        Err("Meeting recording requires Windows 10 or later.".to_string())
    }
}

fn macos_supports_system_audio(version: &str) -> bool {
    let mut parts = version.trim().split('.');
    let major = parts.next().and_then(|value| value.parse::<u32>().ok());
    let minor = parts.next().and_then(|value| value.parse::<u32>().ok());
    matches!((major, minor), (Some(major), Some(minor)) if major > 14 || (major == 14 && minor >= 2))
}

#[cfg(test)]
mod tests {
    use super::super::types::{LibraryTranscriptionResult, TranscriptSegment};
    use super::*;

    #[test]
    fn meeting_transcription_rejects_cohere_without_timestamps() {
        assert!(model_supports_meetings("parakeet_tdt_int8"));
        assert!(!model_supports_meetings("cohere_transcribe_int4"));
        assert!(model_supports_meetings("remote:assemblyai:universal"));
        assert!(model_supports_live_meeting_transcript("parakeet_tdt_int8"));
        assert!(!model_supports_live_meeting_transcript(
            "cohere_transcribe_int4"
        ));
        assert!(!model_supports_live_meeting_transcript(
            "remote:assemblyai:universal"
        ));
    }

    #[test]
    fn mixer_combines_and_clips_both_sources() {
        assert_eq!(mix_sample(0.25, 0.5), 0.75);
        assert_eq!(mix_sample(0.8, 0.6), 1.0);
        assert_eq!(mix_sample(-0.8, -0.6), -1.0);
    }

    #[test]
    fn pcm_conversion_clamps_out_of_range_samples() {
        assert_eq!(float_to_pcm16(2.0), i16::MAX);
        assert_eq!(float_to_pcm16(-2.0), -i16::MAX);
        assert_eq!(float_to_pcm16(0.0), 0);
    }

    #[test]
    fn capture_lag_detects_unreported_audio_gaps() {
        assert_eq!(capture_lag_samples(Duration::from_secs(10), 160_000), 0);
        assert_eq!(
            capture_lag_samples(Duration::from_secs(10), 128_000),
            32_000
        );
        assert!(
            capture_lag_samples(Duration::from_secs(10), 127_999) > TARGET_SAMPLE_RATE as u64 * 2
        );
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[tokio::test]
    async fn capture_continues_after_audio_falls_two_seconds_behind() {
        let directory =
            std::env::temp_dir().join(format!("looper-meeting-lag-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("delayed.wav");
        let writer = create_wav_writer(&path).unwrap();
        let cancel = CancellationToken::new();
        let stream_cancel = cancel.clone();
        let frame = looper_audio_capture::CaptureFrame {
            raw_mic: Arc::from(vec![0.25_f32; CAPTURE_CHUNK_SAMPLES]),
            raw_speaker: Arc::from(vec![0.0_f32; CAPTURE_CHUNK_SAMPLES]),
            echo_cancelled: None,
        };
        let stream = looper_audio_capture::CaptureStream::new(futures_util::stream::unfold(
            0_u8,
            move |index| {
                let frame = frame.clone();
                let stream_cancel = stream_cancel.clone();
                async move {
                    if index < 10 {
                        Some((Ok::<_, looper_audio_capture::Error>(frame), index + 1))
                    } else {
                        stream_cancel.cancel();
                        std::future::pending().await
                    }
                }
            },
        ));
        let observed_lag = Arc::new(Mutex::new(0_u64));
        let progress_lag = Arc::clone(&observed_lag);

        let captured = write_capture_stream_with_timing(
            stream,
            writer,
            cancel,
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            None,
            Duration::from_millis(50),
            Instant::now() - Duration::from_secs(3),
            move |_, lag_samples| {
                let mut maximum = progress_lag.lock();
                *maximum = (*maximum).max(lag_samples);
            },
            || {},
        )
        .await
        .unwrap();

        assert_eq!(captured.samples_written, TARGET_SAMPLE_RATE as u64);
        assert!(*observed_lag.lock() > TARGET_SAMPLE_RATE as u64 * 2);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[tokio::test]
    async fn capture_still_fails_when_the_audio_stream_stalls() {
        let directory =
            std::env::temp_dir().join(format!("looper-meeting-stall-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("stalled.wav");
        let writer = create_wav_writer(&path).unwrap();
        let stream = looper_audio_capture::CaptureStream::new(futures_util::stream::pending::<
            Result<looper_audio_capture::CaptureFrame, looper_audio_capture::Error>,
        >());

        let result = write_capture_stream_with_timing(
            stream,
            writer,
            CancellationToken::new(),
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            None,
            Duration::from_millis(10),
            Instant::now(),
            |_, _| {},
            || {},
        )
        .await;
        let error = match result {
            Ok(_) => panic!("stalled audio stream should fail"),
            Err(error) => error,
        };

        assert!(error.to_string().contains("stalled for five seconds"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn final_path_removes_partial_marker_only() {
        let path = Path::new("/tmp/meeting.partial.wav");
        assert_eq!(finalized_path(path), PathBuf::from("/tmp/meeting.wav"));
        assert_eq!(
            finalized_path(Path::new("/tmp/meeting.wav")),
            PathBuf::from("/tmp/meeting.wav")
        );
    }

    #[test]
    fn macos_version_gate_starts_at_14_2() {
        assert!(!macos_supports_system_audio("14.1.9\n"));
        assert!(macos_supports_system_audio("14.2\n"));
        assert!(macos_supports_system_audio("15.0\n"));
        assert!(!macos_supports_system_audio("invalid"));
    }

    #[test]
    fn wav_writer_flushes_a_readable_partial_header() {
        let directory =
            std::env::temp_dir().join(format!("looper-meeting-wav-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("capture.partial.wav");
        let mut writer = create_wav_writer(&path).unwrap();
        for _ in 0..1_600 {
            writer.write_sample(100_i16).unwrap();
        }
        writer.flush().unwrap();

        let info = read_wav_info(&path).unwrap();
        assert_eq!(info.total_samples, 1_600);
        assert!((info.duration_seconds - 0.1).abs() < f32::EPSILON);

        writer.finalize().unwrap();
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn disk_preflight_covers_at_least_two_hours_of_pcm_audio() {
        let two_hour_pcm_bytes = TARGET_SAMPLE_RATE as u64 * 2 * 60 * 60 * 2;
        assert!(MIN_FREE_DISK_BYTES > two_hour_pcm_bytes);
    }

    #[test]
    fn the_capture_stops_itself_with_room_left_to_close_the_file() {
        // Parar por debajo del mínimo de arranque, y con margen de sobra para
        // cerrar la cabecera del wav: si se apurase hasta el último byte, la
        // grabación moriría justo en el guardado, que es lo que se evita.
        assert!(CAPTURE_LOW_DISK_BYTES < MIN_FREE_DISK_BYTES);
        let one_minute_pcm_bytes = TARGET_SAMPLE_RATE as u64 * 2 * 60;
        assert!(CAPTURE_LOW_DISK_BYTES > one_minute_pcm_bytes);
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[tokio::test]
    async fn capture_initializer_times_out_instead_of_blocking_startup() {
        let started = Instant::now();
        let result = run_capture_initializer(
            || {
                std::thread::sleep(Duration::from_millis(100));
                Ok(())
            },
            Duration::from_millis(10),
        )
        .await;

        assert!(matches!(result, Err(CaptureOpenFailure::TimedOut)));
        assert!(started.elapsed() < Duration::from_millis(80));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn system_audio_timeout_points_to_the_matching_privacy_pane() {
        assert!(system_audio_timeout_message().contains("Screen & System Audio Recording"));
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[test]
    fn failed_capture_preserves_final_audio_and_metadata() {
        let directory =
            std::env::temp_dir().join(format!("looper-meeting-failure-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let partial_path = directory.join("meeting.partial.wav");
        let final_path = directory.join("meeting.wav");
        let mut writer = create_wav_writer(&partial_path).unwrap();
        for _ in 0..1_600 {
            writer.write_sample(100_i16).unwrap();
        }
        writer.finalize().unwrap();

        let storage = crate::storage::StorageManager::new(directory.join("library.db")).unwrap();
        let id = Uuid::new_v4().to_string();
        storage
            .insert_meeting_item(
                LibraryItem {
                    id: id.clone(),
                    name: "Interrupted meeting".to_string(),
                    audio_path: partial_path.display().to_string(),
                    source_path: String::new(),
                    store_original: false,
                    status: LibraryItemStatus::Recording,
                    transcript: None,
                    segments: None,
                    words: None,
                    duration_seconds: 0.0,
                    file_size_bytes: 0,
                    original_format: "wav".to_string(),
                    created_at: Utc::now().to_rfc3339(),
                    transcribed_at: None,
                    tags: Vec::new(),
                    llm_cleanup_enabled: false,
                    denoise_enabled: false,
                    speech_model: "test-model".to_string(),
                    show_timestamps: true,
                    detect_speakers: false,
                    kind: "meeting".to_string(),
                    speakers: None,
                },
                &MeetingDetails {
                    library_item_id: id.clone(),
                    started_at: Utc::now().to_rfc3339(),
                    ended_at: None,
                    notes: String::new(),
                    notes_revision: 0,
                    summary: None,
                    summary_status: MeetingSummaryStatus::Idle,
                    summary_error: None,
                    system_audio_enabled: true,
                    recovered: false,
                    calendar_context: None,
                    note_markers: Vec::new(),
                    live_transcript: Vec::new(),
                },
            )
            .unwrap();

        preserve_failed_capture(
            &storage,
            &id,
            &partial_path,
            &final_path,
            "Audio device disconnected",
        )
        .unwrap();

        let item = storage.get_library_item(&id).unwrap().unwrap();
        assert_eq!(item.audio_path, final_path.display().to_string());
        assert!(final_path.exists());
        assert!(!partial_path.exists());
        assert!((item.duration_seconds - 0.1).abs() < f32::EPSILON);
        assert!(item.file_size_bytes > 44);
        assert!(matches!(
            item.status,
            LibraryItemStatus::Error { ref message }
                if message == "Audio device disconnected"
        ));

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(target_os = "macos")]
    fn current_rss_bytes() -> u64 {
        let output = std::process::Command::new("ps")
            .args(["-o", "rss=", "-p", &std::process::id().to_string()])
            .output()
            .unwrap();
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<u64>()
            .unwrap()
            * 1024
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    #[ignore = "writes a 230 MB WAV to prove the two-hour bounded-memory path"]
    async fn two_hour_capture_stream_stays_under_memory_budget() {
        let directory =
            std::env::temp_dir().join(format!("looper-meeting-long-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("two-hours.wav");
        let writer = create_wav_writer(&path).unwrap();
        let samples_per_frame = CAPTURE_CHUNK_SAMPLES as u64;
        let expected_samples = TARGET_SAMPLE_RATE as u64 * 2 * 60 * 60;
        let frame_count = expected_samples / samples_per_frame;
        let frame = looper_audio_capture::CaptureFrame {
            raw_mic: Arc::from(vec![0.01_f32; CAPTURE_CHUNK_SAMPLES]),
            raw_speaker: Arc::from(vec![0.0_f32; CAPTURE_CHUNK_SAMPLES]),
            echo_cancelled: None,
        };
        let cancel = CancellationToken::new();
        let stream_cancel = cancel.clone();
        let stream = looper_audio_capture::CaptureStream::new(futures_util::stream::unfold(
            0_u64,
            move |index| {
                let frame = frame.clone();
                let stream_cancel = stream_cancel.clone();
                async move {
                    if index < frame_count {
                        Some((
                            Ok::<_, looper_audio_capture::Error>(frame),
                            index.saturating_add(1),
                        ))
                    } else {
                        stream_cancel.cancel();
                        std::future::pending().await
                    }
                }
            },
        ));
        let rss_before = current_rss_bytes();

        let captured = write_capture_stream(
            stream,
            writer,
            cancel,
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            None,
            |_, _| {},
            || {},
        )
        .await
        .unwrap();

        let rss_after = current_rss_bytes();
        let rss_growth = rss_after.saturating_sub(rss_before);
        let info = read_wav_info(&path).unwrap();
        eprintln!(
            "two-hour capture: {} samples, {} MB WAV, {} MB RSS growth",
            captured.samples_written,
            fs::metadata(&path).unwrap().len() / 1024 / 1024,
            rss_growth / 1024 / 1024
        );
        assert_eq!(captured.samples_written, expected_samples);
        assert_eq!(info.total_samples, expected_samples as usize);
        assert!((info.duration_seconds - 7_200.0).abs() < f32::EPSILON);
        assert!(
            rss_growth < 100 * 1024 * 1024,
            "RSS grew by {} MB",
            rss_growth / 1024 / 1024
        );

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn meeting_note_uses_the_previous_thirty_seconds() {
        assert_eq!(note_marker_range(12_000), (0, 12_000));
        assert_eq!(note_marker_range(45_500), (15_500, 45_500));
    }

    #[test]
    fn held_meeting_note_adds_five_seconds_every_two_seconds() {
        assert_eq!(note_selection_duration(0), 10_000);
        assert_eq!(note_selection_duration(1_999), 10_000);
        assert_eq!(note_selection_duration(2_000), 15_000);
        assert_eq!(note_selection_duration(4_000), 20_000);
        assert_eq!(note_selection_duration(20_000), 60_000);
        assert_eq!(note_selection_duration(90_000), 60_000);

        assert_eq!(note_selection_range(45_000, 45_000), (35_000, 45_000));
        assert_eq!(note_selection_range(45_000, 47_000), (32_000, 47_000));
        assert_eq!(note_selection_range(45_000, 49_000), (29_000, 49_000));
        assert_eq!(note_selection_range(45_000, 80_000), (20_000, 80_000));
    }

    #[test]
    fn only_a_quick_first_press_can_become_a_double_tap() {
        assert!(qualifies_for_double_tap(Duration::from_millis(100)));
        assert!(qualifies_for_double_tap(Duration::from_millis(450)));
        assert!(!qualifies_for_double_tap(Duration::from_millis(451)));
        assert!(!qualifies_for_double_tap(Duration::from_secs(2)));
    }

    #[test]
    fn old_meeting_note_markers_default_to_retrospective() {
        let marker: MeetingNoteMarker = serde_json::from_str(
            r#"{"id":"legacy","captured_at_ms":45000,"start_ms":15000,"end_ms":45000,"created_at":"2026-07-18T10:00:45Z"}"#,
        )
        .unwrap();

        assert_eq!(marker.kind, MeetingNoteKind::Retrospective);
    }

    #[test]
    fn meeting_note_capture_persists_marker_and_updates_state() {
        let directory =
            std::env::temp_dir().join(format!("looper-meeting-note-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = crate::storage::StorageManager::new(directory.join("library.db")).unwrap();
        let id = Uuid::new_v4().to_string();
        storage
            .insert_meeting_item(
                LibraryItem {
                    id: id.clone(),
                    name: "Meeting note test".to_string(),
                    audio_path: directory.join("meeting.wav").display().to_string(),
                    source_path: String::new(),
                    store_original: false,
                    status: LibraryItemStatus::Recording,
                    transcript: None,
                    segments: None,
                    words: None,
                    duration_seconds: 0.0,
                    file_size_bytes: 0,
                    original_format: "wav".to_string(),
                    created_at: "2026-07-18T10:00:00Z".to_string(),
                    transcribed_at: None,
                    tags: Vec::new(),
                    llm_cleanup_enabled: false,
                    denoise_enabled: false,
                    speech_model: "test-model".to_string(),
                    show_timestamps: true,
                    detect_speakers: false,
                    kind: "meeting".to_string(),
                    speakers: None,
                },
                &MeetingDetails {
                    library_item_id: id.clone(),
                    started_at: "2026-07-18T10:00:00Z".to_string(),
                    ended_at: None,
                    notes: String::new(),
                    notes_revision: 0,
                    summary: None,
                    summary_status: MeetingSummaryStatus::Idle,
                    summary_error: None,
                    system_audio_enabled: true,
                    recovered: false,
                    calendar_context: None,
                    note_markers: Vec::new(),
                    live_transcript: Vec::new(),
                },
            )
            .unwrap();
        let manager = MeetingCaptureManager::default();
        *manager.state.write() = MeetingCaptureState {
            phase: MeetingCapturePhase::Recording,
            id: Some(id.clone()),
            elapsed_seconds: 45,
            ..Default::default()
        };

        let captured = manager
            .capture_note_at(
                &storage,
                DateTime::parse_from_rfc3339("2026-07-18T10:00:45Z")
                    .unwrap()
                    .with_timezone(&Utc),
            )
            .unwrap();

        assert_eq!(captured.marker.start_ms, 15_000);
        assert_eq!(captured.marker.end_ms, 45_000);
        assert_eq!(captured.details.note_markers, vec![captured.marker.clone()]);
        assert_eq!(
            captured
                .state
                .as_ref()
                .and_then(|state| state.last_note_marker.as_ref()),
            Some(&captured.marker)
        );
        assert_eq!(
            storage
                .get_meeting_details(&id)
                .unwrap()
                .unwrap()
                .note_markers,
            vec![captured.marker]
        );

        let important = manager
            .persist_note_marker_at(
                &storage,
                manager.state(),
                DateTime::parse_from_rfc3339("2026-07-18T10:00:50Z")
                    .unwrap()
                    .with_timezone(&Utc),
                50_000,
                45_000,
                50_000,
                MeetingNoteKind::ImportantMoment,
            )
            .unwrap();
        assert_eq!(important.marker.kind, MeetingNoteKind::ImportantMoment);
        assert_eq!(important.marker.start_ms, 45_000);
        assert_eq!(important.marker.end_ms, 50_000);
        assert_eq!(important.details.note_markers.len(), 2);

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    async fn assert_synthetic_long_form_pipeline(
        capture_label: &str,
        item_name: &str,
        system_audio_enabled: bool,
        intent: CaptureIntent,
    ) {
        let directory = std::env::temp_dir().join(format!(
            "looper-{capture_label}-pipeline-test-{}",
            Uuid::new_v4()
        ));
        fs::create_dir_all(&directory).unwrap();
        let partial_path = directory.join(format!("{capture_label}.partial.wav"));
        let final_path = directory.join(format!("{capture_label}.wav"));
        let storage = crate::storage::StorageManager::new(directory.join("library.db")).unwrap();
        let id = Uuid::new_v4().to_string();
        let started_at = "2026-07-18T10:00:00Z";
        let ended_at = "2026-07-18T10:00:01Z";

        let item = LibraryItem {
            id: id.clone(),
            name: item_name.to_string(),
            audio_path: partial_path.display().to_string(),
            source_path: String::new(),
            store_original: false,
            status: LibraryItemStatus::Recording,
            transcript: None,
            segments: None,
            words: None,
            duration_seconds: 0.0,
            file_size_bytes: 0,
            original_format: "wav".to_string(),
            created_at: started_at.to_string(),
            transcribed_at: None,
            tags: Vec::new(),
            llm_cleanup_enabled: false,
            denoise_enabled: false,
            speech_model: "test-model".to_string(),
            show_timestamps: true,
            detect_speakers: false,
            kind: if intent == CaptureIntent::Meeting {
                "meeting"
            } else {
                "recording"
            }
            .to_string(),
            speakers: None,
        };
        // Mismo alta que `prepare_capture`: toda captura entra con detalles.
        storage
            .insert_meeting_item(
                item,
                &MeetingDetails {
                    library_item_id: id.clone(),
                    started_at: started_at.to_string(),
                    ended_at: None,
                    notes: String::new(),
                    notes_revision: 0,
                    summary: None,
                    summary_status: MeetingSummaryStatus::Idle,
                    summary_error: None,
                    system_audio_enabled,
                    recovered: false,
                    calendar_context: None,
                    note_markers: Vec::new(),
                    live_transcript: Vec::new(),
                },
            )
            .unwrap();

        let writer = create_wav_writer(&partial_path).unwrap();
        let cancel = CancellationToken::new();
        let stream_cancel = cancel.clone();
        let frame = looper_audio_capture::CaptureFrame {
            raw_mic: Arc::from(vec![0.25_f32; CAPTURE_CHUNK_SAMPLES]),
            raw_speaker: Arc::from(vec![
                if system_audio_enabled {
                    0.5_f32
                } else {
                    0.0_f32
                };
                CAPTURE_CHUNK_SAMPLES
            ]),
            echo_cancelled: None,
        };
        let stream = looper_audio_capture::CaptureStream::new(futures_util::stream::unfold(
            0_u8,
            move |index| {
                let frame = frame.clone();
                let stream_cancel = stream_cancel.clone();
                async move {
                    if index < 10 {
                        Some((Ok::<_, looper_audio_capture::Error>(frame), index + 1))
                    } else {
                        stream_cancel.cancel();
                        std::future::pending().await
                    }
                }
            },
        ));

        let captured = write_capture_stream(
            stream,
            writer,
            cancel,
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            None,
            |_, _| {},
            || {},
        )
        .await
        .unwrap();
        assert_eq!(captured.samples_written, TARGET_SAMPLE_RATE as u64);

        persist_finalized_capture(
            &storage,
            &id,
            &partial_path,
            &final_path,
            captured,
            ended_at,
        )
        .unwrap();

        let pending = storage.get_library_item(&id).unwrap().unwrap();
        assert!(matches!(pending.status, LibraryItemStatus::Pending));
        assert!((pending.duration_seconds - 1.0).abs() < f32::EPSILON);
        assert!(final_path.exists());
        assert!(!partial_path.exists());
        let mut reader = hound::WavReader::open(&final_path).unwrap();
        assert_eq!(reader.spec().sample_rate, TARGET_SAMPLE_RATE);
        assert_eq!(reader.duration(), TARGET_SAMPLE_RATE);
        assert_eq!(
            reader.samples::<i16>().next().unwrap().unwrap(),
            if system_audio_enabled { 24_575 } else { 8_192 }
        );

        super::super::queue::persist_successful_transcription(
            &storage,
            &id,
            "Decision confirmed".to_string(),
            LibraryTranscriptionResult {
                transcript: "Decision confirmed".to_string(),
                segments: Some(vec![TranscriptSegment {
                    start_ms: 0,
                    end_ms: 1_000,
                    text: "Decision confirmed".to_string(),
                    speaker_id: None,
                }]),
                words: None,
                speech_model: Some("test-model".to_string()),
                speakers: None,
            },
            "2026-07-18T10:00:02Z",
        )
        .unwrap();

        let complete = storage.get_library_item(&id).unwrap().unwrap();
        assert!(matches!(complete.status, LibraryItemStatus::Complete));
        assert_eq!(complete.transcript.as_deref(), Some("Decision confirmed"));
        assert_eq!(complete.segments.as_ref().map(Vec::len), Some(1));
        // Una nota termina con los mismos detalles cerrados que una reunión: es
        // lo que habilita resumen y chat sobre ella.
        let details = storage.get_meeting_details(&id).unwrap().unwrap();
        assert_eq!(details.ended_at.as_deref(), Some(ended_at));
        assert_eq!(details.system_audio_enabled, system_audio_enabled);
        assert!(complete.is_capture());
        assert_eq!(
            complete.kind,
            if intent == CaptureIntent::Meeting {
                "meeting"
            } else {
                "recording"
            }
        );

        drop(reader);
        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[tokio::test]
    async fn synthetic_meeting_pipeline_persists_audio_and_transcription() {
        assert_synthetic_long_form_pipeline(
            "meeting",
            "Synthetic meeting",
            true,
            CaptureIntent::Meeting,
        )
        .await;
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[tokio::test]
    async fn synthetic_note_pipeline_persists_mic_audio_and_transcription() {
        assert_synthetic_long_form_pipeline(
            "note",
            "Synthetic note",
            false,
            CaptureIntent::VoiceNote,
        )
        .await;
    }
}
