use super::{
    emit_event, hotkeys, AppHandle, AppRuntime, Arc, AtomicBool, AtomicU64, AudioSpectrumEmitter,
    Emitter, MeetingOverlayPresentation, Ordering, Personality, PillController, PillHoverEmitter,
    PillModeState, PillStatePayload, PillStatus, PreflightTrayAnchor, RecorderManager,
    UserSettings, EVENT_PILL_MODE, EVENT_PILL_STATE, OVERLAY_OFFSCREEN_LIMIT,
};
use parking_lot::Mutex;
use std::time::{Duration, Instant};

/// A drag that never reported its end stops freezing hover after this long.
const DRAG_FREEZE_TIMEOUT: Duration = Duration::from_secs(10);

impl PillController {
    pub fn new(recorder: Arc<RecorderManager>) -> Self {
        Self {
            recorder,
            status: Mutex::new(PillStatus::Idle),
            recording_mode: Mutex::default(),
            shortcut_origin: Mutex::default(),
            recording_options: Mutex::new(hotkeys::ShortcutOptions::default()),
            recording_settings: Mutex::<Option<UserSettings>>::default(),
            recording_personality: Mutex::<Option<Personality>>::default(),
            smart_press_time: Mutex::default(),
            hold_key_down: Mutex::default(),
            paused_media_session: Mutex::default(),
            audio_spectrum_emitter: Mutex::default(),
            hover_emitter: Mutex::default(),
            hovering: AtomicBool::default(),
            drag_started_at: Mutex::default(),
            recording_generation: AtomicU64::default(),
            is_expanded: Mutex::default(),
            mode_state: Mutex::new(PillModeState::default()),
            overlay_position: Mutex::default(),
            meeting_overlay_presentation: Mutex::new(MeetingOverlayPresentation::default()),
            preflight_tray_anchor: Mutex::<Option<PreflightTrayAnchor>>::default(),
            preflight_language_menu_open: Mutex::default(),
        }
    }

    pub fn status(&self) -> PillStatus {
        self.status.lock().to_owned()
    }

    pub(super) fn emit_state(&self, app: &AppHandle<AppRuntime>) {
        let payload = PillStatePayload {
            status: self.status(),
        };
        if let Err(error) = app.emit(EVENT_PILL_STATE, payload) {
            tracing::error!("Failed to emit pill state: {error}");
        }
    }

    pub fn transition_to(&self, app: &AppHandle<AppRuntime>, next: PillStatus) {
        let previous = {
            let mut current = self.status.lock();
            std::mem::replace(&mut *current, next)
        };
        if previous == next {
            return;
        }

        self.update_overlay_visibility(app, previous, next);
        self.emit_state(app);
    }

    pub(super) fn freeze_recording_personality(&self, personality: Option<Personality>) {
        self.recording_personality.lock().clone_from(&personality);
    }

    pub(super) fn processing_personality(&self) -> Option<Personality> {
        Option::clone(&self.recording_personality.lock())
    }

    pub fn set_expanded(&self, expanded: bool) {
        self.is_expanded.lock().clone_from(&expanded);
    }

    pub(super) fn set_mode_state(
        &self,
        expanded: bool,
        text: &str,
        tone: &str,
        used_screen_context: bool,
    ) {
        self.set_expanded(expanded);
        self.mode_state.lock().clone_from(&PillModeState {
            expanded,
            text: text.to_owned(),
            tone: tone.to_owned(),
            used_screen_context,
        });
    }

    pub(super) fn emit_mode_state(&self, app: &AppHandle<AppRuntime>) {
        let current = self.mode_state.lock().clone();
        let payload = serde_json::json!({
            "expanded": current.expanded,
            "text": current.text,
            "tone": current.tone,
            "usedScreenContext": current.used_screen_context,
        });
        emit_event(app, EVENT_PILL_MODE, payload);
    }

    pub fn is_expanded(&self) -> bool {
        self.is_expanded.lock().to_owned()
    }

    pub(super) fn is_hovering(&self) -> bool {
        self.hovering.load(Ordering::Relaxed)
    }

    pub(super) fn set_hovering(&self, hovering: bool) {
        self.hovering.store(hovering, Ordering::Relaxed);
    }

    pub(super) fn set_dragging(&self, dragging: bool) {
        let started = dragging.then(Instant::now);
        self.drag_started_at.lock().clone_from(&started);
    }

    /// True while a drag holds the pill. The timeout is the safety net for a
    /// pointer-up the webview never sees, which would otherwise freeze hover
    /// tracking for the rest of the session.
    pub(super) fn is_dragging(&self) -> bool {
        self.drag_started_at
            .lock()
            .is_some_and(|started| started.elapsed() < DRAG_FREEZE_TIMEOUT)
    }

    pub(super) fn overlay_position(&self) -> Option<(i32, i32)> {
        self.overlay_position.lock().as_ref().copied()
    }

    /// Ignores the sentinel used to hide the overlay so it cannot become the
    /// user's next persisted anchor.
    pub(super) fn set_overlay_position(&self, position: (i32, i32)) {
        let is_hidden_sentinel =
            position.0 <= OVERLAY_OFFSCREEN_LIMIT || position.1 <= OVERLAY_OFFSCREEN_LIMIT;
        if !is_hidden_sentinel {
            self.overlay_position.lock().replace(position);
        }
    }

    pub(super) fn meeting_overlay_presentation(&self) -> MeetingOverlayPresentation {
        self.meeting_overlay_presentation.lock().to_owned()
    }

    pub(super) fn set_meeting_overlay_presentation(
        &self,
        presentation: MeetingOverlayPresentation,
    ) {
        self.meeting_overlay_presentation
            .lock()
            .clone_from(&presentation);
    }

    pub fn recorder(&self) -> &RecorderManager {
        self.recorder.as_ref()
    }

    pub fn recorder_handle(&self) -> Arc<RecorderManager> {
        Arc::clone(&self.recorder)
    }

    pub(super) fn start_audio_spectrum_emitter(&self, app: &AppHandle<AppRuntime>) {
        let mut slot = self.audio_spectrum_emitter.lock();
        if slot.is_none() {
            slot.replace(AudioSpectrumEmitter::start(
                app.clone(),
                Arc::clone(&self.recorder),
            ));
        }
    }

    pub(super) fn stop_audio_spectrum_emitter(&self) {
        let active = self.audio_spectrum_emitter.lock().take();
        if let Some(emitter) = active {
            emitter.stop();
        }
    }

    pub(super) fn start_hover_emitter(&self, app: &AppHandle<AppRuntime>) {
        let mut slot = self.hover_emitter.lock();
        if slot.is_none() {
            slot.replace(PillHoverEmitter::start(app.clone()));
        }
    }
}
