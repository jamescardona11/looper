use std::os::raw::c_void;
use std::ptr::NonNull;

use crossbeam_channel::Sender;
use objc2_core_audio::{
    kAudioHardwareNoError, kAudioHardwarePropertyDefaultInputDevice, kAudioHardwarePropertyDevices,
    kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject,
    AudioObjectAddPropertyListener, AudioObjectID, AudioObjectPropertyAddress,
    AudioObjectPropertySelector, AudioObjectRemovePropertyListener,
};
use tauri::{AppHandle, Emitter, Manager};

use crate::{set_app_menu, tray, AppRuntime, AppState, SETTINGS_WINDOW_LABEL};

pub const EVENT_INPUT_DEVICES_CHANGED: &str = "audio:input-devices-changed";

pub fn init(app: &AppHandle<AppRuntime>) -> Result<(), String> {
    let watcher_app = app.clone();
    std::thread::Builder::new()
        .name("audio-device-watcher".to_owned())
        .spawn(move || {
            if let Err(error) = watch_device_changes(watcher_app) {
                tracing::error!("Failed to start input device watcher: {error}");
            }
        })
        .map(|_| ())
        .map_err(|error| format!("Failed to spawn input device watcher: {error}"))
}

fn watch_device_changes(app: AppHandle<AppRuntime>) -> Result<(), String> {
    let (notifications, changes) = crossbeam_channel::bounded(1);
    let _subscriptions = CoreAudioWatch::install(notifications)?;

    for () in changes {
        DeviceMenuRefresh::new(&app).perform();
        let _ = app.emit_to(SETTINGS_WINDOW_LABEL, EVENT_INPUT_DEVICES_CHANGED, ());
    }
    Ok(())
}

struct DeviceMenuRefresh<'a> {
    app: &'a AppHandle<AppRuntime>,
}

impl<'a> DeviceMenuRefresh<'a> {
    fn new(app: &'a AppHandle<AppRuntime>) -> Self {
        Self { app }
    }

    fn perform(self) {
        let settings = self.app.state::<AppState>().current_settings();
        if let Err(error) = set_app_menu(self.app, &settings) {
            tracing::error!("Failed to refresh app menu after input device change: {error}");
        }
        if let Err(error) = tray::refresh_tray_menu(self.app, &settings) {
            tracing::error!("Failed to refresh tray menu after input device change: {error}");
        }
    }
}

struct CoreAudioWatch {
    // Rust drops fields in declaration order, undoing the registration order.
    _default_input: CoreAudioSubscription,
    _inventory: CoreAudioSubscription,
}

impl CoreAudioWatch {
    fn install(notifications: Sender<()>) -> Result<Self, String> {
        let inventory =
            CoreAudioSubscription::register(kAudioHardwarePropertyDevices, notifications.clone())?;
        let default_input = CoreAudioSubscription::register(
            kAudioHardwarePropertyDefaultInputDevice,
            notifications,
        )?;
        Ok(Self {
            _default_input: default_input,
            _inventory: inventory,
        })
    }
}

struct ChangeMailbox {
    notifications: Sender<()>,
}

impl ChangeMailbox {
    fn notify(&self) {
        let _ = self.notifications.try_send(());
    }
}

struct CoreAudioSubscription {
    property: AudioObjectPropertyAddress,
    mailbox: Box<ChangeMailbox>,
}

impl CoreAudioSubscription {
    fn register(
        selector: AudioObjectPropertySelector,
        notifications: Sender<()>,
    ) -> Result<Self, String> {
        let property = property_address(selector);
        let mailbox = Box::new(ChangeMailbox { notifications });
        let status = unsafe {
            AudioObjectAddPropertyListener(
                system_audio_object(),
                NonNull::from(&property),
                Some(on_audio_property_changed),
                mailbox_pointer(&mailbox),
            )
        };
        if status == kAudioHardwareNoError {
            Ok(Self { property, mailbox })
        } else {
            Err(listener_error(status))
        }
    }
}

impl Drop for CoreAudioSubscription {
    fn drop(&mut self) {
        let _ = unsafe {
            AudioObjectRemovePropertyListener(
                system_audio_object(),
                NonNull::from(&self.property),
                Some(on_audio_property_changed),
                mailbox_pointer(&self.mailbox),
            )
        };
    }
}

fn property_address(selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress {
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    }
}

fn system_audio_object() -> AudioObjectID {
    kAudioObjectSystemObject as AudioObjectID
}

fn mailbox_pointer(mailbox: &ChangeMailbox) -> *mut c_void {
    std::ptr::from_ref(mailbox).cast_mut().cast()
}

fn listener_error(status: i32) -> String {
    format!("CoreAudio listener failed with status {status}")
}

unsafe extern "C-unwind" fn on_audio_property_changed(
    _: AudioObjectID,
    _: u32,
    _: NonNull<AudioObjectPropertyAddress>,
    context: *mut c_void,
) -> i32 {
    if let Some(mailbox) = (context as *mut ChangeMailbox).as_ref() {
        mailbox.notify();
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn address_targets_the_global_main_element_for_the_requested_selector() {
        let address = property_address(kAudioHardwarePropertyDefaultInputDevice);

        assert_eq!(address.mSelector, kAudioHardwarePropertyDefaultInputDevice);
        assert_eq!(address.mScope, kAudioObjectPropertyScopeGlobal);
        assert_eq!(address.mElement, kAudioObjectPropertyElementMain);
    }

    #[test]
    fn native_callback_coalesces_a_burst_into_the_single_bounded_slot() {
        let (notifications, changes) = crossbeam_channel::bounded(1);
        let mailbox = Box::new(ChangeMailbox { notifications });
        let mut address = property_address(kAudioHardwarePropertyDevices);
        let address_pointer = NonNull::from(&mut address);

        unsafe {
            on_audio_property_changed(0, 1, address_pointer, mailbox_pointer(&mailbox));
            on_audio_property_changed(0, 1, address_pointer, mailbox_pointer(&mailbox));
        }

        assert_eq!(changes.len(), 1);
        assert_eq!(changes.try_recv(), Ok(()));
    }

    #[test]
    fn native_callback_accepts_a_null_context_and_keeps_the_success_status() {
        let mut address = property_address(kAudioHardwarePropertyDevices);

        let status = unsafe {
            on_audio_property_changed(0, 0, NonNull::from(&mut address), std::ptr::null_mut())
        };

        assert_eq!(status, 0);
        assert_eq!(
            listener_error(-50),
            "CoreAudio listener failed with status -50"
        );
    }

    #[test]
    #[ignore = "requires CoreAudio on a macOS host"]
    fn host_listener_registration_smoke() {
        let (notifications, _changes) = crossbeam_channel::bounded(1);
        let subscriptions = CoreAudioWatch::install(notifications).unwrap();
        drop(subscriptions);
    }
}
