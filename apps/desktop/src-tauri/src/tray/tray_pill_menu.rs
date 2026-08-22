use crate::pill::capture::{CapturePillDockPosition, CapturePillPresentation};
use crate::settings::UserSettings;
use crate::AppRuntime;
use tauri::menu::{CheckMenuItemBuilder, Submenu, SubmenuBuilder};
use tauri::AppHandle;

const POSITION_PREFIX: &str = "menu_pill_position:";
const PRESENTATION_PREFIX: &str = "menu_pill_presentation:";
const LANGUAGE_PREFIX: &str = "menu_dictation_language:";

type CheckChoice = (String, &'static str, bool);

fn checked_submenu(
    app: &AppHandle<AppRuntime>,
    title: &str,
    choices: impl IntoIterator<Item = CheckChoice>,
) -> tauri::Result<Submenu<AppRuntime>> {
    let mut menu = SubmenuBuilder::new(app, title);
    for (id, label, checked) in choices {
        let item = CheckMenuItemBuilder::with_id(id, label)
            .checked(checked)
            .build(app)?;
        menu = menu.item(&item);
    }
    menu.build()
}

fn presentation_choices(settings: &UserSettings) -> Vec<CheckChoice> {
    [
        ("Dock", "dock", CapturePillPresentation::Dock),
        ("Floating", "floating", CapturePillPresentation::Floating),
    ]
    .into_iter()
    .map(|(label, value, presentation)| {
        (
            format!("{PRESENTATION_PREFIX}{value}"),
            label,
            settings.capture_pill_presentation == presentation,
        )
    })
    .collect()
}

fn dock_position_choices(settings: &UserSettings) -> Vec<CheckChoice> {
    [
        ("Top Center", CapturePillDockPosition::TopCenter),
        ("Left Center", CapturePillDockPosition::LeftCenter),
        ("Right Center", CapturePillDockPosition::RightCenter),
        ("Bottom Center", CapturePillDockPosition::BottomCenter),
    ]
    .into_iter()
    .map(|(label, position)| {
        (
            format!("{POSITION_PREFIX}{}", position.menu_value()),
            label,
            settings.capture_pill_presentation == CapturePillPresentation::Dock
                && settings.capture_pill_dock_position == position,
        )
    })
    .collect()
}

fn language_choices(settings: &UserSettings) -> Vec<CheckChoice> {
    [("Español", "es"), ("English", "en"), ("Português", "pt")]
        .into_iter()
        .map(|(label, code)| {
            (
                format!("{LANGUAGE_PREFIX}{code}"),
                label,
                settings.language == code,
            )
        })
        .collect()
}

pub(crate) fn build_capture_pill_submenu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<Submenu<AppRuntime>> {
    let position = checked_submenu(app, "Dock Position", dock_position_choices(settings))?;
    let mut menu = SubmenuBuilder::new(app, "Capture Pill");
    for (id, label, checked) in presentation_choices(settings) {
        let item = CheckMenuItemBuilder::with_id(id, label)
            .checked(checked)
            .build(app)?;
        menu = menu.item(&item);
    }
    menu.item(&position).build()
}

pub(crate) fn build_dictation_language_submenu(
    app: &AppHandle<AppRuntime>,
    settings: &UserSettings,
) -> tauri::Result<Submenu<AppRuntime>> {
    checked_submenu(app, "Dictation Language", language_choices(settings))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn choice_policies_keep_the_current_preferences_checked() {
        let settings = UserSettings {
            language: "pt".to_string(),
            capture_pill_presentation: CapturePillPresentation::Dock,
            capture_pill_dock_position: CapturePillDockPosition::RightCenter,
            ..UserSettings::default()
        };

        assert!(presentation_choices(&settings)
            .iter()
            .any(|(id, _, checked)| id.ends_with("dock") && *checked));
        assert!(dock_position_choices(&settings)
            .iter()
            .any(|(id, _, checked)| id.ends_with("right_center") && *checked));
        assert!(language_choices(&settings)
            .iter()
            .any(|(id, _, checked)| id.ends_with(":pt") && *checked));
    }
}
