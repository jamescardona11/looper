use crate::{platform::toast::ToastSurfaceAction, AppRuntime};
use anyhow::{Context, Result};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

tauri_panel! {
    panel!(PassiveToastPanel {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            becomes_key_only_if_needed: true,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
    })
}

pub(crate) fn apply(
    app: &AppHandle<AppRuntime>,
    window: &WebviewWindow<AppRuntime>,
    action: ToastSurfaceAction,
) -> Result<()> {
    match action {
        ToastSurfaceAction::Prepare => prepare_panel(app, window),
        ToastSurfaceAction::Reveal => schedule_panel_change(app, window, PanelChange::Reveal),
        ToastSurfaceAction::AcceptPointer(accepts_pointer) => {
            schedule_panel_change(app, window, PanelChange::PointerInput(accepts_pointer))
        }
        ToastSurfaceAction::Conceal => {
            park_outside_visible_area(window);
            schedule_panel_change(app, window, PanelChange::Conceal)
        }
    }
}

fn prepare_panel(app: &AppHandle<AppRuntime>, window: &WebviewWindow<AppRuntime>) -> Result<()> {
    let label = window.label().to_owned();
    window
        .to_panel::<PassiveToastPanel>()
        .map_err(|error| anyhow::anyhow!(format!("{error:?}")))
        .with_context(|| format!("convert window '{label}' into a native toast panel"))?;

    if let Ok(panel) = app.get_webview_panel(&label) {
        panel.set_style_mask(panel_style().into());
        panel.set_collection_behavior(space_behavior().into());
        panel.set_level(PanelLevel::Floating.into());
        panel.set_becomes_key_only_if_needed(true);
        panel.set_floating_panel(true);
        panel.set_hides_on_deactivate(false);
        panel.set_has_shadow(false);
        panel.set_ignores_mouse_events(true);
        panel.hide();
    }

    Ok(())
}

fn schedule_panel_change(
    app: &AppHandle<AppRuntime>,
    window: &WebviewWindow<AppRuntime>,
    change: PanelChange,
) -> Result<()> {
    let handle = app.clone();
    let label = window.label().to_owned();
    app.run_on_main_thread(move || {
        if let Ok(panel) = handle.get_webview_panel(&label) {
            match change {
                PanelChange::Reveal => panel.as_panel().orderFront(None),
                PanelChange::PointerInput(accepts_pointer) => {
                    panel.set_ignores_mouse_events(!accepts_pointer);
                }
                PanelChange::Conceal => {
                    panel.set_ignores_mouse_events(true);
                    panel.hide();
                }
            }
        }
    })
    .context("schedule native toast panel update")
}

fn panel_style() -> StyleMask {
    StyleMask::empty().borderless().nonactivating_panel()
}

fn space_behavior() -> CollectionBehavior {
    CollectionBehavior::new()
        .can_join_all_spaces()
        .stationary()
        .ignores_cycle()
        .full_screen_auxiliary()
}

fn park_outside_visible_area(window: &WebviewWindow<AppRuntime>) {
    const PARKING_COORDINATE: i32 = -9_999;
    let parked = tauri::PhysicalPosition::new(PARKING_COORDINATE, PARKING_COORDINATE);
    let _ = window.set_position(parked);
}

#[derive(Clone, Copy)]
enum PanelChange {
    Reveal,
    PointerInput(bool),
    Conceal,
}
