//! ¿Hay otra aplicación usando el micrófono ahora mismo?
//!
//! Es la señal para reconocer una reunión que nadie agendó: una llamada abre
//! una entrada de audio, mientras reproducir música solo abre una salida.
//! CoreAudio expone ambas cosas por proceso, así que no hace falta analizar
//! audio ni pedir permiso de grabación de pantalla.
//!
//! Looper también aparece en la lista mientras dicta. Se excluye por PID para
//! que la app no se ofrezca a grabar su propio dictado. CoreSpeech mantiene
//! una entrada para Siri, así que se excluye por su bundle ID exacto.

use std::ptr::NonNull;

use core_foundation::{
    base::TCFType,
    string::{CFString, CFStringRef},
};
use objc2_core_audio::{
    kAudioHardwareNoError, kAudioHardwarePropertyProcessObjectList,
    kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject,
    kAudioProcessPropertyBundleID, kAudioProcessPropertyIsRunningInput, kAudioProcessPropertyPID,
    AudioObjectGetPropertyData, AudioObjectGetPropertyDataSize, AudioObjectID,
    AudioObjectPropertyAddress,
};

fn address(selector: u32) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress {
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    }
}

fn all_audio_processes() -> Option<Vec<AudioObjectID>> {
    let addr = address(kAudioHardwarePropertyProcessObjectList);
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
    if status != kAudioHardwareNoError {
        return None;
    }
    if size == 0 {
        return Some(Vec::new());
    }

    let object_size = std::mem::size_of::<AudioObjectID>();
    if size as usize % object_size != 0 {
        return None;
    }

    let mut processes = vec![0 as AudioObjectID; size as usize / object_size];
    let buffer = NonNull::new(processes.as_mut_ptr() as *mut std::ffi::c_void)?;
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
    if status != kAudioHardwareNoError || size as usize % object_size != 0 {
        return None;
    }

    processes.truncate(size as usize / object_size);
    Some(processes)
}

fn process_pid(process: AudioObjectID) -> Option<i32> {
    let addr = address(kAudioProcessPropertyPID);
    let mut pid = 0_i32;
    let mut size = std::mem::size_of::<i32>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            process,
            NonNull::from(&addr),
            0,
            std::ptr::null(),
            NonNull::from(&mut size),
            NonNull::new(&mut pid as *mut i32 as *mut std::ffi::c_void)?,
        )
    };
    if status != kAudioHardwareNoError || size != std::mem::size_of::<i32>() as u32 {
        return None;
    }

    Some(pid)
}

fn process_bundle_id(process: AudioObjectID) -> Option<String> {
    let addr = address(kAudioProcessPropertyBundleID);
    let mut bundle_id: CFStringRef = std::ptr::null();
    let mut size = std::mem::size_of::<CFStringRef>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            process,
            NonNull::from(&addr),
            0,
            std::ptr::null(),
            NonNull::from(&mut size),
            NonNull::new(&mut bundle_id as *mut CFStringRef as *mut std::ffi::c_void)?,
        )
    };
    if status != kAudioHardwareNoError || bundle_id.is_null() {
        return None;
    }

    // CoreAudio entrega este CFString con ownership al caller.
    let bundle_id = unsafe { CFString::wrap_under_create_rule(bundle_id) };
    if size != std::mem::size_of::<CFStringRef>() as u32 {
        return None;
    }

    Some(bundle_id.to_string())
}

fn process_is_running_input(process: AudioObjectID) -> Option<bool> {
    let addr = address(kAudioProcessPropertyIsRunningInput);
    let mut running = 0_u32;
    let mut size = std::mem::size_of::<u32>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            process,
            NonNull::from(&addr),
            0,
            std::ptr::null(),
            NonNull::from(&mut size),
            NonNull::new(&mut running as *mut u32 as *mut std::ffi::c_void)?,
        )
    };
    if status != kAudioHardwareNoError || size != std::mem::size_of::<u32>() as u32 {
        return None;
    }

    Some(running != 0)
}

fn is_current_process(pid: i32, current_pid: u32) -> bool {
    u32::try_from(pid) == Ok(current_pid)
}

fn is_ignored_input_bundle(bundle_id: &str) -> bool {
    bundle_id == "com.apple.CoreSpeech"
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ProcessObservation {
    pid: Option<i32>,
    bundle_id: Option<String>,
    running_input: Option<bool>,
}

fn classify_external_input(
    current_pid: u32,
    observations: impl IntoIterator<Item = ProcessObservation>,
) -> Option<bool> {
    let mut inspected_reliably = false;
    let mut incomplete = false;

    for observation in observations {
        let Some(pid) = observation.pid else {
            incomplete = true;
            continue;
        };
        inspected_reliably = true;

        if is_current_process(pid, current_pid) {
            continue;
        }

        match observation.running_input {
            Some(true)
                if observation
                    .bundle_id
                    .as_deref()
                    .is_some_and(is_ignored_input_bundle) => {}
            Some(true) => return Some(true),
            Some(false) => {}
            None => incomplete = true,
        }
    }

    if incomplete {
        None
    } else {
        inspected_reliably.then_some(false)
    }
}

/// `Some(true)` significa que otro proceso tiene una entrada activa.
/// `Some(false)` significa que CoreAudio se pudo inspeccionar y no encontró
/// entrada externa. `None` conserva la diferencia entre "libre" y "no se pudo
/// consultar" en sistemas donde la API no está disponible o cambió durante la
/// lectura.
pub fn input_device_in_use() -> Option<bool> {
    let processes = all_audio_processes()?;
    if processes.is_empty() {
        return Some(false);
    }

    let observations = processes.into_iter().map(|process| {
        let pid = process_pid(process);
        let running_input = pid
            .filter(|pid| !is_current_process(*pid, std::process::id()))
            .and_then(|_| process_is_running_input(process));
        let bundle_id = running_input
            .filter(|running| *running)
            .and_then(|_| process_bundle_id(process));

        ProcessObservation {
            pid,
            bundle_id,
            running_input,
        }
    });

    classify_external_input(std::process::id(), observations)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn observed(pid: i32, bundle_id: Option<&str>, running_input: bool) -> ProcessObservation {
        ProcessObservation {
            pid: Some(pid),
            bundle_id: bundle_id.map(str::to_owned),
            running_input: Some(running_input),
        }
    }

    #[test]
    fn process_list_uses_the_global_scope_and_expected_selector() {
        let addr = address(kAudioHardwarePropertyProcessObjectList);

        assert_eq!(addr.mSelector, kAudioHardwarePropertyProcessObjectList);
        assert_eq!(addr.mScope, kAudioObjectPropertyScopeGlobal);
    }

    #[test]
    fn process_pid_uses_the_global_scope_and_expected_selector() {
        let addr = address(kAudioProcessPropertyPID);

        assert_eq!(addr.mSelector, kAudioProcessPropertyPID);
        assert_eq!(addr.mScope, kAudioObjectPropertyScopeGlobal);
    }

    #[test]
    fn input_activity_uses_the_process_input_selector() {
        let addr = address(kAudioProcessPropertyIsRunningInput);

        assert_eq!(addr.mSelector, kAudioProcessPropertyIsRunningInput);
        assert_eq!(addr.mScope, kAudioObjectPropertyScopeGlobal);
    }

    #[test]
    fn bundle_lookup_uses_the_process_bundle_selector() {
        let addr = address(kAudioProcessPropertyBundleID);

        assert_eq!(addr.mSelector, kAudioProcessPropertyBundleID);
        assert_eq!(addr.mScope, kAudioObjectPropertyScopeGlobal);
    }

    #[test]
    fn pid_matching_rejects_negative_and_accepts_the_current_pid() {
        assert!(is_current_process(321, 321));
        assert!(!is_current_process(320, 321));
        assert!(!is_current_process(-1, u32::MAX));
    }

    #[test]
    fn excludes_looper_even_when_its_input_is_running() {
        let current_pid = 321;
        let result = classify_external_input(
            current_pid,
            [observed(321, Some("com.j11.looper.desktop"), true)],
        );

        assert_eq!(result, Some(false));
    }

    #[test]
    fn reports_input_from_another_process() {
        let result = classify_external_input(321, [observed(654, Some("us.zoom.xos"), true)]);

        assert_eq!(result, Some(true));
    }

    #[test]
    fn ignores_corespeech_input_activity() {
        let result =
            classify_external_input(321, [observed(654, Some("com.apple.CoreSpeech"), true)]);

        assert_eq!(result, Some(false));
    }

    #[test]
    fn corespeech_does_not_hide_real_external_input() {
        let result = classify_external_input(
            321,
            [
                observed(654, Some("com.apple.CoreSpeech"), true),
                observed(987, Some("com.google.Chrome"), true),
            ],
        );

        assert_eq!(result, Some(true));
    }

    #[test]
    fn active_input_without_bundle_is_still_external() {
        let result = classify_external_input(321, [observed(654, None, true)]);

        assert_eq!(result, Some(true));
    }

    #[test]
    fn only_the_exact_corespeech_bundle_is_ignored() {
        let result = classify_external_input(
            321,
            [observed(654, Some("com.apple.CoreSpeech.helper"), true)],
        );

        assert_eq!(result, Some(true));
    }

    #[test]
    fn output_only_processes_do_not_look_like_microphone_activity() {
        let result = classify_external_input(321, [observed(654, None, false)]);

        assert_eq!(result, Some(false));
    }

    #[test]
    fn incomplete_process_data_stays_inconclusive() {
        let result = classify_external_input(
            321,
            [
                observed(654, None, false),
                ProcessObservation {
                    pid: Some(987),
                    bundle_id: Some("us.zoom.xos".to_owned()),
                    running_input: None,
                },
            ],
        );

        assert_eq!(result, None);
    }

    #[test]
    fn reports_a_verdict_or_admits_it_could_not_look() {
        match input_device_in_use() {
            Some(true) | Some(false) | None => {}
        }
    }

    /// Necesita micrófono y ffmpeg, así que no corre en CI:
    /// `cargo test --lib mic_activity -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn notices_another_process_opening_the_microphone() {
        use std::process::{Command, Stdio};
        use std::thread::sleep;
        use std::time::Duration;

        let before = input_device_in_use();
        if before != Some(false) {
            eprintln!("saltado: estado inicial del micrófono: {before:?}");
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
                "-f",
                "null",
                "-",
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
