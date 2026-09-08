use crate::audio::{self, DeviceInfo};
use crate::settings::UserSettings;
use crate::{AppRuntime, AppState};
use tauri::menu::{CheckMenuItemBuilder, MenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Manager};

pub(super) const MENU_ID_MIC_DEFAULT: &str = "menu_mic_default";
pub(super) const MENU_ID_MIC_PREFIX: &str = "menu_mic_";

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

pub(crate) fn build_microphone_submenu(
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

pub(super) fn select_microphone(app: &AppHandle<AppRuntime>, device_id: Option<&str>) {
    let state = app.state::<AppState>();
    if state
        .current_settings_unmasked()
        .microphone_device
        .as_deref()
        == device_id
    {
        return;
    }
    match state.persist_settings_with(|_, settings| {
        settings.microphone_device = device_id.map(str::to_owned);
    }) {
        Ok((previous, saved)) => {
            crate::analytics::track_settings_changes(app, &previous, &saved);
            super::refresh_speech_menus(app, &saved);
            state.emit_settings_changed(app, &saved);
        }
        Err(error) => tracing::error!("Failed to update microphone selection: {error}"),
    }
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
    fn failed_microphone_discovery_still_allows_system_default() {
        let entries = microphone_rows(None, Err("unavailable".into()));
        assert!(
            matches!(entries.first(), Some(MicrophoneRow::Selectable { id, checked: true, .. }) if id == MENU_ID_MIC_DEFAULT)
        );
    }
}
