use anyhow::{anyhow, Context, Result};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

use crate::AppRuntime;

tauri_panel! {
    panel!(OverlayHUD {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            becomes_key_only_if_needed: true,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct PanelPolicy {
    becomes_key_only_if_needed: bool,
    floating: bool,
    hides_on_deactivate: bool,
    shadow: bool,
    alpha: f64,
}

impl PanelPolicy {
    const fn overlay() -> Self {
        Self {
            becomes_key_only_if_needed: true,
            floating: true,
            hides_on_deactivate: false,
            shadow: false,
            alpha: 1.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PointerPolicy {
    PassThrough,
    Interactive,
}

impl PointerPolicy {
    fn from_interactive(interactive: bool) -> Self {
        if interactive {
            Self::Interactive
        } else {
            Self::PassThrough
        }
    }

    fn ignores_mouse_events(self) -> bool {
        self == Self::PassThrough
    }
}

pub fn init(app: &AppHandle<AppRuntime>, overlay_window: &WebviewWindow<AppRuntime>) -> Result<()> {
    overlay_window
        .to_panel::<OverlayHUD>()
        .map_err(|error| anyhow!(format!("{error:?}")))
        .context("convert main overlay window to macOS NSPanel")?;

    let panel = app
        .get_webview_panel(crate::MAIN_WINDOW_LABEL)
        .map_err(|error| anyhow!(format!("{error:?}")))
        .context("get macOS overlay panel")?;
    let policy = PanelPolicy::overlay();

    panel.set_style_mask(initial_style().into());
    panel.set_level(PanelLevel::Floating.into());
    panel.set_collection_behavior(space_behavior().into());
    panel.set_becomes_key_only_if_needed(policy.becomes_key_only_if_needed);
    panel.set_floating_panel(policy.floating);
    panel.set_hides_on_deactivate(policy.hides_on_deactivate);
    panel.set_has_shadow(policy.shadow);
    panel.set_ignores_mouse_events(PointerPolicy::PassThrough.ignores_mouse_events());
    Ok(())
}

fn initial_style() -> StyleMask {
    StyleMask::empty().borderless().nonactivating_panel()
}

fn space_behavior() -> CollectionBehavior {
    CollectionBehavior::new()
        .can_join_all_spaces()
        .stationary()
        .ignores_cycle()
        .full_screen_auxiliary()
}

pub fn show(
    app: &AppHandle<AppRuntime>,
    overlay_window: &WebviewWindow<AppRuntime>,
    interactive: bool,
) -> Result<()> {
    // The webview and its NSPanel have independent visibility. WebKit will not
    // repaint a sticky if only the native panel is ordered to the front.
    overlay_window
        .show()
        .context("show macOS overlay webview")?;
    schedule_reveal(app, PointerPolicy::from_interactive(interactive));
    Ok(())
}

fn schedule_reveal(app: &AppHandle<AppRuntime>, pointer: PointerPolicy) {
    let app_handle = app.clone();
    let policy = PanelPolicy::overlay();
    let _ = app.run_on_main_thread(move || {
        let Ok(panel) = app_handle.get_webview_panel(crate::MAIN_WINDOW_LABEL) else {
            return;
        };
        panel.set_alpha_value(policy.alpha);
        panel.set_level(PanelLevel::Floating.into());
        panel.set_hides_on_deactivate(policy.hides_on_deactivate);
        panel.show();
        panel.order_front_regardless();
        panel.set_ignores_mouse_events(pointer.ignores_mouse_events());
    });
}

pub fn set_interactive(app: &AppHandle<AppRuntime>, interactive: bool) -> Result<()> {
    schedule_pointer_policy(app, PointerPolicy::from_interactive(interactive));
    Ok(())
}

fn schedule_pointer_policy(app: &AppHandle<AppRuntime>, pointer: PointerPolicy) {
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_handle.get_webview_panel(crate::MAIN_WINDOW_LABEL) {
            panel.set_ignores_mouse_events(pointer.ignores_mouse_events());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlay_policy_never_activates_or_hides_with_the_app() {
        let policy = PanelPolicy::overlay();
        assert!(policy.becomes_key_only_if_needed);
        assert!(policy.floating);
        assert!(!policy.hides_on_deactivate);
        assert!(!policy.shadow);
        assert_eq!(policy.alpha, 1.0);
    }

    #[test]
    fn pointer_policy_is_the_inverse_of_native_mouse_passthrough() {
        let passive = PointerPolicy::from_interactive(false);
        let active = PointerPolicy::from_interactive(true);

        assert_eq!(passive, PointerPolicy::PassThrough);
        assert!(passive.ignores_mouse_events());
        assert_eq!(active, PointerPolicy::Interactive);
        assert!(!active.ignores_mouse_events());
    }
}
