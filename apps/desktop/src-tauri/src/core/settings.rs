pub(crate) use settings_input::UpdateSettingsArgs;
pub(crate) use settings_onboarding::{complete_onboarding, reset_onboarding};
pub(crate) use settings_runtime::update as update_settings;

#[path = "settings_input.rs"]
mod settings_input;
#[path = "settings_onboarding.rs"]
mod settings_onboarding;
#[path = "settings_runtime.rs"]
mod settings_runtime;
