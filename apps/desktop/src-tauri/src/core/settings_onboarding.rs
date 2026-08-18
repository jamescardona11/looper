use tauri::AppHandle;

use crate::{analytics, AppRuntime, AppState};

pub(crate) fn complete_onboarding(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
) -> Result<(), String> {
    apply_transition(app, state, OnboardingTransition::Completed)
}

pub(crate) fn reset_onboarding(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
) -> Result<(), String> {
    apply_transition(app, state, OnboardingTransition::Reset)
}

enum OnboardingTransition {
    Completed,
    Reset,
}

impl OnboardingTransition {
    fn is_completed(&self) -> bool {
        matches!(self, Self::Completed)
    }

    fn tracks_completion(&self) -> bool {
        self.is_completed()
    }
}

fn apply_transition(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    transition: OnboardingTransition,
) -> Result<(), String> {
    let mut next = state.current_settings_unmasked();
    next.onboarding_completed = transition.is_completed();
    let persisted = state
        .persist_settings(next)
        .map_err(|error| error.to_string())?;

    state.emit_settings_changed(app, &persisted);
    if transition.tracks_completion() {
        analytics::track_onboarding_completed(app);
    }
    Ok(())
}
