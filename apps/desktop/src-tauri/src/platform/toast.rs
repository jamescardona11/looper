use crate::AppRuntime;
use anyhow::Result;
use tauri::{AppHandle, WebviewWindow};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ToastSurfaceAction {
    Prepare,
    Reveal,
    AcceptPointer(bool),
    Conceal,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ToastVisibility {
    Preserve,
    Visible,
    Hidden,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ToastEffectPlan {
    pub(crate) accepts_pointer: Option<bool>,
    pub(crate) visibility: ToastVisibility,
}

impl ToastSurfaceAction {
    fn description(self) -> &'static str {
        match self {
            Self::Prepare => "prepare",
            Self::Reveal => "reveal",
            Self::AcceptPointer(true) => "enable pointer input",
            Self::AcceptPointer(false) => "disable pointer input",
            Self::Conceal => "conceal",
        }
    }

    #[cfg(any(target_os = "windows", test))]
    pub(crate) const fn effect_plan(self) -> ToastEffectPlan {
        match self {
            Self::Prepare => ToastEffectPlan {
                accepts_pointer: Some(false),
                visibility: ToastVisibility::Preserve,
            },
            Self::Reveal => ToastEffectPlan {
                accepts_pointer: None,
                visibility: ToastVisibility::Visible,
            },
            Self::AcceptPointer(accepts_pointer) => ToastEffectPlan {
                accepts_pointer: Some(accepts_pointer),
                visibility: ToastVisibility::Preserve,
            },
            Self::Conceal => ToastEffectPlan {
                accepts_pointer: Some(false),
                visibility: ToastVisibility::Hidden,
            },
        }
    }
}

pub fn init(app: &AppHandle<AppRuntime>, toast_window: &WebviewWindow<AppRuntime>) {
    dispatch(app, toast_window, ToastSurfaceAction::Prepare);
}

pub fn show(app: &AppHandle<AppRuntime>, toast_window: &WebviewWindow<AppRuntime>) {
    dispatch(app, toast_window, ToastSurfaceAction::Reveal);
}

pub fn set_interactive(
    app: &AppHandle<AppRuntime>,
    toast_window: &WebviewWindow<AppRuntime>,
    interactive: bool,
) {
    dispatch(
        app,
        toast_window,
        ToastSurfaceAction::AcceptPointer(interactive),
    );
}

pub fn hide(app: &AppHandle<AppRuntime>, toast_window: &WebviewWindow<AppRuntime>) {
    dispatch(app, toast_window, ToastSurfaceAction::Conceal);
}

fn dispatch(
    app: &AppHandle<AppRuntime>,
    toast_window: &WebviewWindow<AppRuntime>,
    action: ToastSurfaceAction,
) {
    if let Err(error) = apply_native_action(app, toast_window, action) {
        tracing::error!(
            window = toast_window.label(),
            operation = action.description(),
            %error,
            "Native toast surface operation failed"
        );
    }
}

#[cfg(target_os = "macos")]
fn apply_native_action(
    app: &AppHandle<AppRuntime>,
    toast_window: &WebviewWindow<AppRuntime>,
    action: ToastSurfaceAction,
) -> Result<()> {
    crate::platform::macos::toast::apply(app, toast_window, action)
}

#[cfg(target_os = "windows")]
fn apply_native_action(
    _app: &AppHandle<AppRuntime>,
    toast_window: &WebviewWindow<AppRuntime>,
    action: ToastSurfaceAction,
) -> Result<()> {
    crate::platform::windows::toast::apply(toast_window, action)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn apply_native_action(
    _app: &AppHandle<AppRuntime>,
    _toast_window: &WebviewWindow<AppRuntime>,
    _action: ToastSurfaceAction,
) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{ToastEffectPlan, ToastSurfaceAction, ToastVisibility};

    #[test]
    fn action_descriptions_distinguish_pointer_modes() {
        assert_eq!(
            ToastSurfaceAction::AcceptPointer(true).description(),
            "enable pointer input"
        );
        assert_eq!(
            ToastSurfaceAction::AcceptPointer(false).description(),
            "disable pointer input"
        );
    }

    #[test]
    fn concealment_disables_pointer_input_before_hiding() {
        assert_eq!(
            ToastSurfaceAction::Conceal.effect_plan(),
            ToastEffectPlan {
                accepts_pointer: Some(false),
                visibility: ToastVisibility::Hidden,
            }
        );
    }

    #[test]
    fn reveal_preserves_the_existing_pointer_mode() {
        assert_eq!(
            ToastSurfaceAction::Reveal.effect_plan(),
            ToastEffectPlan {
                accepts_pointer: None,
                visibility: ToastVisibility::Visible,
            }
        );
    }
}
