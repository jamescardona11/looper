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
    transparent: bool,
    alpha: f64,
}

impl PanelPolicy {
    const fn overlay() -> Self {
        Self {
            becomes_key_only_if_needed: true,
            floating: true,
            hides_on_deactivate: false,
            shadow: false,
            transparent: true,
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
    // `to_panel` sustituye la superficie transparente que Tauri configuró en
    // la WebviewWindow. Sin restaurarla, macOS pinta el frame completo del
    // overlay alrededor de la pill.
    panel.set_transparent(policy.transparent);
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

pub async fn set_frame(
    app: &AppHandle<AppRuntime>,
    overlay_window: &WebviewWindow<AppRuntime>,
    logical_size: (f64, f64),
    physical_origin: (i32, i32),
) -> Result<()> {
    let current_origin = overlay_window
        .outer_position()
        .context("read current macOS overlay position")?;
    let scale = overlay_window
        .scale_factor()
        .context("read macOS overlay scale")?;
    let app_handle = app.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();

    app.run_on_main_thread(move || {
        let result = apply_frame(
            &app_handle,
            (current_origin.x, current_origin.y),
            logical_size,
            physical_origin,
            scale,
        );
        let _ = sender.send(result);
    })
    .context("schedule macOS overlay frame update")?;

    receiver
        .await
        .context("wait for macOS overlay frame update")?
}

/// Enqueues one AppKit frame mutation before the webview receives its next
/// visual state. Unlike separate Tauri size and position calls, macOS cannot
/// paint an intermediate frame while the compact pill becomes the recorder.
pub fn schedule_frame(
    app: &AppHandle<AppRuntime>,
    overlay_window: &WebviewWindow<AppRuntime>,
    logical_size: (f64, f64),
    physical_origin: (i32, i32),
) -> Result<()> {
    let current_origin = overlay_window
        .outer_position()
        .context("read current macOS overlay position")?;
    let scale = overlay_window
        .scale_factor()
        .context("read macOS overlay scale")?;
    let app_handle = app.clone();

    app.run_on_main_thread(move || {
        if let Err(error) = apply_frame(
            &app_handle,
            (current_origin.x, current_origin.y),
            logical_size,
            physical_origin,
            scale,
        ) {
            tracing::error!("Failed to apply scheduled macOS overlay frame: {error}");
        }
    })
    .context("schedule macOS overlay frame update")
}

fn apply_frame(
    app: &AppHandle<AppRuntime>,
    current_tauri_origin: (i32, i32),
    logical_size: (f64, f64),
    physical_origin: (i32, i32),
    scale: f64,
) -> Result<()> {
    let panel = app
        .get_webview_panel(crate::MAIN_WINDOW_LABEL)
        .map_err(|error| anyhow!(format!("{error:?}")))
        .context("get macOS overlay panel")?;
    let current_frame = panel.as_panel().frame();
    let target_frame = panel_frame_for_tauri_target(
        current_frame,
        current_tauri_origin,
        physical_origin,
        logical_size,
        scale,
    );
    panel.as_panel().setFrame_display(target_frame, true);
    Ok(())
}

fn panel_frame_for_tauri_target(
    current_frame: NSRect,
    current_tauri_origin: (i32, i32),
    target_tauri_origin: (i32, i32),
    target_logical_size: (f64, f64),
    scale: f64,
) -> NSRect {
    let delta_x = f64::from(target_tauri_origin.0 - current_tauri_origin.0) / scale;
    let delta_y = f64::from(target_tauri_origin.1 - current_tauri_origin.1) / scale;
    let target_x = current_frame.origin.x + delta_x;

    // Tauri mide Y hacia abajo desde la esquina superior; AppKit, hacia arriba
    // desde la inferior. Conservamos el punto superior mientras cambia el alto.
    let current_top = current_frame.origin.y + current_frame.size.height;
    let target_top = current_top - delta_y;
    let target_y = target_top - target_logical_size.1;

    NSRect::new(
        NSPoint::new(target_x, target_y),
        NSSize::new(target_logical_size.0, target_logical_size.1),
    )
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
        assert!(policy.transparent);
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

    #[test]
    fn panel_frame_updates_size_and_top_left_in_one_step() {
        let current = NSRect::new(NSPoint::new(100.0, 500.0), NSSize::new(268.0, 56.0));

        let target = panel_frame_for_tauri_target(
            current,
            (200, 300),
            (170, -4),
            (328.0, 360.0),
            2.0,
        );

        assert_eq!(target.origin, NSPoint::new(85.0, 348.0));
        assert_eq!(target.size, NSSize::new(328.0, 360.0));
    }
}
