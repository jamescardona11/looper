#[cfg(target_os = "macos")]
use crate::hover_intent::{HoverDecision, HoverIntent};
use crate::permissions;
use crate::{
    accessibility_context, assistive,
    capture_pill::{
        self, clamp_coordinates as clamp_overlay_coordinates, closest_monitor_index,
        logical_pixels, physical_size as physical_overlay_size, points_share_closest_monitor,
        CapturePillDockPosition, CapturePillPresentation,
    },
    core::hotkeys::{self, HotkeyState},
    emit_event, model_manager, music, platform,
    recorder::RecorderManager,
    screen_vocabulary,
    settings::{MediaAction, Personality, TranscriptionMode, UserSettings},
    toast, AppRuntime, AppState, AudioSpectrumPayload, EVENT_AUDIO_SPECTRUM, MAIN_WINDOW_LABEL,
};
use chrono::{DateTime, Local};
use parking_lot::Mutex;
use rustfft::{num_complex::Complex, FftPlanner};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Rect, WebviewWindow};

#[path = "pill_controller_state.rs"]
mod pill_controller_state;
#[path = "pill_layout.rs"]
mod pill_layout;

use pill_layout::{
    canonical_from_dictation_origin, canonical_meeting_overlay_origin,
    dictation_origin_from_canonical, meeting_overlay_geometry,
};

const MIN_RECORDING_DURATION_MS: i64 = 300;
const OVERLAY_HIDE_AFTER_IDLE_MS: u64 = 180;
const CANCELLED_FEEDBACK_MS: u64 = 1_200;
const MAX_RECORDING_DURATION: Duration = Duration::from_secs(30 * 60);
const CAPTURE_ARM_DELAY: Duration = Duration::from_millis(280);
const DICTATION_OVERLAY_WIDTH: f64 = 300.0;
const DICTATION_OVERLAY_HEIGHT: f64 = 260.0;
const STICKY_OVERLAY_WIDTH: f64 = 260.0;
const STICKY_OVERLAY_HEIGHT: f64 = 60.0;
const STICKY_LANGUAGE_MENU_HEIGHT: f64 = 254.0;
const PREFLIGHT_OVERLAY_WIDTH: f64 = 260.0;
const PREFLIGHT_OVERLAY_HEIGHT: f64 = 48.0;
const PREFLIGHT_LANGUAGE_MENU_HEIGHT: f64 = 242.0;
const PREFLIGHT_TRAY_GAP: f64 = 6.0;
const PREFLIGHT_HIDE_AFTER_LEAVE_MS: u64 = 180;
const MEETING_TRANSCRIPT_WIDTH: f64 = 252.0;
const MEETING_TRANSCRIPT_HEIGHT: f64 = 300.0;
const MEETING_PILL_SLOT_WIDTH: f64 = 260.0;
const MEETING_PILL_HEIGHT: f64 = 48.0;
const MEETING_COMPACT_PILL_SIZE: f64 = 42.0;
const MEETING_OVERLAY_GAP: f64 = 4.0;
const MEETING_PILL_GUTTER: f64 = 4.0;
const MEETING_OVERLAY_WIDTH: f64 = MEETING_PILL_SLOT_WIDTH + MEETING_PILL_GUTTER * 2.0;
const MEETING_OVERLAY_HEIGHT: f64 = MEETING_PILL_HEIGHT + MEETING_PILL_GUTTER * 2.0;
const MEETING_TRANSCRIPT_ABOVE_HEIGHT: f64 = MEETING_TRANSCRIPT_HEIGHT
    + MEETING_OVERLAY_GAP
    + MEETING_PILL_HEIGHT
    + MEETING_PILL_GUTTER * 2.0;
const MEETING_TRANSCRIPT_SIDE_WIDTH: f64 = MEETING_TRANSCRIPT_WIDTH
    + MEETING_OVERLAY_GAP
    + MEETING_PILL_SLOT_WIDTH
    + MEETING_PILL_GUTTER * 2.0;
const MEETING_TRANSCRIPT_SIDE_HEIGHT: f64 = MEETING_TRANSCRIPT_HEIGHT + MEETING_PILL_GUTTER * 2.0;
const DICTATION_PILL_INSET_BOTTOM: f64 = 8.0;
const DICTATION_PILL_INSET_X: f64 = (DICTATION_OVERLAY_WIDTH - MEETING_PILL_SLOT_WIDTH) / 2.0;
const DICTATION_PILL_INSET_Y: f64 =
    DICTATION_OVERLAY_HEIGHT - DICTATION_PILL_INSET_BOTTOM - MEETING_PILL_HEIGHT;
const OVERLAY_OFFSCREEN_LIMIT: i32 = -5_000;
pub const EVENT_PILL_STATE: &str = "pill:state";
pub const EVENT_PILL_MODE: &str = "pill:mode";
pub const EVENT_PILL_HOVER: &str = "pill:hover";
pub const EVENT_CAPTURE_PILL_PREFERENCES: &str = "capture-pill:preferences";
/// Se emite cuando el texto ya está en la app y el undo sigue disponible.
pub const EVENT_PILL_INSERTED: &str = "pill:inserted";
/// Acompaña al estado de error con el registro que quedó guardado, para que la
/// pill pueda ofrecer reintentar en vez de solo decir que el audio está a salvo.
pub const EVENT_PILL_ERROR: &str = "pill:error";
/// Streaming preview of a Selection Mode transform: fires with the text
/// accumulated so far while the LLM generates - see
/// `emit_pill_transform_stream`.
pub const EVENT_PILL_TRANSFORM_STREAM: &str = "pill:transform-stream";
pub(crate) const PILL_TONE_DEFAULT: &str = "default";
pub(crate) const PILL_TONE_CLEANUP: &str = "cleanup";
pub(crate) const PILL_TONE_PREVIEW: &str = "preview";
/// Selection Mode's action selector (F2): shown after the voice instruction
/// is transcribed, before the transform runs - see
/// `transcribe.rs::await_edit_action_selection`.
pub(crate) const PILL_TONE_ACTION_SELECT: &str = "action_select";
/// Selection Mode's "Ask" result (F2): the transformed text is shown here
/// and only here - this tone is never wired to a confirm-and-insert action
/// in the frontend, see `PillOverlay.tsx`.
pub(crate) const PILL_TONE_ASK_RESULT: &str = "ask_result";
pub(crate) const PILL_TONE_COPY_RESULT: &str = "copy_result";
pub(crate) const PILL_TONE_INSERTED_RESULT: &str = "inserted_result";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PillStatus {
    Idle,
    Preflight,
    Listening,
    Processing,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MeetingTranscriptPlacement {
    #[default]
    Above,
    Left,
    Right,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MeetingTranscriptSideAlignment {
    Top,
    #[default]
    Bottom,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct MeetingOverlayPresentation {
    compact: bool,
    transcript_visible: bool,
    transcript_pinned: bool,
    placement: MeetingTranscriptPlacement,
    side_alignment: MeetingTranscriptSideAlignment,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MeetingOverlayGeometry {
    placement: MeetingTranscriptPlacement,
    side_alignment: MeetingTranscriptSideAlignment,
    logical_size: (i32, i32),
    origin: (i32, i32),
}

#[derive(Debug, Clone, Copy)]
struct PreflightTrayAnchor {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone)]
struct PillModeState {
    expanded: bool,
    text: String,
    tone: String,
    used_screen_context: bool,
}

impl Default for PillModeState {
    fn default() -> Self {
        Self {
            expanded: false,
            text: String::new(),
            tone: PILL_TONE_DEFAULT.to_string(),
            used_screen_context: false,
        }
    }
}

#[derive(Serialize)]
pub struct MeetingOverlayPresentationPayload {
    placement: MeetingTranscriptPlacement,
    #[serde(rename = "sideAlignment")]
    side_alignment: MeetingTranscriptSideAlignment,
}

impl std::fmt::Display for PillStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PillStatus::Idle => write!(f, "idle"),
            PillStatus::Preflight => write!(f, "preflight"),
            PillStatus::Listening => write!(f, "listening"),
            PillStatus::Processing => write!(f, "processing"),
            PillStatus::Cancelled => write!(f, "cancelled"),
            PillStatus::Error => write!(f, "error"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordingMode {
    Hold,
    Toggle,
}

#[derive(Serialize, Clone)]
pub struct PillStatePayload {
    pub status: PillStatus,
}

#[derive(Serialize, Clone)]
pub struct PillErrorPayload {
    /// `None` cuando no se guardó audio que pueda reintentarse.
    pub retry_id: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct PillInsertedPayload {
    /// Cuántos caracteres se insertaron: la pill lo usa para no anunciar
    /// inserciones vacías.
    pub chars: usize,
    /// Solo con `can_undo` la pill ofrece deshacer; una inserción no verificada
    /// no tiene estado de undo fiable.
    pub can_undo: bool,
}

const SPECTRUM_SAMPLE_COUNT: usize = 512;
const SPECTRUM_OUTPUT_COUNT: usize = SPECTRUM_SAMPLE_COUNT / 2;
const SPECTRUM_MEMORY: f32 = 0.8;
const SPECTRUM_FLOOR_DB: f32 = -100.0;
const SPECTRUM_CEILING_DB: f32 = -30.0;

struct SpectrumAnalyzer {
    transform: Arc<dyn rustfft::Fft<f32>>,
    taper: Vec<f32>,
    workspace: Vec<Complex<f32>>,
    levels: Vec<f32>,
}

impl SpectrumAnalyzer {
    fn new() -> Self {
        let mut plans = FftPlanner::<f32>::new();
        let last_sample = (SPECTRUM_SAMPLE_COUNT - 1) as f32;
        let taper = (0..SPECTRUM_SAMPLE_COUNT)
            .map(|sample| {
                let phase = 2.0 * std::f32::consts::PI * sample as f32 / last_sample;
                (1.0 - phase.cos()) / 2.0
            })
            .collect();

        Self {
            transform: plans.plan_fft_forward(SPECTRUM_SAMPLE_COUNT),
            taper,
            workspace: vec![Complex::new(0.0, 0.0); SPECTRUM_SAMPLE_COUNT],
            levels: vec![0.0; SPECTRUM_OUTPUT_COUNT],
        }
    }

    fn frame(&mut self, samples: Option<&[f32]>) -> Vec<u8> {
        match samples {
            Some(samples) => {
                for sample_index in 0..samples.len() {
                    self.workspace[sample_index] =
                        Complex::new(samples[sample_index] * self.taper[sample_index], 0.0);
                }
                self.transform.process(&mut self.workspace);
                for bin_index in 0..self.levels.len() {
                    let amplitude = self.workspace[bin_index].norm() / SPECTRUM_SAMPLE_COUNT as f32;
                    let decibels = 20.0 * amplitude.max(1e-10).log10();
                    let scaled = ((decibels - SPECTRUM_FLOOR_DB)
                        / (SPECTRUM_CEILING_DB - SPECTRUM_FLOOR_DB))
                        .clamp(0.0, 1.0);
                    self.levels[bin_index] =
                        SPECTRUM_MEMORY * self.levels[bin_index] + (1.0 - SPECTRUM_MEMORY) * scaled;
                }
            }
            None => self
                .levels
                .iter_mut()
                .for_each(|level| *level *= SPECTRUM_MEMORY),
        }

        self.levels
            .iter()
            .map(|level| (level * 255.0).round().clamp(0.0, 255.0) as u8)
            .collect()
    }
}

struct AudioSpectrumEmitter {
    stop: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl AudioSpectrumEmitter {
    fn start(app: AppHandle<AppRuntime>, recorder: Arc<RecorderManager>) -> Self {
        let cancellation = Arc::new(AtomicBool::new(false));
        let worker_cancellation = Arc::clone(&cancellation);
        let worker = std::thread::spawn(move || {
            let mut analyzer = SpectrumAnalyzer::new();
            while !worker_cancellation.load(Ordering::Relaxed) {
                let samples = recorder.spectrum_snapshot();
                let payload = AudioSpectrumPayload {
                    bins: analyzer.frame(samples.as_deref()),
                };
                emit_event(&app, EVENT_AUDIO_SPECTRUM, payload);
                std::thread::sleep(Duration::from_millis(40));
            }
        });
        Self {
            stop: cancellation,
            handle: Some(worker),
        }
    }

    fn stop(mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            std::thread::spawn(move || {
                let _ = handle.join();
            });
        }
    }
}

#[derive(Serialize, Clone)]
pub struct PillHoverPayload {
    pub hovering: bool,
}

struct PillHoverEmitter;

impl PillHoverEmitter {
    fn start(app: AppHandle<AppRuntime>) -> Self {
        std::thread::spawn(move || {
            let interval = Duration::from_millis(50);
            let started = Instant::now();
            let mut intent = HoverIntent::default();
            let mut last: Option<HoverDecision> = None;
            loop {
                // A drag owns the pill until the pointer is released. Polling
                // through it would collapse the pill mid-drag and, worse, hand
                // the panel back to click-through while the user still holds it.
                if app.state::<AppState>().pill().is_dragging() {
                    intent.forget_travel();
                    std::thread::sleep(interval);
                    continue;
                }
                let now_ms = started.elapsed().as_millis() as u64;
                // Mouse-query failures must fail closed. Keeping the previous
                // interactive state can leave an invisible NSPanel consuming
                // clicks after the pointer has moved away from the pill.
                let decision = match cursor_over_pill_window(&app) {
                    Some((inside, cursor)) => intent.observe(inside, cursor, now_ms),
                    None => intent.abandon(),
                };
                let previous = last.replace(decision);

                // The window takes the pointer the moment it arrives, while
                // expanding waits for the pointer to settle. Coupling them
                // would either lose a fast click or expand at every crossing.
                if previous.map(|last| last.interactive) != Some(decision.interactive) {
                    set_overlay_interactive(&app, decision.interactive);
                }
                if previous.map(|last| last.hovering) != Some(decision.hovering) {
                    let hovering = decision.hovering;
                    tracing::debug!(hovering, "Capture pill hover changed");
                    app.state::<AppState>().pill().set_hovering(hovering);
                    emit_event(&app, EVENT_PILL_HOVER, PillHoverPayload { hovering });
                }
                std::thread::sleep(interval);
            }
        });
        Self
    }
}

/// A point in logical screen coordinates.
type Point = (f64, f64);

/// The pointer, and the pill's origin and size - all in logical points.
struct OverlayGeometry {
    cursor: Point,
    origin: Point,
    size: Point,
}

/// The pointer and the pill's frame, both in logical points.
fn overlay_geometry_in_points(window: &WebviewWindow<AppRuntime>) -> Option<OverlayGeometry> {
    let cursor = window.cursor_position().ok()?;
    let origin = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let (cursor, origin, size) = capture_pill::to_shared_points(
        (cursor.x, cursor.y),
        primary_scale_factor(window),
        (f64::from(origin.x), f64::from(origin.y)),
        (f64::from(size.width), f64::from(size.height)),
        window.scale_factor().ok()?,
    );
    Some(OverlayGeometry {
        cursor,
        origin,
        size,
    })
}

/// The factor the toolkit used to report the cursor position.
fn primary_scale_factor(window: &WebviewWindow<AppRuntime>) -> f64 {
    window
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| monitor.scale_factor())
        .unwrap_or(1.0)
}

/// Reports whether the cursor is on the pill, and where it is. The position
/// travels with the answer because hover intent is judged from how fast the
/// pointer is moving, not only from where it ended up.
fn cursor_over_pill_window(app: &AppHandle<AppRuntime>) -> Option<(bool, (f64, f64))> {
    let window = app.get_webview_window(MAIN_WINDOW_LABEL)?;
    // Everything below is in logical points. See `to_shared_points`: the
    // toolkit scales the cursor and the window frame differently once two
    // screens have different densities, and points are where they agree.
    let OverlayGeometry {
        cursor,
        origin: pos,
        size,
    } = overlay_geometry_in_points(&window)?;
    let scale = 1.0;

    let state = app.state::<AppState>();
    let meeting_overlay_active = state.meeting_capture().is_active();
    if meeting_overlay_active {
        return Some((cursor_over_meeting_overlay_bounds(
            cursor,
            pos,
            size,
            scale,
            state.pill().meeting_overlay_presentation(),
        ), cursor));
    }

    if state.pill().status() == PillStatus::Preflight {
        return Some((
            point_in_rect(
                cursor,
                pos,
                size,
            ),
            cursor,
        ));
    }

    if state.pill().status() == PillStatus::Idle {
        let settings = state.current_settings_unmasked();
        if *state.pill().preflight_language_menu_open.lock() {
            return Some((
                point_in_rect(
                    cursor,
                    pos,
                    size,
                ),
                cursor,
            ));
        }
        return Some((
            capture_pill::hit_test(
            (cursor.0 - pos.0, cursor.1 - pos.1),
            size,
            scale,
                settings.capture_pill_presentation,
                settings.capture_pill_dock_position,
                state.pill().is_hovering(),
            ),
            cursor,
        ));
    }

    Some((
        cursor_over_pill_bounds(
            cursor,
            pos,
            size,
            scale,
            state.pill().is_expanded(),
        ),
        cursor,
    ))
}

fn cursor_over_meeting_overlay_bounds(
    cursor: (f64, f64),
    window_origin: (f64, f64),
    window_size: (f64, f64),
    scale: f64,
    presentation: MeetingOverlayPresentation,
) -> bool {
    let pill_width = if presentation.compact {
        MEETING_COMPACT_PILL_SIZE * scale
    } else {
        MEETING_PILL_SLOT_WIDTH * scale
    };
    let pill_height = MEETING_PILL_HEIGHT * scale;
    let left = match (presentation.transcript_visible, presentation.placement) {
        (true, MeetingTranscriptPlacement::Left) => {
            window_origin.0
                + (MEETING_PILL_GUTTER + MEETING_TRANSCRIPT_WIDTH + MEETING_OVERLAY_GAP) * scale
        }
        _ => window_origin.0 + MEETING_PILL_GUTTER * scale,
    };
    let top = if presentation.transcript_visible
        && presentation.placement != MeetingTranscriptPlacement::Above
        && presentation.side_alignment == MeetingTranscriptSideAlignment::Top
    {
        window_origin.1 + MEETING_PILL_GUTTER * scale
    } else {
        window_origin.1 + window_size.1 - (MEETING_PILL_GUTTER * scale) - pill_height
    };

    let cursor_over_pill = point_in_rect(cursor, (left, top), (pill_width, pill_height));
    if cursor_over_pill || !presentation.transcript_visible || !presentation.transcript_pinned {
        return cursor_over_pill;
    }

    let transcript_width = MEETING_TRANSCRIPT_WIDTH * scale;
    let transcript_height = 300.0 * scale;
    let transcript_left = match presentation.placement {
        MeetingTranscriptPlacement::Above => {
            window_origin.0 + (window_size.0 - transcript_width) / 2.0
        }
        MeetingTranscriptPlacement::Left => window_origin.0 + MEETING_PILL_GUTTER * scale,
        MeetingTranscriptPlacement::Right => {
            window_origin.0
                + (MEETING_PILL_GUTTER + MEETING_PILL_SLOT_WIDTH + MEETING_OVERLAY_GAP) * scale
        }
    };
    let transcript_top = window_origin.1 + MEETING_PILL_GUTTER * scale;

    point_in_rect(
        cursor,
        (transcript_left, transcript_top),
        (transcript_width, transcript_height),
    )
}

fn point_in_rect(point: (f64, f64), origin: (f64, f64), size: (f64, f64)) -> bool {
    point.0 >= origin.0
        && point.0 < origin.0 + size.0
        && point.1 >= origin.1
        && point.1 < origin.1 + size.1
}

fn cursor_over_pill_bounds(
    cursor: (f64, f64),
    window_origin: (f64, f64),
    window_size: (f64, f64),
    scale: f64,
    expanded: bool,
) -> bool {
    let hit_width = 260.0 * scale;
    let hit_height = if expanded {
        220.0 * scale
    } else {
        42.0 * scale
    };
    let bottom_inset = 8.0 * scale;
    let left = window_origin.0 + (window_size.0 - hit_width) / 2.0;
    let right = left + hit_width;
    let bottom = window_origin.1 + window_size.1 - bottom_inset;
    let top = bottom - hit_height;

    cursor.0 >= left && cursor.0 < right && cursor.1 >= top && cursor.1 < bottom
}

fn set_overlay_interactive(app: &AppHandle<AppRuntime>, interactive: bool) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    platform::overlay::set_interactive(app, &window, interactive);
}

pub struct PillController {
    status: Mutex<PillStatus>,
    recording_mode: Mutex<Option<RecordingMode>>,
    shortcut_origin: Mutex<Option<hotkeys::ShortcutAction>>,
    recording_options: Mutex<hotkeys::ShortcutOptions>,
    recording_settings: Mutex<Option<UserSettings>>,
    recording_personality: Mutex<Option<Personality>>,
    smart_press_time: Mutex<Option<DateTime<Local>>>,
    hold_key_down: Mutex<bool>,
    paused_media_session: Mutex<Option<music::MediaSession>>,
    recorder: Arc<RecorderManager>,
    audio_spectrum_emitter: Mutex<Option<AudioSpectrumEmitter>>,
    hover_emitter: Mutex<Option<PillHoverEmitter>>,
    hovering: AtomicBool,
    drag_started_at: Mutex<Option<Instant>>,
    recording_generation: AtomicU64,
    is_expanded: Mutex<bool>,
    mode_state: Mutex<PillModeState>,
    overlay_position: Mutex<Option<(i32, i32)>>,
    meeting_overlay_presentation: Mutex<MeetingOverlayPresentation>,
    preflight_tray_anchor: Mutex<Option<PreflightTrayAnchor>>,
    preflight_language_menu_open: Mutex<bool>,
}

impl PillController {
    fn start_streaming_session_if_supported(
        &self,
        app: &AppHandle<AppRuntime>,
        settings: &UserSettings,
    ) {
        let state = app.state::<AppState>();
        if settings.transcription_mode == TranscriptionMode::Cloud {
            state.start_cloud_streaming_session(app, settings.language.clone());
            return;
        }

        let selected_model = crate::speech::selected_model(settings);
        if crate::remote_speech::is_remote_model(&selected_model)
            || !model_manager::is_streaming_model(&selected_model)
        {
            return;
        }

        if let Ok(ready) = model_manager::ensure_model_ready(app, &selected_model) {
            state.start_streaming_session(app, &ready);
        }
    }

    /// Muestra el dock de captura junto al icono de la bandeja. Su posición
    /// nunca se persiste: pertenece a la bandeja, no a la píldora movible.
    pub fn open_preflight(&self, app: &AppHandle<AppRuntime>, rect: Rect) {
        if self.status() != PillStatus::Idle
            || app.state::<AppState>().meeting_capture().is_active()
        {
            return;
        }

        let position = rect.position.to_physical::<i32>(1.0);
        let size = rect.size.to_physical::<u32>(1.0);
        *self.preflight_tray_anchor.lock() = Some(PreflightTrayAnchor {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        });
        *self.preflight_language_menu_open.lock() = false;
        self.transition_to(app, PillStatus::Preflight);
    }

    /// Da al cursor un instante para pasar del icono al dock. Si no llega,
    /// cerramos sin dejar una ventana transparente sobre el escritorio.
    pub fn close_preflight_after_pointer_leaves(&self, app: &AppHandle<AppRuntime>) {
        if self.status() != PillStatus::Preflight {
            return;
        }

        let app_handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(PREFLIGHT_HIDE_AFTER_LEAVE_MS));
            let state = app_handle.state::<AppState>();
            let pill = state.pill();
            if pill.status() == PillStatus::Preflight
                && !cursor_over_pill_window(&app_handle).is_some_and(|(inside, _)| inside)
            {
                pill.transition_to(&app_handle, PillStatus::Idle);
            }
        });
    }

    pub fn set_preflight_language_menu_open(
        &self,
        app: &AppHandle<AppRuntime>,
        open: bool,
    ) -> Result<(), String> {
        let status = self.status();
        if !matches!(status, PillStatus::Idle | PillStatus::Preflight) {
            return Ok(());
        }
        *self.preflight_language_menu_open.lock() = open;
        if status == PillStatus::Preflight {
            show_preflight_overlay(app)
        } else {
            show_idle_sticky(app)
        }
    }

    pub fn transition_to_error(&self, app: &AppHandle<AppRuntime>, message: &str) {
        let status = self.status();
        if matches!(status, PillStatus::Listening | PillStatus::Processing) {
            tracing::error!(
                "[Pill] Suppressing error during active recording ({status}): {message}"
            );
            return;
        }
        tracing::error!("[Pill] {message}");
        if let Err(err) = self.recorder.stop() {
            tracing::error!("[Pill] Failed to stop recorder during error transition: {err}");
        }
        self.resume_paused_media();
        self.reset_recording_state();
        self.set_hold_key_down(false);
        self.transition_to(app, PillStatus::Error);
        let simple_msg = simplify_recording_error(message);
        toast::show(app, "error", None, &simple_msg);
    }

    fn fail_recording_stop(&self, app: &AppHandle<AppRuntime>, message: &str) {
        tracing::error!("[Pill] {message}");
        let settings = app.state::<AppState>().current_settings();
        crate::analytics::track_recording_failed(
            app,
            "stop",
            crate::analytics::classify_failure_reason(message),
            microphone_input_kind(&settings),
        );
        self.resume_paused_media();
        self.reset_recording_state();
        self.set_hold_key_down(false);
        self.transition_to(app, PillStatus::Error);
        let simple_msg = simplify_recording_error(message);
        toast::show(app, "error", None, &simple_msg);
    }

    fn update_overlay_visibility(
        &self,
        app: &AppHandle<AppRuntime>,
        previous: PillStatus,
        next: PillStatus,
    ) {
        if next == PillStatus::Idle {
            *self.preflight_tray_anchor.lock() = None;
            *self.preflight_language_menu_open.lock() = false;
            let app_handle = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(OVERLAY_HIDE_AFTER_IDLE_MS));
                if app_handle.state::<AppState>().pill().status() == PillStatus::Idle {
                    if let Err(error) = show_idle_sticky(&app_handle) {
                        tracing::error!("Failed to restore the Dictation sticky: {error}");
                    }
                }
            });
            return;
        }

        if previous == PillStatus::Preflight {
            *self.preflight_tray_anchor.lock() = None;
            *self.preflight_language_menu_open.lock() = false;
            show_overlay(app);
            self.start_hover_emitter(app);
            return;
        }

        if previous == PillStatus::Idle {
            *self.preflight_language_menu_open.lock() = false;
            if next == PillStatus::Preflight {
                if let Err(err) = show_preflight_overlay(app) {
                    tracing::error!("Failed to show capture dock: {err}");
                    self.transition_to(app, PillStatus::Idle);
                    return;
                }
            } else {
                show_overlay(app);
            }
            self.start_hover_emitter(app);
        }
    }

    pub fn reset(&self, app: &AppHandle<AppRuntime>) {
        self.reset_recording_state();
        self.set_hold_key_down(false);
        self.transition_to(app, PillStatus::Idle);
    }

    fn show_cancelled(&self, app: &AppHandle<AppRuntime>) {
        collapse_expanded_pill(app);
        self.transition_to(app, PillStatus::Cancelled);
        let app_handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(CANCELLED_FEEDBACK_MS));
            let state = app_handle.state::<AppState>();
            let pill = state.pill();
            if pill.status() == PillStatus::Cancelled {
                pill.reset(&app_handle);
                let settings = state.current_settings_unmasked();
                crate::refresh_native_menus(&app_handle, &settings);
            }
        });
    }

    // Stop-processing cleanup should not invent a release event.
    // Reset/error paths clear this when the whole pill state is discarded.
    pub fn finish_processing(&self, app: &AppHandle<AppRuntime>) {
        let status = self.status();
        let recording = self.is_recording();
        let should_reset = match status {
            PillStatus::Processing => true,
            PillStatus::Listening => !recording,
            _ => false,
        };
        if should_reset {
            self.reset(app);
        }
    }

    fn pause_media_if_playing(&self, app: &AppHandle<AppRuntime>) {
        let settings = app.state::<AppState>().current_settings();
        let mode = match settings.media_action {
            MediaAction::Off => return,
            MediaAction::Pause => music::MediaMode::Pause,
            MediaAction::Duck10 => music::MediaMode::Duck(10),
            MediaAction::Duck25 => music::MediaMode::Duck(25),
            MediaAction::Duck50 => music::MediaMode::Duck(50),
            MediaAction::Duck75 => music::MediaMode::Duck(75),
        };
        let session = Some(music::engage(mode));
        *self.paused_media_session.lock() = session;
    }

    fn resume_paused_media(&self) {
        let session = self.paused_media_session.lock().take();
        music::disengage(session);
    }

    fn reset_recording_state(&self) {
        self.stop_audio_spectrum_emitter();
        *self.recording_mode.lock() = None;
        *self.shortcut_origin.lock() = None;
        *self.recording_options.lock() = hotkeys::ShortcutOptions::default();
        *self.recording_settings.lock() = None;
        *self.recording_personality.lock() = None;
        *self.smart_press_time.lock() = None;
    }

    fn capture_selected_text_if_enabled(
        &self,
        app: &AppHandle<AppRuntime>,
        settings: &UserSettings,
    ) {
        let state = app.state::<AppState>();

        if !settings.edit_mode_enabled {
            state.set_pending_selected_text(None);
            return;
        }

        let selected_text = match assistive::get_selected_text_ax() {
            Some(text) if text.len() <= 10_000 => Some(text),
            _ => None,
        };
        state.set_pending_selected_text(selected_text);
    }

    pub(crate) fn is_recording(&self) -> bool {
        self.recording_mode.lock().is_some()
    }

    fn active_mode(&self) -> Option<RecordingMode> {
        *self.recording_mode.lock()
    }

    fn try_start_recording(
        &self,
        mode: RecordingMode,
        origin: hotkeys::ShortcutAction,
        options: hotkeys::ShortcutOptions,
    ) -> bool {
        let mut current_mode = self.recording_mode.lock();
        if current_mode.is_some() {
            return false;
        }
        *current_mode = Some(mode);
        *self.shortcut_origin.lock() = Some(origin);
        *self.recording_options.lock() = options;
        if mode == RecordingMode::Hold {
            self.set_hold_key_down(true);
        }
        true
    }

    fn set_hold_key_down(&self, is_down: bool) {
        *self.hold_key_down.lock() = is_down;
    }

    fn clear_hold_state(&self) -> bool {
        let mut hold_down = self.hold_key_down.lock();
        if *hold_down {
            *hold_down = false;
            true
        } else {
            false
        }
    }

    fn prepare_shortcut_press(
        &self,
        app: &AppHandle<AppRuntime>,
        action: hotkeys::ShortcutAction,
    ) -> bool {
        // Fn no debe requerir cerrar el dock: el mismo gesto lo reemplaza por
        // Listening antes de abrir el micrófono.
        if self.status() == PillStatus::Preflight {
            self.transition_to(app, PillStatus::Idle);
        }

        if self.status() == PillStatus::Idle {
            let _ = self.recording_mode.lock().take();
            let _ = self.shortcut_origin.lock().take();
            *self.recording_options.lock() = hotkeys::ShortcutOptions::default();
            self.set_hold_key_down(false);
            let _ = self.smart_press_time.lock().take();
        }

        if self.status() == PillStatus::Processing {
            if *self.shortcut_origin.lock() == Some(action) {
                self.cancel_processing(app);
            }
            return false;
        }

        self.reset_stale_listening_state(app);

        if self.status() == PillStatus::Error {
            toast::hide(app);
            self.reset(app);
        }

        true
    }

    fn start_recording(
        &self,
        app: &AppHandle<AppRuntime>,
        mode: RecordingMode,
        origin: hotkeys::ShortcutAction,
        options: hotkeys::ShortcutOptions,
    ) -> bool {
        let state = app.state::<AppState>();
        if state.meeting_capture().is_active() {
            toast::show(
                app,
                "error",
                Some("Meeting recording active"),
                "Stop the meeting recording before starting dictation.",
            );
            return false;
        }
        if !check_mic_permission(app) {
            return false;
        }

        if !self.try_start_recording(mode, origin, options) {
            return false;
        }

        state.clear_cancellation();
        let mut settings = state.current_settings();
        settings.cleanup_enabled = options.cleanup_enabled;
        let workflow = options
            .workflow_rule_index
            .and_then(|index| settings.mode_rules.get(index).cloned())
            .or_else(|| crate::mode_context::resolve_active_mode_rule(&settings));
        if let Some(workflow) = workflow.as_ref() {
            crate::mode_rules::apply_workflow_runtime_settings(&mut settings, workflow);
        }
        *self.recording_settings.lock() = Some(settings.clone());

        let generation = self.recording_generation.fetch_add(1, Ordering::SeqCst) + 1;
        // Enter Listening before the device opens for fast visual feedback.
        self.transition_to(app, PillStatus::Listening);
        // Model warming remains asynchronous, but it must not get in front of
        // the state event that makes the pill visible after the shortcut.
        crate::speech::warm(app, &settings);

        let pending_dir = crate::recordings_root(app)
            .ok()
            .map(|root| root.join(crate::recorder::PENDING_DIR_NAME));
        match self
            .recorder
            .start(settings.microphone_device.clone(), pending_dir)
        {
            Ok(started) => {
                self.freeze_recording_personality(crate::mode_context::resolve_active_personality(
                    &settings,
                ));
                self.arm_capture_after_settle(app, generation);
                self.start_audio_spectrum_emitter(app);
                self.pause_media_if_playing(app);
                self.start_streaming_session_if_supported(app, &settings);
                self.spawn_screen_vocabulary_capture(app, &settings);
                self.spawn_recording_cap(app, generation);

                emit_event(
                    app,
                    crate::EVENT_RECORDING_START,
                    crate::RecordingStartPayload {
                        started_at: started.to_rfc3339(),
                    },
                );
                check_accessibility_warning(app);
                true
            }
            Err(err) => {
                crate::analytics::track_recording_failed(
                    app,
                    "start",
                    crate::analytics::classify_failure_reason(&err.to_string()),
                    microphone_input_kind(&settings),
                );
                self.reset_recording_state();
                self.set_hold_key_down(false);
                // Drop out of Listening so transition_to_error isn't suppressed.
                self.transition_to(app, PillStatus::Idle);
                self.transition_to_error(app, &format!("Unable to start recording: {err}"));
                false
            }
        }
    }

    fn after_delay_if_recording(
        app: &AppHandle<AppRuntime>,
        generation: u64,
        delay: Duration,
        action: impl FnOnce(&Self, &AppHandle<AppRuntime>) + Send + 'static,
    ) {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(delay);
            let state = app.state::<AppState>();
            let pill = state.pill();
            if pill.recording_generation.load(Ordering::SeqCst) == generation && pill.is_recording()
            {
                action(pill, &app);
            }
        });
    }

    /// Screen-as-dictionary (gated by the same `use_screen_context` setting
    /// as F5.3, default OFF): kicks off the AX capture only after the
    /// recorder has started, so the walk runs in parallel with the recording
    /// and can never delay the mic. `queue_transcription` consumes the
    /// resulting terms for this dictation only; a failed capture degrades to
    /// the plain user dictionary. The task slot is cleared even when the
    /// setting is off so a stale capture from a cancelled dictation can't
    /// leak into this one.
    fn spawn_screen_vocabulary_capture(
        &self,
        app: &AppHandle<AppRuntime>,
        settings: &UserSettings,
    ) {
        let state = app.state::<AppState>();
        if !settings.use_screen_context {
            state.set_pending_screen_terms_task(None);
            return;
        }
        let task = tauri::async_runtime::spawn(async {
            tauri::async_runtime::spawn_blocking(accessibility_context::capture_screen_context)
                .await
                .ok()
                .flatten()
                .map(|text| screen_vocabulary::extract_salient_terms(&text))
                .unwrap_or_default()
        });
        state.set_pending_screen_terms_task(Some(task));
    }

    fn spawn_recording_cap(&self, app: &AppHandle<AppRuntime>, generation: u64) {
        Self::after_delay_if_recording(app, generation, MAX_RECORDING_DURATION, |pill, app| {
            if pill.status() == PillStatus::Listening {
                pill.stop_and_process(app);
            }
        });
    }

    fn arm_capture_after_settle(&self, app: &AppHandle<AppRuntime>, generation: u64) {
        Self::after_delay_if_recording(app, generation, CAPTURE_ARM_DELAY, |pill, _| {
            pill.recorder().arm();
        });
    }

    fn reset_stale_listening_state(&self, app: &AppHandle<AppRuntime>) {
        if self.status() == PillStatus::Listening && !self.is_recording() {
            self.reset(app);
        }
    }

    fn handle_hold_press(
        &self,
        app: &AppHandle<AppRuntime>,
        origin: hotkeys::ShortcutAction,
        options: hotkeys::ShortcutOptions,
    ) -> bool {
        if !self.prepare_shortcut_press(app, origin) {
            return false;
        }

        self.start_recording(app, RecordingMode::Hold, origin, options)
    }

    fn handle_hold_release(&self, app: &AppHandle<AppRuntime>) {
        if !self.clear_hold_state() {
            return;
        }

        if self.active_mode() != Some(RecordingMode::Hold) {
            return;
        }

        self.stop_and_process(app);
    }

    fn handle_toggle_press(&self, app: &AppHandle<AppRuntime>, options: hotkeys::ShortcutOptions) {
        let origin = hotkeys::ShortcutAction::Toggle;
        if !self.prepare_shortcut_press(app, origin) {
            return;
        }

        if self.active_mode() == Some(RecordingMode::Hold) {
            return;
        }

        if self.is_recording() {
            self.stop_and_process(app);
        } else {
            self.start_recording(app, RecordingMode::Toggle, origin, options);
        }
    }

    fn handle_smart_press(&self, app: &AppHandle<AppRuntime>, options: hotkeys::ShortcutOptions) {
        let press_time = Local::now();

        let origin = hotkeys::ShortcutAction::Smart;
        if !self.prepare_shortcut_press(app, origin) {
            return;
        }

        if self.is_recording() && self.active_mode() == Some(RecordingMode::Toggle) {
            self.handle_toggle_press(app, options);
            return;
        }

        if self.active_mode() == Some(RecordingMode::Hold) {
            return;
        }

        if self.handle_hold_press(app, origin, options) {
            *self.smart_press_time.lock() = Some(press_time);
        }
    }

    fn handle_smart_release(&self, app: &AppHandle<AppRuntime>) {
        if self.smart_press_time.lock().take().is_some() {
            self.handle_hold_release(app);
        }
    }

    fn stop_and_process(&self, app: &AppHandle<AppRuntime>) {
        self.stop_audio_spectrum_emitter();
        *self.recording_mode.lock() = None;
        let settings = self
            .recording_settings
            .lock()
            .take()
            .unwrap_or_else(|| app.state::<AppState>().current_settings());
        let active_mode = self.processing_personality();
        let recording_options = *self.recording_options.lock();
        self.capture_selected_text_if_enabled(app, &settings);

        let state = app.state::<AppState>();
        let has_streaming = state.has_streaming_session();
        // Create the cancellation token up front, before the worker spawns, so a
        // rapid cancel can't slip in before the token exists and leak a paste.
        let cancel_token = state.create_transcription_token();

        if has_streaming {
            self.transition_to(app, PillStatus::Processing);
            let recorder = Arc::clone(&self.recorder);
            let app_handle = app.clone();
            let resume_app = app_handle.clone();
            let settings_for_transcription = settings.clone();
            std::thread::spawn(move || {
                let streaming_outcome = app_handle
                    .state::<AppState>()
                    .stop_streaming_session(&app_handle)
                    .unwrap_or_else(|| {
                        crate::streaming_transcription::StreamingOutcome::Fallback(
                            "Streaming session ended before finalization".into(),
                        )
                    });
                match recorder.stop_after_capture(move || {
                    resume_app.state::<AppState>().pill().resume_paused_media();
                }) {
                    Ok(Some(recording)) => {
                        let duration_ms =
                            (recording.ended_at - recording.started_at).num_milliseconds();

                        if duration_ms < MIN_RECORDING_DURATION_MS {
                            discard_pending_recording(&recording);
                            collapse_expanded_pill(&app_handle);
                            app_handle
                                .state::<AppState>()
                                .pill()
                                .finish_processing(&app_handle);
                            return;
                        }

                        let streaming_transcript = match streaming_outcome {
                            crate::streaming_transcription::StreamingOutcome::Transcript(text)
                                if !text.trim().is_empty() =>
                            {
                                text
                            }
                            crate::streaming_transcription::StreamingOutcome::Transcript(_) => {
                                tracing::warn!(
                                    "[streaming] Empty transcript; using captured audio"
                                );
                                collapse_expanded_pill(&app_handle);
                                crate::persist_recording_async(
                                    app_handle,
                                    recording,
                                    settings_for_transcription,
                                    active_mode.clone(),
                                    recording_options.temporary,
                                    cancel_token,
                                );
                                return;
                            }
                            crate::streaming_transcription::StreamingOutcome::Fallback(reason) => {
                                tracing::warn!("[streaming] {reason}; using captured audio");
                                toast::show(
                                    &app_handle,
                                    "info",
                                    Some("Cloud streaming unavailable"),
                                    "Finishing with the recorded audio instead.",
                                );
                                collapse_expanded_pill(&app_handle);
                                crate::persist_recording_async(
                                    app_handle,
                                    recording,
                                    settings_for_transcription,
                                    active_mode.clone(),
                                    recording_options.temporary,
                                    cancel_token,
                                );
                                return;
                            }
                        };

                        let saved = match crate::recordings_root(&app_handle).and_then(|base_dir| {
                            crate::recorder::persist_recording(base_dir, &recording)
                        }) {
                            Ok(saved) => saved,
                            Err(err) => {
                                collapse_expanded_pill(&app_handle);
                                app_handle.state::<AppState>().pill().fail_recording_stop(
                                    &app_handle,
                                    &format!("Unable to save recording: {err}"),
                                );
                                return;
                            }
                        };
                        app_handle
                            .state::<AppState>()
                            .set_pending_path(Some(saved.path.clone()));

                        crate::transcribe::finalize_streaming_transcription(
                            &app_handle,
                            crate::transcribe::StreamingTranscriptionInput {
                                raw_transcript: streaming_transcript,
                                duration_seconds: (duration_ms.max(0) as f32) / 1000.0,
                                audio_path: saved.path,
                                pending_path: saved.pending_path,
                                settings: settings_for_transcription,
                                active_mode,
                                temporary: recording_options.temporary,
                                cancel_token,
                            },
                        );
                    }
                    Ok(None) => {
                        collapse_expanded_pill(&app_handle);
                        app_handle
                            .state::<AppState>()
                            .pill()
                            .finish_processing(&app_handle);
                    }
                    Err(err) => {
                        collapse_expanded_pill(&app_handle);
                        app_handle.state::<AppState>().pill().fail_recording_stop(
                            &app_handle,
                            &format!("Unable to stop recording: {err}"),
                        );
                    }
                }
            });
        } else {
            self.transition_to(app, PillStatus::Processing);
            let recorder = Arc::clone(&self.recorder);
            let app_handle = app.clone();
            let resume_app = app_handle.clone();
            let settings_for_transcription = settings.clone();
            std::thread::spawn(move || {
                match recorder.stop_after_capture(move || {
                    resume_app.state::<AppState>().pill().resume_paused_media();
                }) {
                    Ok(Some(recording)) => {
                        let duration_ms =
                            (recording.ended_at - recording.started_at).num_milliseconds();
                        if duration_ms < MIN_RECORDING_DURATION_MS {
                            discard_pending_recording(&recording);
                            app_handle
                                .state::<AppState>()
                                .pill()
                                .finish_processing(&app_handle);
                            return;
                        }

                        crate::persist_recording_async(
                            app_handle,
                            recording,
                            settings_for_transcription,
                            active_mode,
                            recording_options.temporary,
                            cancel_token,
                        );
                    }
                    Ok(None) => {
                        app_handle
                            .state::<AppState>()
                            .pill()
                            .finish_processing(&app_handle);
                    }
                    Err(err) => {
                        app_handle.state::<AppState>().pill().fail_recording_stop(
                            &app_handle,
                            &format!("Unable to stop recording: {err}"),
                        );
                    }
                }
            });
        }
    }

    pub fn cancel(&self, app: &AppHandle<AppRuntime>) {
        self.stop_audio_spectrum_emitter();
        app.state::<AppState>().cancel_streaming_session();
        let app_handle = app.clone();
        if let Err(err) = self
            .recorder
            .stop_after_capture_and_discard_pending(move || {
                app_handle.state::<AppState>().pill().resume_paused_media();
            })
        {
            self.resume_paused_media();
            tracing::error!("Failed to stop recorder: {err}");
        }
        self.show_cancelled(app);
    }

    pub fn cancel_processing(&self, app: &AppHandle<AppRuntime>) {
        if self.status() != PillStatus::Processing {
            return;
        }

        self.stop_audio_spectrum_emitter();
        let state = app.state::<AppState>();
        state.cancel_streaming_session();
        state.request_cancellation();
        let app_handle = app.clone();
        if let Err(err) = self
            .recorder
            .stop_after_capture_and_discard_pending(move || {
                app_handle.state::<AppState>().pill().resume_paused_media();
            })
        {
            self.resume_paused_media();
            tracing::error!("Failed to stop recorder: {err}");
        }

        if let Some(path) = state.take_pending_path() {
            let _ = std::fs::remove_file(&path);
        }

        self.show_cancelled(app);
    }
}

pub(crate) fn emit_pill_mode(app: &AppHandle<AppRuntime>, expanded: bool, text: &str) {
    emit_pill_mode_with_tone(app, expanded, text, PILL_TONE_DEFAULT);
}

pub(crate) fn emit_pill_mode_with_tone(
    app: &AppHandle<AppRuntime>,
    expanded: bool,
    text: &str,
    tone: &str,
) {
    emit_pill_mode_full(app, expanded, text, tone, false);
}

/// Full pill-mode payload: `used_screen_context` (F5.3) tells the pill the
/// shown text came from a transform that read the active window's visible
/// text, so it can render the "Screen context" indicator.
pub(crate) fn emit_pill_mode_full(
    app: &AppHandle<AppRuntime>,
    expanded: bool,
    text: &str,
    tone: &str,
    used_screen_context: bool,
) {
    app.state::<AppState>()
        .pill()
        .set_mode_state(expanded, text, tone, used_screen_context);

    if let Err(err) = app.emit(
        EVENT_PILL_MODE,
        serde_json::json!({
            "expanded": expanded,
            "text": text,
            "tone": tone,
            "usedScreenContext": used_screen_context,
        }),
    ) {
        tracing::error!("Failed to emit pill mode: {err}");
    }
}

#[tauri::command]
pub fn sync_pill_renderer_state(app: AppHandle<AppRuntime>) {
    let state = app.state::<AppState>();
    let pill = state.pill();
    pill.emit_state(&app);
    pill.emit_mode_state(&app);
    emit_event(
        &app,
        EVENT_PILL_HOVER,
        PillHoverPayload {
            hovering: pill.hovering.load(Ordering::Relaxed),
        },
    );
}

pub(crate) fn collapse_expanded_pill(app: &AppHandle<AppRuntime>) {
    emit_pill_mode(app, false, "");
}

/// Streaming preview of a Selection Mode transform: `text` is the transform
/// output accumulated so far. Display-only - the pill shows it while the LLM
/// generates, but it is never insertable; accept/cancel only ever operate on
/// the final, safety-checked text that the preview gate later emits via
/// `pill:mode` (tone "preview"). Deliberately does NOT touch the AppState
/// expanded flag: the frontend expansion is presentation-only and the next
/// `pill:mode` emission remains the source of truth.
pub(crate) fn emit_pill_transform_stream(app: &AppHandle<AppRuntime>, text: &str) {
    if let Err(err) = app.emit(
        EVENT_PILL_TRANSFORM_STREAM,
        serde_json::json!({ "text": text }),
    ) {
        tracing::error!("Failed to emit pill transform stream: {err}");
    }
}

fn discard_pending_recording(recording: &crate::recorder::CompletedRecording) {
    if let Some(path) = recording.pending_path.as_deref() {
        let _ = std::fs::remove_file(path);
    }
}

pub(crate) fn check_mic_permission(app: &AppHandle<AppRuntime>) -> bool {
    #[cfg(target_os = "macos")]
    {
        if permissions::check_microphone_permission() {
            return true;
        }

        if let Err(err) = permissions::request_microphone_permission() {
            tracing::error!("Failed to request microphone permission: {err}");
        }

        if !permissions::check_microphone_permission() {
            toast::show_with_action(
                app,
                "error",
                Some("Microphone"),
                "Microphone access required to record. Allow it, then try again.",
                "open_microphone_settings",
                "Open Settings",
            );
            return false;
        }
    }

    #[cfg(not(target_os = "macos"))]
    let _ = app;

    true
}

fn check_accessibility_warning(app: &AppHandle<AppRuntime>) {
    #[cfg(target_os = "macos")]
    {
        let is_trusted = permissions::check_accessibility_permission();
        if !is_trusted {
            toast::show_with_action(
                app,
                "warning",
                Some("Accessibility"),
                "Accessibility permissions missing.",
                "open_accessibility_settings",
                "Open Settings",
            );
        }
    }

    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

fn shortcuts_paused(app: &AppHandle<AppRuntime>) -> bool {
    let state = app.state::<AppState>();
    state.is_shortcut_capture_active()
}

pub(crate) fn handle_registered_hotkey_event(
    app: &AppHandle<AppRuntime>,
    action: hotkeys::ShortcutAction,
    state: HotkeyState,
    options: hotkeys::ShortcutOptions,
) {
    if shortcuts_paused(app) {
        return;
    }

    let app_state = app.state::<AppState>();
    let meeting_capture = app_state.meeting_capture();
    let meeting_note_result = match state {
        HotkeyState::Pressed => meeting_capture.handle_note_press(app, &app_state),
        HotkeyState::Released => meeting_capture.handle_note_release(app, &app_state),
    };
    match meeting_note_result {
        Ok(true) => return,
        Err(message) => {
            toast::show(app, "error", Some("Meeting note"), &message);
            return;
        }
        Ok(false) => {}
    }

    if meeting_capture.is_active() {
        return;
    }
    let pill = app_state.pill();

    match action {
        hotkeys::ShortcutAction::Smart => match state {
            HotkeyState::Pressed => pill.handle_smart_press(app, options),
            HotkeyState::Released => pill.handle_smart_release(app),
        },
        hotkeys::ShortcutAction::Hold => match state {
            HotkeyState::Pressed => {
                let _ = pill.handle_hold_press(app, action, options);
            }
            HotkeyState::Released => pill.handle_hold_release(app),
        },
        hotkeys::ShortcutAction::Toggle => {
            if state == HotkeyState::Pressed {
                pill.handle_toggle_press(app, options);
            }
        }
        hotkeys::ShortcutAction::Workflow => match state {
            HotkeyState::Pressed => pill.handle_smart_press(app, options),
            HotkeyState::Released => pill.handle_smart_release(app),
        },
    }
}

pub fn register_shortcuts(app: &AppHandle<AppRuntime>) -> anyhow::Result<()> {
    let state = app.state::<AppState>();
    if state.is_shortcut_capture_active() {
        return Ok(());
    }

    let settings = state.current_settings();
    let candidates = configured_shortcut_candidates(&settings);
    state
        .hotkeys
        .replace_registrations(app, compile_shortcut_candidates(candidates))
}

#[derive(Clone, Copy)]
struct ShortcutCandidate<'a> {
    label: &'static str,
    enabled: bool,
    shortcut: &'a str,
    action: hotkeys::ShortcutAction,
    options: hotkeys::ShortcutOptions,
}

fn configured_shortcut_candidates(settings: &UserSettings) -> Vec<ShortcutCandidate<'_>> {
    let groups = [
        (
            "Smart",
            settings.smart_enabled,
            hotkeys::ShortcutAction::Smart,
            settings.shortcut_bindings.smart.as_slice(),
        ),
        (
            "Hold",
            settings.hold_enabled,
            hotkeys::ShortcutAction::Hold,
            settings.shortcut_bindings.hold.as_slice(),
        ),
        (
            "Toggle",
            settings.toggle_enabled,
            hotkeys::ShortcutAction::Toggle,
            settings.shortcut_bindings.toggle.as_slice(),
        ),
    ];
    let mut candidates = Vec::new();

    for (label, enabled, action, entries) in groups {
        candidates.extend(entries.iter().map(|entry| ShortcutCandidate {
            label,
            enabled,
            shortcut: entry.shortcut.as_str(),
            action,
            options: hotkeys::ShortcutOptions {
                temporary: entry.temporary,
                cleanup_enabled: entry.cleanup_enabled,
                workflow_rule_index: None,
            },
        }));
    }
    candidates.extend(
        settings
            .mode_rules
            .iter()
            .enumerate()
            .filter_map(|(rule_index, rule)| match &rule.trigger {
                crate::settings::ModeRuleTrigger::Hotkey { shortcut } => Some(ShortcutCandidate {
                    label: "Workflow",
                    enabled: rule.enabled,
                    shortcut,
                    action: hotkeys::ShortcutAction::Workflow,
                    options: hotkeys::ShortcutOptions {
                        temporary: false,
                        cleanup_enabled: !rule.deterministic_only,
                        workflow_rule_index: Some(rule_index),
                    },
                }),
                _ => None,
            }),
    );
    candidates
}

fn compile_shortcut_candidates(
    candidates: Vec<ShortcutCandidate<'_>>,
) -> Vec<hotkeys::RegisteredHotkey> {
    let mut accepted = Vec::<(&'static str, hotkeys::Hotkey)>::new();
    let mut registrations = Vec::new();

    for candidate in candidates.into_iter().filter(|candidate| candidate.enabled) {
        let parsed = match hotkeys::parse_shortcut(candidate.shortcut) {
            Ok(shortcut) => shortcut,
            Err(error) => {
                tracing::error!(
                    "Skipping invalid {} shortcut `{}`: {error}",
                    candidate.label,
                    candidate.shortcut
                );
                continue;
            }
        };
        if let Err(error) = hotkeys::validate_recording_shortcut(&parsed) {
            tracing::error!(
                "Skipping unsupported {} shortcut `{}`: {error}",
                candidate.label,
                candidate.shortcut
            );
            continue;
        }
        if let Some((previous_label, previous)) = accepted
            .iter()
            .find(|(_, previous)| hotkeys::shortcuts_conflict(previous, &parsed))
        {
            tracing::error!(
                "Skipping {} shortcut `{}` because it conflicts with {} shortcut `{}`",
                candidate.label,
                candidate.shortcut,
                previous_label,
                previous
            );
            continue;
        }

        accepted.push((candidate.label, parsed));
        registrations.push(hotkeys::RegisteredHotkey {
            hotkey: parsed,
            action: candidate.action,
            options: candidate.options,
        });
    }
    registrations
}

#[derive(Serialize)]
pub struct OverlayPositionPayload {
    pub x: i32,
    pub y: i32,
}

#[tauri::command]
pub fn set_overlay_position(
    x: i32,
    y: i32,
    app: AppHandle<AppRuntime>,
) -> Result<OverlayPositionPayload, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Overlay window not found.".to_string())?;
    let app_state = app.state::<AppState>();
    let meeting_surface = app_state.meeting_capture().is_active();
    let idle_sticky = !meeting_surface && app_state.pill().status() == PillStatus::Idle;
    let scale = window
        .scale_factor()
        .map_err(|err| format!("Failed to read overlay scale: {err}"))?;
    let sticky_menu_open = idle_sticky && *app_state.pill().preflight_language_menu_open.lock();
    let sticky_height = if sticky_menu_open {
        STICKY_LANGUAGE_MENU_HEIGHT
    } else {
        STICKY_OVERLAY_HEIGHT
    };
    let sticky_menu_inset = logical_pixels(sticky_height - STICKY_OVERLAY_HEIGHT, scale);
    // Lo que llega es la posición canónica: es la que este mismo comando
    // devolvió y la que el frontend guardó. Colocarla tal cual como origen de
    // ventana desplazaba la píldora en cada restauración.
    let requested = if meeting_surface {
        (x, y)
    } else if idle_sticky {
        (x, y - sticky_menu_inset)
    } else {
        dictation_origin_from_canonical((x, y), scale)
    };
    let logical_size = if meeting_surface {
        (MEETING_OVERLAY_WIDTH, MEETING_OVERLAY_HEIGHT)
    } else if idle_sticky {
        (STICKY_OVERLAY_WIDTH, sticky_height)
    } else {
        (DICTATION_OVERLAY_WIDTH, DICTATION_OVERLAY_HEIGHT)
    };
    let physical_size = physical_overlay_size(logical_size, scale);
    let restored_on_cursor_screen = window
        .cursor_position()
        .ok()
        .and_then(|cursor| {
            let monitors = window.available_monitors().ok()?;
            let bounds = monitors
                .iter()
                .map(|monitor| {
                    let position = monitor.position();
                    let size = monitor.size();
                    (position.x, position.y, size.width, size.height)
                })
                .collect::<Vec<_>>();
            let requested_center = (
                requested.0 + i32::try_from(physical_size.0 / 2).unwrap_or(i32::MAX),
                requested.1 + i32::try_from(physical_size.1 / 2).unwrap_or(i32::MAX),
            );
            Some(points_share_closest_monitor(
                requested_center,
                (cursor.x.round() as i32, cursor.y.round() as i32),
                &bounds,
            ))
        })
        .unwrap_or(true);
    let position = if idle_sticky && !restored_on_cursor_screen {
        cursor_screen_overlay_position(&window, logical_size)
            .or_else(|| clamp_overlay_position(&window, requested.0, requested.1, physical_size))
    } else {
        clamp_overlay_position(&window, requested.0, requested.1, physical_size)
    }
    .ok_or_else(|| "No display is available for the overlay.".to_string())?;
    if window
        .outer_position()
        .map(|current| (current.x, current.y) != position)
        .unwrap_or(true)
    {
        window
            .set_position(tauri::PhysicalPosition::new(position.0, position.1))
            .map_err(|err| format!("Failed to position the overlay: {err}"))?;
    }
    let canonical_position = if meeting_surface {
        canonical_meeting_overlay_origin(
            position,
            scale,
            app_state.pill().meeting_overlay_presentation(),
        )
    } else if idle_sticky {
        (position.0, position.1 + sticky_menu_inset)
    } else {
        canonical_from_dictation_origin(position, scale)
    };
    app_state.pill().set_overlay_position(canonical_position);
    Ok(OverlayPositionPayload {
        x: canonical_position.0,
        y: canonical_position.1,
    })
}

#[tauri::command]
pub fn persist_overlay_position(
    x: i32,
    y: i32,
    app: AppHandle<AppRuntime>,
) -> Result<OverlayPositionPayload, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Overlay window not found.".to_string())?;
    // Ocultar la píldora la manda fuera de la pantalla, y eso dispara un
    // `onMoved`. Guardar esa posición la convierte en la preferida del
    // usuario: el siguiente `clamp` la pega a una esquina, el resultado se
    // vuelve a guardar y ya no hay forma de salir de ahí.
    if x <= OVERLAY_OFFSCREEN_LIMIT || y <= OVERLAY_OFFSCREEN_LIMIT {
        return Err("The overlay is off-screen; nothing to remember.".to_string());
    }
    let app_state = app.state::<AppState>();
    let meeting_surface = app_state.meeting_capture().is_active();
    let idle_sticky = !meeting_surface && app_state.pill().status() == PillStatus::Idle;
    let scale = window
        .scale_factor()
        .map_err(|err| format!("Failed to read overlay scale: {err}"))?;
    let sticky_menu_open = idle_sticky && *app_state.pill().preflight_language_menu_open.lock();
    let sticky_height = if sticky_menu_open {
        STICKY_LANGUAGE_MENU_HEIGHT
    } else {
        STICKY_OVERLAY_HEIGHT
    };
    let sticky_menu_inset = logical_pixels(sticky_height - STICKY_OVERLAY_HEIGHT, scale);
    let logical_size = if meeting_surface {
        (MEETING_OVERLAY_WIDTH, MEETING_OVERLAY_HEIGHT)
    } else if idle_sticky {
        (STICKY_OVERLAY_WIDTH, sticky_height)
    } else {
        (DICTATION_OVERLAY_WIDTH, DICTATION_OVERLAY_HEIGHT)
    };
    // Y aunque esté en pantalla, tiene que caber en un display real antes de
    // convertirse en la posición canónica.
    let (x, y) = clamp_overlay_position(&window, x, y, physical_overlay_size(logical_size, scale))
        .ok_or_else(|| "No display is available for the overlay.".to_string())?;
    let canonical_position = if meeting_surface {
        canonical_meeting_overlay_origin(
            (x, y),
            scale,
            app_state.pill().meeting_overlay_presentation(),
        )
    } else if idle_sticky {
        (x, y + sticky_menu_inset)
    } else {
        canonical_from_dictation_origin((x, y), scale)
    };
    app_state.pill().set_overlay_position(canonical_position);
    Ok(OverlayPositionPayload {
        x: canonical_position.0,
        y: canonical_position.1,
    })
}

#[tauri::command]
pub fn set_meeting_overlay_presentation(
    compact: bool,
    transcript_visible: bool,
    transcript_pinned: bool,
    app: AppHandle<AppRuntime>,
) -> Result<MeetingOverlayPresentationPayload, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Overlay window not found.".to_string())?;
    let scale = window
        .scale_factor()
        .map_err(|err| format!("Failed to read overlay scale: {err}"))?;
    let current_origin = window
        .outer_position()
        .map_err(|err| format!("Failed to read overlay position: {err}"))?;
    let app_state = app.state::<AppState>();
    let canonical_origin = canonical_meeting_overlay_origin(
        (current_origin.x, current_origin.y),
        scale,
        app_state.pill().meeting_overlay_presentation(),
    );
    let monitor = monitor_for_overlay_origin(&window, canonical_origin)
        .ok_or_else(|| "No display is available for the overlay.".to_string())?;
    let geometry = meeting_overlay_geometry(
        canonical_origin,
        scale,
        compact,
        transcript_visible,
        (monitor.position().x, monitor.position().y),
        (monitor.size().width, monitor.size().height),
    );

    window
        .set_size(LogicalSize::new(
            f64::from(geometry.logical_size.0),
            f64::from(geometry.logical_size.1),
        ))
        .map_err(|err| format!("Failed to resize meeting overlay: {err}"))?;
    window
        .set_position(tauri::PhysicalPosition::new(
            geometry.origin.0,
            geometry.origin.1,
        ))
        .map_err(|err| format!("Failed to position meeting overlay: {err}"))?;

    let presentation = MeetingOverlayPresentation {
        compact,
        transcript_visible,
        transcript_pinned: transcript_visible && transcript_pinned,
        placement: geometry.placement,
        side_alignment: geometry.side_alignment,
    };
    app_state
        .pill()
        .set_meeting_overlay_presentation(presentation);

    Ok(MeetingOverlayPresentationPayload {
        placement: geometry.placement,
        side_alignment: geometry.side_alignment,
    })
}

fn monitor_for_overlay_origin(
    window: &WebviewWindow<AppRuntime>,
    origin: (i32, i32),
) -> Option<tauri::Monitor> {
    let monitors = window.available_monitors().ok()?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let pill_center = (
        origin.0 + logical_pixels(MEETING_PILL_SLOT_WIDTH / 2.0, scale),
        origin.1 + logical_pixels(MEETING_PILL_HEIGHT / 2.0, scale),
    );
    let monitor_bounds = monitors
        .iter()
        .map(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            (position.x, position.y, size.width, size.height)
        })
        .collect::<Vec<_>>();
    closest_monitor_index(pill_center, &monitor_bounds)
        .and_then(|index| monitors.get(index))
        .cloned()
}

fn preferred_capture_monitor(window: &WebviewWindow<AppRuntime>) -> Option<tauri::Monitor> {
    // El dock es una entrada global, no una ventana de contenido. Al abrirlo
    // debe seguir la pantalla en la que está trabajando el usuario; el frame
    // anterior del NSPanel puede pertenecer a un monitor distinto.
    if let (Ok(cursor), Ok(monitors)) = (window.cursor_position(), window.available_monitors()) {
        // Compared in logical points, for the same reason the hit test is:
        // the cursor carries the primary screen's scale and each monitor
        // carries its own, so the raw numbers only agree on a uniform desktop.
        let cursor_scale = primary_scale_factor(window);
        let cursor = (cursor.x / cursor_scale, cursor.y / cursor_scale);
        if let Some(monitor) = monitors.into_iter().find(|monitor| {
            let scale = monitor.scale_factor();
            let position = monitor.position();
            let size = monitor.size();
            let left = f64::from(position.x) / scale;
            let top = f64::from(position.y) / scale;
            cursor.0 >= left
                && cursor.0 < left + f64::from(size.width) / scale
                && cursor.1 >= top
                && cursor.1 < top + f64::from(size.height) / scale
        }) {
            return Some(monitor);
        }
    }

    if let Ok(Some(monitor)) = window.current_monitor() {
        return Some(monitor);
    }

    window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| window.available_monitors().ok()?.into_iter().next())
}

#[tauri::command]
pub fn finish_recording(app: AppHandle<AppRuntime>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let pill = state.pill();
    if pill.status() != PillStatus::Listening || !pill.is_recording() {
        return Err("No active recording to finish.".to_string());
    }
    pill.stop_and_process(&app);
    Ok(())
}

#[tauri::command]
pub fn start_dictation_from_dock(app: AppHandle<AppRuntime>) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.meeting_capture().is_active() {
        return Err("Stop the meeting before starting Dictation.".to_string());
    }

    let pill = state.pill();
    if !matches!(pill.status(), PillStatus::Idle | PillStatus::Preflight) || pill.is_recording() {
        return Err("Dictation is already active.".to_string());
    }

    pill.handle_toggle_press(&app, hotkeys::ShortcutOptions::default());
    if pill.is_recording() {
        Ok(())
    } else {
        Err(
            "Dictation could not start. Check microphone access and the transcription model."
                .to_string(),
        )
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePillPreferences {
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
    language: String,
}

pub(crate) fn emit_capture_pill_preferences(app: &AppHandle<AppRuntime>, settings: &UserSettings) {
    emit_event(
        app,
        EVENT_CAPTURE_PILL_PREFERENCES,
        CapturePillPreferences {
            presentation: settings.capture_pill_presentation,
            dock_position: settings.capture_pill_dock_position,
            language: settings.language.clone(),
        },
    );
}

#[tauri::command]
pub fn get_capture_pill_preferences(state: tauri::State<AppState>) -> CapturePillPreferences {
    let settings = state.current_settings_unmasked();
    CapturePillPreferences {
        presentation: settings.capture_pill_presentation,
        dock_position: settings.capture_pill_dock_position,
        language: settings.language,
    }
}

#[tauri::command]
pub fn set_capture_pill_presentation(
    presentation: CapturePillPresentation,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<CapturePillPreferences, String> {
    let (_, next) = state
        .persist_settings_with(|_, settings| {
            settings.capture_pill_presentation = presentation;
        })
        .map_err(|error| error.to_string())?;
    state.emit_settings_changed(&app, &next);
    emit_capture_pill_preferences(&app, &next);
    crate::tray::refresh_tray_menu(&app, &next).map_err(|error| error.to_string())?;
    show_idle_sticky(&app)?;
    Ok(CapturePillPreferences {
        presentation: next.capture_pill_presentation,
        dock_position: next.capture_pill_dock_position,
        language: next.language,
    })
}

#[tauri::command]
pub fn set_capture_pill_dock_position(
    dock_position: CapturePillDockPosition,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<CapturePillPreferences, String> {
    let (_, next) = state
        .persist_settings_with(|_, settings| {
            settings.capture_pill_presentation = CapturePillPresentation::Dock;
            settings.capture_pill_dock_position = dock_position;
        })
        .map_err(|error| error.to_string())?;
    state.emit_settings_changed(&app, &next);
    emit_capture_pill_preferences(&app, &next);
    crate::tray::refresh_tray_menu(&app, &next).map_err(|error| error.to_string())?;
    show_idle_sticky(&app)?;
    Ok(CapturePillPreferences {
        presentation: next.capture_pill_presentation,
        dock_position: next.capture_pill_dock_position,
        language: next.language,
    })
}

/// Freezes hover tracking while the user drags the pill. A lost pointer-up
/// cannot strand the pill: `is_dragging` expires on its own.
#[tauri::command]
pub fn set_pill_dragging(dragging: bool, app: AppHandle<AppRuntime>) {
    app.state::<AppState>().pill().set_dragging(dragging);
}

#[tauri::command]
pub fn set_preflight_language_menu_open(
    open: bool,
    app: AppHandle<AppRuntime>,
) -> Result<(), String> {
    app.state::<AppState>()
        .pill()
        .set_preflight_language_menu_open(&app, open)
}

#[cfg(debug_assertions)]
pub(crate) fn start_qa_dictation(app: &AppHandle<AppRuntime>) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.meeting_capture().is_active() {
        return Err("Stop the meeting before starting Dictation.".to_string());
    }
    let pill = state.pill();
    if pill.is_recording() {
        return Err("Dictation is already recording.".to_string());
    }
    if !check_mic_permission(app) {
        return Err(
            "Microphone permission is disabled for Looper QA. Enable it in System Settings, then try again."
                .to_string(),
        );
    }

    pill.handle_toggle_press(app, hotkeys::ShortcutOptions::default());
    if pill.is_recording() {
        Ok(())
    } else {
        Err("Dictation could not start. Check microphone access and the installed transcription provider.".to_string())
    }
}

pub fn show_idle_sticky(app: &AppHandle<AppRuntime>) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.pill().status() != PillStatus::Idle || state.meeting_capture().is_active() {
        return Ok(());
    }

    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Dictation sticky window not found.".to_string())?;
    let settings = state.current_settings_unmasked();
    let language_menu_open = *state.pill().preflight_language_menu_open.lock();
    let logical_height = if language_menu_open {
        STICKY_LANGUAGE_MENU_HEIGHT
    } else {
        STICKY_OVERLAY_HEIGHT
    };
    let logical_size = (STICKY_OVERLAY_WIDTH, logical_height);
    let scale = window.scale_factor().unwrap_or(1.0);
    let physical_size = physical_overlay_size(logical_size, scale);
    let menu_inset = logical_pixels(logical_height - STICKY_OVERLAY_HEIGHT, scale);

    window
        .set_size(LogicalSize::new(logical_size.0, logical_size.1))
        .map_err(|error| format!("Failed to resize Dictation sticky: {error}"))?;
    // AppKit can restore the NSPanel's previous frame when it is shown. Make
    // the panel visible first, then apply the canonical dock/floating anchor.
    platform::overlay::show(app, &window, true);

    let placed = match settings.capture_pill_presentation {
        CapturePillPresentation::Dock => preferred_capture_monitor(&window)
            .map(|monitor| {
                let work_area = monitor.work_area();
                let monitor_scale = monitor.scale_factor();
                let base_size = physical_overlay_size(
                    (capture_pill::WINDOW_WIDTH, capture_pill::WINDOW_HEIGHT),
                    monitor_scale,
                );
                let base_origin = capture_pill::dock_origin(
                    (work_area.position.x, work_area.position.y),
                    (work_area.size.width, work_area.size.height),
                    base_size,
                    logical_pixels(capture_pill::EDGE_MARGIN, monitor_scale),
                    settings.capture_pill_dock_position,
                );
                let dock_menu_inset =
                    logical_pixels(logical_height - STICKY_OVERLAY_HEIGHT, monitor_scale);
                let position = if language_menu_open
                    && settings.capture_pill_dock_position != CapturePillDockPosition::TopCenter
                {
                    (base_origin.0, base_origin.1 - dock_menu_inset)
                } else {
                    base_origin
                };
                tracing::debug!(
                    presentation = ?settings.capture_pill_presentation,
                    dock_position = ?settings.capture_pill_dock_position,
                    work_x = work_area.position.x,
                    work_y = work_area.position.y,
                    work_width = work_area.size.width,
                    work_height = work_area.size.height,
                    window_x = position.0,
                    window_y = position.1,
                    "Positioning Capture pill"
                );
                let _ = window.set_position(tauri::PhysicalPosition::new(position.0, position.1));
            })
            .is_some(),
        CapturePillPresentation::Floating => state
            .pill()
            .overlay_position()
            .and_then(|canonical| {
                clamp_overlay_position(
                    &window,
                    canonical.0,
                    canonical.1 - menu_inset,
                    physical_size,
                )
            })
            .or_else(|| {
                let monitor = preferred_capture_monitor(&window)?;
                let work_area = monitor.work_area();
                let monitor_scale = monitor.scale_factor();
                let base_size = physical_overlay_size(
                    (capture_pill::WINDOW_WIDTH, capture_pill::WINDOW_HEIGHT),
                    monitor_scale,
                );
                Some(capture_pill::dock_origin(
                    (work_area.position.x, work_area.position.y),
                    (work_area.size.width, work_area.size.height),
                    base_size,
                    logical_pixels(85.0, monitor_scale),
                    CapturePillDockPosition::BottomCenter,
                ))
            })
            .map(|position| {
                let _ = window.set_position(tauri::PhysicalPosition::new(position.0, position.1));
            })
            .is_some(),
    };

    if !placed {
        position_overlay_on_cursor_screen(&window, logical_size);
    }

    state.pill().start_hover_emitter(app);
    Ok(())
}

pub fn show_overlay(app: &AppHandle<AppRuntime>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let app_state = app.state::<AppState>();
        let meeting_active = app_state.meeting_capture().is_active();
        let interactive = meeting_active;
        if meeting_active {
            app_state
                .pill()
                .set_meeting_overlay_presentation(MeetingOverlayPresentation::default());
        }
        // Una posición guardada puede haber dejado de existir: basta desconectar
        // el monitor en el que estaba. Antes eso hacía que no se colocara nada y
        // la ventana se mostrase donde la dejó el último `hide` — fuera de la
        // pantalla. La píldora estaba visible y en ninguna parte.
        let placed = if let Some((x, y)) = app_state.pill().overlay_position() {
            if interactive {
                if let (Ok(scale), Some(monitor)) = (
                    window.scale_factor(),
                    monitor_for_overlay_origin(&window, (x, y)),
                ) {
                    let presentation = app_state.pill().meeting_overlay_presentation();
                    let geometry = meeting_overlay_geometry(
                        (x, y),
                        scale,
                        presentation.compact,
                        presentation.transcript_visible,
                        (monitor.position().x, monitor.position().y),
                        (monitor.size().width, monitor.size().height),
                    );
                    let _ = window.set_size(LogicalSize::new(
                        f64::from(geometry.logical_size.0),
                        f64::from(geometry.logical_size.1),
                    ));
                    let _ = window.set_position(tauri::PhysicalPosition::new(
                        geometry.origin.0,
                        geometry.origin.1,
                    ));
                    true
                } else {
                    false
                }
            } else {
                let _ = window.set_size(LogicalSize::new(
                    DICTATION_OVERLAY_WIDTH,
                    DICTATION_OVERLAY_HEIGHT,
                ));
                let scale = window.scale_factor().unwrap_or(1.0);
                let origin = dictation_origin_from_canonical((x, y), scale);
                let physical = physical_overlay_size(
                    (DICTATION_OVERLAY_WIDTH, DICTATION_OVERLAY_HEIGHT),
                    scale,
                );
                if let Some(position) =
                    clamp_overlay_position(&window, origin.0, origin.1, physical)
                {
                    let _ =
                        window.set_position(tauri::PhysicalPosition::new(position.0, position.1));
                    true
                } else {
                    false
                }
            }
        } else {
            false
        };

        if !placed {
            let logical_size = if interactive {
                (MEETING_OVERLAY_WIDTH, MEETING_OVERLAY_HEIGHT)
            } else {
                (DICTATION_OVERLAY_WIDTH, DICTATION_OVERLAY_HEIGHT)
            };
            let _ = window.set_size(LogicalSize::new(logical_size.0, logical_size.1));
            position_overlay_on_cursor_screen(&window, logical_size);
        }
        platform::overlay::show(app, &window, interactive);
        app_state.pill().start_hover_emitter(app);
        if !app.state::<AppState>().pill().is_expanded() {
            collapse_expanded_pill(app);
        }
    }
}

fn show_preflight_overlay(app: &AppHandle<AppRuntime>) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Capture overlay window not found.".to_string())?;
    let state = app.state::<AppState>();
    let pill = state.pill();
    let anchor = pill
        .preflight_tray_anchor
        .lock()
        .as_ref()
        .copied()
        .ok_or_else(|| "Capture dock has no tray anchor.".to_string())?;
    let language_menu_open = *pill.preflight_language_menu_open.lock();
    let logical_height = if language_menu_open {
        PREFLIGHT_LANGUAGE_MENU_HEIGHT
    } else {
        PREFLIGHT_OVERLAY_HEIGHT
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let physical_size = physical_overlay_size((PREFLIGHT_OVERLAY_WIDTH, logical_height), scale);
    let x = anchor.x + (anchor.width as i32 - physical_size.0 as i32) / 2;
    let y = anchor.y + anchor.height as i32 + logical_pixels(PREFLIGHT_TRAY_GAP, scale) as i32;
    let (x, y) = clamp_overlay_position(&window, x, y, physical_size)
        .ok_or_else(|| "No display is available for the capture dock.".to_string())?;

    window
        .set_size(LogicalSize::new(PREFLIGHT_OVERLAY_WIDTH, logical_height))
        .map_err(|err| format!("Failed to resize capture dock: {err}"))?;
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|err| format!("Failed to position capture dock: {err}"))?;
    platform::overlay::show(app, &window, true);
    collapse_expanded_pill(app);
    Ok(())
}

/// `window_size` se pasa en vez de leerse: `set_size` es asíncrono, así que
/// `outer_size()` justo después devuelve tanto el tamaño nuevo como el viejo
/// según llegue la carrera. Colocar el aviso con el tamaño de la ventana de
/// dictado lo dejaba 218 px por encima de donde toca, unas veces sí y otras no.
fn clamp_overlay_position(
    window: &WebviewWindow<AppRuntime>,
    x: i32,
    y: i32,
    window_size: (u32, u32),
) -> Option<(i32, i32)> {
    let monitors = window.available_monitors().ok()?;
    let window_size = tauri::PhysicalSize {
        width: window_size.0,
        height: window_size.1,
    };
    let monitor_bounds = monitors
        .iter()
        .map(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            (position.x, position.y, size.width, size.height)
        })
        .collect::<Vec<_>>();
    let center = (
        x + i32::try_from(window_size.width / 2).unwrap_or(i32::MAX),
        y + i32::try_from(window_size.height / 2).unwrap_or(i32::MAX),
    );
    let target =
        closest_monitor_index(center, &monitor_bounds).and_then(|index| monitors.get(index))?;
    let work_area = target.work_area();
    Some(clamp_overlay_coordinates(
        x,
        y,
        (window_size.width, window_size.height),
        (work_area.position.x, work_area.position.y),
        (work_area.size.width, work_area.size.height),
    ))
}

fn position_overlay(window: &WebviewWindow<AppRuntime>, logical_size: (f64, f64)) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let scale_factor = monitor.scale_factor();
        let size = physical_overlay_size(logical_size, scale_factor);
        let screen = monitor.size();
        let mon_pos = monitor.position();
        let x = mon_pos.x + (screen.width.saturating_sub(size.0) / 2) as i32;
        let bottom_padding_physical = (85.0 * scale_factor) as i32;
        let y = mon_pos.y + screen.height as i32 - size.1 as i32 - bottom_padding_physical;
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

fn position_overlay_on_cursor_screen(window: &WebviewWindow<AppRuntime>, logical_size: (f64, f64)) {
    if let Some((x, y)) = cursor_screen_overlay_position(window, logical_size) {
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    } else {
        position_overlay(window, logical_size);
    }
}

fn cursor_screen_overlay_position(
    window: &WebviewWindow<AppRuntime>,
    logical_size: (f64, f64),
) -> Option<(i32, i32)> {
    let cursor_pos = window.cursor_position().ok()?;
    let target_monitor = window.available_monitors().ok()?.into_iter().find(|m| {
        let pos = m.position();
        let size = m.size();
        cursor_pos.x >= pos.x as f64
            && cursor_pos.x < (pos.x + size.width as i32) as f64
            && cursor_pos.y >= pos.y as f64
            && cursor_pos.y < (pos.y + size.height as i32) as f64
    })?;

    let scale_factor = target_monitor.scale_factor();
    let size = physical_overlay_size(logical_size, scale_factor);
    let mon_pos = target_monitor.position();
    let mon_size = target_monitor.size();
    let x = mon_pos.x + ((mon_size.width.saturating_sub(size.0)) / 2) as i32;
    let bottom_padding_physical = (85.0 * scale_factor) as i32;
    let y = mon_pos.y + mon_size.height as i32 - size.1 as i32 - bottom_padding_physical;
    Some((x, y))
}

fn microphone_input_kind(settings: &UserSettings) -> &'static str {
    if settings.microphone_device.is_some() {
        "selected"
    } else {
        "default"
    }
}

/// Simplifies recording error messages
fn simplify_recording_error(message: &str) -> String {
    let msg_lower = message.to_lowercase();

    if msg_lower.contains("permission")
        || msg_lower.contains("not allowed")
        || msg_lower.contains("access denied")
        || msg_lower.contains("coreaudio")
    {
        return "Microphone permission needed. Check System Settings.".to_string();
    }

    if msg_lower.contains("microphone")
        || msg_lower.contains("audio")
        || msg_lower.contains("input device")
    {
        return "Microphone unavailable".to_string();
    }

    if message.len() <= 30 {
        return message.to_string();
    }

    "Recording failed".to_string()
}

#[cfg(test)]
mod pill_policy_tests {
    use super::*;
    use crate::settings::{
        ModeRule, ModeRuleTrigger, ShortcutBinding, WorkflowEngine, WorkflowInput, WorkflowOutput,
    };

    fn binding(shortcut: &str, temporary: bool, cleanup_enabled: bool) -> ShortcutBinding {
        ShortcutBinding {
            shortcut: shortcut.to_owned(),
            temporary,
            cleanup_enabled,
        }
    }

    fn hotkey_workflow(shortcut: &str, deterministic_only: bool) -> ModeRule {
        ModeRule {
            id: "workflow-contract".to_owned(),
            name: "Workflow contract".to_owned(),
            enabled: true,
            trigger: ModeRuleTrigger::Hotkey {
                shortcut: shortcut.to_owned(),
            },
            input: WorkflowInput::Dictation,
            engine: WorkflowEngine::Auto,
            language: None,
            transform_preset: None,
            custom_prompt: None,
            deterministic_only,
            output: WorkflowOutput::Insert,
            auto_send_on_insert: false,
        }
    }

    #[test]
    fn spectrum_contract_keeps_shape_smoothing_and_decay() {
        let mut analyzer = SpectrumAnalyzer::new();
        let silence = analyzer.frame(None);
        assert_eq!(silence, vec![0; SPECTRUM_OUTPUT_COUNT]);

        let signal = vec![1.0; SPECTRUM_SAMPLE_COUNT];
        let first = analyzer.frame(Some(&signal));
        let second = analyzer.frame(Some(&signal));
        let decayed = analyzer.frame(None);

        assert_eq!(first.len(), SPECTRUM_SAMPLE_COUNT / 2);
        assert!(second
            .iter()
            .zip(&first)
            .all(|(later, prior)| later >= prior));
        assert!(second.iter().any(|level| *level > 0));
        assert!(decayed
            .iter()
            .zip(&second)
            .all(|(later, prior)| later <= prior));
    }

    #[test]
    fn shortcut_candidates_retain_mode_options_and_workflow_index() {
        let mut settings = UserSettings::default();
        settings.smart_enabled = true;
        settings.hold_enabled = true;
        settings.toggle_enabled = true;
        settings.shortcut_bindings.smart = vec![binding("Control+A", true, true)];
        settings.shortcut_bindings.hold = vec![binding("Control+B", false, true)];
        settings.shortcut_bindings.toggle = vec![binding("Control+C", true, false)];
        settings.mode_rules = vec![hotkey_workflow("Control+D", true)];

        let registrations = compile_shortcut_candidates(configured_shortcut_candidates(&settings));
        assert_eq!(registrations.len(), 4);
        assert_eq!(registrations[0].action, hotkeys::ShortcutAction::Smart);
        assert_eq!(
            registrations[0].options,
            hotkeys::ShortcutOptions {
                temporary: true,
                cleanup_enabled: true,
                workflow_rule_index: None,
            }
        );
        assert_eq!(registrations[2].action, hotkeys::ShortcutAction::Toggle);
        assert_eq!(registrations[3].action, hotkeys::ShortcutAction::Workflow);
        assert_eq!(registrations[3].options.workflow_rule_index, Some(0));
        assert!(!registrations[3].options.cleanup_enabled);
    }

    #[test]
    fn shortcut_compilation_skips_disabled_invalid_and_conflicting_entries() {
        let candidates = vec![
            ShortcutCandidate {
                label: "Smart",
                enabled: true,
                shortcut: "Control+A",
                action: hotkeys::ShortcutAction::Smart,
                options: hotkeys::ShortcutOptions::default(),
            },
            ShortcutCandidate {
                label: "Hold",
                enabled: false,
                shortcut: "Control+B",
                action: hotkeys::ShortcutAction::Hold,
                options: hotkeys::ShortcutOptions::default(),
            },
            ShortcutCandidate {
                label: "Toggle",
                enabled: true,
                shortcut: "Control+A",
                action: hotkeys::ShortcutAction::Toggle,
                options: hotkeys::ShortcutOptions::default(),
            },
            ShortcutCandidate {
                label: "Workflow",
                enabled: true,
                shortcut: "Control+NotAKey",
                action: hotkeys::ShortcutAction::Workflow,
                options: hotkeys::ShortcutOptions::default(),
            },
        ];

        let registrations = compile_shortcut_candidates(candidates);
        assert_eq!(registrations.len(), 1);
        assert_eq!(registrations[0].action, hotkeys::ShortcutAction::Smart);
        assert_eq!(registrations[0].hotkey.to_string(), "Ctrl+A");
    }
}

#[cfg(test)]
mod meeting_overlay_tests {
    use super::*;

    #[test]
    fn the_canonical_origin_survives_a_round_trip_on_a_retina_display() {
        let canonical = (1_040, 1_820);

        assert_eq!(
            canonical_from_dictation_origin(dictation_origin_from_canonical(canonical, 2.0), 2.0),
            canonical
        );
    }

    #[test]
    fn overlay_position_is_clamped_inside_a_negative_origin_monitor() {
        assert_eq!(
            clamp_overlay_coordinates(-2_500, -50, (420, 92), (-1_920, 0), (1_920, 1_080)),
            (-1_920, 0)
        );
        assert_eq!(
            clamp_overlay_coordinates(-100, 1_200, (420, 92), (-1_920, 0), (1_920, 1_080)),
            (-420, 988)
        );
    }

    #[test]
    fn oversized_overlay_anchors_to_monitor_origin() {
        assert_eq!(
            clamp_overlay_coordinates(500, 500, (2_400, 1_200), (-1_920, 0), (1_920, 1_080)),
            (-1_920, 0)
        );
    }

    #[test]
    fn nearest_monitor_follows_the_pill_center_across_display_boundaries() {
        let monitors = [(0, 0, 1_920, 1_080), (1_920, -240, 2_560, 1_440)];

        assert_eq!(closest_monitor_index((1_900, 500), &monitors), Some(0));
        assert_eq!(closest_monitor_index((1_940, 500), &monitors), Some(1));
        assert_eq!(closest_monitor_index((1_930, -300), &monitors), Some(1));
    }

    #[test]
    fn sticky_restore_detects_when_the_cursor_moved_to_another_display() {
        let monitors = [(0, 0, 2_560, 1_440), (888, 2_880, 3_024, 1_964)];

        assert!(points_share_closest_monitor(
            (1_280, 1_300),
            (1_900, 800),
            &monitors,
        ));
        assert!(!points_share_closest_monitor(
            (1_280, 1_300),
            (1_900, 3_400),
            &monitors,
        ));
    }

    #[test]
    fn compact_hit_testing_only_activates_the_visible_signal_rail() {
        let origin = (1_000.0, 500.0);
        let size = (600.0, 380.0);
        let scale = 2.0;

        assert!(cursor_over_pill_bounds(
            (1_300.0, 850.0),
            origin,
            size,
            scale,
            false,
        ));
        assert!(!cursor_over_pill_bounds(
            (1_300.0, 650.0),
            origin,
            size,
            scale,
            false,
        ));
        assert!(cursor_over_pill_bounds(
            (1_300.0, 650.0),
            origin,
            size,
            scale,
            true,
        ));
    }

    #[test]
    fn meeting_transcript_prefers_above_without_moving_the_pill_anchor() {
        let geometry =
            meeting_overlay_geometry((100, 500), 1.0, false, true, (0, 0), (1_920, 1_080));

        assert_eq!(geometry.placement, MeetingTranscriptPlacement::Above);
        assert_eq!(geometry.logical_size, (268, 360));
        assert_eq!(geometry.origin, (96, 192));
        assert_eq!(
            canonical_meeting_overlay_origin(
                geometry.origin,
                1.0,
                MeetingOverlayPresentation {
                    transcript_visible: true,
                    placement: geometry.placement,
                    side_alignment: geometry.side_alignment,
                    ..MeetingOverlayPresentation::default()
                },
            ),
            (100, 500),
        );
    }

    #[test]
    fn meeting_transcript_falls_right_and_aligns_top_near_screen_top() {
        let geometry = meeting_overlay_geometry((100, 0), 1.0, false, true, (0, 0), (1_920, 1_080));

        assert_eq!(geometry.placement, MeetingTranscriptPlacement::Right);
        assert_eq!(geometry.side_alignment, MeetingTranscriptSideAlignment::Top,);
        assert_eq!(geometry.logical_size, (524, 308));
        assert_eq!(geometry.origin, (96, 0));
        assert_eq!(
            canonical_meeting_overlay_origin(
                geometry.origin,
                1.0,
                MeetingOverlayPresentation {
                    transcript_visible: true,
                    placement: geometry.placement,
                    side_alignment: geometry.side_alignment,
                    ..MeetingOverlayPresentation::default()
                },
            ),
            (100, 4),
        );
    }

    #[test]
    fn meeting_transcript_preserves_its_anchor_on_a_negative_origin_monitor() {
        let geometry =
            meeting_overlay_geometry((-1_700, 500), 1.0, false, true, (-1_920, 0), (1_920, 1_080));

        assert_eq!(geometry.placement, MeetingTranscriptPlacement::Above);
        assert_eq!(geometry.origin, (-1_704, 192));
        assert_eq!(
            canonical_meeting_overlay_origin(
                geometry.origin,
                1.0,
                MeetingOverlayPresentation {
                    transcript_visible: true,
                    placement: geometry.placement,
                    side_alignment: geometry.side_alignment,
                    ..MeetingOverlayPresentation::default()
                },
            ),
            (-1_700, 500),
        );
    }

    #[test]
    fn compact_meeting_hit_testing_does_not_capture_the_old_full_pill_area() {
        let presentation = MeetingOverlayPresentation {
            compact: true,
            ..MeetingOverlayPresentation::default()
        };

        assert!(cursor_over_meeting_overlay_bounds(
            (1_120.0, 520.0),
            (1_105.0, 496.0),
            (50.0, 50.0),
            1.0,
            presentation,
        ));
        assert!(!cursor_over_meeting_overlay_bounds(
            (1_050.0, 520.0),
            (1_105.0, 496.0),
            (50.0, 50.0),
            1.0,
            presentation,
        ));
    }

    #[test]
    fn hidden_transcript_uses_only_the_visible_pill_window() {
        let full = meeting_overlay_geometry((100, 500), 1.0, false, false, (0, 0), (1_920, 1_080));
        assert_eq!(full.logical_size, (268, 56));
        assert_eq!(full.origin, (96, 496));

        let compact =
            meeting_overlay_geometry((100, 500), 1.0, true, false, (0, 0), (1_920, 1_080));
        assert_eq!(compact.logical_size, (50, 50));
        assert_eq!(compact.origin, (205, 496));
        assert_eq!(
            canonical_meeting_overlay_origin(
                compact.origin,
                1.0,
                MeetingOverlayPresentation {
                    compact: true,
                    ..MeetingOverlayPresentation::default()
                },
            ),
            (100, 500),
        );
    }

    #[test]
    fn pinned_transcript_makes_the_integrated_surface_interactive() {
        let presentation = MeetingOverlayPresentation {
            transcript_visible: true,
            transcript_pinned: true,
            placement: MeetingTranscriptPlacement::Above,
            ..MeetingOverlayPresentation::default()
        };

        assert!(cursor_over_meeting_overlay_bounds(
            (1_100.0, 520.0),
            (1_000.0, 500.0),
            (268.0, 360.0),
            1.0,
            presentation,
        ));
        assert!(!cursor_over_meeting_overlay_bounds(
            (1_001.0, 505.0),
            (1_000.0, 500.0),
            (268.0, 360.0),
            1.0,
            presentation,
        ));
    }

    #[test]
    fn pinned_side_transcript_only_captures_the_two_visible_surfaces() {
        let presentation = MeetingOverlayPresentation {
            transcript_visible: true,
            transcript_pinned: true,
            placement: MeetingTranscriptPlacement::Right,
            side_alignment: MeetingTranscriptSideAlignment::Top,
            ..MeetingOverlayPresentation::default()
        };

        assert!(cursor_over_meeting_overlay_bounds(
            (1_300.0, 520.0),
            (1_000.0, 500.0),
            (524.0, 308.0),
            1.0,
            presentation,
        ));
        assert!(cursor_over_meeting_overlay_bounds(
            (1_050.0, 520.0),
            (1_000.0, 500.0),
            (524.0, 308.0),
            1.0,
            presentation,
        ));
        assert!(!cursor_over_meeting_overlay_bounds(
            (1_266.0, 520.0),
            (1_000.0, 500.0),
            (524.0, 308.0),
            1.0,
            presentation,
        ));
    }
}

#[cfg(test)]
mod recording_personality_tests {
    use super::*;

    fn personality(name: &str) -> Personality {
        Personality {
            id: name.to_lowercase(),
            name: name.to_string(),
            enabled: true,
            apps: Vec::new(),
            websites: Vec::new(),
            instructions: vec![format!("Use {name}")],
        }
    }

    #[test]
    fn processing_reuses_the_personality_frozen_at_recording_start() {
        let controller = PillController::new(Arc::new(RecorderManager::new()));
        controller.freeze_recording_personality(Some(personality("Prompt A")));

        let current_personality = personality("Prompt B");
        let frozen = controller
            .processing_personality()
            .expect("recording personality");

        assert_eq!(frozen.name, "Prompt A");
        assert_eq!(frozen.instructions, vec!["Use Prompt A"]);
        assert_ne!(frozen, current_personality);
    }
}
