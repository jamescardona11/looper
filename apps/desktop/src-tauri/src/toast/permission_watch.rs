use crate::AppRuntime;
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use tauri::AppHandle;

static ACCESSIBILITY_GENERATION: AtomicU64 = AtomicU64::new(0);
static MICROPHONE_GENERATION: AtomicU64 = AtomicU64::new(0);
static NEXT_TOAST_ID: AtomicU64 = AtomicU64::new(0);
static ACTIVE_TOAST_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PermissionKind {
    Accessibility,
    Microphone,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) struct Watch {
    generation: u64,
    permission: PermissionKind,
    toast_id: u64,
}

impl Watch {
    pub(super) fn begin(action: Option<&str>) -> Option<Self> {
        let Some(permission) = PermissionKind::from_action(action) else {
            mark_toast_hidden();
            return None;
        };
        let watch = Self {
            generation: permission.bump_generation(),
            permission,
            toast_id: NEXT_TOAST_ID.fetch_add(1, Ordering::SeqCst) + 1,
        };
        ACTIVE_TOAST_ID.store(watch.toast_id, Ordering::SeqCst);
        Some(watch)
    }

    pub(super) fn monitor(self, app: AppHandle<AppRuntime>) {
        std::thread::spawn(move || wait_until_resolved(app, self));
    }

    fn take_visible_toast(self) -> bool {
        ACTIVE_TOAST_ID
            .compare_exchange(self.toast_id, 0, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
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

    fn generation(self) -> &'static AtomicU64 {
        match self {
            Self::Accessibility => &ACCESSIBILITY_GENERATION,
            Self::Microphone => &MICROPHONE_GENERATION,
        }
    }

    fn bump_generation(self) -> u64 {
        self.generation().fetch_add(1, Ordering::SeqCst) + 1
    }
}

pub(super) fn mark_toast_hidden() {
    ACTIVE_TOAST_ID.store(0, Ordering::SeqCst);
}

fn wait_until_resolved(app: AppHandle<AppRuntime>, watch: Watch) {
    loop {
        std::thread::sleep(Duration::from_millis(500));
        if generation_is_stale(watch.permission, watch.generation) {
            return;
        }
        if watch.permission.has_resolved(&app)
            && !generation_is_stale(watch.permission, watch.generation)
        {
            if watch.take_visible_toast() {
                super::hide(&app);
            }
            return;
        }
    }
}

fn generation_is_stale(permission: PermissionKind, generation: u64) -> bool {
    permission.generation().load(Ordering::SeqCst) != generation
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
    use super::{generation_is_stale, mark_toast_hidden, PermissionKind, Watch};

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

    #[test]
    fn permission_monitors_have_independent_lifecycles() {
        let accessibility = Watch::begin(Some("open_accessibility_settings")).unwrap();
        assert!(accessibility.take_visible_toast());

        let accessibility = Watch::begin(Some("open_accessibility_settings")).unwrap();
        let microphone = Watch::begin(Some("open_microphone_settings")).unwrap();

        assert!(!generation_is_stale(
            PermissionKind::Accessibility,
            accessibility.generation,
        ));
        assert!(!generation_is_stale(
            PermissionKind::Microphone,
            microphone.generation,
        ));

        mark_toast_hidden();
        assert!(!microphone.take_visible_toast());
        assert!(!generation_is_stale(
            PermissionKind::Accessibility,
            accessibility.generation,
        ));
        assert!(!generation_is_stale(
            PermissionKind::Microphone,
            microphone.generation,
        ));

        let replacement = Watch::begin(Some("open_accessibility_settings")).unwrap();
        assert!(generation_is_stale(
            PermissionKind::Accessibility,
            accessibility.generation,
        ));
        assert!(!generation_is_stale(
            PermissionKind::Accessibility,
            replacement.generation,
        ));
        assert!(!generation_is_stale(
            PermissionKind::Microphone,
            microphone.generation,
        ));

        assert!(Watch::begin(Some("retry_transcription")).is_none());
        assert!(!replacement.take_visible_toast());
        assert!(!generation_is_stale(
            PermissionKind::Accessibility,
            replacement.generation,
        ));
    }
}
