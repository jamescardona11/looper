use std::sync::{Arc, OnceLock};

use tauri::{AppHandle, Listener, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

use super::cli::app_context;
use super::commands::{history, interaction, preferences, system};
use super::contracts::{AppRuntime, MAIN_WINDOW_LABEL, SETTINGS_WINDOW_LABEL};
use super::state::AppState;
use crate::settings::{default_local_model, SettingsStore, UserSettings};
use crate::{
    analytics, assistive, library, license, local_llm, model_manager, pill, platform,
    recent_transcriptions, tray, update_checker,
};

#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};

static LOG_GUARD: OnceLock<tracing_appender::non_blocking::WorkerGuard> = OnceLock::new();

pub fn run() {
    let runtime = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
    let _entered = runtime.enter();
    tauri::async_runtime::set(runtime.handle().clone());
    let builder = install_plugins(tauri::Builder::default());
    register_commands(builder)
        .setup(setup_application)
        .build(app_context())
        .expect("error while building tauri application")
        .run(handle_lifecycle_event);
}

pub fn run_local_llm_sidecar() -> anyhow::Result<()> {
    local_llm::run_sidecar()
}

fn install_plugins(builder: tauri::Builder<AppRuntime>) -> tauri::Builder<AppRuntime> {
    #[cfg(target_os = "windows")]
    let builder = builder.device_event_filter(tauri::DeviceEventFilter::Always);

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(
        |application, arguments, _working_directory| {
            if let Err(failure) = tray::toggle_settings_window(application) {
                tracing::error!("Failed to focus window on second instance: {failure}");
            }
            handle_deep_link_urls(application, arguments.into_iter().skip(1));
        },
    ));

    let builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        Some(vec!["--autostart"]),
    ));
    #[cfg(target_os = "macos")]
    let builder = builder
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_nspanel::init())
        .on_menu_event(|application, event| {
            handle_app_menu_event(application, event.id().as_ref());
        });
    builder
}

fn setup_application(app: &mut tauri::App<AppRuntime>) -> Result<(), Box<dyn std::error::Error>> {
    analytics::set_crash_phase("setup_start");
    #[cfg(target_os = "macos")]
    app.set_activation_policy(ActivationPolicy::Accessory);
    let handle = app.handle().clone();
    analytics::set_crash_phase("logging");
    initialize_logging(&handle);
    #[cfg(target_os = "macos")]
    assistive::initialize_shortcut_keycodes();
    let crash_marker = install_crash_reporting(&handle);
    let settings_store = load_settings_and_manage_state(app)?;
    start_state_services(&handle, settings_store);
    start_runtime_services(app);
    synchronize_platform_state(&handle);
    prepare_windows(&handle);
    prepare_tray_and_shortcuts(&handle);
    launch_background_work(&handle, crash_marker);
    analytics::set_crash_phase("recording_recovery");
    crate::transcribe::recover_interrupted_recordings(&handle);
    analytics::set_crash_phase("permissions_startup_check");
    system::check_permissions_on_startup(&handle);
    analytics::set_crash_phase("running");
    Ok(())
}

fn install_crash_reporting(app: &AppHandle<AppRuntime>) -> Option<std::path::PathBuf> {
    analytics::set_crash_phase("crash_handler");
    let marker = app
        .path()
        .app_data_dir()
        .ok()
        .map(|directory| directory.join("last_crash.txt"));
    let log = app.path().app_log_dir().ok().map(|directory| {
        let _ = std::fs::create_dir_all(&directory);
        directory.join("crash.log")
    });
    if let Some(path) = marker.as_ref() {
        analytics::install_crash_handler(path.clone(), log);
        #[cfg(target_os = "windows")]
        if let Ok(directory) = app.path().app_log_dir() {
            platform::windows::crash::install(directory, path.clone());
        }
    }
    marker
}

fn load_settings_and_manage_state(
    app: &mut tauri::App<AppRuntime>,
) -> Result<Arc<SettingsStore>, Box<dyn std::error::Error>> {
    analytics::set_crash_phase("settings_load");
    let handle = app.handle();
    let store = Arc::new(SettingsStore::new(handle)?);
    let mut settings = store.load().unwrap_or_default();
    if model_manager::definition(&settings.local_model).is_none() {
        settings.local_model = default_local_model();
        if let Err(failure) = store.save(&settings) {
            tracing::error!("Failed to persist default local model: {failure}");
        }
    }
    analytics::set_crash_phase("app_state");
    app.manage(AppState::new(Arc::clone(&store), settings, handle));
    Ok(store)
}

fn start_state_services(app: &AppHandle<AppRuntime>, settings_store: Arc<SettingsStore>) {
    app.state::<AppState>()
        .meeting_awareness()
        .start(app.clone());
    let application = app.clone();
    tauri::async_runtime::spawn(async move {
        match license::secure_grant_refresh_needed(&settings_store) {
            Ok(true) => {
                let http = application.state::<AppState>().http();
                if let Err(failure) = license::refresh_license(http, &settings_store).await {
                    tracing::warn!("Could not refresh the saved license: {failure}");
                }
            }
            Ok(false) => {}
            Err(failure) => tracing::warn!("Could not inspect the saved license: {failure}"),
        }
    });
}

fn start_runtime_services(app: &tauri::App<AppRuntime>) {
    analytics::set_crash_phase("services");
    let handle = app.handle();
    crate::integrations::start_control_server(handle.clone());
    library::commands::recover_interrupted_library_items(handle);
    library::watch::start_watch_folder_service(handle.clone());
    register_deep_link_handlers(app);

    #[cfg(target_os = "macos")]
    {
        let application = handle.clone();
        handle.listen(library::EVENT_LIBRARY_RENDERER_READY, move |_| {
            library::commands::mark_library_import_renderer_ready(&application);
        });
    }
    let application = handle.clone();
    handle.listen(tray::EVENT_SETTINGS_RENDERER_READY, move |_| {
        tray::mark_settings_renderer_ready(&application);
    });
}

fn synchronize_platform_state(app: &AppHandle<AppRuntime>) {
    let settings = app.state::<AppState>().current_settings();
    if let Err(failure) = sync_launch_at_login(app, settings.auto_launch_enabled) {
        tracing::error!("Failed to sync launch at login state: {failure}");
    }
    #[cfg(target_os = "macos")]
    {
        if let Err(failure) = set_app_menu(app, &settings) {
            tracing::error!("Failed to set app menu: {failure}");
        }
        if let Err(failure) = platform::macos::audio_devices::init(app) {
            tracing::error!("Failed to initialize input device watcher: {failure}");
        }
    }
}

fn prepare_windows(app: &AppHandle<AppRuntime>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.hide();
        platform::overlay::init(app, &window);
    }
    for label in [
        crate::toast::WINDOW_LABEL,
        crate::awareness_notification::WINDOW_LABEL,
    ] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.hide();
            platform::toast::init(app, &window);
        }
    }
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        platform::settings_window::init(&window);
    }
}

fn prepare_tray_and_shortcuts(app: &AppHandle<AppRuntime>) {
    analytics::set_crash_phase("tray_shortcuts");
    if let Ok(icon) = tray::build_tray(app) {
        app.state::<AppState>().store_tray(icon);
    }
    if let Err(failure) = pill::show_idle_sticky(app) {
        tracing::error!("Failed to show the Dictation sticky: {failure}");
    }
    if let Err(failure) = pill::register_shortcuts(app) {
        tracing::error!("Failed to register shortcuts: {failure}");
        crate::toast::show_with_action(
            app,
            "warning",
            Some("Fn unavailable"),
            "Enable Accessibility so Fn can take notes during meetings.",
            "open_accessibility_settings",
            "Enable permission",
        );
    }
    if app.state::<AppState>().should_open_settings_on_startup() {
        let _ = tray::toggle_settings_window(app);
    }
    update_checker::check_post_auto_update(app);
}

fn launch_background_work(app: &AppHandle<AppRuntime>, crash_marker: Option<std::path::PathBuf>) {
    analytics::set_crash_phase("background_tasks");
    update_checker::start_background_checker(
        app.clone(),
        app.state::<AppState>().update_state().clone(),
    );
    app.state::<AppState>().start_preflight_loop(app.clone());
    let application = app.clone();
    tauri::async_runtime::spawn(async move {
        analytics::set_crash_phase("analytics_init");
        analytics::init(&application).await;
        if let Some(path) = crash_marker {
            analytics::report_pending_crash(&application, &path);
        }
        if application.state::<AppState>().analytics_first_run() {
            analytics::track_app_installed(&application);
        }
        analytics::track_app_started(&application);
        analytics::set_crash_phase("running");
    });
}

fn register_commands(builder: tauri::Builder<AppRuntime>) -> tauri::Builder<AppRuntime> {
    builder.invoke_handler(tauri::generate_handler![
        preferences::get_settings,
        preferences::get_calendar_access_status,
        preferences::request_calendar_access,
        preferences::get_upcoming_calendar_meetings,
        preferences::get_meeting_awareness_state,
        preferences::dismiss_meeting_awareness,
        preferences::open_meeting_notification_settings,
        preferences::set_shortcut_capture_active,
        preferences::retry_shortcuts,
        preferences::update_settings,
        preferences::set_dictation_language,
        preferences::get_license_state,
        preferences::activate_license,
        preferences::refresh_license,
        preferences::deactivate_license,
        preferences::get_dictation_stats,
        system::preview_recording_prune,
        system::preview_audio_storage_budget,
        system::preview_transcription_prune,
        crate::dictionary::set_dictionary,
        crate::dictionary::get_replacements,
        crate::dictionary::set_replacements,
        crate::dictionary::get_dictionary_usage,
        crate::user_snippets::get_snippets,
        crate::user_snippets::set_snippets,
        crate::auto_dictionary::accept_auto_dictionary_suggestion,
        crate::auto_dictionary::reject_auto_dictionary_suggestion,
        crate::corrections::get_suggested_corrections,
        crate::corrections::accept_suggested_correction,
        crate::corrections::dismiss_suggested_correction,
        crate::personalization::get_personalities,
        crate::personalization::set_personalities,
        crate::personalization::preview_personality_style,
        crate::personalization::list_installed_apps,
        crate::personalization::list_website_icons,
        crate::mode_rules::get_mode_rules,
        crate::mode_rules::set_mode_rules,
        crate::mode_rules::get_active_mode_rule_suggestion,
        crate::import::commands::detect_importable_apps,
        crate::import::commands::preview_import,
        crate::import::commands::apply_import,
        system::get_app_info,
        system::export_complete_archive,
        system::open_data_dir,
        history::get_transcriptions,
        crate::memory::search_memory,
        history::mark_transcription_synced,
        history::delete_transcription,
        history::retry_transcription,
        history::retry_llm_cleanup,
        history::undo_llm_cleanup,
        history::cancel_retry_transcription,
        crate::pill::set_overlay_position,
        crate::pill::persist_overlay_position,
        crate::pill::set_meeting_overlay_presentation,
        crate::library::commands::create_library_item,
        crate::library::commands::get_library_items_page,
        crate::library::commands::update_library_item,
        crate::library::commands::delete_library_item,
        crate::library::commands::cancel_library_transcription,
        crate::library::commands::retry_library_transcription,
        crate::library::commands::export_library_item_to_path,
        crate::library::commands::get_library_tags,
        crate::library::commands::probe_library_import_files,
        crate::library::commands::get_library_watch_folders,
        crate::library::commands::add_library_watch_folder,
        crate::library::commands::remove_library_watch_folder,
        crate::library::commands::scan_library_watch_folders_now,
        crate::library::commands::probe_library_youtube_url,
        crate::library::commands::create_library_youtube_item,
        crate::library::commands::get_library_translations,
        crate::library::commands::translate_library_item,
        crate::library::commands::delete_library_translation,
        crate::library::meeting_commands::start_meeting_capture,
        crate::library::meeting_commands::start_note_from_dock,
        crate::library::meeting_commands::start_prompted_meeting_capture,
        crate::library::meeting_commands::stop_meeting_capture,
        crate::library::meeting_commands::continue_meeting_after_silence,
        crate::library::meeting_commands::get_meeting_capture_state,
        crate::library::meeting_commands::capture_meeting_note,
        crate::library::meeting_commands::get_meeting_details,
        crate::library::meeting_commands::update_meeting_notes,
        crate::library::meeting_commands::generate_meeting_summary,
        crate::library::meeting_commands::ask_meeting,
        preferences::mirror_confirmed_meeting_output,
        crate::model_manager::list_models,
        crate::model_manager::check_model_status,
        crate::model_manager::download_model,
        crate::model_manager::delete_model,
        crate::model_manager::cancel_download,
        crate::local_llm::list_local_llm_models,
        crate::local_llm::get_local_llm_model_status,
        crate::local_llm::get_meeting_ai_status,
        crate::local_llm::download_local_llm_model,
        crate::local_llm::cancel_local_llm_model_download,
        crate::local_llm::delete_local_llm_model,
        system::list_speech_models,
        crate::cli_install::get_cli_install_status,
        crate::cli_install::install_cli,
        crate::cli_install::remove_cli,
        crate::audio::list_input_devices,
        crate::toast::toast_dismissed,
        crate::toast::set_toast_interactive,
        system::open_accessibility_settings,
        system::check_accessibility_permission,
        system::check_microphone_permission,
        system::request_microphone_permission,
        system::open_microphone_settings,
        system::open_system_audio_settings,
        system::open_input_monitoring_settings,
        system::check_screen_capture_permission,
        system::request_screen_capture_permission,
        system::open_screen_capture_settings,
        system::open_llm_cleanup_settings,
        system::open_ffmpeg_install,
        preferences::complete_onboarding,
        interaction::cancel_recording,
        crate::pill::finish_recording,
        crate::pill::start_dictation_from_dock,
        crate::pill::get_capture_pill_preferences,
        crate::pill::set_capture_pill_presentation,
        crate::pill::set_capture_pill_dock_position,
        crate::pill::set_preflight_language_menu_open,
        crate::pill::sync_pill_renderer_state,
        interaction::confirm_pending_insertion,
        interaction::cancel_pending_insertion,
        interaction::choose_edit_action,
        interaction::cancel_edit_action,
        interaction::undo_last_insertion,
        interaction::insert_remote_text,
        history::view_recovered_transcriptions,
        history::copy_last_transcription,
        preferences::reset_onboarding,
        crate::toast::debug_show_toast,
        crate::analytics::report_frontend_crash,
        crate::analytics::track_onboarding_step_viewed,
        system::fetch_llm_models,
        system::fetch_remote_speech_models,
        system::set_cloud_auth_token,
        system::open_about_page,
        system::reveal_logs,
        crate::update_checker::get_update_status,
        crate::update_checker::check_for_updates,
        crate::update_checker::download_and_install_update
    ])
}

fn handle_lifecycle_event(app: &AppHandle<AppRuntime>, event: tauri::RunEvent) {
    match event {
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Opened { urls } => {
            let files = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .collect();
            if let Err(failure) = library::handle_opened_paths(app, files) {
                tracing::error!("Failed to handle opened files: {failure}");
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => {
            let _ = tray::toggle_settings_window(app);
        }
        tauri::RunEvent::Exit => shutdown_application(app),
        _ => {}
    }
}

fn shutdown_application(app: &AppHandle<AppRuntime>) {
    let state = app.state::<AppState>();
    state.local_transcriber.unload();
    tauri::async_runtime::block_on(state.local_llm_runtime.shutdown());
    state.stop_preflight_loop();
    let (duration, transcription_count) = state.session_metrics();
    analytics::track_app_exited(app, duration, transcription_count);
}

fn initialize_logging(app: &AppHandle<AppRuntime>) {
    use tracing_subscriber::fmt::writer::MakeWriterExt;
    use tracing_subscriber::layer::SubscriberExt;

    let Ok(directory) = app.path().app_log_dir() else {
        return;
    };
    let _ = std::fs::create_dir_all(&directory);
    let appender = match tracing_appender::rolling::RollingFileAppender::builder()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("looper")
        .filename_suffix("log")
        .max_log_files(7)
        .build(directory)
    {
        Ok(appender) => appender,
        Err(failure) => {
            eprintln!("Failed to create log file appender: {failure}");
            return;
        }
    };
    let (writer, guard) = tracing_appender::non_blocking(appender);
    let targets = tracing_subscriber::filter::Targets::new()
        .with_default(tracing::level_filters::LevelFilter::WARN)
        .with_target("looper_lib", tracing::level_filters::LevelFilter::INFO)
        .with_target("looper_ts", tracing::level_filters::LevelFilter::INFO);
    let subscriber = tracing_subscriber::fmt()
        .with_writer(writer.and(std::io::stderr))
        .with_ansi(false)
        .finish()
        .with(targets);
    if tracing::subscriber::set_global_default(subscriber).is_ok() {
        let _ = LOG_GUARD.set(guard);
    }
}

fn register_deep_link_handlers(app: &tauri::App<AppRuntime>) {
    let handle = app.handle().clone();
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        handle_deep_link_urls(&handle, urls.into_iter().map(|url| url.to_string()));
    }
    app.deep_link().on_open_url(move |event| {
        handle_deep_link_urls(&handle, event.urls().iter().map(|url| url.to_string()));
    });
}

fn handle_deep_link_urls<I, S>(app: &AppHandle<AppRuntime>, urls: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    urls.into_iter()
        .filter(|url| license::is_license_deep_link(url.as_ref()))
        .for_each(|_| {
            if let Err(failure) = license::handle_deep_link(app) {
                tracing::error!("{failure}");
            }
        });
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(crate) fn sync_launch_at_login(
    app: &AppHandle<AppRuntime>,
    enabled: bool,
) -> Result<(), String> {
    let manager = app.autolaunch();
    let current = manager
        .is_enabled()
        .map_err(|failure| format!("Failed to read launch at login status: {failure}"))?;
    if current == enabled {
        return Ok(());
    }
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|failure| {
        let action = if enabled { "enable" } else { "disable" };
        format!("Failed to {action} launch at login: {failure}")
    })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub(crate) fn sync_launch_at_login(
    _app: &AppHandle<AppRuntime>,
    _enabled: bool,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn set_app_menu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<()> {
    app.set_menu(platform::macos::menu::build_app_menu(app, settings)?)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn handle_app_menu_event(app: &AppHandle<AppRuntime>, id: &str) {
    use crate::platform::macos::menu::{
        MENU_ID_CHECK_UPDATES, MENU_ID_FEATURE_LAB, MENU_ID_MIC_DEFAULT, MENU_ID_MIC_PREFIX,
        MENU_ID_SETTINGS,
    };
    use crate::recent_transcriptions::MENU_ID_RECENT_TRANSCRIPTION_PREFIX;

    #[cfg(debug_assertions)]
    if crate::qa_lab::handle_menu_event(app, id) {
        let settings = app.state::<AppState>().current_settings_unmasked();
        preferences::refresh_native_menus(app, &settings);
        return;
    }
    if let Some(settings) = crate::speech::menu::handle_speech_menu_event(app, id) {
        preferences::refresh_native_menus(app, &settings);
        return;
    }
    match id {
        library::meeting_commands::MENU_ID_MEETING_TOGGLE => {
            library::meeting_commands::toggle_meeting_from_menu(app)
        }
        MENU_ID_SETTINGS => {
            let _ = tray::open_settings_general(app);
        }
        MENU_ID_CHECK_UPDATES => {
            let _ = tray::open_settings_about(app);
        }
        MENU_ID_FEATURE_LAB => {
            let _ = tray::open_settings_feature_lab(app);
        }
        MENU_ID_MIC_DEFAULT => set_microphone(app, None),
        _ => {
            if let Some(transcription_id) = id.strip_prefix(MENU_ID_RECENT_TRANSCRIPTION_PREFIX) {
                recent_transcriptions::copy_transcription_to_clipboard(app, transcription_id);
            } else if let Some(raw_id) = id.strip_prefix(MENU_ID_MIC_PREFIX) {
                set_microphone(app, Some(raw_id.strip_prefix("dev:").unwrap_or(raw_id)));
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn set_microphone(app: &AppHandle<AppRuntime>, device_id: Option<&str>) {
    let state = app.state::<AppState>();
    let mut settings = state.current_settings_unmasked();
    if settings.microphone_device.as_deref() == device_id {
        return;
    }
    let previous = settings.clone();
    settings.microphone_device = device_id.map(str::to_owned);
    match state.persist_settings(settings) {
        Ok(saved) => {
            analytics::track_settings_changes(app, &previous, &saved);
            preferences::refresh_native_menus(app, &saved);
            state.emit_settings_changed(app, &saved);
        }
        Err(failure) => tracing::error!("Failed to update microphone selection: {failure}"),
    }
}
