use tauri::menu::{
    Menu, MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Manager};

use crate::library::meeting_commands::{meeting_toggle_label, MENU_ID_MEETING_TOGGLE};
use crate::recent_transcriptions::build_recent_transcriptions_menu;
use crate::settings::UserSettings;
use crate::speech::menu::{build_model_status_items, build_models_submenu};
use crate::{AppRuntime, AppState};

pub const MENU_ID_CHECK_UPDATES: &str = "menu_check_updates";
pub const MENU_ID_SETTINGS: &str = "menu_settings";
pub const MENU_ID_FEATURE_LAB: &str = "menu_feature_lab";

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
        .item(&crate::tray::build_dictation_item(app)?)
        .item(&meeting_item)
        .text("menu_pill_recover", "Show Capture Pill")
        .item(&crate::tray::build_capture_pill_submenu(app, settings)?)
        .item(&update_item)
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

    let microphones = crate::tray::build_microphone_submenu(app, settings)?;
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
