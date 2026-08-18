use crate::platform::toast::{ToastSurfaceAction, ToastVisibility};
use anyhow::Result;
use tauri::WebviewWindow;

pub(crate) fn apply(window: &WebviewWindow, action: ToastSurfaceAction) -> Result<()> {
    let plan = action.effect_plan();

    if let Some(accepts_pointer) = plan.accepts_pointer {
        set_pointer_input(window, accepts_pointer)?;
    }

    match plan.visibility {
        ToastVisibility::Preserve => Ok(()),
        ToastVisibility::Visible => window.show().map_err(Into::into),
        ToastVisibility::Hidden => window.hide().map_err(Into::into),
    }
}

fn set_pointer_input(window: &WebviewWindow, accepts_pointer: bool) -> Result<()> {
    window
        .set_ignore_cursor_events(!accepts_pointer)
        .map_err(Into::into)
}
