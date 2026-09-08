use crate::pill::{self, PillStatus};
use crate::{AppRuntime, AppState};
use tauri::menu::{Menu, MenuItem, MenuItemKind};
use tauri::{AppHandle, Manager};

pub(super) const START_ID: &str = "menu_dictation_start";
pub(super) const STOP_ID: &str = "menu_dictation_stop";

fn dictation_action(
    status: PillStatus,
    meeting_active: bool,
) -> (&'static str, &'static str, bool) {
    if meeting_active {
        return (START_ID, "Start Dictation", false);
    }
    match status {
        PillStatus::Idle | PillStatus::Preflight => (START_ID, "Start Dictation", true),
        PillStatus::Listening => (STOP_ID, "Stop Dictation", true),
        PillStatus::Processing => (START_ID, "Transcribing…", false),
        PillStatus::Cancelled | PillStatus::Error => (START_ID, "Start Dictation", false),
    }
}

pub(crate) fn build_dictation_item(
    app: &AppHandle<AppRuntime>,
) -> tauri::Result<MenuItem<AppRuntime>> {
    let state = app.state::<AppState>();
    let (id, label, enabled) =
        dictation_action(state.pill().status(), state.meeting_capture().is_active());
    MenuItem::with_id(app, id, label, enabled, None::<&str>)
}

pub(super) fn refresh(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    let tray_menu = app.state::<AppState>().tray_menu.lock().clone();
    if let Some(menu) = tray_menu {
        refresh_menu(app, &menu)?;
    }
    #[cfg(target_os = "macos")]
    if let Some(menu) = app.menu() {
        refresh_menu(app, &menu)?;
    }
    Ok(())
}

fn refresh_menu(app: &AppHandle<AppRuntime>, menu: &Menu<AppRuntime>) -> tauri::Result<()> {
    refresh_items(app, menu.items()?, &|old, new, index| {
        menu.insert(new, index)?;
        menu.remove(old)
    })
}

// The rest of the menu keeps its identity, including microphone choices and
// open submenus. Start/Stop retain distinct IDs for stale menu selections.
fn refresh_items(
    app: &AppHandle<AppRuntime>,
    items: Vec<MenuItemKind<AppRuntime>>,
    replace: &dyn Fn(&MenuItem<AppRuntime>, &MenuItem<AppRuntime>, usize) -> tauri::Result<()>,
) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    let (id, label, enabled) =
        dictation_action(state.pill().status(), state.meeting_capture().is_active());
    for (index, item) in items.into_iter().enumerate() {
        match item {
            MenuItemKind::MenuItem(item) if matches!(item.id().as_ref(), START_ID | STOP_ID) => {
                if item.id().as_ref() == id {
                    item.set_text(label)?;
                    item.set_enabled(enabled)?;
                } else {
                    let next = MenuItem::with_id(app, id, label, enabled, None::<&str>)?;
                    replace(&item, &next, index)?;
                }
            }
            MenuItemKind::Submenu(menu) => {
                refresh_items(app, menu.items()?, &|old, new, index| {
                    menu.insert(new, index)?;
                    menu.remove(old)
                })?;
            }
            _ => {}
        }
    }
    Ok(())
}

pub(super) fn dictate_from_menu(app: &AppHandle<AppRuntime>, stop: bool) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = if stop {
            pill::finish_recording(app.clone())
        } else {
            pill::start_dictation_from_dock(app.clone())
        };
        if let Err(message) = result {
            crate::toast::show(&app, "error", Some("Dictation"), &message);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dictation_can_start_without_a_keyboard_listener_and_stop_while_listening() {
        for status in [PillStatus::Idle, PillStatus::Preflight] {
            assert_eq!(
                dictation_action(status, false),
                (START_ID, "Start Dictation", true)
            );
        }
        assert_eq!(
            dictation_action(PillStatus::Listening, false),
            (STOP_ID, "Stop Dictation", true)
        );
    }

    #[test]
    fn busy_states_do_not_offer_a_second_capture() {
        assert_eq!(
            dictation_action(PillStatus::Processing, false),
            (START_ID, "Transcribing…", false)
        );
        for status in [
            PillStatus::Idle,
            PillStatus::Preflight,
            PillStatus::Listening,
            PillStatus::Processing,
            PillStatus::Cancelled,
            PillStatus::Error,
        ] {
            assert!(!dictation_action(status, true).2);
        }
        assert!(!dictation_action(PillStatus::Error, false).2);
        assert!(!dictation_action(PillStatus::Cancelled, false).2);
    }
}
