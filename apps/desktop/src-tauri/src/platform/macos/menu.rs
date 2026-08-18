use tauri::menu::{
    CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem,
    Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Manager};

use crate::audio::{self, DeviceInfo};
use crate::library::meeting_commands::{meeting_toggle_label, MENU_ID_MEETING_TOGGLE};
use crate::recent_transcriptions::build_recent_transcriptions_menu;
use crate::settings::UserSettings;
use crate::speech::menu::{build_model_status_items, build_models_submenu};
use crate::{AppRuntime, AppState};

pub const MENU_ID_CHECK_UPDATES: &str = "menu_check_updates";
pub const MENU_ID_SETTINGS: &str = "menu_settings";
pub const MENU_ID_FEATURE_LAB: &str = "menu_feature_lab";
pub const MENU_ID_MIC_DEFAULT: &str = "menu_mic_default";
pub const MENU_ID_MIC_PREFIX: &str = "menu_mic_";

const SETTINGS_ACTION: ActionSpec = ActionSpec {
    id: MENU_ID_SETTINGS,
    title: "Settings…",
    accelerator: Some("CmdOrCtrl+,"),
};
const UPDATE_ACTION: ActionSpec = ActionSpec {
    id: MENU_ID_CHECK_UPDATES,
    title: "Check for Updates...",
    accelerator: None,
};
const FEATURE_LAB_ACTION: ActionSpec = ActionSpec {
    id: MENU_ID_FEATURE_LAB,
    title: "Feature Lab...",
    accelerator: None,
};
const EDIT_TITLES: [&str; 6] = ["Undo", "Redo", "Cut", "Copy", "Paste", "Select All"];
const VIEW_TITLES: [&str; 4] = ["Close Window", "Toggle Full Screen", "Minimize", "Zoom"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ActionSpec {
    id: &'static str,
    title: &'static str,
    accelerator: Option<&'static str>,
}

impl ActionSpec {
    fn build(self, app: &AppHandle<AppRuntime>) -> tauri::Result<MenuItem<AppRuntime>> {
        let builder = MenuItemBuilder::with_id(self.id, self.title);
        match self.accelerator {
            Some(accelerator) => builder.accelerator(accelerator).build(app),
            None => builder.build(app),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum MicrophoneRow {
    Selectable {
        id: String,
        title: String,
        checked: bool,
    },
    Unavailable {
        id: &'static str,
        title: String,
    },
}

fn microphone_rows(
    selected_device: Option<&str>,
    discovery: Result<Vec<DeviceInfo>, String>,
) -> Vec<MicrophoneRow> {
    let mut rows = vec![MicrophoneRow::Selectable {
        id: MENU_ID_MIC_DEFAULT.to_owned(),
        title: "System Default".to_owned(),
        checked: selected_device.is_none(),
    }];

    match discovery {
        Ok(devices) if devices.is_empty() => rows.push(MicrophoneRow::Unavailable {
            id: "menu_mic_none",
            title: "No input devices found".to_owned(),
        }),
        Ok(devices) => rows.extend(devices.into_iter().map(|device| {
            let title = if device.is_default {
                format!("{} (Default)", device.name)
            } else {
                device.name
            };
            MicrophoneRow::Selectable {
                id: format!("{MENU_ID_MIC_PREFIX}dev:{}", device.id),
                title,
                checked: selected_device == Some(device.id.as_str()),
            }
        })),
        Err(error) => rows.push(MicrophoneRow::Unavailable {
            id: "menu_mic_error",
            title: format!("Microphone unavailable ({error})"),
        }),
    }
    rows
}

fn microphone_menu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<Submenu<AppRuntime>> {
    let rows = microphone_rows(
        settings.microphone_device.as_deref(),
        audio::list_input_devices(),
    );
    let mut menu = SubmenuBuilder::new(app, "Microphone");
    for row in rows {
        match row {
            MicrophoneRow::Selectable { id, title, checked } => {
                let item = CheckMenuItemBuilder::with_id(id, title)
                    .checked(checked)
                    .build(app)?;
                menu = menu.item(&item);
            }
            MicrophoneRow::Unavailable { id, title } => {
                let item = MenuItem::with_id(app, id, title, false, None::<&str>)?;
                menu = menu.item(&item);
            }
        }
    }
    menu.build()
}

fn application_menu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
    app_name: &str,
) -> tauri::Result<Submenu<AppRuntime>> {
    let settings_item = SETTINGS_ACTION.build(app)?;
    let update_item = UPDATE_ACTION.build(app)?;
    let meeting_item = MenuItemBuilder::with_id(
        MENU_ID_MEETING_TOGGLE,
        meeting_toggle_label(&app.state::<AppState>()),
    )
    .build(app)?;
    let mut menu = SubmenuBuilder::new(app, app_name)
        .item(&settings_item)
        .separator()
        .item(&update_item)
        .item(&meeting_item)
        .separator();

    if cfg!(debug_assertions) {
        let feature_lab = FEATURE_LAB_ACTION.build(app)?;
        menu = menu.item(&feature_lab).separator();
    }

    let model_status = build_model_status_items(app, settings)?;
    for item in &model_status {
        menu = menu.item(item);
    }
    if !model_status.is_empty() {
        menu = menu.separator();
    }
    menu = menu.item(&build_models_submenu(app, settings)?);

    #[cfg(debug_assertions)]
    {
        menu = menu.separator().item(&crate::qa_lab::build_submenu(app)?);
    }

    let microphones = microphone_menu(app, settings)?;
    let recent = build_recent_transcriptions_menu(app, "Last Transcriptions")?;
    let hide_title = format!("Hide {app_name}");
    let quit_title = format!("Quit {app_name}");

    menu.item(&microphones)
        .separator()
        .item(&recent)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some("Services"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(&hide_title))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("Hide Others"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("Show All"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some(&quit_title))?)
        .build()
}

fn edit_menu(app: &AppHandle<AppRuntime>) -> tauri::Result<Submenu<AppRuntime>> {
    let [undo, redo, cut, copy, paste, select_all] = EDIT_TITLES;
    SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, Some(undo))?)
        .item(&PredefinedMenuItem::redo(app, Some(redo))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(cut))?)
        .item(&PredefinedMenuItem::copy(app, Some(copy))?)
        .item(&PredefinedMenuItem::paste(app, Some(paste))?)
        .item(&PredefinedMenuItem::select_all(app, Some(select_all))?)
        .build()
}

fn view_menu(app: &AppHandle<AppRuntime>) -> tauri::Result<Submenu<AppRuntime>> {
    let [close, fullscreen, minimize, zoom] = VIEW_TITLES;
    SubmenuBuilder::new(app, "View")
        .item(&PredefinedMenuItem::close_window(app, Some(close))?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some(fullscreen))?)
        .separator()
        .item(&PredefinedMenuItem::minimize(app, Some(minimize))?)
        .item(&PredefinedMenuItem::maximize(app, Some(zoom))?)
        .build()
}

pub fn build_app_menu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<Menu<AppRuntime>> {
    let app_name = app.package_info().name.clone();
    let application = application_menu(app, settings, &app_name)?;
    let view = view_menu(app)?;
    let edit = edit_menu(app)?;
    MenuBuilder::new(app)
        .items(&[&application, &edit, &view])
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(id: &str, name: &str, is_default: bool) -> DeviceInfo {
        DeviceInfo {
            id: id.to_owned(),
            name: name.to_owned(),
            is_default,
        }
    }

    #[test]
    fn app_action_contract_keeps_ids_titles_and_settings_accelerator() {
        assert_eq!(
            [SETTINGS_ACTION, UPDATE_ACTION, FEATURE_LAB_ACTION],
            [
                ActionSpec {
                    id: "menu_settings",
                    title: "Settings…",
                    accelerator: Some("CmdOrCtrl+,"),
                },
                ActionSpec {
                    id: "menu_check_updates",
                    title: "Check for Updates...",
                    accelerator: None,
                },
                ActionSpec {
                    id: "menu_feature_lab",
                    title: "Feature Lab...",
                    accelerator: None,
                },
            ]
        );
    }

    #[test]
    fn microphone_rows_keep_discovery_order_ids_labels_and_selection() {
        let rows = microphone_rows(
            Some("usb-2"),
            Ok(vec![
                device("usb-1", "Built-in", true),
                device("usb-2", "Studio", false),
            ]),
        );
        assert_eq!(
            rows,
            vec![
                MicrophoneRow::Selectable {
                    id: "menu_mic_default".to_owned(),
                    title: "System Default".to_owned(),
                    checked: false,
                },
                MicrophoneRow::Selectable {
                    id: "menu_mic_dev:usb-1".to_owned(),
                    title: "Built-in (Default)".to_owned(),
                    checked: false,
                },
                MicrophoneRow::Selectable {
                    id: "menu_mic_dev:usb-2".to_owned(),
                    title: "Studio".to_owned(),
                    checked: true,
                },
            ]
        );
    }

    #[test]
    fn system_default_is_checked_only_without_an_explicit_device() {
        let rows = microphone_rows(None, Ok(vec![device("usb", "USB", false)]));
        assert!(matches!(
            rows.first(),
            Some(MicrophoneRow::Selectable { checked: true, .. })
        ));
    }

    #[test]
    fn empty_and_failed_discovery_keep_distinct_disabled_rows() {
        assert_eq!(
            microphone_rows(Some("missing"), Ok(Vec::new()))[1],
            MicrophoneRow::Unavailable {
                id: "menu_mic_none",
                title: "No input devices found".to_owned(),
            }
        );
        assert_eq!(
            microphone_rows(None, Err("permission denied".to_owned()))[1],
            MicrophoneRow::Unavailable {
                id: "menu_mic_error",
                title: "Microphone unavailable (permission denied)".to_owned(),
            }
        );
    }

    #[test]
    fn standard_menu_titles_preserve_native_action_order() {
        assert_eq!(
            EDIT_TITLES,
            ["Undo", "Redo", "Cut", "Copy", "Paste", "Select All"]
        );
        assert_eq!(
            VIEW_TITLES,
            ["Close Window", "Toggle Full Screen", "Minimize", "Zoom"]
        );
    }
}
