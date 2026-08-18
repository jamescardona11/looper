use crate::AppRuntime;
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use tauri::AppHandle;

static ACTIVE_GENERATION: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PermissionKind {
    Accessibility,
    Microphone,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) struct Watch {
    generation: u64,
    permission: Option<PermissionKind>,
}

impl Watch {
    pub(super) fn begin(action: Option<&str>) -> Self {
        Self {
            generation: ACTIVE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1,
            permission: PermissionKind::from_action(action),
        }
    }

    pub(super) fn monitor(self, app: AppHandle<AppRuntime>) {
        let Some(permission) = self.permission else {
            return;
        };
        std::thread::spawn(move || wait_until_resolved(app, permission, self.generation));
    }
}

impl PermissionKind {
    fn from_action(action: Option<&str>) -> Option<Self> {
        match action {
            Some("open_accessibility_settings") => Some(Self::Accessibility),
            Some("open_microphone_settings") => Some(Self::Microphone),
            _ => None,
        }
    }

    fn has_resolved(self, app: &AppHandle<AppRuntime>) -> bool {
        match self {
            Self::Accessibility => accessibility_ready(app),
            Self::Microphone => crate::permissions::check_microphone_permission(),
        }
    }
}

pub(super) fn invalidate() {
    ACTIVE_GENERATION.fetch_add(1, Ordering::SeqCst);
}

fn wait_until_resolved(app: AppHandle<AppRuntime>, permission: PermissionKind, generation: u64) {
    loop {
        std::thread::sleep(Duration::from_millis(500));
        if generation_is_stale(generation) {
            return;
        }
        if permission.has_resolved(&app) && !generation_is_stale(generation) {
            super::hide(&app);
            return;
        }
    }
}

fn generation_is_stale(generation: u64) -> bool {
    ACTIVE_GENERATION.load(Ordering::SeqCst) != generation
}

fn accessibility_ready(app: &AppHandle<AppRuntime>) -> bool {
    if !crate::permissions::check_accessibility_permission() {
        return false;
    }
    match crate::restore_recording_shortcuts(app) {
        Ok(()) => true,
        Err(error) => {
            tracing::warn!("Accessibility granted but shortcuts are not ready: {error}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::PermissionKind;

    #[test]
    fn maps_only_supported_settings_actions_to_permissions() {
        assert_eq!(
            PermissionKind::from_action(Some("open_accessibility_settings")),
            Some(PermissionKind::Accessibility)
        );
        assert_eq!(
            PermissionKind::from_action(Some("open_microphone_settings")),
            Some(PermissionKind::Microphone)
        );
        assert_eq!(
            PermissionKind::from_action(Some("retry_transcription")),
            None
        );
        assert_eq!(PermissionKind::from_action(None), None);
    }
}
