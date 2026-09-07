use chrono::{DateTime, Duration as ChronoDuration, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;

use crate::{awareness_notification, pill, AppRuntime, AppState};

const AGENDA_WINDOW_DAYS: i64 = 7;
const EVENT_MEETING_AWARENESS_STATE: &str = "meeting:awareness_state";
const POLL_INTERVAL_SECONDS: u64 = 15;
const MICROPHONE_POLL_INTERVAL_SECONDS: u64 = 2;
const REMINDER_LEAD_SECONDS: i64 = 60;
const LATE_JOIN_WINDOW_MINUTES: i64 = 15;
const CALENDAR_READ_ATTEMPTS: usize = 3;
const CALENDAR_RETRY_DELAY_MILLIS: u64 = 100;
/// Un aviso es una oferta, no un estado: si no la aceptas se retira sola.
/// Vale igual para las dos clases de aviso. Un micrófono puede quedarse
/// abierto durante horas, y una reunión de calendario seguía siendo
/// "todavía puedes unirte" hasta quince minutos después de empezar, así que
/// las dos se quedaban en pantalla mucho más de lo que dura un vistazo. La
/// oferta sigue viva en el menú de la barra; lo que caduca es la tarjeta.
const PROMPT_TTL_SECONDS: u64 = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CalendarAccessStatus {
    Unsupported,
    NotDetermined,
    Authorized,
    Denied,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CalendarMeeting {
    pub id: String,
    pub external_id: String,
    pub calendar_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub series_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub occurrence_id: Option<String>,
    pub title: String,
    pub started_at: String,
    pub ended_at: String,
    pub meeting_url: Option<String>,
    pub organizer: Option<String>,
    pub attendee_count: usize,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeetingAwarenessPhase {
    #[default]
    Idle,
    Upcoming,
    Ready,
    /// Reunión que nadie agendó, deducida de que otra app abrió el micrófono.
    /// No tiene evento asociado, así que el aviso no puede nombrarla.
    Detected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeetingAwarenessSource {
    Calendar,
    Microphone,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct MeetingAwarenessState {
    pub phase: MeetingAwarenessPhase,
    pub meeting: Option<CalendarMeeting>,
    pub seconds_until_start: Option<i64>,
}

pub struct MeetingAwarenessManager {
    state: Arc<parking_lot::RwLock<MeetingAwarenessState>>,
    agenda: Arc<parking_lot::RwLock<Vec<CalendarMeeting>>>,
    dismissed_event_ids: Arc<parking_lot::Mutex<HashSet<String>>>,
    /// Una llamada detectada por micrófono no tiene evento que recordar como
    /// descartado, así que sin esta marca el aviso volvía a los quince
    /// segundos: el micrófono seguía ocupado y nada decía que ya lo cerraste.
    detected_dismissed: Arc<AtomicBool>,
    /// Identifica al aviso detectado que está en pantalla, para que el
    /// temporizador de uno viejo no retire el que acaba de aparecer.
    detected_generation: Arc<AtomicU64>,
    refresh_requested: Arc<Notify>,
    started: AtomicBool,
}

impl Default for MeetingAwarenessManager {
    fn default() -> Self {
        Self {
            state: Arc::new(parking_lot::RwLock::new(MeetingAwarenessState::default())),
            agenda: Arc::new(parking_lot::RwLock::new(Vec::new())),
            dismissed_event_ids: Arc::new(parking_lot::Mutex::new(HashSet::new())),
            detected_dismissed: Arc::new(AtomicBool::new(false)),
            detected_generation: Arc::new(AtomicU64::new(0)),
            refresh_requested: Arc::new(Notify::new()),
            started: AtomicBool::new(false),
        }
    }
}

impl MeetingAwarenessManager {
    pub fn state(&self) -> MeetingAwarenessState {
        self.state.read().clone()
    }

    pub fn agenda(&self) -> Vec<CalendarMeeting> {
        self.agenda.read().clone()
    }

    pub fn meeting_by_id(&self, event_id: &str) -> Option<CalendarMeeting> {
        self.agenda
            .read()
            .iter()
            .find(|meeting| meeting.id == event_id)
            .cloned()
    }

    pub fn request_refresh(&self) {
        self.refresh_requested.notify_one();
    }

    pub fn dismiss(&self, app: &AppHandle<AppRuntime>) {
        let dismissed_prompt = {
            let current = self.state.read();
            match current.meeting.as_ref() {
                Some(meeting) => self.remember_dismissed_event(&meeting.id),
                // Sin evento no hay id que recordar: la marca es lo único que
                // impide que el siguiente sondeo vuelva a levantar el aviso.
                None if current.phase == MeetingAwarenessPhase::Detected => {
                    self.detected_dismissed.store(true, Ordering::SeqCst);
                }
                None => {}
            }
            current.phase != MeetingAwarenessPhase::Idle
        };
        // Cualquier aviso visible consume también el episodio de micrófono
        // que pueda estar detrás. Hacerlo sin volver a consultar CoreAudio
        // permite cerrar al instante y evita que un aviso de calendario se
        // convierta enseguida en una segunda tarjeta genérica. Una lectura
        // explícita de micrófono libre rearma el siguiente episodio.
        if dismissed_prompt {
            self.detected_dismissed.store(true, Ordering::SeqCst);
        }
        self.detected_generation.fetch_add(1, Ordering::SeqCst);
        self.set_state(app, MeetingAwarenessState::default());
        hide_prompt_if_safe(app);
    }

    pub fn dismiss_event(&self, app: &AppHandle<AppRuntime>, event_id: &str) {
        self.remember_dismissed_event(event_id);
        self.detected_dismissed.store(true, Ordering::SeqCst);
        self.detected_generation.fetch_add(1, Ordering::SeqCst);
        self.set_state(app, MeetingAwarenessState::default());
        hide_prompt_if_safe(app);
    }

    fn remember_dismissed_event(&self, event_id: &str) {
        self.dismissed_event_ids.lock().insert(event_id.to_string());
    }

    pub fn start(&self, app: AppHandle<AppRuntime>) {
        if self.started.swap(true, Ordering::SeqCst) {
            return;
        }

        let state = Arc::clone(&self.state);
        let agenda = Arc::clone(&self.agenda);
        let dismissed = Arc::clone(&self.dismissed_event_ids);
        let detected_dismissed = Arc::clone(&self.detected_dismissed);
        let detected_generation = Arc::clone(&self.detected_generation);
        let refresh_requested = Arc::clone(&self.refresh_requested);
        platform::setup_change_notification({
            let refresh_requested = Arc::clone(&refresh_requested);
            move || refresh_requested.notify_one()
        });
        #[cfg(target_os = "macos")]
        start_microphone_activity_watcher(app.clone(), Arc::clone(&refresh_requested));

        tauri::async_runtime::spawn(async move {
            let mut interval =
                tokio::time::interval(std::time::Duration::from_secs(POLL_INTERVAL_SECONDS));
            let mut rendered_agenda_day = chrono::Local::now().date_naive();
            let mut timed_prompt: Option<PromptIdentity> = None;
            loop {
                tokio::select! {
                    _ = interval.tick() => {}
                    _ = refresh_requested.notified() => {}
                }
                let settings = app.state::<AppState>().current_settings();
                let calendar_enabled = settings.calendar_meeting_awareness_enabled;
                let microphone_enabled = settings.microphone_meeting_awareness_enabled;
                let agenda_day = chrono::Local::now().date_naive();
                if agenda_day != rendered_agenda_day {
                    rendered_agenda_day = agenda_day;
                    if let Err(error) = crate::tray::refresh_tray_menu(&app, &settings) {
                        tracing::warn!("Failed to refresh Calendar day labels: {error}");
                    }
                } else if let Err(error) = crate::tray::refresh_calendar_tray_title(&app, &settings)
                {
                    tracing::warn!("Failed to refresh Calendar menu bar title: {error}");
                }
                if !should_check_awareness(calendar_enabled, microphone_enabled) {
                    replace_agenda(&app, &agenda, Vec::new());
                    let was_prompting = state.read().phase != MeetingAwarenessPhase::Idle;
                    update_shared_state(&app, &state, MeetingAwarenessState::default());
                    if was_prompting {
                        hide_prompt_if_safe(&app);
                    }
                    timed_prompt = None;
                    continue;
                }
                let mic = microphone_activity_if_enabled(microphone_enabled, || {
                    microphone_busy_excluding_self(&app)
                });
                refresh_detected_dismissal(&detected_dismissed, mic);

                let meetings = if calendar_enabled {
                    let now = Utc::now();
                    let refreshed = tauri::async_runtime::spawn_blocking(move || {
                        upcoming_calendar_meetings(now)
                    })
                    .await
                    .unwrap_or_else(|error| Err(error.to_string()));
                    match refreshed {
                        Ok(meetings) => {
                            prune_dismissed_events(&dismissed, &meetings);
                            replace_agenda(&app, &agenda, meetings.clone());
                            meetings
                        }
                        Err(error) => {
                            tracing::warn!("Failed to refresh calendar meetings: {error}");
                            agenda.read().clone()
                        }
                    }
                } else {
                    replace_agenda(&app, &agenda, Vec::new());
                    Vec::new()
                };

                if app.state::<AppState>().meeting_capture().is_active()
                    || dictation_busy(&app.state::<AppState>())
                {
                    let was_prompting = state.read().phase != MeetingAwarenessPhase::Idle;
                    update_shared_state(&app, &state, MeetingAwarenessState::default());
                    if was_prompting && !app.state::<AppState>().meeting_capture().is_active() {
                        hide_prompt_if_safe(&app);
                    }
                    timed_prompt = None;
                    continue;
                }

                let candidate_generation = detected_generation.load(Ordering::SeqCst);
                let candidate = select_awareness_state(
                    AwarenessSignals {
                        meetings: &meetings,
                        microphone_busy: mic,
                        detected_dismissed: detected_dismissed.load(Ordering::SeqCst),
                    },
                    Utc::now(),
                    &dismissed.lock(),
                );
                let (previous_phase, _previous_prompt, next) = commit_awareness_candidate(
                    &app,
                    &state,
                    candidate,
                    &detected_dismissed,
                    candidate_generation,
                    &detected_generation,
                );
                let next_phase = next.phase;
                let should_show = next_phase != MeetingAwarenessPhase::Idle;
                let next_prompt = prompt_identity(&next);
                if should_show && !dictation_busy(&app.state::<AppState>()) {
                    let presented = awareness_notification::show(&app);
                    if prompt_needs_timeout(
                        presented,
                        next_prompt.as_ref(),
                        timed_prompt.as_ref(),
                    ) {
                        arm_prompt_timeout(
                            &app,
                            &state,
                            &dismissed,
                            &detected_dismissed,
                            &detected_generation,
                        );
                        timed_prompt = next_prompt.clone();
                    }
                    if let Err(error) = pill::show_idle_sticky(&app) {
                        tracing::error!(
                            "Failed to keep Dictation visible with meeting notice: {error}"
                        );
                    }
                } else if previous_phase != MeetingAwarenessPhase::Idle && !should_show {
                    timed_prompt = None;
                    hide_prompt_if_safe(&app);
                } else if !should_show {
                    timed_prompt = None;
                }
            }
        });
    }

    fn set_state(&self, app: &AppHandle<AppRuntime>, next: MeetingAwarenessState) {
        update_shared_state(app, &self.state, next);
    }
}

fn should_check_awareness(calendar_enabled: bool, microphone_enabled: bool) -> bool {
    calendar_enabled || microphone_enabled
}

#[cfg(target_os = "macos")]
fn start_microphone_activity_watcher(app: AppHandle<AppRuntime>, refresh_requested: Arc<Notify>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(
            MICROPHONE_POLL_INTERVAL_SECONDS,
        ));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut previous = None;

        loop {
            interval.tick().await;
            let enabled = app
                .state::<AppState>()
                .current_settings()
                .microphone_meeting_awareness_enabled;
            let current = microphone_activity_if_enabled(enabled, || {
                crate::platform::macos::mic_activity::input_device_in_use()
            });
            if previous != Some(current) {
                previous = Some(current);
                refresh_requested.notify_one();
            }
        }
    });
}

fn replace_agenda(
    app: &AppHandle<AppRuntime>,
    agenda: &parking_lot::RwLock<Vec<CalendarMeeting>>,
    next: Vec<CalendarMeeting>,
) {
    let changed = {
        let mut current = agenda.write();
        if *current == next {
            false
        } else {
            *current = next;
            true
        }
    };
    if changed {
        let settings = app.state::<AppState>().current_settings();
        if let Err(error) = crate::tray::refresh_tray_menu(app, &settings) {
            tracing::warn!("Failed to refresh Calendar agenda in the tray: {error}");
        }
    }
}

fn prune_dismissed_events(
    dismissed: &parking_lot::Mutex<HashSet<String>>,
    meetings: &[CalendarMeeting],
) {
    let current_ids = meetings
        .iter()
        .map(|meeting| meeting.id.as_str())
        .collect::<HashSet<_>>();
    dismissed
        .lock()
        .retain(|event_id| current_ids.contains(event_id.as_str()));
}

fn update_shared_state(
    app: &AppHandle<AppRuntime>,
    state: &parking_lot::RwLock<MeetingAwarenessState>,
    next: MeetingAwarenessState,
) {
    let mut current = state.write();
    if *current == next {
        return;
    }
    *current = next.clone();
    if let Err(error) = app.emit(EVENT_MEETING_AWARENESS_STATE, next) {
        tracing::warn!("Failed to emit meeting awareness state: {error}");
    }
}

fn commit_awareness_candidate(
    app: &AppHandle<AppRuntime>,
    state: &parking_lot::RwLock<MeetingAwarenessState>,
    candidate: MeetingAwarenessState,
    detected_dismissed: &AtomicBool,
    candidate_generation: u64,
    prompt_generation: &AtomicU64,
) -> (
    MeetingAwarenessPhase,
    Option<PromptIdentity>,
    MeetingAwarenessState,
) {
    let mut current = state.write();
    let previous_phase = current.phase;
    let previous_prompt = prompt_identity(&current);
    let next = honor_prompt_dismissal(
        candidate,
        detected_dismissed.load(Ordering::SeqCst),
        candidate_generation == prompt_generation.load(Ordering::SeqCst),
    );
    if *current != next {
        *current = next.clone();
        if let Err(error) = app.emit(EVENT_MEETING_AWARENESS_STATE, next.clone()) {
            tracing::warn!("Failed to emit meeting awareness state: {error}");
        }
    }
    (previous_phase, previous_prompt, next)
}

fn hide_prompt_if_safe(app: &AppHandle<AppRuntime>) {
    awareness_notification::hide(app);
    let state = app.state::<AppState>();
    if !dictation_busy(&state) && !state.meeting_capture().is_active() {
        if let Err(error) = pill::show_idle_sticky(app) {
            tracing::error!("Failed to restore Dictation after meeting prompt: {error}");
        }
    }
}

/// Soltar la tecla no acaba el dictado: quedan la transcripción y el pegado, y
/// durante esa cola `is_recording()` ya es `false`. Mirarlo solo a él dejaba
/// que el aviso se colara encima de una nota a medio terminar.
fn dictation_busy(state: &AppState) -> bool {
    // Solo cuenta el dictado en curso. `Error` y `Cancelled` se quedan puestos
    // hasta que alguien resetea la píldora, así que mirar "distinto de Idle"
    // dejaba que un dictado fallido silenciara el aviso para siempre.
    state.pill().is_recording()
        || matches!(
            state.pill().status(),
            crate::pill::PillStatus::Listening | crate::pill::PillStatus::Processing
        )
}

/// Lo que el aviso está enseñando. Dos estados con la misma identidad son el
/// mismo aviso: una reunión que pasa de `Upcoming` a `Ready` no reinicia su
/// cuenta atrás, porque para quien mira es la misma tarjeta.
#[derive(Clone, Debug, PartialEq, Eq)]
enum PromptIdentity {
    DetectedCall,
    Event(String),
}

fn prompt_identity(state: &MeetingAwarenessState) -> Option<PromptIdentity> {
    match (state.phase, state.meeting.as_ref()) {
        (MeetingAwarenessPhase::Idle, _) => None,
        (_, Some(meeting)) => Some(PromptIdentity::Event(meeting.id.clone())),
        (_, None) => Some(PromptIdentity::DetectedCall),
    }
}

fn prompt_needs_timeout(
    presented: bool,
    prompt: Option<&PromptIdentity>,
    timed_prompt: Option<&PromptIdentity>,
) -> bool {
    presented && prompt.is_some() && prompt != timed_prompt
}

/// Retira el aviso pasado su tiempo de vida, salvo que ya lo haya reemplazado
/// otro. Se marca como descartado para que el siguiente sondeo no lo levante
/// otra vez mientras la señal que lo provocó siga ahí: el micrófono abierto o
/// la reunión todavía en su ventana.
fn arm_prompt_timeout(
    app: &AppHandle<AppRuntime>,
    state: &Arc<parking_lot::RwLock<MeetingAwarenessState>>,
    dismissed_event_ids: &Arc<parking_lot::Mutex<HashSet<String>>>,
    detected_dismissed: &Arc<AtomicBool>,
    detected_generation: &Arc<AtomicU64>,
) {
    let token = detected_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    let state = Arc::clone(state);
    let dismissed_event_ids = Arc::clone(dismissed_event_ids);
    let detected_dismissed = Arc::clone(detected_dismissed);
    let detected_generation = Arc::clone(detected_generation);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(PROMPT_TTL_SECONDS)).await;
        if detected_generation.load(Ordering::SeqCst) != token {
            return;
        }
        let Some(showing) = prompt_identity(&state.read()) else {
            return;
        };
        match showing {
            PromptIdentity::Event(event_id) => {
                dismissed_event_ids.lock().insert(event_id);
                detected_dismissed.store(true, Ordering::SeqCst);
            }
            PromptIdentity::DetectedCall => {
                detected_dismissed.store(true, Ordering::SeqCst);
            }
        }
        update_shared_state(&app, &state, MeetingAwarenessState::default());
        hide_prompt_if_safe(&app);
    });
}

/// Todo lo que puede delatar una reunión, junto. Se agrupa en vez de pasarse
/// suelto porque la decisión tiene que vivir en un único sitio puro: si cada
/// fuente nueva añadiera su `if` al bucle, la lógica quedaría repartida entre
/// esta función y el hilo, y los tests dejarían de cubrir lo que pasa de
/// verdad. Añadir una fuente debe ser un campo más aquí, nada más.
pub(crate) struct AwarenessSignals<'a> {
    pub meetings: &'a [CalendarMeeting],
    /// Otra aplicación tiene el micrófono abierto: hay una llamada que nadie
    /// agendó. `None` cuando no se ha podido mirar, que no es lo mismo que
    /// saber que está libre.
    pub microphone_busy: Option<bool>,
    /// Ya rechazaste grabar esta llamada. El micrófono sigue abierto, así que
    /// la señal no ha cambiado; lo que cambió es que ya respondiste.
    pub detected_dismissed: bool,
}

/// El bucle ya sale antes cuando Looper está dictando o capturando una
/// reunión, así que aquí un micrófono ocupado siempre es de otra aplicación.
/// Fuera de macOS no hay forma de saberlo, y `None` lo dice sin inventárselo.
#[cfg(target_os = "macos")]
fn microphone_busy_excluding_self(_app: &AppHandle<AppRuntime>) -> Option<bool> {
    crate::platform::macos::mic_activity::input_device_in_use()
}

#[cfg(not(target_os = "macos"))]
fn microphone_busy_excluding_self(_app: &AppHandle<AppRuntime>) -> Option<bool> {
    None
}

fn microphone_activity_if_enabled(
    enabled: bool,
    probe: impl FnOnce() -> Option<bool>,
) -> Option<bool> {
    if !enabled {
        return None;
    }
    probe()
}

/// Solo una lectura explícita de micrófono libre termina el episodio. `None`
/// significa que CoreAudio no pudo responder; tratarlo como libre haría que
/// un aviso descartado reapareciera cuando la siguiente lectura volviera a
/// reportar el mismo uso activo.
fn refresh_detected_dismissal(
    detected_dismissed: &AtomicBool,
    microphone_busy: Option<bool>,
) {
    if microphone_busy == Some(false) {
        detected_dismissed.store(false, Ordering::SeqCst);
    }
}

/// El descarte puede ocurrir mientras el bucle ya calculó un candidato. Esta
/// comprobación se ejecuta bajo el mismo lock que publica el estado, de modo
/// que un candidato obsoleto nunca puede volver a abrir el aviso después de
/// que `dismiss` lo dejó en `Idle`.
fn honor_prompt_dismissal(
    candidate: MeetingAwarenessState,
    detected_dismissed: bool,
    generation_is_current: bool,
) -> MeetingAwarenessState {
    if !generation_is_current
        || (detected_dismissed && candidate.phase == MeetingAwarenessPhase::Detected)
    {
        return MeetingAwarenessState::default();
    }
    candidate
}

fn select_awareness_state(
    signals: AwarenessSignals<'_>,
    now: DateTime<Utc>,
    dismissed: &HashSet<String>,
) -> MeetingAwarenessState {
    let from_calendar = select_from_calendar(signals.meetings, now, dismissed);
    if from_calendar.phase != MeetingAwarenessPhase::Idle {
        // El evento gana: trae título y hora, así que el aviso puede decir de
        // qué reunión habla. Y al resolverse aquí, una reunión agendada que
        // además abre el micrófono sigue produciendo un solo aviso.
        return from_calendar;
    }

    if signals.microphone_busy == Some(true) && !signals.detected_dismissed {
        return MeetingAwarenessState {
            phase: MeetingAwarenessPhase::Detected,
            meeting: None,
            seconds_until_start: None,
        };
    }

    MeetingAwarenessState::default()
}

fn select_from_calendar(
    meetings: &[CalendarMeeting],
    now: DateTime<Utc>,
    dismissed: &HashSet<String>,
) -> MeetingAwarenessState {
    meetings
        .iter()
        .filter(|meeting| !dismissed.contains(&meeting.id))
        .filter_map(|meeting| {
            let starts = DateTime::parse_from_rfc3339(&meeting.started_at)
                .ok()?
                .with_timezone(&Utc);
            let ends = DateTime::parse_from_rfc3339(&meeting.ended_at)
                .ok()?
                .with_timezone(&Utc);
            let seconds_until_start = (starts - now).num_seconds();
            let latest_prompt = std::cmp::min(
                ends,
                starts + ChronoDuration::minutes(LATE_JOIN_WINDOW_MINUTES),
            );
            if seconds_until_start > REMINDER_LEAD_SECONDS || now > latest_prompt {
                return None;
            }

            Some(MeetingAwarenessState {
                phase: if seconds_until_start > 0 {
                    MeetingAwarenessPhase::Upcoming
                } else {
                    MeetingAwarenessPhase::Ready
                },
                meeting: Some(meeting.clone()),
                seconds_until_start: Some(seconds_until_start.max(0)),
            })
        })
        .next()
        .unwrap_or_default()
}

pub fn calendar_access_status() -> CalendarAccessStatus {
    platform::calendar_access_status()
}

pub fn request_calendar_access() -> bool {
    platform::request_calendar_access()
}

pub fn upcoming_calendar_meetings(now: DateTime<Utc>) -> Result<Vec<CalendarMeeting>, String> {
    platform::upcoming_calendar_meetings(
        now - ChronoDuration::minutes(15),
        now + ChronoDuration::days(AGENDA_WINDOW_DAYS),
    )
}

fn recurring_identity(
    event_identifier: &str,
    calendar_item_identifier: &str,
    external_identifier: &str,
    occurrence_timestamp: Option<i64>,
) -> (String, Option<String>, Option<String>) {
    let base_id = if event_identifier.is_empty() {
        calendar_item_identifier
    } else {
        event_identifier
    };
    let Some(occurrence_timestamp) = occurrence_timestamp else {
        return (base_id.to_string(), None, None);
    };
    let series_id = if external_identifier.is_empty() {
        calendar_item_identifier
    } else {
        external_identifier
    }
    .to_string();
    let occurrence_id = format!("{base_id}:{occurrence_timestamp}");
    (occurrence_id.clone(), Some(series_id), Some(occurrence_id))
}

fn retry_calendar_read<T>(
    attempts: usize,
    mut operation: impl FnMut() -> Result<T, String>,
    mut wait: impl FnMut(),
) -> Result<T, String> {
    let attempts = attempts.max(1);
    for attempt in 0..attempts {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error) if attempt + 1 == attempts => return Err(error),
            Err(_) => wait(),
        }
    }
    unreachable!("calendar retry loop always returns")
}

fn meeting_url(
    raw_url: Option<&str>,
    notes: Option<&str>,
    location: Option<&str>,
) -> Option<String> {
    raw_url
        .into_iter()
        .chain(notes)
        .chain(location)
        .flat_map(urls_in_text)
        .find(|candidate| is_meeting_url(candidate))
}

fn urls_in_text(text: &str) -> impl Iterator<Item = String> + '_ {
    static URL_PATTERN: OnceLock<Regex> = OnceLock::new();
    URL_PATTERN
        .get_or_init(|| Regex::new(r#"https?://[^\s<>\"']+"#).expect("valid URL pattern"))
        .find_iter(text)
        .map(|value| {
            value
                .as_str()
                .trim_end_matches(['.', ',', ';', ':', ')', ']', '}'])
                .to_string()
        })
}

fn is_meeting_url(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }

    let Some(host) = url.host_str().map(str::to_ascii_lowercase) else {
        return false;
    };
    let path = url.path().to_ascii_lowercase();
    let matches_domain = |domain: &str| host == domain || host.ends_with(&format!(".{domain}"));

    match host.as_str() {
        "meet.google.com" => true,
        "app.slack.com" => path.starts_with("/huddle/"),
        _ if matches_domain("zoom.us") => path.starts_with("/j/") || path.starts_with("/wc/"),
        _ => [
            "teams.microsoft.com",
            "teams.live.com",
            "webex.com",
            "whereby.com",
            "around.co",
        ]
        .iter()
        .any(|domain| matches_domain(domain)),
    }
}

#[cfg(target_os = "macos")]
#[path = "calendar_macos.rs"]
mod platform;

#[cfg(not(target_os = "macos"))]
#[path = "calendar_unsupported.rs"]
mod platform;

#[cfg(test)]
mod tests {
    use super::{
        honor_prompt_dismissal, is_meeting_url, meeting_url, microphone_activity_if_enabled,
        prompt_identity, prompt_needs_timeout, prune_dismissed_events, recurring_identity,
        refresh_detected_dismissal, retry_calendar_read, select_awareness_state,
        should_check_awareness, AwarenessSignals, CalendarMeeting, MeetingAwarenessManager,
        MeetingAwarenessPhase, MeetingAwarenessState, PromptIdentity,
    };
    use chrono::{Duration, TimeZone, Utc};
    use std::collections::HashSet;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;

    fn signals<'a>(
        meetings: &'a [CalendarMeeting],
        microphone_busy: Option<bool>,
    ) -> AwarenessSignals<'a> {
        AwarenessSignals {
            meetings,
            microphone_busy,
            detected_dismissed: false,
        }
    }

    fn event(start_offset_seconds: i64) -> CalendarMeeting {
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();
        CalendarMeeting {
            id: "event-1".into(),
            external_id: "series-1".into(),
            calendar_id: "work".into(),
            series_id: None,
            occurrence_id: None,
            title: "Product review".into(),
            started_at: (now + Duration::seconds(start_offset_seconds)).to_rfc3339(),
            ended_at: (now + Duration::hours(1)).to_rfc3339(),
            meeting_url: Some("https://meet.google.com/abc-defg-hij".into()),
            organizer: Some("Ada".into()),
            attendee_count: 3,
        }
    }

    #[test]
    fn the_same_meeting_getting_closer_does_not_restart_the_countdown() {
        // `Upcoming` pasa a `Ready` cuando la reunion empieza. Para quien mira
        // es la misma tarjeta, asi que rearmar el temporizador ahi la dejaria
        // en pantalla el doble de lo que dura la oferta.
        let upcoming = MeetingAwarenessState {
            phase: MeetingAwarenessPhase::Upcoming,
            meeting: Some(event(30)),
            seconds_until_start: Some(30),
        };
        let ready = MeetingAwarenessState {
            phase: MeetingAwarenessPhase::Ready,
            meeting: Some(event(0)),
            seconds_until_start: Some(0),
        };

        assert_eq!(prompt_identity(&upcoming), prompt_identity(&ready));
    }

    #[test]
    fn each_prompt_gets_its_own_countdown() {
        let detected = MeetingAwarenessState {
            phase: MeetingAwarenessPhase::Detected,
            meeting: None,
            seconds_until_start: None,
        };
        let mut other = event(30);
        other.id = "event-2".into();
        let second_meeting = MeetingAwarenessState {
            phase: MeetingAwarenessPhase::Upcoming,
            meeting: Some(other),
            seconds_until_start: Some(30),
        };
        let first_meeting = MeetingAwarenessState {
            phase: MeetingAwarenessPhase::Upcoming,
            meeting: Some(event(30)),
            seconds_until_start: Some(30),
        };

        assert_eq!(
            prompt_identity(&detected),
            Some(PromptIdentity::DetectedCall)
        );
        assert_ne!(prompt_identity(&first_meeting), prompt_identity(&detected));
        assert_ne!(
            prompt_identity(&first_meeting),
            prompt_identity(&second_meeting),
            "una reunion que releva a otra estrena cuenta atras"
        );
        assert_eq!(
            prompt_identity(&MeetingAwarenessState::default()),
            None,
            "sin aviso no hay nada que caducar"
        );
    }

    #[test]
    fn a_calendar_prompt_blocked_by_a_toast_keeps_its_timeout_pending() {
        let prompt = PromptIdentity::Event("event-1".into());

        assert!(!prompt_needs_timeout(false, Some(&prompt), None));
        assert!(prompt_needs_timeout(true, Some(&prompt), None));
    }

    #[test]
    fn a_presented_prompt_does_not_restart_its_timeout_on_refresh() {
        let prompt = PromptIdentity::Event("event-1".into());

        assert!(!prompt_needs_timeout(
            true,
            Some(&prompt),
            Some(&prompt),
        ));
        assert!(!prompt_needs_timeout(true, None, Some(&prompt)));
    }

    #[test]
    fn an_open_microphone_is_enough_to_offer_recording() {
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();

        let state = select_awareness_state(signals(&[], Some(true)), now, &HashSet::new());

        assert_eq!(state.phase, MeetingAwarenessPhase::Detected);
        assert!(
            state.meeting.is_none(),
            "no hay evento que nombrar en una reunion que nadie agendo"
        );
    }

    #[test]
    fn an_external_call_does_not_require_calendar_awareness() {
        assert!(should_check_awareness(false, true));
        assert!(should_check_awareness(true, false));
        assert!(!should_check_awareness(false, false));
    }

    #[test]
    fn disabled_microphone_awareness_does_not_probe_core_audio() {
        let calls = AtomicUsize::new(0);

        assert_eq!(
            microphone_activity_if_enabled(false, || {
                calls.fetch_add(1, Ordering::SeqCst);
                Some(true)
            }),
            None
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);

        assert_eq!(
            microphone_activity_if_enabled(true, || {
                calls.fetch_add(1, Ordering::SeqCst);
                Some(true)
            }),
            Some(true)
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_rejected_call_does_not_come_back_while_the_microphone_stays_open() {
        // El micrófono sigue ocupado, que es justo por lo que el aviso volvía
        // cada quince segundos despues de cerrarlo.
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();

        let state = select_awareness_state(
            AwarenessSignals {
                meetings: &[],
                microphone_busy: Some(true),
                detected_dismissed: true,
            },
            now,
            &HashSet::new(),
        );

        assert_eq!(state.phase, MeetingAwarenessPhase::Idle);
    }

    #[test]
    fn a_dismissed_microphone_episode_rearms_only_after_an_observed_idle_sample() {
        let dismissed = AtomicBool::new(true);

        refresh_detected_dismissal(&dismissed, Some(true));
        assert!(dismissed.load(Ordering::SeqCst));

        refresh_detected_dismissal(&dismissed, None);
        assert!(
            dismissed.load(Ordering::SeqCst),
            "una lectura desconocida no demuestra que el episodio terminó"
        );

        refresh_detected_dismissal(&dismissed, Some(true));
        assert!(dismissed.load(Ordering::SeqCst));

        refresh_detected_dismissal(&dismissed, Some(false));
        assert!(!dismissed.load(Ordering::SeqCst));

        let next_episode = select_awareness_state(
            AwarenessSignals {
                meetings: &[],
                microphone_busy: Some(true),
                detected_dismissed: dismissed.load(Ordering::SeqCst),
            },
            Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap(),
            &HashSet::new(),
        );
        assert_eq!(next_episode.phase, MeetingAwarenessPhase::Detected);
    }

    #[test]
    fn a_stale_candidate_cannot_reopen_after_dismiss() {
        let stale_candidate = MeetingAwarenessState {
            phase: MeetingAwarenessPhase::Detected,
            meeting: None,
            seconds_until_start: None,
        };

        assert_eq!(
            honor_prompt_dismissal(stale_candidate.clone(), true, true).phase,
            MeetingAwarenessPhase::Idle
        );
        assert_eq!(
            honor_prompt_dismissal(stale_candidate, false, true).phase,
            MeetingAwarenessPhase::Detected
        );

        let stale_calendar_candidate = MeetingAwarenessState {
            phase: MeetingAwarenessPhase::Upcoming,
            meeting: Some(event(30)),
            seconds_until_start: Some(30),
        };
        assert_eq!(
            honor_prompt_dismissal(stale_calendar_candidate.clone(), false, false).phase,
            MeetingAwarenessPhase::Idle
        );
        assert_eq!(
            honor_prompt_dismissal(stale_calendar_candidate, false, true).phase,
            MeetingAwarenessPhase::Upcoming
        );
    }

    #[test]
    fn a_scheduled_meeting_still_prompts_after_rejecting_a_detected_call() {
        // Rechazar la llamada sin agendar no puede silenciar una reunion que
        // si esta en el calendario.
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();

        let state = select_awareness_state(
            AwarenessSignals {
                meetings: &[event(30)],
                microphone_busy: Some(true),
                detected_dismissed: true,
            },
            now,
            &HashSet::new(),
        );

        assert_eq!(state.phase, MeetingAwarenessPhase::Upcoming);
    }

    #[test]
    fn a_quiet_microphone_offers_nothing() {
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();

        assert_eq!(
            select_awareness_state(signals(&[], Some(false)), now, &HashSet::new()).phase,
            MeetingAwarenessPhase::Idle
        );
    }

    #[test]
    fn not_being_able_to_check_the_microphone_is_not_a_meeting() {
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();

        assert_eq!(
            select_awareness_state(signals(&[], None), now, &HashSet::new()).phase,
            MeetingAwarenessPhase::Idle
        );
    }

    #[test]
    fn a_scheduled_meeting_wins_so_the_prompt_can_name_it() {
        // Las dos senales a la vez deben producir un solo aviso, y el del
        // calendario es el que puede decir de que reunion habla.
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();

        let state = select_awareness_state(signals(&[event(30)], Some(true)), now, &HashSet::new());

        assert_eq!(state.phase, MeetingAwarenessPhase::Upcoming);
        assert_eq!(
            state.meeting.map(|m| m.title).as_deref(),
            Some("Product review")
        );
    }

    #[test]
    fn a_dismissed_meeting_still_falls_through_to_the_microphone() {
        // Descartar el aviso del calendario no deberia silenciar la llamada
        // que de verdad esta sonando.
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();
        let mut dismissed = HashSet::new();
        dismissed.insert("event-1".to_string());

        let state = select_awareness_state(signals(&[event(30)], Some(true)), now, &dismissed);

        assert_eq!(state.phase, MeetingAwarenessPhase::Detected);
    }

    #[test]
    fn meeting_url_prefers_a_recognized_event_url() {
        assert_eq!(
            meeting_url(
                Some("https://meet.google.com/abc-defg-hij"),
                Some("Agenda https://docs.example.com/a"),
                None,
            )
            .as_deref(),
            Some("https://meet.google.com/abc-defg-hij")
        );
    }

    #[test]
    fn meeting_url_falls_back_to_notes_and_location() {
        assert_eq!(
            meeting_url(
                Some("https://calendar.google.com/event/123"),
                Some("Join: https://teams.microsoft.com/l/meetup-join/abc),"),
                Some("Room 3"),
            )
            .as_deref(),
            Some("https://teams.microsoft.com/l/meetup-join/abc")
        );
    }

    #[test]
    fn regular_links_do_not_become_meetings() {
        assert_eq!(
            meeting_url(None, Some("Agenda https://docs.example.com/a"), None),
            None
        );
        assert!(!is_meeting_url("https://example.com/zoom.us/j/123"));
        assert!(!is_meeting_url(
            "https://evil.example/?redirect=.zoom.us/j/123"
        ));
        assert!(!is_meeting_url(
            "https://evil.example/path/.meet.google.com/abc-defg-hij"
        ));
    }

    #[test]
    fn meeting_surfaces_one_minute_before_start() {
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();
        let state =
            select_awareness_state(signals(&[event(45)], Some(false)), now, &HashSet::new());
        assert_eq!(state.phase, MeetingAwarenessPhase::Upcoming);
        assert_eq!(state.seconds_until_start, Some(45));
    }

    #[test]
    fn meeting_remains_ready_during_late_join_window() {
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();
        let state = select_awareness_state(
            signals(&[event(-5 * 60)], Some(false)),
            now,
            &HashSet::new(),
        );
        assert_eq!(state.phase, MeetingAwarenessPhase::Ready);
    }

    #[test]
    fn dismissed_and_far_future_events_do_not_surface() {
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();
        let dismissed = HashSet::from(["event-1".to_string()]);
        assert_eq!(
            select_awareness_state(signals(&[event(30)], Some(false)), now, &dismissed).phase,
            MeetingAwarenessPhase::Idle
        );
        assert_eq!(
            select_awareness_state(signals(&[event(120)], Some(false)), now, &HashSet::new()).phase,
            MeetingAwarenessPhase::Idle
        );
    }

    #[test]
    fn explicit_dismissal_survives_awareness_state_changes() {
        let manager = MeetingAwarenessManager::default();
        manager.remember_dismissed_event("event-1");
        let now = Utc.with_ymd_and_hms(2026, 7, 21, 15, 0, 0).unwrap();

        assert_eq!(
            select_awareness_state(
                signals(&[event(30)], Some(false)),
                now,
                &manager.dismissed_event_ids.lock()
            )
            .phase,
            MeetingAwarenessPhase::Idle
        );
    }

    #[test]
    fn recurring_occurrences_get_unique_ids_and_share_a_series() {
        let first = recurring_identity("event", "calendar-item", "external", Some(100));
        let second = recurring_identity("event", "calendar-item", "external", Some(200));

        assert_eq!(first.1.as_deref(), Some("external"));
        assert_eq!(second.1, first.1);
        assert_ne!(first.0, second.0);
        assert_eq!(first.2.as_deref(), Some("event:100"));
    }

    #[test]
    fn one_off_events_keep_their_event_identifier() {
        assert_eq!(
            recurring_identity("event", "calendar-item", "external", None),
            ("event".to_string(), None, None)
        );
        assert_eq!(
            recurring_identity("", "calendar-item", "", None).0,
            "calendar-item"
        );
    }

    #[test]
    fn calendar_reads_retry_transient_failures_without_extra_attempts() {
        let calls = Arc::new(AtomicUsize::new(0));
        let attempts = Arc::clone(&calls);
        let result = retry_calendar_read(
            3,
            move || {
                let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                if attempt < 2 {
                    Err("temporary".to_string())
                } else {
                    Ok("ready")
                }
            },
            || {},
        );

        assert_eq!(result, Ok("ready"));
        assert_eq!(calls.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn dismissed_ids_are_pruned_after_events_leave_the_agenda() {
        let dismissed = parking_lot::Mutex::new(HashSet::from(["event-1".into(), "stale".into()]));
        prune_dismissed_events(&dismissed, &[event(30)]);

        assert_eq!(*dismissed.lock(), HashSet::from(["event-1".into()]));
    }
}
