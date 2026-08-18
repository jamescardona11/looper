use anyhow::{Context, Result};
use tauri::WebviewWindow;
use windows::Win32::Foundation::{GetLastError, SetLastError, HWND, WIN32_ERROR};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_TOPMOST,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_SHOWNOACTIVATE,
    WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};

use crate::AppRuntime;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ExtendedStylePlan {
    current: u32,
    desired: u32,
}

impl ExtendedStylePlan {
    fn for_overlay(current: u32, interactive: bool) -> Self {
        let mut desired = current | WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0;
        desired &= !WS_EX_APPWINDOW.0;
        if interactive {
            desired &= !WS_EX_TRANSPARENT.0;
        } else {
            desired |= WS_EX_TRANSPARENT.0;
        }
        Self { current, desired }
    }

    fn changed(self) -> bool {
        self.current != self.desired
    }
}

#[derive(Clone, Copy)]
struct NativeOverlay {
    hwnd: HWND,
}

impl NativeOverlay {
    fn attach(window: &WebviewWindow<AppRuntime>) -> Result<Self> {
        let hwnd = window.hwnd().context("get Windows overlay HWND")?;
        Ok(Self { hwnd: HWND(hwnd.0) })
    }

    fn configure(self, interactive: bool) -> Result<()> {
        let plan = ExtendedStylePlan::for_overlay(self.read_extended_style()?, interactive);
        if plan.changed() {
            self.write_extended_style(plan.desired)?;
        }
        Ok(())
    }

    fn read_extended_style(self) -> Result<u32> {
        unsafe {
            SetLastError(WIN32_ERROR(0));
            let style = GetWindowLongPtrW(self.hwnd, GWL_EXSTYLE);
            if style == 0 {
                let error = GetLastError();
                if error.0 != 0 {
                    anyhow::bail!(
                        "get Windows overlay extended styles failed with Win32 error {}",
                        error.0
                    );
                }
            }
            Ok(style as u32)
        }
    }

    fn write_extended_style(self, style: u32) -> Result<()> {
        unsafe {
            SetLastError(WIN32_ERROR(0));
            let previous = SetWindowLongPtrW(self.hwnd, GWL_EXSTYLE, style as isize);
            if previous == 0 {
                let error = GetLastError();
                if error.0 != 0 {
                    anyhow::bail!(
                        "set Windows overlay extended styles failed with Win32 error {}",
                        error.0
                    );
                }
            }
            SetWindowPos(
                self.hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            )
            .context("apply Windows overlay extended styles")?;
        }
        Ok(())
    }

    fn reveal_without_activation(self) -> Result<()> {
        unsafe {
            let _ = ShowWindow(self.hwnd, SW_SHOWNOACTIVATE);
            SetWindowPos(
                self.hwnd,
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
            )
            .context("show Windows overlay without activation")?;
        }
        Ok(())
    }
}

pub fn init(overlay_window: &WebviewWindow<AppRuntime>) -> Result<()> {
    overlay_window.set_ignore_cursor_events(true)?;
    NativeOverlay::attach(overlay_window)?.configure(false)
}

pub fn show(overlay_window: &WebviewWindow<AppRuntime>, interactive: bool) -> Result<()> {
    set_interactive(overlay_window, interactive)?;
    NativeOverlay::attach(overlay_window)?.reveal_without_activation()
}

pub fn set_interactive(
    overlay_window: &WebviewWindow<AppRuntime>,
    interactive: bool,
) -> Result<()> {
    overlay_window.set_ignore_cursor_events(!interactive)?;
    NativeOverlay::attach(overlay_window)?.configure(interactive)
}

#[cfg(test)]
mod tests {
    use super::*;

    const UNRELATED_STYLE: u32 = 0x0000_0010;

    #[test]
    fn passive_overlay_is_tool_topology_without_activation_or_pointer_input() {
        let plan = ExtendedStylePlan::for_overlay(WS_EX_APPWINDOW.0 | UNRELATED_STYLE, false);

        assert_eq!(plan.desired & WS_EX_APPWINDOW.0, 0);
        assert_ne!(plan.desired & WS_EX_TOOLWINDOW.0, 0);
        assert_ne!(plan.desired & WS_EX_NOACTIVATE.0, 0);
        assert_ne!(plan.desired & WS_EX_TRANSPARENT.0, 0);
        assert_ne!(plan.desired & UNRELATED_STYLE, 0);
    }

    #[test]
    fn interactive_overlay_only_removes_pointer_passthrough() {
        let base = WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0 | WS_EX_TRANSPARENT.0 | UNRELATED_STYLE;
        let plan = ExtendedStylePlan::for_overlay(base, true);

        assert_eq!(plan.desired & WS_EX_TRANSPARENT.0, 0);
        assert_ne!(plan.desired & WS_EX_NOACTIVATE.0, 0);
        assert_ne!(plan.desired & WS_EX_TOOLWINDOW.0, 0);
        assert_ne!(plan.desired & UNRELATED_STYLE, 0);
    }

    #[test]
    fn already_configured_style_does_not_require_native_rewrite() {
        let current = WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0 | WS_EX_TRANSPARENT.0;
        assert!(!ExtendedStylePlan::for_overlay(current, false).changed());
    }
}
