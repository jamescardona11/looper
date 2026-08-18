use std::cmp::Ordering;

use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Default)]
struct DeviceFingerprint {
    id: Option<String>,
    name: Option<String>,
}

impl DeviceFingerprint {
    fn inspect_default(device: Option<&cpal::Device>) -> Self {
        let Some(device) = device else {
            return Self::default();
        };
        Self {
            id: device.id().ok().map(|id| id.to_string()),
            name: device
                .description()
                .ok()
                .map(|description| description.name().to_owned()),
        }
    }

    fn identifies(&self, candidate: &DeviceCandidate) -> bool {
        self.id.as_deref() == Some(candidate.id.as_str())
            || self.name.as_deref() == Some(candidate.name.as_str())
    }
}

struct DeviceCandidate {
    id: String,
    name: String,
}

impl DeviceCandidate {
    fn inspect(device: cpal::Device) -> Option<Self> {
        let name = device.description().ok()?.name().to_owned();
        let id = device
            .id()
            .map(|id| id.to_string())
            .unwrap_or_else(|_| name.clone());
        Some(Self { id, name })
    }
}

struct DeviceInventory {
    default: DeviceFingerprint,
    devices: Vec<DeviceInfo>,
}

impl DeviceInventory {
    fn new(default: DeviceFingerprint) -> Self {
        Self {
            default,
            devices: Vec::new(),
        }
    }

    fn include(&mut self, candidate: DeviceCandidate) {
        let is_default = self.default.identifies(&candidate);
        self.devices.push(DeviceInfo {
            id: candidate.id,
            name: candidate.name,
            is_default,
        });
    }

    fn finish(mut self) -> Vec<DeviceInfo> {
        self.devices.sort_by(device_order);
        self.devices
    }
}

fn device_order(left: &DeviceInfo, right: &DeviceInfo) -> Ordering {
    match right.is_default.cmp(&left.is_default) {
        Ordering::Equal => left.name.cmp(&right.name),
        default_order => default_order,
    }
}

#[tauri::command]
pub fn list_input_devices() -> std::result::Result<Vec<DeviceInfo>, String> {
    let host = cpal::default_host();
    let default = DeviceFingerprint::inspect_default(host.default_input_device().as_ref());
    let available = host
        .input_devices()
        .map_err(|error| format!("Failed to list input devices: {error}"))?;

    let mut inventory = DeviceInventory::new(default);
    for candidate in available.filter_map(DeviceCandidate::inspect) {
        inventory.include(candidate);
    }
    Ok(inventory.finish())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn candidate(id: &str, name: &str) -> DeviceCandidate {
        DeviceCandidate {
            id: id.to_owned(),
            name: name.to_owned(),
        }
    }

    #[test]
    fn inventory_marks_default_by_id_then_sorts_default_first_and_names_afterward() {
        let mut inventory = DeviceInventory::new(DeviceFingerprint {
            id: Some("usb-2".to_owned()),
            name: Some("Old name".to_owned()),
        });
        inventory.include(candidate("usb-1", "Zeta"));
        inventory.include(candidate("usb-2", "Beta"));
        inventory.include(candidate("usb-3", "Alpha"));

        let devices = inventory.finish();

        assert_eq!(
            devices
                .iter()
                .map(|device| device.name.as_str())
                .collect::<Vec<_>>(),
            ["Beta", "Alpha", "Zeta"]
        );
        assert!(devices[0].is_default);
        assert!(!devices[1].is_default);
    }

    #[test]
    fn default_name_fallback_marks_every_device_with_that_name() {
        let mut inventory = DeviceInventory::new(DeviceFingerprint {
            id: None,
            name: Some("Shared microphone".to_owned()),
        });
        inventory.include(candidate("first", "Shared microphone"));
        inventory.include(candidate("second", "Shared microphone"));

        let devices = inventory.finish();

        assert!(devices.iter().all(|device| device.is_default));
    }

    #[test]
    fn device_info_keeps_the_frontend_wire_fields() {
        let value = serde_json::to_value(DeviceInfo {
            id: "built-in".to_owned(),
            name: "MacBook Microphone".to_owned(),
            is_default: true,
        })
        .unwrap();

        assert_eq!(
            value,
            json!({
                "id": "built-in",
                "name": "MacBook Microphone",
                "is_default": true
            })
        );
    }

    #[test]
    #[ignore = "requires a host audio backend"]
    fn host_device_enumeration_smoke() {
        list_input_devices().unwrap();
    }
}
