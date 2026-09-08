use crate::library::meeting_commands::{
    join_calendar_meeting_from_menu, meeting_toggle_label, toggle_meeting_from_menu,
    MENU_ID_MEETING_TOGGLE,
};
use crate::pill::capture::{CapturePillDockPosition, CapturePillPresentation};
use crate::recent_transcriptions::{
    build_recent_transcriptions_menu, copy_transcription_to_clipboard,
    MENU_ID_RECENT_TRANSCRIPTION_PREFIX,
};
use crate::settings::UserSettings;
use crate::speech::menu::{
    build_model_status_items, build_models_submenu, handle_speech_menu_event,
};
use crate::{AppRuntime, AppState};
use chrono::Utc;
use parking_lot::Mutex;
use std::sync::OnceLock;
use tauri::menu::{Menu, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Emitter, Manager};

mod tray_calendar;
mod tray_dictation;
pub(crate) use tray_dictation::build_dictation_item;
mod tray_pill_menu;
mod tray_settings_window;
use tray_calendar::{calendar_agenda_entries, calendar_menu_bar_title};
pub(crate) use tray_pill_menu::build_capture_pill_submenu;
use tray_pill_menu::build_dictation_language_submenu;
pub use tray_settings_window::toggle_settings_window;

mod microphone;
pub(crate) use microphone::build_microphone_submenu;
use microphone::{select_microphone, MENU_ID_MIC_DEFAULT, MENU_ID_MIC_PREFIX};
const MENU_ID_CHECK_UPDATES: &str = "menu_check_updates";
const MENU_ID_FEATURE_LAB: &str = "menu_feature_lab";
const MENU_ID_CALENDAR_NEXT: &str = "menu_calendar_next";
const MENU_ID_CALENDAR_EMPTY: &str = "menu_calendar_empty";
const MENU_ID_CALENDAR_JOIN_PREFIX: &str = "menu_calendar_join:";
const MENU_ID_PILL_POSITION_PREFIX: &str = "menu_pill_position:";
const MENU_ID_PILL_PRESENTATION_PREFIX: &str = "menu_pill_presentation:";
const MENU_ID_DICTATION_LANGUAGE_PREFIX: &str = "menu_dictation_language:";
pub(crate) const EVENT_SETTINGS_RENDERER_READY: &str = "settings:renderer_ready";

const EVENT_NAVIGATE_ABOUT: &str = "navigate:about";
const EVENT_NAVIGATE_SETTINGS: &str = "navigate:settings";
const EVENT_NAVIGATE_CALENDAR: &str = "navigate:calendar";
const EVENT_NAVIGATE_HISTORY: &str = "navigate:history";
const EVENT_NAVIGATE_MODELS: &str = "navigate:models";
const EVENT_NAVIGATE_FEATURE_LAB: &str = "navigate:feature-lab";
const EVENT_NAVIGATE_APP_PRIVACY: &str = "navigate:app-privacy";

#[derive(Clone, Copy)]
enum SettingsNavigationTarget {
    General,
    Calendar,
    About,
    History,
    Models,
    Providers,
    Account,
    FeatureLab,
    /// Ajustes → App, donde vive la fila de Accesibilidad y su explicación.
    AppPrivacy,
}

impl SettingsNavigationTarget {
    fn event_name(self) -> &'static str {
        match self {
            Self::General => EVENT_NAVIGATE_SETTINGS,
            Self::Calendar => EVENT_NAVIGATE_CALENDAR,
            Self::About => EVENT_NAVIGATE_ABOUT,
            Self::History => EVENT_NAVIGATE_HISTORY,
            Self::Models => EVENT_NAVIGATE_MODELS,
            Self::Providers => "navigate:providers",
            Self::Account => "navigate:account",
            Self::FeatureLab => EVENT_NAVIGATE_FEATURE_LAB,
            Self::AppPrivacy => EVENT_NAVIGATE_APP_PRIVACY,
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
    use super::tray_calendar::{normalized_title, MENU_TITLE_LIMIT};
    use super::*;
    use chrono::{DateTime, Duration as ChronoDuration, TimeZone, Utc};

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
        let truncated = normalized_title(title, 24);

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
        assert_eq!(title.chars().count(), MENU_TITLE_LIMIT);
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

pub(crate) fn open_settings_calendar(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    open_settings_navigation(app, SettingsNavigationTarget::Calendar)
}

pub(crate) fn open_settings_history(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    open_settings_navigation(app, SettingsNavigationTarget::History)
}

pub(crate) fn open_settings_models(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    open_settings_navigation(app, SettingsNavigationTarget::Models)
}

pub(crate) fn open_meeting_ai_settings(
    app: &AppHandle<AppRuntime>,
    licensed: bool,
) -> tauri::Result<()> {
    let target = if licensed {
        SettingsNavigationTarget::Providers
    } else {
        SettingsNavigationTarget::Account
    };
    open_settings_navigation(app, target)
}

pub(crate) fn open_settings_feature_lab(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    open_settings_navigation(app, SettingsNavigationTarget::FeatureLab)
}

pub(crate) fn open_settings_app_privacy(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    open_settings_navigation(app, SettingsNavigationTarget::AppPrivacy)
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
    menu = menu.item(&build_dictation_item(app)?);
    let meeting_toggle = MenuItem::with_id(
        app,
        MENU_ID_MEETING_TOGGLE,
        meeting_toggle_label(&app.state::<AppState>()),
        true,
        None::<&str>,
    )?;
    menu = menu
        .item(&meeting_toggle)
        .text("menu_pill_recover", "Show Capture Pill")
        .separator();
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
    menu = menu.item(&build_recent_transcriptions_menu(
        app,
        "Recent Transcriptions",
    )?);
    menu = menu
        .separator()
        .item(&build_capture_settings_submenu(app, settings)?);
    #[cfg(debug_assertions)]
    {
        menu = menu
            .text(MENU_ID_FEATURE_LAB, "Feature Lab")
            .item(&crate::qa_lab::build_submenu(app)?);
    }
    menu = menu.separator();

    let open_settings = MenuItem::with_id(app, "open_settings", "Open Looper", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit_looper", "Quit Looper", true, None::<&str>)?;
    menu = menu
        .item(&open_settings)
        .item(&check_updates)
        .separator()
        .item(&quit);

    menu.build()
}

fn build_capture_settings_submenu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<tauri::menu::Submenu<AppRuntime>> {
    let mut menu = SubmenuBuilder::new(app, "Capture Settings")
        .item(&build_dictation_language_submenu(app, settings)?)
        .item(&build_microphone_submenu(app, settings)?)
        .item(&build_models_submenu(app, settings)?);
    let status_items = build_model_status_items(app, settings)?;
    if !status_items.is_empty() {
        menu = menu.separator();
        for item in &status_items {
            menu = menu.item(item);
        }
    }
    menu.separator()
        .item(&build_capture_pill_submenu(app, settings)?)
        .build()
}

pub(crate) fn refresh_capture_menus(app: &AppHandle<AppRuntime>) {
    let task_app = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Err(error) = tray_dictation::refresh(&task_app) {
            tracing::error!("Failed to update dictation menu action: {error}");
        }
    });
}

pub(crate) fn refresh_tray_menu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    if let Some(tray) = state.tray_handle() {
        let menu = build_tray_menu(app, settings)?;
        tray.set_menu(Some(menu.clone()))?;
        *state.tray_menu.lock() = Some(menu);
        set_calendar_tray_title(&tray, settings, state.meeting_awareness().agenda())?;
    }
    Ok(())
}

pub(crate) fn refresh_calendar_tray_title(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    if let Some(tray) = state.tray_handle() {
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

enum TrayAction<'a> {
    DictationStart,
    DictationStop,
    MeetingToggle,
    DefaultMicrophone,
    CheckUpdates,
    FeatureLab,
    PillRecover,
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
            tray_dictation::START_ID => return Self::DictationStart,
            tray_dictation::STOP_ID => return Self::DictationStop,
            "menu_pill_recover" => return Self::PillRecover,
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

pub(crate) fn handle_native_menu_event(app: &AppHandle<AppRuntime>, id: &str) {
    #[cfg(debug_assertions)]
    if crate::qa_lab::handle_menu_event(app, id) {
        refresh_speech_menus(app, &app.state::<AppState>().current_settings_unmasked());
        return;
    }
    if let Some(saved) = handle_speech_menu_event(app, id) {
        refresh_speech_menus(app, &saved);
        return;
    }

    match TrayAction::decode(id) {
        TrayAction::DictationStart => tray_dictation::dictate_from_menu(app, false),
        TrayAction::DictationStop => tray_dictation::dictate_from_menu(app, true),
        TrayAction::PillRecover => {
            if let Err(error) = crate::pill::recover_idle_sticky(app) {
                crate::toast::show(app, "error", Some("Capture Pill"), &error);
            }
        }
        TrayAction::MeetingToggle => toggle_meeting_from_menu(app),
        TrayAction::DefaultMicrophone => select_microphone(app, None),
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
        TrayAction::SelectMicrophone(device_id) => select_microphone(app, Some(device_id)),
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
}

pub fn build_tray(app: &AppHandle<AppRuntime>) -> tauri::Result<TrayIcon<AppRuntime>> {
    let settings = app.state::<AppState>().current_settings();
    let menu = build_tray_menu(app, &settings)?;

    let builder = TrayIconBuilder::new();

    #[cfg(target_os = "macos")]
    let builder = {
        let icon_bytes = include_bytes!("../../icons/tray.png");
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
            #[cfg(not(target_os = "macos"))]
            other => handle_native_menu_event(app, other),
            // macOS already dispatches shared actions through the app's global menu handler.
            #[cfg(target_os = "macos")]
            _ => {}
        })
        .build(app)?;
    *app.state::<AppState>().tray_menu.lock() = Some(menu);
    set_calendar_tray_title(
        &tray,
        &settings,
        app.state::<AppState>().meeting_awareness().agenda(),
    )?;
    Ok(tray)
}
