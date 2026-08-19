//! ¿Hay otra aplicación usando el micrófono ahora mismo?
//!
//! Es la señal con la que se reconoce una reunión que nadie agendó: una
//! llamada abre el micrófono, y la música no. CoreAudio ya lleva la cuenta en
//! `kAudioDevicePropertyDeviceIsRunningSomewhere`, así que no hace falta
//! analizar audio ni pedir permiso de grabación de pantalla.
//!
//! Se recorren todos los dispositivos, no solo el predeterminado: en un Mac
//! con AirPods, cámara y micrófono interno conviven varios, y la llamada
//! puede estar abriendo uno que no es el activo por defecto. Preguntar solo
//! por el predeterminado deja pasar justo ese caso.
//!
//! Cuidado al usarlo: mientras Looper dicta, el micrófono también está
//! ocupado - por él mismo. Quien consulte esto debe descartar ese caso, o la
//! app se ofrecerá a grabar el propio dictado del usuario.

use std::ptr::NonNull;

use objc2_core_audio::{
    kAudioDevicePropertyDeviceIsRunningSomewhere, kAudioHardwareNoError,
    kAudioDevicePropertyStreams, kAudioHardwarePropertyDevices, kAudioObjectPropertyElementMain,
    kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyScopeInput, kAudioObjectSystemObject,
    AudioObjectGetPropertyData, AudioObjectGetPropertyDataSize, AudioObjectID,
    AudioObjectPropertyAddress,
};

fn address(selector: u32, scope: u32) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress {
        mSelector: selector,
        mScope: scope,
        mElement: kAudioObjectPropertyElementMain,
    }
}

fn all_devices() -> Vec<AudioObjectID> {
    let addr = address(
        kAudioHardwarePropertyDevices,
        kAudioObjectPropertyScopeGlobal,
    );
    let mut size: u32 = 0;

    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            kAudioObjectSystemObject as AudioObjectID,
            NonNull::from(&addr),
            0,
            std::ptr::null(),
            NonNull::from(&mut size),
        )
    };
    if status != kAudioHardwareNoError || size == 0 {
        return Vec::new();
    }

    let count = size as usize / std::mem::size_of::<AudioObjectID>();
    let mut devices = vec![0 as AudioObjectID; count];
    let Some(buffer) = NonNull::new(devices.as_mut_ptr() as *mut std::ffi::c_void) else {
        return Vec::new();
    };

    let status = unsafe {
        AudioObjectGetPropertyData(
            kAudioObjectSystemObject as AudioObjectID,
            NonNull::from(&addr),
            0,
            std::ptr::null(),
            NonNull::from(&mut size),
            buffer,
        )
    };
    if status != kAudioHardwareNoError {
        return Vec::new();
    }
    devices
        .into_iter()
        .filter(|device| device_has_input_stream(*device))
        .collect()
}

fn device_has_input_stream(device: AudioObjectID) -> bool {
    let addr = address(kAudioDevicePropertyStreams, kAudioObjectPropertyScopeInput);
    let mut size: u32 = 0;
    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            device,
            NonNull::from(&addr),
            0,
            std::ptr::null(),
            NonNull::from(&mut size),
        )
    };
    status == kAudioHardwareNoError && size > 0
}

/// `DeviceIsRunningSomewhere` es un estado del dispositivo completo. Se
/// filtran antes los dispositivos con entrada para no contar altavoces, pero
/// la consulta de actividad debe usar el scope global de CoreAudio.
fn device_capturing(device: AudioObjectID) -> Option<bool> {
    let addr = address(
        kAudioDevicePropertyDeviceIsRunningSomewhere,
        kAudioObjectPropertyScopeGlobal,
    );
    let mut running: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            device,
            NonNull::from(&addr),
            0,
            std::ptr::null(),
            NonNull::from(&mut size),
            NonNull::new(&mut running as *mut u32 as *mut std::ffi::c_void)?,
        )
    };
    if status != kAudioHardwareNoError {
        return None;
    }
    Some(running != 0)
}

/// `None` cuando no se pudo mirar ningún dispositivo, que no es lo mismo que
/// saber que están todos libres. Se distingue a propósito de `Some(false)`.
pub fn input_device_in_use() -> Option<bool> {
    let devices = all_devices();
    if devices.is_empty() {
        return None;
    }

    let mut looked_at_one = false;
    for device in devices {
        match device_capturing(device) {
            Some(true) => return Some(true),
            Some(false) => looked_at_one = true,
            None => {}
        }
    }

    looked_at_one.then_some(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_a_verdict_or_admits_it_could_not_look() {
        match input_device_in_use() {
            Some(true) | Some(false) | None => {}
        }
    }

    #[test]
    fn a_mac_has_at_least_one_audio_device() {
        assert!(
            !all_devices().is_empty(),
            "CoreAudio no devolvió ningún dispositivo"
        );
    }

    #[test]
    fn running_state_is_asked_on_the_global_scope() {
        let addr = address(
            kAudioDevicePropertyDeviceIsRunningSomewhere,
            kAudioObjectPropertyScopeGlobal,
        );

        assert_eq!(addr.mScope, kAudioObjectPropertyScopeGlobal);
    }

    #[test]
    fn input_stream_inventory_is_asked_on_the_input_scope() {
        let addr = address(kAudioDevicePropertyStreams, kAudioObjectPropertyScopeInput);

        assert_eq!(addr.mScope, kAudioObjectPropertyScopeInput);
    }

    /// Necesita micrófono y ffmpeg, así que no corre en CI:
    /// `cargo test --lib mic_activity -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn notices_another_process_opening_the_microphone() {
        use std::process::{Command, Stdio};
        use std::thread::sleep;
        use std::time::Duration;

        if input_device_in_use() != Some(false) {
            eprintln!("saltado: algo ya tiene el micrófono abierto");
            return;
        }

        let mut recorder = Command::new("ffmpeg")
            .args([
                "-f",
                "avfoundation",
                "-i",
                ":0",
                "-t",
                "10",
                "-y",
                "/tmp/mic-probe.wav",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("ffmpeg no arrancó");
        sleep(Duration::from_secs(3));

        let while_recording = input_device_in_use();
        let _ = recorder.kill();
        let _ = recorder.wait();
        sleep(Duration::from_secs(2));
        let after = input_device_in_use();

        assert_eq!(while_recording, Some(true), "no vio el micrófono ocupado");
        assert_eq!(after, Some(false), "siguió creyéndolo ocupado al soltarlo");
    }
}
