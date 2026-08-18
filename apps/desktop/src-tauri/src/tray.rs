use crate::capture_pill::{CapturePillDockPosition, CapturePillPresentation};
use crate::library::meeting_commands::{
    join_calendar_meeting_from_menu, meeting_toggle_label, toggle_meeting_from_menu,
    MENU_ID_MEETING_TOGGLE,
};
use crate::recent_transcriptions::{
    build_recent_transcriptions_menu, copy_transcription_to_clipboard,
    MENU_ID_RECENT_TRANSCRIPTION_PREFIX,
};
use crate::settings::UserSettings;
use crate::speech::menu::{
    build_model_status_items, build_models_submenu, handle_speech_menu_event,
};
use crate::{audio, AppRuntime, AppState, SETTINGS_WINDOW_LABEL};
use chrono::{DateTime, Duration as ChronoDuration, Local, Utc};
use parking_lot::Mutex;
use std::sync::{atomic::Ordering, OnceLock};
#[cfg(target_os = "macos")]
use std::time::Duration;
use tauri::menu::{CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;

// On macOS, share mic constants with the app menu; on other platforms, define locally
#[cfg(target_os = "macos")]
use crate::platform::macos::menu::{MENU_ID_MIC_DEFAULT, MENU_ID_MIC_PREFIX};
#[cfg(not(target_os = "macos"))]
const MENU_ID_MIC_PREFIX: &str = "menu_mic_";
#[cfg(not(target_os = "macos"))]
const MENU_ID_MIC_DEFAULT: &str = "menu_mic_default";
const MENU_ID_CHECK_UPDATES: &str = "menu_check_updates";
const MENU_ID_FEATURE_LAB: &str = "menu_feature_lab";
const MENU_ID_CALENDAR_NEXT: &str = "menu_calendar_next";
const MENU_ID_CALENDAR_EMPTY: &str = "menu_calendar_empty";
const MENU_ID_CALENDAR_JOIN_PREFIX: &str = "menu_calendar_join:";
const MAX_CALENDAR_AGENDA_ITEMS: usize = 10;
const MAX_CALENDAR_TITLE_CHARS: usize = 30;
const CALENDAR_TITLE_HORIZON_HOURS: i64 = 24;
const MENU_ID_PILL_POSITION_PREFIX: &str = "menu_pill_position:";
const MENU_ID_PILL_PRESENTATION_PREFIX: &str = "menu_pill_presentation:";
const MENU_ID_DICTATION_LANGUAGE_PREFIX: &str = "menu_dictation_language:";
pub(crate) const EVENT_SETTINGS_RENDERER_READY: &str = "settings:renderer_ready";

#[cfg(target_os = "macos")]
const BACKGROUND_SURFACE_RESTORE_DELAY_MS: u64 = 120;

const EVENT_NAVIGATE_ABOUT: &str = "navigate:about";
const EVENT_NAVIGATE_SETTINGS: &str = "navigate:settings";
const EVENT_NAVIGATE_HISTORY: &str = "navigate:history";
const EVENT_NAVIGATE_MODELS: &str = "navigate:models";
const EVENT_NAVIGATE_FEATURE_LAB: &str = "navigate:feature-lab";

#[derive(Clone, Copy)]
enum SettingsNavigationTarget {
    General,
    About,
    History,
    Models,
    FeatureLab,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CalendarAgendaEntry {
    event_id: String,
    label: String,
}

struct CalendarWindow<'a> {
    meeting: &'a crate::meeting_awareness::CalendarMeeting,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
}

impl<'a> CalendarWindow<'a> {
    fn parse(meeting: &'a crate::meeting_awareness::CalendarMeeting) -> Option<Self> {
        Some(Self {
            meeting,
            starts_at: DateTime::parse_from_rfc3339(&meeting.started_at)
                .ok()?
                .with_timezone(&Utc),
            ends_at: DateTime::parse_from_rfc3339(&meeting.ended_at)
                .ok()?
                .with_timezone(&Utc),
        })
    }

    fn belongs_to_agenda(&self, now: DateTime<Utc>, horizon: DateTime<Utc>) -> bool {
        self.ends_at > now && self.starts_at <= horizon
    }

    fn is_active(&self, now: DateTime<Utc>) -> bool {
        self.starts_at <= now && self.ends_at > now
    }

    fn starts_within(&self, now: DateTime<Utc>, horizon: DateTime<Utc>) -> bool {
        self.starts_at > now && self.starts_at <= horizon
    }
}

fn calendar_windows(
    meetings: &[crate::meeting_awareness::CalendarMeeting],
) -> Vec<CalendarWindow<'_>> {
    meetings.iter().filter_map(CalendarWindow::parse).collect()
}

fn calendar_agenda_entries(
    meetings: &[crate::meeting_awareness::CalendarMeeting],
    now: DateTime<Utc>,
) -> Vec<CalendarAgendaEntry> {
    let horizon = now + ChronoDuration::days(7);
    let mut upcoming = calendar_windows(meetings)
        .into_iter()
        .filter(|window| window.belongs_to_agenda(now, horizon))
        .collect::<Vec<_>>();
    upcoming.sort_by_key(|window| window.starts_at);
    upcoming
        .into_iter()
        .take(MAX_CALENDAR_AGENDA_ITEMS)
        .map(|window| CalendarAgendaEntry {
            event_id: window.meeting.id.clone(),
            label: calendar_agenda_label(&window.meeting.title, window.starts_at, now),
        })
        .collect()
}

fn calendar_agenda_label(title: &str, starts_at: DateTime<Utc>, now: DateTime<Utc>) -> String {
    let starts_local = starts_at.with_timezone(&Local);
    let now_local = now.with_timezone(&Local);
    let day = if starts_local.date_naive() == now_local.date_naive() {
        "Today".to_string()
    } else if starts_local.date_naive() == now_local.date_naive() + ChronoDuration::days(1) {
        "Tomorrow".to_string()
    } else {
        starts_local.format("%a %b %-d").to_string()
    };
    format!(
        "{day} {} · {}",
        starts_local.format("%H:%M"),
        truncate_calendar_title(title, 42)
    )
}

fn truncate_calendar_title(title: &str, max_chars: usize) -> String {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    let title = if title.is_empty() {
        "Untitled meeting".to_string()
    } else {
        title
    };
    if title.chars().count() <= max_chars {
        return title;
    }
    let mut truncated = title
        .chars()
        .take(max_chars.saturating_sub(1))
        .collect::<String>();
    truncated.push('…');
    truncated
}

fn calendar_menu_bar_title(
    meetings: &[crate::meeting_awareness::CalendarMeeting],
    now: DateTime<Utc>,
) -> Option<String> {
    let windows = calendar_windows(meetings);
    if let Some(active) = windows
        .iter()
        .filter(|window| window.is_active(now))
        .min_by_key(|window| window.ends_at)
    {
        let suffix = format!(
            " • {} left",
            compact_calendar_duration(active.ends_at - now)
        );
        return Some(compact_calendar_title(&active.meeting.title, &suffix));
    }

    let horizon = now + ChronoDuration::hours(CALENDAR_TITLE_HORIZON_HOURS);
    let next = windows
        .iter()
        .filter(|window| window.starts_within(now, horizon))
        .min_by_key(|window| window.starts_at)?;
    let suffix = format!(" • in {}", compact_calendar_duration(next.starts_at - now));
    Some(compact_calendar_title(&next.meeting.title, &suffix))
}

fn compact_calendar_title(title: &str, suffix: &str) -> String {
    let title_limit = MAX_CALENDAR_TITLE_CHARS.saturating_sub(suffix.chars().count());
    format!("{}{suffix}", truncate_calendar_title(title, title_limit))
}

fn compact_calendar_duration(duration: ChronoDuration) -> String {
    let seconds = duration.num_seconds().max(1) as u64;
    if seconds < 60 {
        return format!("{seconds}s");
    }
    let minutes = seconds / 60;
    if minutes < 60 {
        return format!("{minutes}m");
    }
    let hours = minutes / 60;
    let remaining_minutes = minutes % 60;
    if remaining_minutes == 0 {
        format!("{hours}h")
    } else {
        format!("{hours}h {remaining_minutes}m")
    }
}

impl SettingsNavigationTarget {
    fn event_name(self) -> &'static str {
        match self {
            Self::General => EVENT_NAVIGATE_SETTINGS,
            Self::About => EVENT_NAVIGATE_ABOUT,
            Self::History => EVENT_NAVIGATE_HISTORY,
            Self::Models => EVENT_NAVIGATE_MODELS,
            Self::FeatureLab => EVENT_NAVIGATE_FEATURE_LAB,
        }
    }
}

#[derive(Default)]
struct PendingSettingsNavigation {
    renderer_ready: bool,
    target: Option<SettingsNavigationTarget>,
}

fn pending_settings_navigation() -> &'static Mutex<PendingSettingsNavigation> {
    static PENDING: OnceLock<Mutex<PendingSettingsNavigation>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(PendingSettingsNavigation::default()))
}

fn flush_pending_settings_navigation(app: &AppHandle<AppRuntime>) {
    let target = {
        let mut pending = pending_settings_navigation().lock();
        if !pending.renderer_ready {
            return;
        }
        pending.target.take()
    };

    if let Some(target) = target {
        let _ = app.emit(target.event_name(), ());
    }
}

#[cfg(test)]
mod navigation_tests {
    use super::*;

    #[test]
    fn general_settings_uses_the_settings_navigation_event() {
        assert_eq!(
            SettingsNavigationTarget::General.event_name(),
            EVENT_NAVIGATE_SETTINGS
        );
    }

    #[test]
    fn pill_position_menu_ids_use_the_four_supported_centers() {
        assert!(matches!(
            TrayAction::decode("menu_pill_position:top_center"),
            TrayAction::PillPosition(CapturePillDockPosition::TopCenter)
        ));
        assert!(matches!(
            TrayAction::decode("menu_pill_position:bottom_left"),
            TrayAction::Ignore
        ));
    }
}

#[cfg(test)]
mod calendar_agenda_tests {
    use super::*;
    use chrono::TimeZone;

    fn meeting(
        id: &str,
        starts_at: DateTime<Utc>,
        ends_at: DateTime<Utc>,
    ) -> crate::meeting_awareness::CalendarMeeting {
        crate::meeting_awareness::CalendarMeeting {
            id: id.to_string(),
            external_id: String::new(),
            calendar_id: "work".to_string(),
            series_id: None,
            occurrence_id: None,
            title: format!("Meeting {id}"),
            started_at: starts_at.to_rfc3339(),
            ended_at: ends_at.to_rfc3339(),
            meeting_url: Some("https://meet.google.com/abc-defg-hij".to_string()),
            organizer: None,
            attendee_count: 0,
        }
    }

    #[test]
    fn agenda_keeps_active_and_future_meetings_in_start_order() {
        let now = Utc.with_ymd_and_hms(2026, 7, 23, 15, 0, 0).unwrap();
        let meetings = vec![
            meeting(
                "later",
                now + ChronoDuration::hours(2),
                now + ChronoDuration::hours(3),
            ),
            meeting(
                "ended",
                now - ChronoDuration::hours(2),
                now - ChronoDuration::hours(1),
            ),
            meeting(
                "active",
                now - ChronoDuration::minutes(5),
                now + ChronoDuration::minutes(25),
            ),
        ];

        let entries = calendar_agenda_entries(&meetings, now);
        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.event_id.as_str())
                .collect::<Vec<_>>(),
            vec!["active", "later"]
        );
    }

    #[test]
    fn agenda_omits_meetings_beyond_seven_days() {
        let now = Utc.with_ymd_and_hms(2026, 7, 23, 15, 0, 0).unwrap();
        let entries = calendar_agenda_entries(
            &[meeting(
                "far",
                now + ChronoDuration::days(8),
                now + ChronoDuration::days(8) + ChronoDuration::hours(1),
            )],
            now,
        );
        assert!(entries.is_empty());
    }

    #[test]
    fn agenda_labels_bound_long_titles() {
        let title = "A very long calendar meeting title that should not take over the tray menu";
        let truncated = truncate_calendar_title(title, 24);

        assert_eq!(truncated.chars().count(), 24);
        assert!(truncated.ends_with('…'));
    }

    #[test]
    fn menu_bar_prefers_an_active_meeting() {
        let now = Utc.with_ymd_and_hms(2026, 7, 23, 15, 0, 0).unwrap();
        let meetings = vec![
            meeting(
                "active",
                now - ChronoDuration::minutes(5),
                now + ChronoDuration::minutes(10),
            ),
            meeting(
                "next",
                now + ChronoDuration::minutes(1),
                now + ChronoDuration::minutes(30),
            ),
        ];

        assert_eq!(
            calendar_menu_bar_title(&meetings, now),
            Some("Meeting active • 10m left".to_string())
        );
    }

    #[test]
    fn menu_bar_shows_only_the_next_day_and_bounds_its_title() {
        let now = Utc.with_ymd_and_hms(2026, 7, 23, 15, 0, 0).unwrap();
        let mut next = meeting(
            "next",
            now + ChronoDuration::minutes(5),
            now + ChronoDuration::minutes(35),
        );
        next.title = "A very long recurring product planning meeting".to_string();
        let far = meeting(
            "far",
            now + ChronoDuration::hours(25),
            now + ChronoDuration::hours(26),
        );

        let title = calendar_menu_bar_title(&[far, next], now).unwrap();
        assert_eq!(title.chars().count(), MAX_CALENDAR_TITLE_CHARS);
        assert!(title.ends_with(" • in 5m"));
    }
}

pub(crate) fn mark_settings_renderer_ready(app: &AppHandle<AppRuntime>) {
    pending_settings_navigation().lock().renderer_ready = true;
    flush_pending_settings_navigation(app);
}

fn queue_settings_navigation(target: SettingsNavigationTarget) {
    let mut pending = pending_settings_navigation().lock();
    pending.target = Some(target);
}

fn open_settings_navigation(
    app: &AppHandle<AppRuntime>,
    target: SettingsNavigationTarget,
) -> tauri::Result<()> {
    queue_settings_navigation(target);
    if let Err(err) = toggle_settings_window(app) {
        let mut pending = pending_settings_navigation().lock();
        pending.target = None;
        return Err(err);
    }
    flush_pending_settings_navigation(app);
    Ok(())
}

pub(crate) fn open_settings_about(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    open_settings_navigation(app, SettingsNavigationTarget::About)
}

pub(crate) fn open_settings_general(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    open_settings_navigation(app, SettingsNavigationTarget::General)
}

pub(crate) fn open_settings_history(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    open_settings_navigation(app, SettingsNavigationTarget::History)
}

pub(crate) fn open_settings_models(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    open_settings_navigation(app, SettingsNavigationTarget::Models)
}

pub(crate) fn open_settings_feature_lab(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    open_settings_navigation(app, SettingsNavigationTarget::FeatureLab)
}

enum MicrophoneMenuEntry {
    Choice {
        id: String,
        label: String,
        checked: bool,
    },
    Notice {
        id: &'static str,
        label: String,
    },
}

fn microphone_menu_entries(
    settings: &UserSettings,
    devices: &[audio::DeviceInfo],
) -> Vec<MicrophoneMenuEntry> {
    let mut entries = vec![MicrophoneMenuEntry::Choice {
        id: MENU_ID_MIC_DEFAULT.to_string(),
        label: "System Default".to_string(),
        checked: settings.microphone_device.is_none(),
    }];
    if devices.is_empty() {
        entries.push(MicrophoneMenuEntry::Notice {
            id: "menu_mic_none",
            label: "No input devices found".to_string(),
        });
        return entries;
    }

    entries.extend(devices.iter().map(|device| MicrophoneMenuEntry::Choice {
        id: format!("{MENU_ID_MIC_PREFIX}dev:{}", device.id),
        label: if device.is_default {
            format!("{} (Default)", device.name)
        } else {
            device.name.clone()
        },
        checked: settings.microphone_device.as_deref() == Some(device.id.as_str()),
    }));
    entries
}

fn build_microphone_submenu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<tauri::menu::Submenu<AppRuntime>> {
    let entries = match audio::list_input_devices() {
        Ok(devices) => microphone_menu_entries(settings, &devices),
        Err(error) => vec![MicrophoneMenuEntry::Notice {
            id: "menu_mic_error",
            label: format!("Microphone unavailable ({error})"),
        }],
    };
    let mut menu = SubmenuBuilder::new(app, "Microphone");
    for entry in entries {
        match entry {
            MicrophoneMenuEntry::Choice { id, label, checked } => {
                let item = CheckMenuItemBuilder::with_id(id, label)
                    .checked(checked)
                    .build(app)?;
                menu = menu.item(&item);
            }
            MicrophoneMenuEntry::Notice { id, label } => {
                let item = MenuItem::with_id(app, id, label, false, None::<&str>)?;
                menu = menu.item(&item);
            }
        }
    }
    menu.build()
}

fn build_tray_menu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<Menu<AppRuntime>> {
    let mut menu = MenuBuilder::new(app);

    let check_updates = MenuItem::with_id(
        app,
        MENU_ID_CHECK_UPDATES,
        "Check for Updates",
        true,
        None::<&str>,
    )?;
    menu = menu.item(&check_updates);
    menu = menu.separator();
    let meeting_toggle = MenuItem::with_id(
        app,
        MENU_ID_MEETING_TOGGLE,
        meeting_toggle_label(&app.state::<AppState>()),
        true,
        None::<&str>,
    )?;
    menu = menu.item(&meeting_toggle);
    if settings.calendar_meeting_awareness_enabled {
        let state = app.state::<AppState>();
        let entries = calendar_agenda_entries(&state.meeting_awareness().agenda(), Utc::now());
        let recording_meeting = state.meeting_capture().is_active();
        if let Some(next) = entries.first() {
            let next_item = MenuItem::with_id(
                app,
                MENU_ID_CALENDAR_NEXT,
                format!("Next · {}", next.label),
                false,
                None::<&str>,
            )?;
            menu = menu.item(&next_item);
        }

        let mut agenda = SubmenuBuilder::new(app, format!("Upcoming meetings ({})", entries.len()));
        if entries.is_empty() {
            let empty = MenuItem::with_id(
                app,
                MENU_ID_CALENDAR_EMPTY,
                "No meetings in the next 7 days",
                false,
                None::<&str>,
            )?;
            agenda = agenda.item(&empty);
        } else {
            for entry in entries {
                let item = MenuItem::with_id(
                    app,
                    format!("{MENU_ID_CALENDAR_JOIN_PREFIX}{}", entry.event_id),
                    format!("Join · {}", entry.label),
                    !recording_meeting,
                    None::<&str>,
                )?;
                agenda = agenda.item(&item);
            }
        }
        menu = menu.item(&agenda.build()?);
    }
    menu = menu.item(&build_capture_pill_submenu(app, settings)?);
    menu = menu.item(&build_dictation_language_submenu(app, settings)?);
    if cfg!(debug_assertions) {
        let feature_lab =
            MenuItem::with_id(app, MENU_ID_FEATURE_LAB, "Feature Lab", true, None::<&str>)?;
        menu = menu.item(&feature_lab);
    }
    menu = menu.separator();
    let status_items = build_model_status_items(app, settings)?;
    for item in &status_items {
        menu = menu.item(item);
    }
    if !status_items.is_empty() {
        menu = menu.separator();
    }

    // TODO: add back Mode submenu when cloud is added.
    // let mode_submenu = SubmenuBuilder::new(app, "Mode") ...

    menu = menu.item(&build_models_submenu(app, settings)?);

    menu = menu.item(&build_microphone_submenu(app, settings)?);
    #[cfg(debug_assertions)]
    {
        menu = menu.separator();
        menu = menu.item(&crate::qa_lab::build_submenu(app)?);
    }

    menu = menu.separator();
    let recent_submenu = build_recent_transcriptions_menu(app, "Last Transcriptions")?;
    menu = menu.item(&recent_submenu);
    menu = menu.separator();

    let open_settings = MenuItem::with_id(app, "open_settings", "Open Looper", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit_looper", "Quit Looper", true, None::<&str>)?;
    menu = menu.item(&open_settings).item(&quit);

    menu.build()
}

fn build_capture_pill_submenu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<tauri::menu::Submenu<AppRuntime>> {
    let mut capture_pill = SubmenuBuilder::new(app, "Capture Pill");
    for (label, value, presentation) in [
        ("Dock", "dock", CapturePillPresentation::Dock),
        ("Floating", "floating", CapturePillPresentation::Floating),
    ] {
        let item = CheckMenuItemBuilder::with_id(
            format!("{MENU_ID_PILL_PRESENTATION_PREFIX}{value}"),
            label,
        )
        .checked(settings.capture_pill_presentation == presentation)
        .build(app)?;
        capture_pill = capture_pill.item(&item);
    }

    let mut position = SubmenuBuilder::new(app, "Dock Position");
    for (label, dock_position) in [
        ("Top Center", CapturePillDockPosition::TopCenter),
        ("Left Center", CapturePillDockPosition::LeftCenter),
        ("Right Center", CapturePillDockPosition::RightCenter),
        ("Bottom Center", CapturePillDockPosition::BottomCenter),
    ] {
        let item = CheckMenuItemBuilder::with_id(
            format!(
                "{MENU_ID_PILL_POSITION_PREFIX}{}",
                dock_position.menu_value()
            ),
            label,
        )
        .checked(
            settings.capture_pill_presentation == CapturePillPresentation::Dock
                && settings.capture_pill_dock_position == dock_position,
        )
        .build(app)?;
        position = position.item(&item);
    }

    capture_pill.item(&position.build()?).build()
}

fn build_dictation_language_submenu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<tauri::menu::Submenu<AppRuntime>> {
    let mut language = SubmenuBuilder::new(app, "Dictation Language");
    for (label, code) in [("Español", "es"), ("English", "en"), ("Português", "pt")] {
        let item = CheckMenuItemBuilder::with_id(
            format!("{MENU_ID_DICTATION_LANGUAGE_PREFIX}{code}"),
            label,
        )
        .checked(settings.language == code)
        .build(app)?;
        language = language.item(&item);
    }
    language.build()
}

pub(crate) fn refresh_tray_menu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    if let Some(tray) = state.tray.lock().clone() {
        let menu = build_tray_menu(app, settings)?;
        tray.set_menu(Some(menu))?;
        set_calendar_tray_title(&tray, settings, state.meeting_awareness().agenda())?;
    }
    Ok(())
}

pub(crate) fn refresh_calendar_tray_title(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    if let Some(tray) = state.tray.lock().clone() {
        set_calendar_tray_title(&tray, settings, state.meeting_awareness().agenda())?;
    }
    Ok(())
}

fn set_calendar_tray_title(
    tray: &TrayIcon<AppRuntime>,
    settings: &UserSettings,
    meetings: Vec<crate::meeting_awareness::CalendarMeeting>,
) -> tauri::Result<()> {
    let title = settings
        .calendar_meeting_awareness_enabled
        .then(|| calendar_menu_bar_title(&meetings, Utc::now()))
        .flatten()
        .unwrap_or_default();
    tray.set_title(Some(title))
}

fn refresh_speech_menus(app: &AppHandle<AppRuntime>, settings: &UserSettings) {
    if let Err(err) = refresh_tray_menu(app, settings) {
        tracing::error!("Failed to refresh tray menu: {err}");
    }
    #[cfg(target_os = "macos")]
    if let Err(err) = crate::set_app_menu(app, settings) {
        tracing::error!("Failed to refresh app menu: {err}");
    }
}

fn set_microphone_from_menu(app: &AppHandle<AppRuntime>, device_id: Option<&str>) {
    let state = app.state::<AppState>();
    let mut settings = state.current_settings();
    if settings.microphone_device.as_deref() == device_id {
        return;
    }
    settings.microphone_device = device_id.map(|id| id.to_string());
    match state.persist_settings(settings.clone()) {
        Ok(saved) => {
            refresh_speech_menus(app, &saved);
            if let Err(err) = app.emit(crate::EVENT_SETTINGS_CHANGED, &saved) {
                tracing::error!("Failed to emit settings change: {err}");
            }
        }
        Err(err) => tracing::error!("Failed to update microphone selection: {err}"),
    }
}

enum TrayAction<'a> {
    MeetingToggle,
    DefaultMicrophone,
    CheckUpdates,
    FeatureLab,
    PillPosition(CapturePillDockPosition),
    PillPresentation(CapturePillPresentation),
    DictationLanguage(&'static str),
    JoinCalendar(&'a str),
    CopyTranscription(&'a str),
    SelectMicrophone(&'a str),
    Ignore,
}

impl<'a> TrayAction<'a> {
    fn decode(id: &'a str) -> Self {
        match id {
            MENU_ID_MEETING_TOGGLE => return Self::MeetingToggle,
            MENU_ID_MIC_DEFAULT => return Self::DefaultMicrophone,
            MENU_ID_CHECK_UPDATES => return Self::CheckUpdates,
            MENU_ID_FEATURE_LAB => return Self::FeatureLab,
            _ => {}
        }

        if let Some(value) = id.strip_prefix(MENU_ID_PILL_POSITION_PREFIX) {
            return match value {
                "top_center" => Self::PillPosition(CapturePillDockPosition::TopCenter),
                "left_center" => Self::PillPosition(CapturePillDockPosition::LeftCenter),
                "right_center" => Self::PillPosition(CapturePillDockPosition::RightCenter),
                "bottom_center" => Self::PillPosition(CapturePillDockPosition::BottomCenter),
                _ => Self::Ignore,
            };
        }
        if let Some(value) = id.strip_prefix(MENU_ID_PILL_PRESENTATION_PREFIX) {
            return match value {
                "dock" => Self::PillPresentation(CapturePillPresentation::Dock),
                "floating" => Self::PillPresentation(CapturePillPresentation::Floating),
                _ => Self::Ignore,
            };
        }
        if let Some(value) = id.strip_prefix(MENU_ID_DICTATION_LANGUAGE_PREFIX) {
            return match value {
                "es" => Self::DictationLanguage("es"),
                "en" => Self::DictationLanguage("en"),
                "pt" => Self::DictationLanguage("pt"),
                _ => Self::Ignore,
            };
        }
        if let Some(event_id) = id.strip_prefix(MENU_ID_CALENDAR_JOIN_PREFIX) {
            return Self::JoinCalendar(event_id);
        }
        if let Some(transcription_id) = id.strip_prefix(MENU_ID_RECENT_TRANSCRIPTION_PREFIX) {
            return Self::CopyTranscription(transcription_id);
        }
        if let Some(device_id) = id.strip_prefix(MENU_ID_MIC_PREFIX) {
            return Self::SelectMicrophone(device_id.strip_prefix("dev:").unwrap_or(device_id));
        }
        Self::Ignore
    }
}

fn handle_tray_menu_event(app: &AppHandle<AppRuntime>, id: &str) {
    if let Some(saved) = handle_speech_menu_event(app, id) {
        refresh_speech_menus(app, &saved);
        return;
    }

    match TrayAction::decode(id) {
        TrayAction::MeetingToggle => toggle_meeting_from_menu(app),
        TrayAction::DefaultMicrophone => set_microphone_from_menu(app, None),
        TrayAction::CheckUpdates => {
            if let Err(err) = open_settings_about(app) {
                tracing::error!("Failed to open settings for update check: {err}");
            }
        }
        TrayAction::FeatureLab => {
            if let Err(err) = open_settings_feature_lab(app) {
                tracing::error!("Failed to open Feature Lab: {err}");
            }
        }
        TrayAction::PillPosition(position) => {
            update_capture_pill_settings(app, |settings| {
                settings.capture_pill_presentation = CapturePillPresentation::Dock;
                settings.capture_pill_dock_position = position;
            });
        }
        TrayAction::PillPresentation(presentation) => {
            update_capture_pill_settings(app, |settings| {
                settings.capture_pill_presentation = presentation;
            });
        }
        TrayAction::DictationLanguage(language) => {
            update_capture_pill_settings(app, |settings| {
                settings.language = language.to_string();
            });
        }
        TrayAction::JoinCalendar(event_id) => join_calendar_meeting_from_menu(app, event_id),
        TrayAction::CopyTranscription(transcription_id) => {
            copy_transcription_to_clipboard(app, transcription_id)
        }
        TrayAction::SelectMicrophone(device_id) => set_microphone_from_menu(app, Some(device_id)),
        TrayAction::Ignore => {}
    }
}

fn update_capture_pill_settings(
    app: &AppHandle<AppRuntime>,
    mutate: impl FnOnce(&mut UserSettings),
) {
    let state = app.state::<AppState>();
    match state.persist_settings_with(|_, settings| mutate(settings)) {
        Ok((_, saved)) => {
            state.emit_settings_changed(app, &saved);
            crate::pill::emit_capture_pill_preferences(app, &saved);
            refresh_speech_menus(app, &saved);
            if let Err(error) = crate::pill::show_idle_sticky(app) {
                tracing::error!("Failed to update Capture pill: {error}");
            }
        }
        Err(error) => tracing::error!("Failed to save Capture pill preference: {error}"),
    }
}

#[cfg(test)]
mod capture_pill_menu_tests {
    use super::*;

    #[test]
    fn parses_every_capture_pill_menu_choice() {
        assert!(matches!(
            TrayAction::decode(&format!("{MENU_ID_PILL_PRESENTATION_PREFIX}dock")),
            TrayAction::PillPresentation(CapturePillPresentation::Dock)
        ));
        assert!(matches!(
            TrayAction::decode(&format!("{MENU_ID_PILL_PRESENTATION_PREFIX}floating")),
            TrayAction::PillPresentation(CapturePillPresentation::Floating)
        ));

        for (value, expected) in [
            ("top_center", CapturePillDockPosition::TopCenter),
            ("left_center", CapturePillDockPosition::LeftCenter),
            ("right_center", CapturePillDockPosition::RightCenter),
            ("bottom_center", CapturePillDockPosition::BottomCenter),
        ] {
            match TrayAction::decode(&format!("{MENU_ID_PILL_POSITION_PREFIX}{value}")) {
                TrayAction::PillPosition(actual) => assert_eq!(actual, expected),
                _ => panic!("expected a supported Capture Pill position"),
            }
        }
    }

    #[test]
    fn dictation_language_menu_is_limited_to_the_supported_trio() {
        for language in ["es", "en", "pt"] {
            assert!(matches!(
                TrayAction::decode(&format!("{MENU_ID_DICTATION_LANGUAGE_PREFIX}{language}")),
                TrayAction::DictationLanguage(parsed) if parsed == language
            ));
        }
        assert!(matches!(
            TrayAction::decode(&format!("{MENU_ID_DICTATION_LANGUAGE_PREFIX}fr")),
            TrayAction::Ignore
        ));
    }

    #[test]
    fn menu_prefixes_keep_their_action_payloads() {
        assert!(matches!(
            TrayAction::decode("menu_calendar_join:event-7"),
            TrayAction::JoinCalendar("event-7")
        ));
        assert!(matches!(
            TrayAction::decode("menu_recent_transcription_entry-2"),
            TrayAction::CopyTranscription("entry-2")
        ));
        assert!(matches!(
            TrayAction::decode("menu_mic_dev:device-9"),
            TrayAction::SelectMicrophone("device-9")
        ));
    }

    #[test]
    fn microphone_menu_marks_the_selected_device_and_default_hardware() {
        let settings = UserSettings {
            microphone_device: Some("usb-mic".to_string()),
            ..UserSettings::default()
        };
        let entries = microphone_menu_entries(
            &settings,
            &[
                audio::DeviceInfo {
                    id: "built-in".to_string(),
                    name: "MacBook Microphone".to_string(),
                    is_default: true,
                },
                audio::DeviceInfo {
                    id: "usb-mic".to_string(),
                    name: "USB Microphone".to_string(),
                    is_default: false,
                },
            ],
        );

        assert!(matches!(
            &entries[0],
            MicrophoneMenuEntry::Choice { id, checked: false, .. } if id == MENU_ID_MIC_DEFAULT
        ));
        assert!(matches!(
            &entries[1],
            MicrophoneMenuEntry::Choice { label, checked: false, .. } if label == "MacBook Microphone (Default)"
        ));
        assert!(matches!(
            &entries[2],
            MicrophoneMenuEntry::Choice { id, checked: true, .. } if id == "menu_mic_dev:usb-mic"
        ));
    }
}

pub fn build_tray(app: &AppHandle<AppRuntime>) -> tauri::Result<TrayIcon<AppRuntime>> {
    let settings = app.state::<AppState>().current_settings();
    let menu = build_tray_menu(app, &settings)?;

    let builder = TrayIconBuilder::new();

    #[cfg(target_os = "macos")]
    let builder = {
        let icon_bytes = include_bytes!("../icons/tray.png");
        let icon = tauri::image::Image::from_bytes(icon_bytes)?.to_owned();
        builder.icon(icon).icon_as_template(true)
    };

    #[cfg(target_os = "windows")]
    let builder = match app.default_window_icon() {
        Some(icon) => builder.icon(icon.clone()),
        None => builder,
    };

    let tray = builder
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_settings" => {
                if let Err(err) = toggle_settings_window(app) {
                    tracing::error!("Failed to open settings window: {err}");
                }
            }
            "quit_looper" => {
                app.exit(0);
            }
            other => handle_tray_menu_event(app, other),
        })
        .build(app)?;
    set_calendar_tray_title(
        &tray,
        &settings,
        app.state::<AppState>().meeting_awareness().agenda(),
    )?;
    Ok(tray)
}

pub fn toggle_settings_window(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    let mut reset_close_flag = false;

    let window = if let Some(existing) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        existing
    } else {
        reset_close_flag = true;
        let builder = WebviewWindowBuilder::new(app, SETTINGS_WINDOW_LABEL, WebviewUrl::default())
            .title("Looper")
            .inner_size(900.0, 750.0)
            .min_inner_size(900.0, 750.0)
            .resizable(true)
            .visible(false);

        #[cfg(target_os = "macos")]
        let builder = builder.hidden_title(true);

        #[cfg(target_os = "windows")]
        let builder = builder.decorations(false);

        builder.build()?
    };

    if reset_close_flag {
        state
            .settings_close_handler_registered
            .store(false, Ordering::SeqCst);
    }

    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(ActivationPolicy::Regular);

    if window.is_minimized().unwrap_or(false) {
        window.unminimize()?;
    }
    window.show()?;
    window.set_focus()?;

    // Show a toast if the app just restarted via auto-update
    if state.take_auto_update_completed() {
        let current_version = env!("CARGO_PKG_VERSION");
        crate::toast::emit_toast(
            app,
            crate::toast::Payload {
                toast_type: "success".to_string(),
                title: None,
                message: format!("Looper updated to v{current_version}."),
                auto_dismiss: Some(true),
                duration: Some(5000),
                retry_id: None,
                mode: None,
                action: None,
                action_label: None,
                secondary_action: None,
                secondary_action_label: None,
            },
        );
    }

    let already_registered = state
        .settings_close_handler_registered
        .swap(true, Ordering::SeqCst);
    if !already_registered {
        let app_handle = app.clone();
        let window_clone = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window_clone.hide();
                if let Err(error) = crate::restore_recording_shortcuts(&app_handle) {
                    tracing::error!(
                        "Failed to restore recording shortcuts after closing Settings: {error}"
                    );
                }
                #[cfg(target_os = "macos")]
                {
                    let _ = app_handle.set_activation_policy(ActivationPolicy::Accessory);
                    restore_background_surfaces_after_settings_close(app_handle.clone());
                }
            }
        });
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn restore_background_surfaces_after_settings_close(app: AppHandle<AppRuntime>) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(BACKGROUND_SURFACE_RESTORE_DELAY_MS));
        if let Err(error) = crate::pill::show_idle_sticky(&app) {
            tracing::error!("Failed to restore Dictation after closing Looper: {error}");
        }
        app.state::<AppState>()
            .meeting_awareness()
            .request_refresh();
    });
}
