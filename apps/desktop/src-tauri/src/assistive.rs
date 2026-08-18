use anyhow::{anyhow, Result};

#[cfg(not(target_os = "macos"))]
use arboard::Clipboard;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use arboard::Error as ClipboardError;
#[cfg(target_os = "macos")]
use arboard::{Clipboard, ImageData, SetExtApple};
#[cfg(target_os = "windows")]
use arboard::{ImageData, SetExtWindows};
#[cfg(target_os = "macos")]
use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation, CGKeyCode};
#[cfg(target_os = "macos")]
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::{thread, time::Duration};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    VIRTUAL_KEY, VK_C, VK_CONTROL, VK_RIGHT, VK_V, VK_Z,
};

const MAX_FOCUSED_TEXT_SNAPSHOT_LEN: usize = 20_000;

#[derive(Clone, Debug, PartialEq)]
pub struct FocusedTextSnapshot {
    pub pid: i32,
    pub role: Option<String>,
    pub subrole: Option<String>,
    pub value: String,
    pub frame: Option<(f64, f64, f64, f64)>,
    /// Selected text range (location, length) in UTF-16 code units, as
    /// reported by the accessibility API. `None` when the focused element
    /// doesn't expose a selection (or on platforms that don't read it).
    /// Used only to compute an expected post-insertion value for
    /// verification purposes - not authoritative for the actual insertion.
    pub selection: Option<(i64, i64)>,
}

#[cfg(target_os = "macos")]
pub fn focused_text_snapshot() -> Option<FocusedTextSnapshot> {
    macos_ax::focused_text_snapshot()
}

#[cfg(target_os = "windows")]
pub fn focused_text_snapshot() -> Option<FocusedTextSnapshot> {
    windows_uia::focused_text_snapshot()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn focused_text_snapshot() -> Option<FocusedTextSnapshot> {
    None
}

#[cfg(target_os = "macos")]
pub fn get_selected_text_ax() -> Option<String> {
    match macos_ax::probe_selection() {
        macos_ax::SelectionProbe::Text(text) if !text.trim().is_empty() => return Some(text),
        macos_ax::SelectionProbe::Empty => return None,
        macos_ax::SelectionProbe::Text(_) | macos_ax::SelectionProbe::Unknown => {}
    }

    selected_text_via_copy(Duration::from_millis(50))
}

#[cfg(target_os = "macos")]
mod macos_ax {
    use core_foundation::array::CFArray;
    use core_foundation::base::{CFRelease, CFType, CFTypeRef, TCFType};
    use core_foundation::data::{CFData, CFDataRef};
    use core_foundation::string::{CFString, CFStringRef};
    use std::ffi::c_void;
    use std::ptr;
    use std::sync::OnceLock;

    type AXUIElementRef = *mut c_void;
    type AXError = i32;
    const AX_ERROR_SUCCESS: AXError = 0;
    const AX_VALUE_TYPE_CG_POINT: u32 = 1;
    const AX_VALUE_TYPE_CG_SIZE: u32 = 2;
    const AX_VALUE_TYPE_CF_RANGE: u32 = 4;

    #[repr(C)]
    struct CFRange {
        location: isize,
        length: isize,
    }

    #[repr(C)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    #[repr(C)]
    struct CGSize {
        width: f64,
        height: f64,
    }

    struct AxElement(AXUIElementRef);

    impl AxElement {
        fn as_ptr(&self) -> AXUIElementRef {
            self.0
        }

        unsafe fn system_wide() -> Option<Self> {
            let element = AXUIElementCreateSystemWide();
            (!element.is_null()).then_some(Self(element))
        }
    }

    impl Drop for AxElement {
        fn drop(&mut self) {
            unsafe { CFRelease(self.0.cast()) };
        }
    }

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateSystemWide() -> AXUIElementRef;
        fn AXUIElementCopyAttributeValue(
            element: *mut c_void,
            attribute: *const c_void,
            value: *mut *mut c_void,
        ) -> i32;
        fn AXUIElementGetPid(element: *mut c_void, pid: *mut i32) -> i32;
        fn AXUIElementSetAttributeValue(
            element: *mut c_void,
            attribute: *const c_void,
            value: *const c_void,
        ) -> i32;
        fn AXUIElementIsAttributeSettable(
            element: *mut c_void,
            attribute: *const c_void,
            settable: *mut u8,
        ) -> i32;
        fn AXValueGetValue(value: *const c_void, ax_type: u32, value_ptr: *mut c_void) -> bool;
        fn AXIsProcessTrusted() -> u8;
    }

    /// Outcome of attempting to write to the focused element via the
    /// Accessibility API.
    pub(super) enum AxWriteOutcome {
        /// The write was accepted by the target application.
        Applied,
        /// The attribute isn't settable on this element - direct insertion
        /// doesn't apply here, fall back to paste without treating this as a
        /// failure.
        NotSettable,
        /// The write was attempted but the API reported an error.
        Failed,
        /// Focus moved to a different process between snapshot and write;
        /// refusing to write into an element we didn't intend to target.
        PidMismatch,
    }

    struct FocusedWrite<'a> {
        attribute: &'static str,
        text: &'a str,
        verify_settable: bool,
    }

    /// Inserts `text` at the current selection/cursor of the focused element
    /// by writing the standard `AXSelectedText` attribute, which every
    /// well-behaved AX text implementation treats as "replace the current
    /// selection with this string" (or "insert at the caret" when the
    /// selection is collapsed). `expected_pid` guards against a focus change
    /// that happened after the pre-insertion snapshot was taken.
    pub(super) fn insert_selected_text(expected_pid: i32, text: &str) -> AxWriteOutcome {
        write_focused_text(
            expected_pid,
            FocusedWrite {
                attribute: "AXSelectedText",
                text,
                verify_settable: true,
            },
        )
    }

    /// Restores the focused element's full text value to `previous_value`.
    /// Used to undo a direct AX insertion. Only the value is restored (not
    /// the previous selection/caret position) to keep the AX write surface
    /// small.
    pub(super) fn restore_value(expected_pid: i32, previous_value: &str) -> AxWriteOutcome {
        write_focused_text(
            expected_pid,
            FocusedWrite {
                attribute: "AXValue",
                text: previous_value,
                verify_settable: false,
            },
        )
    }

    fn write_focused_text(expected_pid: i32, request: FocusedWrite<'_>) -> AxWriteOutcome {
        let Some(focused) = copy_focused_element() else {
            return AxWriteOutcome::Failed;
        };
        let element = focused.as_ptr();
        if unsafe { read_pid(element) } != Some(expected_pid) {
            return AxWriteOutcome::PidMismatch;
        }

        let role = unsafe { read_string_attribute(element, "AXRole") };
        let subrole = unsafe { read_string_attribute(element, "AXSubrole") };
        if is_secure_text_field(role.as_deref(), subrole.as_deref()) {
            return AxWriteOutcome::NotSettable;
        }

        let attribute = CFString::new(request.attribute);
        if request.verify_settable {
            let mut settable = 0u8;
            let status = unsafe {
                AXUIElementIsAttributeSettable(
                    element,
                    attribute.as_concrete_TypeRef().cast(),
                    &mut settable,
                )
            };
            if status != AX_ERROR_SUCCESS || settable == 0 {
                return AxWriteOutcome::NotSettable;
            }
        }

        let value = CFString::new(request.text);
        let status = unsafe {
            AXUIElementSetAttributeValue(
                element,
                attribute.as_concrete_TypeRef().cast(),
                value.as_concrete_TypeRef().cast(),
            )
        };
        if status == AX_ERROR_SUCCESS {
            AxWriteOutcome::Applied
        } else {
            AxWriteOutcome::Failed
        }
    }

    pub(super) enum SelectionProbe {
        Text(String),
        Empty,
        Unknown,
    }

    pub(super) fn probe_selection() -> SelectionProbe {
        let Some(focused) = copy_focused_element() else {
            return SelectionProbe::Unknown;
        };
        unsafe { probe_focused(focused.as_ptr()) }
    }

    pub(super) fn focused_text_snapshot() -> Option<super::FocusedTextSnapshot> {
        if let Some(focused) = copy_focused_element() {
            let snapshot = unsafe { snapshot_from_text_element(focused.as_ptr()) };
            if snapshot.is_some() {
                return snapshot;
            }
        }

        unsafe { focused_window_text_snapshot() }
    }

    unsafe fn focused_window_text_snapshot() -> Option<super::FocusedTextSnapshot> {
        let system = AxElement::system_wide()?;
        let app_element = copy_element_attribute(system.as_ptr(), "AXFocusedApplication")?;
        let window = copy_element_attribute(app_element.as_ptr(), "AXFocusedWindow")?;

        let mut budget = 80;
        find_text_snapshot(window.as_ptr(), &mut budget)
    }

    unsafe fn find_text_snapshot(
        element: AXUIElementRef,
        budget: &mut usize,
    ) -> Option<super::FocusedTextSnapshot> {
        if *budget == 0 {
            return None;
        }
        *budget -= 1;

        if let Some(snapshot) = snapshot_from_text_element(element) {
            return Some(snapshot);
        }

        let children_value = copy_attribute(element, "AXChildren")?;
        let children: CFArray<CFType> = TCFType::wrap_under_create_rule(children_value as *const _);
        for child in children.iter() {
            if *budget == 0 {
                break;
            }
            let child_element = child.as_CFTypeRef() as AXUIElementRef;
            if let Some(snapshot) = find_text_snapshot(child_element, budget) {
                return Some(snapshot);
            }
        }
        None
    }

    unsafe fn snapshot_from_text_element(
        element: AXUIElementRef,
    ) -> Option<super::FocusedTextSnapshot> {
        let role = read_string_attribute(element, "AXRole");
        let subrole = read_string_attribute(element, "AXSubrole");
        if is_secure_text_field(role.as_deref(), subrole.as_deref()) {
            return None;
        }

        let value = read_string_attribute(element, "AXValue")?;
        if value.len() > super::MAX_FOCUSED_TEXT_SNAPSHOT_LEN {
            return None;
        }

        let frame = read_frame(element);
        let selection = read_selected_text_range(element)
            .map(|range| (range.location as i64, range.length as i64));
        let pid = read_pid(element)?;

        Some(super::FocusedTextSnapshot {
            pid,
            role,
            subrole,
            value,
            frame,
            selection,
        })
    }

    fn copy_focused_element() -> Option<AxElement> {
        if unsafe { AXIsProcessTrusted() } == 0 {
            return None;
        }

        unsafe {
            let system = AxElement::system_wide()?;

            let focused_attr = CFString::new("AXFocusedUIElement");
            let mut focused: *mut c_void = ptr::null_mut();
            let err = AXUIElementCopyAttributeValue(
                system.as_ptr(),
                focused_attr.as_concrete_TypeRef() as *const c_void,
                &mut focused,
            );

            if err != AX_ERROR_SUCCESS || focused.is_null() {
                return None;
            }

            Some(AxElement(focused))
        }
    }

    #[cfg(test)]
    pub(super) fn is_process_trusted_for_host_smoke() -> bool {
        unsafe { AXIsProcessTrusted() != 0 }
    }

    #[cfg(test)]
    pub(super) fn focused_element_debug_for_host_smoke() -> String {
        let Some(focused) = copy_focused_element() else {
            return "focused_element=none".to_string();
        };

        unsafe {
            let element = focused.as_ptr();
            let role = read_string_attribute(element, "AXRole");
            let subrole = read_string_attribute(element, "AXSubrole");
            let value = read_string_attribute(element, "AXValue");
            let selected_text = read_string_attribute(element, "AXSelectedText");
            let selected_range = read_selected_text_range(element);
            let pid = read_pid(element);
            let frame = read_frame(element);

            format!(
                "focused_element role={:?}; subrole={:?}; pid={:?}; has_value={}; value_len={}; has_selected_text={}; selected_range={:?}; frame={:?}",
                role,
                subrole,
                pid,
                value.is_some(),
                value.as_ref().map_or(0, |text| text.len()),
                selected_text.as_ref().is_some_and(|text| !text.is_empty()),
                selected_range.map(|range| (range.location, range.length)),
                frame,
            )
        }
    }

    #[cfg(test)]
    pub(super) fn focused_window_debug_for_host_smoke() -> String {
        unsafe {
            let Some(system) = AxElement::system_wide() else {
                return "focused_window=system-null".to_string();
            };
            let Some(app_element) = copy_element_attribute(system.as_ptr(), "AXFocusedApplication")
            else {
                return "focused_window=app-none".to_string();
            };
            let Some(window) = copy_element_attribute(app_element.as_ptr(), "AXFocusedWindow")
            else {
                return "focused_window=window-none".to_string();
            };

            let title = read_string_attribute(window.as_ptr(), "AXTitle");
            let role = read_string_attribute(window.as_ptr(), "AXRole");
            let mut nodes = Vec::new();
            let mut budget = 18;
            collect_debug_nodes(window.as_ptr(), &mut budget, &mut nodes);

            format!(
                "focused_window title={:?}; role={:?}; nodes=[{}]",
                title,
                role,
                nodes.join(" | "),
            )
        }
    }

    #[cfg(test)]
    unsafe fn collect_debug_nodes(
        element: AXUIElementRef,
        budget: &mut usize,
        out: &mut Vec<String>,
    ) {
        if *budget == 0 {
            return;
        }
        *budget -= 1;

        let role = read_string_attribute(element, "AXRole");
        let subrole = read_string_attribute(element, "AXSubrole");
        let value_len = read_string_attribute(element, "AXValue").map(|value| value.len());
        let title = read_string_attribute(element, "AXTitle");
        out.push(format!(
            "role={:?},subrole={:?},value_len={:?},title={:?}",
            role, subrole, value_len, title
        ));

        let Some(children_value) = copy_attribute(element, "AXChildren") else {
            return;
        };
        let children: CFArray<CFType> = TCFType::wrap_under_create_rule(children_value as *const _);
        for child in children.iter() {
            if *budget == 0 {
                break;
            }
            collect_debug_nodes(child.as_CFTypeRef() as AXUIElementRef, budget, out);
        }
    }

    fn is_secure_text_field(role: Option<&str>, subrole: Option<&str>) -> bool {
        matches!(role, Some("AXSecureTextField")) || matches!(subrole, Some("AXSecureTextField"))
    }

    unsafe fn probe_focused(focused: AXUIElementRef) -> SelectionProbe {
        if let Some(text) = read_string_attribute(focused, "AXSelectedText") {
            if !text.is_empty() {
                return SelectionProbe::Text(text);
            }
        }

        if matches!(
            read_selected_text_range(focused),
            Some(CFRange { length: 0, .. })
        ) {
            return SelectionProbe::Empty;
        }

        SelectionProbe::Unknown
    }

    unsafe fn read_string_attribute(element: AXUIElementRef, attribute: &str) -> Option<String> {
        let value = copy_attribute(element, attribute)?;
        let cf_type: CFType = CFType::wrap_under_create_rule(value as *const _);
        let cf_string = cf_type.downcast::<CFString>()?;
        Some(cf_string.to_string())
    }

    unsafe fn read_selected_text_range(element: AXUIElementRef) -> Option<CFRange> {
        let value = copy_attribute(element, "AXSelectedTextRange")?;
        let mut range = CFRange {
            location: 0,
            length: 0,
        };
        let ok = AXValueGetValue(
            value,
            AX_VALUE_TYPE_CF_RANGE,
            &mut range as *mut CFRange as *mut c_void,
        );
        CFRelease(value as CFTypeRef);

        ok.then_some(range)
    }

    unsafe fn read_pid(element: AXUIElementRef) -> Option<i32> {
        let mut pid = 0;
        let err = AXUIElementGetPid(element, &mut pid);
        (err == AX_ERROR_SUCCESS).then_some(pid)
    }

    unsafe fn read_frame(element: AXUIElementRef) -> Option<(f64, f64, f64, f64)> {
        let position_value = copy_attribute(element, "AXPosition")?;
        let Some(size_value) = copy_attribute(element, "AXSize") else {
            CFRelease(position_value as CFTypeRef);
            return None;
        };

        let mut point = CGPoint { x: 0.0, y: 0.0 };
        let mut size = CGSize {
            width: 0.0,
            height: 0.0,
        };
        let point_ok = AXValueGetValue(
            position_value,
            AX_VALUE_TYPE_CG_POINT,
            &mut point as *mut CGPoint as *mut c_void,
        );
        let size_ok = AXValueGetValue(
            size_value,
            AX_VALUE_TYPE_CG_SIZE,
            &mut size as *mut CGSize as *mut c_void,
        );
        CFRelease(position_value as CFTypeRef);
        CFRelease(size_value as CFTypeRef);

        (point_ok && size_ok).then_some((point.x, point.y, size.width, size.height))
    }

    unsafe fn copy_attribute(element: AXUIElementRef, attribute: &str) -> Option<*mut c_void> {
        let attribute = CFString::new(attribute);
        let mut value: *mut c_void = ptr::null_mut();
        let err = AXUIElementCopyAttributeValue(
            element,
            attribute.as_concrete_TypeRef() as *const c_void,
            &mut value,
        );

        if err == AX_ERROR_SUCCESS && !value.is_null() {
            return Some(value);
        }

        None
    }

    unsafe fn copy_element_attribute(
        element: AXUIElementRef,
        attribute: &str,
    ) -> Option<AxElement> {
        copy_attribute(element, attribute).map(AxElement)
    }

    #[link(name = "Carbon", kind = "framework")]
    extern "C" {
        fn TISCopyCurrentKeyboardLayoutInputSource() -> *mut c_void;
        fn TISGetInputSourceProperty(
            input_source: *mut c_void,
            property_key: *const c_void,
        ) -> *const c_void;
        fn UCKeyTranslate(
            key_layout_ptr: *const c_void,
            virtual_key_code: u16,
            key_action: u16,
            modifier_key_state: u32,
            keyboard_type: u32,
            key_translate_options: u32,
            dead_key_state: *mut u32,
            max_string_length: usize,
            actual_string_length: *mut usize,
            unicode_string: *mut u16,
        ) -> i32;
        static kTISPropertyUnicodeKeyLayoutData: CFStringRef;
    }

    const UC_KEY_ACTION_DOWN: u16 = 0;

    #[derive(Clone, Copy)]
    struct ShortcutKeycodes {
        copy: Option<u16>,
        paste: Option<u16>,
        undo: Option<u16>,
    }

    static SHORTCUT_KEYCODES: OnceLock<ShortcutKeycodes> = OnceLock::new();

    /// Resolves the layout-dependent shortcut keycodes while Tauri is still
    /// running setup on macOS' main dispatch queue. Newer macOS versions abort
    /// the process when the Carbon input-source API is queried from a Tokio
    /// worker, so recording completion must only read this cache.
    pub(super) fn initialize_shortcut_keycodes() {
        let _ = SHORTCUT_KEYCODES.set(ShortcutKeycodes {
            copy: lookup_keycode_for_char('c'),
            paste: lookup_keycode_for_char('v'),
            undo: lookup_keycode_for_char('z'),
        });
    }

    /// Finds the virtual keycode that produces `target` (case-insensitively,
    /// with no modifiers held) in the currently active keyboard layout, by
    /// asking Carbon's Text Input Sources API for the layout data and
    /// `UCKeyTranslate` for what each virtual key produces. Returns `None`
    /// (caller falls back to a hardcoded US-layout keycode) if the layout
    /// can't be read or no key matches - this keeps a layout change from
    /// ever hard-breaking the synthetic keystrokes.
    fn lookup_keycode_for_char(target: char) -> Option<u16> {
        unsafe {
            let source = TISCopyCurrentKeyboardLayoutInputSource();
            if source.is_null() {
                return None;
            }

            let layout_data = TISGetInputSourceProperty(
                source,
                kTISPropertyUnicodeKeyLayoutData as *const c_void,
            );
            if layout_data.is_null() {
                CFRelease(source as CFTypeRef);
                return None;
            }

            let layout: CFData = TCFType::wrap_under_get_rule(layout_data as CFDataRef);
            let layout_ptr = layout.bytes().as_ptr() as *const c_void;
            let target_lower = target.to_ascii_lowercase();

            let mut found = None;
            for virtual_key in 0u16..128 {
                let mut dead_key_state: u32 = 0;
                let mut length: usize = 0;
                let mut chars = [0u16; 4];
                let status = UCKeyTranslate(
                    layout_ptr,
                    virtual_key,
                    UC_KEY_ACTION_DOWN,
                    0,
                    0,
                    0,
                    &mut dead_key_state,
                    chars.len(),
                    &mut length,
                    chars.as_mut_ptr(),
                );
                if status != 0 || length == 0 {
                    continue;
                }

                let produced = char::decode_utf16(chars[..length].iter().copied())
                    .next()
                    .and_then(|c| c.ok());
                if produced.is_some_and(|c| c.to_ascii_lowercase() == target_lower) {
                    found = Some(virtual_key);
                    break;
                }
            }

            CFRelease(source as CFTypeRef);
            found
        }
    }

    pub(super) fn keycode_for_char(target: char) -> Option<u16> {
        let keycodes = SHORTCUT_KEYCODES.get()?;
        match target.to_ascii_lowercase() {
            'c' => keycodes.copy,
            'v' => keycodes.paste,
            'z' => keycodes.undo,
            _ => None,
        }
    }

    #[cfg(test)]
    mod tests {
        use super::keycode_for_char;

        #[test]
        fn unsupported_shortcut_letters_use_the_callers_fallback() {
            assert_eq!(keycode_for_char('x'), None);
        }

        #[test]
        fn is_case_insensitive() {
            assert_eq!(keycode_for_char('v'), keycode_for_char('V'));
        }

        #[test]
        fn worker_threads_only_read_the_keycode_cache() {
            let handles: Vec<_> = ['c', 'v', 'z', 'c', 'v', 'z', 'c', 'v']
                .into_iter()
                .map(|target| std::thread::spawn(move || keycode_for_char(target)))
                .collect();

            for handle in handles {
                handle.join().expect("keycode_for_char thread panicked");
            }
        }
    }
}

#[cfg(target_os = "windows")]
mod windows_uia {
    use super::{FocusedTextSnapshot, MAX_FOCUSED_TEXT_SNAPSHOT_LEN};
    use windows::Win32::{
        Foundation::RPC_E_CHANGED_MODE,
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        },
        UI::Accessibility::{
            CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern,
            IUIAutomationValuePattern, UIA_TextPatternId, UIA_ValuePatternId,
        },
    };

    pub(super) fn focused_text_snapshot() -> Option<FocusedTextSnapshot> {
        unsafe {
            let _guard = ComGuard::new()?;
            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
            let element = automation.GetFocusedElement().ok()?;

            if element.CurrentIsPassword().ok()?.as_bool() {
                return None;
            }

            let value = read_text_value(&element)?;
            if value.len() > MAX_FOCUSED_TEXT_SNAPSHOT_LEN {
                return None;
            }

            let pid = element.CurrentProcessId().ok()?;
            let role = element
                .CurrentControlType()
                .ok()
                .map(|control_type| control_type.0.to_string());
            let subrole = element
                .CurrentLocalizedControlType()
                .ok()
                .map(|control_type| control_type.to_string());
            let frame = element.CurrentBoundingRectangle().ok().map(|rect| {
                (
                    rect.left as f64,
                    rect.top as f64,
                    (rect.right - rect.left) as f64,
                    (rect.bottom - rect.top) as f64,
                )
            });

            Some(FocusedTextSnapshot {
                pid,
                role,
                subrole,
                value,
                frame,
                // Reading the selection range would need the UIA TextPattern's
                // GetSelection, which isn't wired up here; direct-write
                // insertion isn't attempted on Windows (see insert_text
                // below), so verification falls back to the substring check.
                selection: None,
            })
        }
    }

    fn read_text_value(element: &IUIAutomationElement) -> Option<String> {
        unsafe {
            if let Ok(pattern) =
                element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
            {
                return Some(pattern.CurrentValue().ok()?.to_string());
            }

            let pattern = element
                .GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
                .ok()?;
            let range = pattern.DocumentRange().ok()?;
            let max_length = MAX_FOCUSED_TEXT_SNAPSHOT_LEN
                .saturating_add(1)
                .try_into()
                .ok()?;

            Some(range.GetText(max_length).ok()?.to_string())
        }
    }

    struct ComGuard {
        uninitialize_on_drop: bool,
    }

    impl ComGuard {
        fn new() -> Option<Self> {
            let result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
            if result.is_ok() {
                Some(Self {
                    uninitialize_on_drop: true,
                })
            } else if result == RPC_E_CHANGED_MODE {
                Some(Self {
                    uninitialize_on_drop: false,
                })
            } else {
                None
            }
        }
    }

    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.uninitialize_on_drop {
                unsafe {
                    CoUninitialize();
                }
            }
        }
    }
}

// Hardcoded US-ANSI-layout virtual keycodes, used only as a fallback when
// `keycode_for_char` can't resolve the active keyboard layout (e.g. missing
// Carbon input source data). `resolve_keycode` prefers the layout-aware
// lookup so Cmd+C/V/Z land on the right physical key on non-QWERTY layouts.
#[cfg(target_os = "macos")]
const FALLBACK_C_KEY: CGKeyCode = 8;
#[cfg(target_os = "macos")]
const FALLBACK_V_KEY: CGKeyCode = 9;
#[cfg(target_os = "macos")]
const FALLBACK_Z_KEY: CGKeyCode = 6;

#[cfg(target_os = "macos")]
fn resolve_keycode(target: char, fallback: CGKeyCode) -> CGKeyCode {
    macos_ax::keycode_for_char(target).unwrap_or(fallback)
}

#[cfg(target_os = "macos")]
pub fn initialize_shortcut_keycodes() {
    macos_ax::initialize_shortcut_keycodes();
}

#[cfg(target_os = "macos")]
fn send_cmd_keystroke(key: CGKeyCode) -> Result<()> {
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
        .map_err(|_| anyhow!("Failed to create CGEventSource"))?;

    let key_down = CGEvent::new_keyboard_event(source.clone(), key, true)
        .map_err(|_| anyhow!("Failed to create key-down event"))?;
    key_down.set_flags(CGEventFlags::CGEventFlagCommand);
    key_down.post(CGEventTapLocation::HID);

    thread::sleep(Duration::from_millis(5));

    let key_up = CGEvent::new_keyboard_event(source, key, false)
        .map_err(|_| anyhow!("Failed to create key-up event"))?;
    key_up.set_flags(CGEventFlags::CGEventFlagCommand);
    key_up.post(CGEventTapLocation::HID);

    Ok(())
}

#[cfg(target_os = "macos")]
fn send_copy_keystroke() -> Result<()> {
    send_cmd_keystroke(resolve_keycode('c', FALLBACK_C_KEY))
}

#[cfg(target_os = "macos")]
fn send_undo_keystroke() -> Result<()> {
    send_cmd_keystroke(resolve_keycode('z', FALLBACK_Z_KEY))
}

#[cfg(target_os = "windows")]
pub fn get_selected_text_ax() -> Option<String> {
    selected_text_via_copy(Duration::from_millis(80))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn selected_text_via_copy(read_delay: Duration) -> Option<String> {
    let mut clipboard = Clipboard::new().ok()?;
    let backup = ClipboardBackup::capture(&mut clipboard);
    let copied = if clipboard.clear().is_ok() {
        thread::sleep(Duration::from_millis(5));
        send_copy_keystroke().is_ok()
    } else {
        false
    };
    let selected = if copied {
        thread::sleep(read_delay);
        clipboard.get_text().ok()
    } else {
        None
    };
    backup.restore(&mut clipboard);
    selected.filter(|text| !text.trim().is_empty())
}

#[cfg(target_os = "windows")]
fn send_copy_keystroke() -> Result<()> {
    let inputs = [
        keyboard_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_C, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_C, KEYEVENTF_KEYUP),
        keyboard_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent != inputs.len() as u32 {
        return Err(anyhow!("Failed to send Ctrl+C copy keystroke"));
    }

    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn paste_text(text: &str) -> Result<()> {
    let mut clipboard = Clipboard::new().map_err(|e| anyhow!("Failed to access clipboard: {e}"))?;

    let backup = ClipboardBackup::capture(&mut clipboard);

    let inserted_text = text.to_string();
    set_text_excluding_history(&mut clipboard, inserted_text.clone())?;

    thread::sleep(Duration::from_millis(10));

    let paste_result = send_paste_keystroke();

    thread::spawn(move || {
        thread::sleep(Duration::from_millis(300));
        if let Ok(mut clipboard) = Clipboard::new() {
            if should_restore_after_paste(&mut clipboard, &inserted_text) {
                backup.restore(&mut clipboard);
            }
        }
    });

    paste_result
}

/// Which strategy actually inserted the text.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InsertionMethod {
    /// Wrote directly into the focused element's `AXSelectedText` attribute.
    AxDirect,
    /// Set the system clipboard and sent a synthetic Cmd+V/Ctrl+V.
    Paste,
}

/// Result of an [`insert_text`] call.
pub struct InsertOutcome {
    pub method: InsertionMethod,
    /// `true` when re-reading the focused element confirmed the text landed.
    pub verified: bool,
    /// `true` only when we positively confirmed the text is *not* present
    /// (as opposed to merely being unable to check) - this is what should
    /// drive a user-facing notification, to avoid false alarms on apps whose
    /// accessibility tree we can't read reliably.
    pub confirmed_failure: bool,
}

/// State needed to undo the most recent [`insert_text`] call.
pub enum UndoState {
    AxDirect {
        pid: i32,
        previous_value: String,
    },
    /// Undo by sending a synthetic Cmd+Z/Ctrl+Z to the target app, relying on
    /// its own undo stack (a real paste is a normal undoable edit for almost
    /// every app).
    Paste,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Verification {
    matched: bool,
    confirmed_mismatch: bool,
}

impl Verification {
    const INCONCLUSIVE: Self = Self {
        matched: false,
        confirmed_mismatch: false,
    };

    fn exact_match(matched: bool) -> Self {
        Self {
            matched,
            confirmed_mismatch: !matched,
        }
    }

    fn heuristic(matched: bool) -> Self {
        Self {
            matched,
            confirmed_mismatch: false,
        }
    }
}

/// Splices `text` into `previous_value` at `selection`, to compute what the
/// field's value should look like after a successful insertion.
///
/// `selection` is in UTF-16 code units (as accessibility APIs report it),
/// while this function indexes by Unicode scalar (`char`); the two only
/// diverge for characters outside the Basic Multilingual Plane (rare in
/// dictated text), in which case this simply returns a value that won't
/// match and verification safely falls back to the substring check.
fn expected_value_after_insert(
    previous_value: &str,
    selection: Option<(i64, i64)>,
    text: &str,
) -> Option<String> {
    let (start, len) = selection?;
    if start < 0 || len < 0 {
        return None;
    }
    let chars: Vec<char> = previous_value.chars().collect();
    let start = start as usize;
    let end = start.checked_add(len as usize)?;
    if start > chars.len() || end > chars.len() {
        return None;
    }

    let mut result: String = chars[..start].iter().collect();
    result.push_str(text);
    result.extend(&chars[end..]);
    Some(result)
}

/// Re-reads the focused element and checks whether `text` appears to have
/// landed, relative to the `pre` snapshot taken before insertion.
fn verify_insertion(pre: &FocusedTextSnapshot, text: &str) -> Verification {
    let post = focused_text_snapshot();
    assess_insertion(pre, post.as_ref(), text)
}

fn assess_insertion(
    pre: &FocusedTextSnapshot,
    post: Option<&FocusedTextSnapshot>,
    text: &str,
) -> Verification {
    let Some(post) = post else {
        return Verification::INCONCLUSIVE;
    };
    if post.pid != pre.pid {
        // Focus moved to a different app while we were inserting; we can't
        // judge success against a snapshot of a different target.
        return Verification::INCONCLUSIVE;
    }

    if let Some(expected) = expected_value_after_insert(&pre.value, pre.selection, text) {
        return Verification::exact_match(post.value == expected);
    }

    // No reliable selection to splice against - fall back to a heuristic.
    // A non-match here is treated as inconclusive rather than confirmed,
    // since some apps reformat/trim inserted text in ways this can't model.
    let matched = post.value != pre.value && post.value.contains(text.trim());
    Verification::heuristic(matched)
}

fn verify_insertion_optional(pre: Option<&FocusedTextSnapshot>, text: &str) -> Verification {
    match pre {
        Some(pre) => verify_insertion(pre, text),
        None => Verification::INCONCLUSIVE,
    }
}

#[cfg(test)]
mod verification_tests {
    use super::{assess_insertion, expected_value_after_insert, FocusedTextSnapshot, Verification};

    fn snapshot(pid: i32, value: &str, selection: Option<(i64, i64)>) -> FocusedTextSnapshot {
        FocusedTextSnapshot {
            pid,
            role: Some("AXTextArea".to_string()),
            subrole: None,
            value: value.to_string(),
            frame: Some((12.0, 24.0, 320.0, 180.0)),
            selection,
        }
    }

    #[test]
    fn collapsed_selection_inserts_at_the_caret() {
        let value = expected_value_after_insert("hello world", Some((5, 0)), ",");
        assert_eq!(value.as_deref(), Some("hello, world"));
    }

    #[test]
    fn selected_range_is_replaced_by_inserted_text() {
        let value = expected_value_after_insert("hello world", Some((6, 5)), "Looper");
        assert_eq!(value.as_deref(), Some("hello Looper"));
    }

    #[test]
    fn insertion_supports_both_document_boundaries() {
        let prefix = expected_value_after_insert("notes", Some((0, 0)), "Meeting ");
        let suffix = expected_value_after_insert("notes", Some((5, 0)), " complete");

        assert_eq!(prefix.as_deref(), Some("Meeting notes"));
        assert_eq!(suffix.as_deref(), Some("notes complete"));
    }

    #[test]
    fn replacement_preserves_surrounding_unicode_text() {
        let value = expected_value_after_insert("Résumé pending mañana", Some((7, 7)), "ready");

        assert_eq!(value.as_deref(), Some("Résumé ready mañana"));
    }

    #[test]
    fn entire_field_selection_can_be_replaced() {
        let replacement = expected_value_after_insert(
            "temporary transcription",
            Some((0, 23)),
            "final transcript",
        );

        assert_eq!(replacement.as_deref(), Some("final transcript"));
    }

    #[test]
    fn multiline_replacement_keeps_neighboring_lines() {
        let updated = expected_value_after_insert(
            "Agenda\nold decision\nOwners",
            Some((7, 12)),
            "approved plan",
        );

        assert_eq!(updated.as_deref(), Some("Agenda\napproved plan\nOwners"));
    }

    #[test]
    fn invalid_accessibility_ranges_are_inconclusive() {
        assert_eq!(
            expected_value_after_insert("hello", Some((-1, 2)), "x"),
            None
        );
        assert_eq!(
            expected_value_after_insert("hello", Some((2, -1)), "x"),
            None
        );
        assert_eq!(
            expected_value_after_insert("hello", Some((8, 0)), "x"),
            None
        );
        assert_eq!(
            expected_value_after_insert("hello", Some((4, 8)), "x"),
            None
        );
    }

    #[test]
    fn absent_selection_defers_to_post_insertion_heuristics() {
        let computed =
            expected_value_after_insert("A field without a readable caret", None, " dictated text");

        assert_eq!(computed, None);
    }

    #[test]
    fn missing_post_snapshot_cannot_confirm_success_or_failure() {
        let pre = snapshot(41, "before", Some((6, 0)));
        assert_eq!(
            assess_insertion(&pre, None, " after"),
            Verification::INCONCLUSIVE
        );
    }

    #[test]
    fn focus_change_is_not_reported_as_an_insertion_failure() {
        let pre = snapshot(41, "draft", Some((5, 0)));
        let other_process = snapshot(99, "draft complete", Some((14, 0)));
        assert_eq!(
            assess_insertion(&pre, Some(&other_process), " complete"),
            Verification::INCONCLUSIVE
        );
    }

    #[test]
    fn exact_snapshot_match_is_verified() {
        let pre = snapshot(7, "Hello old world", Some((6, 3)));
        let post = snapshot(7, "Hello new world", Some((9, 0)));
        assert_eq!(
            assess_insertion(&pre, Some(&post), "new"),
            Verification {
                matched: true,
                confirmed_mismatch: false,
            }
        );
    }

    #[test]
    fn exact_snapshot_mismatch_is_a_confirmed_failure() {
        let pre = snapshot(7, "Hello old world", Some((6, 3)));
        let unchanged = snapshot(7, "Hello old world", Some((6, 3)));
        assert_eq!(
            assess_insertion(&pre, Some(&unchanged), "new"),
            Verification {
                matched: false,
                confirmed_mismatch: true,
            }
        );
    }

    #[test]
    fn selectionless_snapshot_uses_the_substring_heuristic() {
        let pre = snapshot(12, "Meeting notes", None);
        let post = snapshot(12, "Meeting notes\nAction item", None);
        assert_eq!(
            assess_insertion(&pre, Some(&post), "  Action item  "),
            Verification {
                matched: true,
                confirmed_mismatch: false,
            }
        );
    }

    #[test]
    fn heuristic_miss_remains_inconclusive() {
        let pre = snapshot(12, "Meeting notes", None);
        let reformatted = snapshot(12, "MEETING NOTES", None);
        assert_eq!(
            assess_insertion(&pre, Some(&reformatted), "Action item"),
            Verification::INCONCLUSIVE
        );
    }

    #[test]
    fn heuristic_requires_the_document_to_change() {
        let pre = snapshot(12, "Existing Action item", None);
        let unchanged = snapshot(12, "Existing Action item", None);

        assert_eq!(
            assess_insertion(&pre, Some(&unchanged), "Action item"),
            Verification::INCONCLUSIVE
        );
    }

    #[test]
    fn exact_verification_supports_deleting_a_selection() {
        let pre = snapshot(8, "remove draft suffix", Some((0, 7)));
        let post = snapshot(8, "draft suffix", Some((0, 0)));

        assert_eq!(
            assess_insertion(&pre, Some(&post), ""),
            Verification::exact_match(true)
        );
    }
}

/// Inserts `text` into whatever currently has keyboard focus, trying direct
/// Accessibility API insertion first and falling back to clipboard+paste
/// when AX-direct doesn't apply or can't be confirmed. `pre_snapshot` is the
/// focused-element snapshot taken immediately before this call (`None` when
/// the caller couldn't/didn't read one, e.g. edit mode or a secure field).
#[cfg(target_os = "macos")]
pub fn insert_text(
    text: &str,
    pre_snapshot: Option<&FocusedTextSnapshot>,
) -> Result<(InsertOutcome, UndoState)> {
    if let Some(snapshot) = pre_snapshot {
        match macos_ax::insert_selected_text(snapshot.pid, text) {
            macos_ax::AxWriteOutcome::Applied => {
                thread::sleep(Duration::from_millis(30));
                let verification = verify_insertion(snapshot, text);
                if verification.matched {
                    return Ok((
                        InsertOutcome {
                            method: InsertionMethod::AxDirect,
                            verified: true,
                            confirmed_failure: false,
                        },
                        UndoState::AxDirect {
                            pid: snapshot.pid,
                            previous_value: snapshot.value.clone(),
                        },
                    ));
                }
                // AX reported the write succeeded but we couldn't confirm it
                // landed - retry with the clipboard+paste fallback rather
                // than trusting a possibly-silent no-op.
            }
            macos_ax::AxWriteOutcome::NotSettable
            | macos_ax::AxWriteOutcome::PidMismatch
            | macos_ax::AxWriteOutcome::Failed => {
                // AX-direct doesn't apply to this element - fall back
                // without spending a verification cycle on it.
            }
        }
    }

    paste_text(text)?;
    thread::sleep(Duration::from_millis(120));
    let verification = verify_insertion_optional(pre_snapshot, text);
    Ok((
        InsertOutcome {
            method: InsertionMethod::Paste,
            verified: verification.matched,
            confirmed_failure: verification.confirmed_mismatch,
        },
        UndoState::Paste,
    ))
}

/// Windows has no direct-write accessibility path in this codebase yet. Only
/// the clipboard+paste strategy is available, so this wraps it with the same
/// post-insertion verification.
#[cfg(target_os = "windows")]
pub fn insert_text(
    text: &str,
    pre_snapshot: Option<&FocusedTextSnapshot>,
) -> Result<(InsertOutcome, UndoState)> {
    paste_text(text)?;
    thread::sleep(Duration::from_millis(120));
    let verification = verify_insertion_optional(pre_snapshot, text);
    Ok((
        InsertOutcome {
            method: InsertionMethod::Paste,
            verified: verification.matched,
            confirmed_failure: verification.confirmed_mismatch,
        },
        UndoState::Paste,
    ))
}

#[cfg(target_os = "macos")]
const RIGHT_ARROW_KEY: CGKeyCode = 124; // kVK_RightArrow - a physical position, not layout-dependent.

#[cfg(target_os = "macos")]
fn send_key_no_modifiers(key: CGKeyCode) -> Result<()> {
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
        .map_err(|_| anyhow!("Failed to create CGEventSource"))?;

    let key_down = CGEvent::new_keyboard_event(source.clone(), key, true)
        .map_err(|_| anyhow!("Failed to create key-down event"))?;
    key_down.post(CGEventTapLocation::HID);

    thread::sleep(Duration::from_millis(5));

    let key_up = CGEvent::new_keyboard_event(source, key, false)
        .map_err(|_| anyhow!("Failed to create key-up event"))?;
    key_up.post(CGEventTapLocation::HID);

    Ok(())
}

/// Collapses the current selection to its right/end edge (a plain Right
/// Arrow key press) without touching the clipboard - used by
/// `insert_after_selection` so the selected text stays in place instead of
/// being overwritten by the next paste.
#[cfg(target_os = "macos")]
fn collapse_selection_to_end() -> Result<()> {
    send_key_no_modifiers(RIGHT_ARROW_KEY)
}

#[cfg(target_os = "windows")]
fn collapse_selection_to_end() -> Result<()> {
    let inputs = [
        keyboard_input(VK_RIGHT, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_RIGHT, KEYEVENTF_KEYUP),
    ];

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent != inputs.len() as u32 {
        return Err(anyhow!("Failed to send Right Arrow keystroke"));
    }

    Ok(())
}

/// Sends a plain Return/Enter keystroke - used by Smart Modes' (F5)
/// `auto_send_on_insert` to submit a chat/message box right after Selection
/// Mode inserts the transformed text. Best-effort: a failure here is logged
/// by the caller but never surfaces as an insertion error, since the text
/// itself already landed successfully.
#[cfg(target_os = "macos")]
const RETURN_KEY: CGKeyCode = 36; // kVK_Return - a physical position, not layout-dependent.

#[cfg(target_os = "macos")]
pub fn send_return_key() -> Result<()> {
    send_key_no_modifiers(RETURN_KEY)
}

#[cfg(target_os = "windows")]
pub fn send_return_key() -> Result<()> {
    use windows::Win32::UI::Input::KeyboardAndMouse::VK_RETURN;

    let inputs = [
        keyboard_input(VK_RETURN, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_RETURN, KEYEVENTF_KEYUP),
    ];

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent != inputs.len() as u32 {
        return Err(anyhow!("Failed to send Return keystroke"));
    }

    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn send_return_key() -> Result<()> {
    Err(anyhow!("Auto-send is not supported on this platform"))
}

/// Selection Mode's "Insert" action (F2): inserts `text` right after the
/// current selection instead of replacing it. There is no AX attribute for
/// "insert after the selection without deleting it", so unlike `insert_text`
/// this always goes through collapse-selection-then-paste - it cannot use
/// the AX-direct/verified path, and undo always falls back to a synthetic
/// undo keystroke.
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn insert_after_selection(text: &str) -> Result<(InsertOutcome, UndoState)> {
    collapse_selection_to_end()?;
    thread::sleep(Duration::from_millis(20));
    paste_text(text)?;
    Ok((
        InsertOutcome {
            method: InsertionMethod::Paste,
            verified: false,
            confirmed_failure: false,
        },
        UndoState::Paste,
    ))
}

/// Undoes the insertion described by `undo`: restores the previous AX value
/// for a direct insertion, or sends a synthetic undo keystroke for a paste.
#[cfg(target_os = "macos")]
pub fn undo_insertion(undo: UndoState) -> Result<()> {
    match undo {
        UndoState::AxDirect {
            pid,
            previous_value,
        } => match macos_ax::restore_value(pid, &previous_value) {
            macos_ax::AxWriteOutcome::Applied => Ok(()),
            macos_ax::AxWriteOutcome::PidMismatch => {
                Err(anyhow!("Cannot undo: focus moved to a different app"))
            }
            macos_ax::AxWriteOutcome::NotSettable | macos_ax::AxWriteOutcome::Failed => Err(
                anyhow!("Cannot undo: the target field no longer accepts direct edits"),
            ),
        },
        UndoState::Paste => send_undo_keystroke(),
    }
}

#[cfg(target_os = "windows")]
pub fn undo_insertion(undo: UndoState) -> Result<()> {
    match undo {
        UndoState::AxDirect { .. } => Err(anyhow!(
            "Direct-write undo is not supported on this platform"
        )),
        UndoState::Paste => send_undo_keystroke(),
    }
}

#[cfg(target_os = "windows")]
pub fn copy_text_to_clipboard(text: &str) -> Result<()> {
    let mut clipboard = Clipboard::new().map_err(|e| anyhow!("Failed to access clipboard: {e}"))?;
    set_text_excluding_history(&mut clipboard, text.to_string())
}

#[cfg(target_os = "macos")]
pub fn copy_text_to_clipboard(text: &str) -> Result<()> {
    let mut clipboard = Clipboard::new().map_err(|e| anyhow!("Failed to access clipboard: {e}"))?;
    set_text_excluding_history(&mut clipboard, text.to_string())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn read_text_from_clipboard(max_chars: usize) -> Option<String> {
    let mut clipboard = Clipboard::new().ok()?;
    let text = clipboard.get_text().ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(max_chars).collect())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn set_text_excluding_history(clipboard: &mut Clipboard, text: String) -> Result<()> {
    clipboard
        .set()
        .exclude_from_history()
        .text(text)
        .map_err(|e| anyhow!("Failed to set clipboard: {e}"))?;
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn should_restore_after_paste(clipboard: &mut Clipboard, inserted_text: &str) -> bool {
    match clipboard.get_text() {
        Ok(current) => return current == inserted_text || current.is_empty(),
        Err(ClipboardError::ContentNotAvailable) => {}
        Err(_) => return false,
    }

    clipboard
        .get()
        .html()
        .is_err_and(|err| matches!(err, ClipboardError::ContentNotAvailable))
        && clipboard
            .get_image()
            .is_err_and(|err| matches!(err, ClipboardError::ContentNotAvailable))
        && clipboard
            .get()
            .file_list()
            .is_err_and(|err| matches!(err, ClipboardError::ContentNotAvailable))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
struct ClipboardBackup {
    text: Option<String>,
    html: Option<String>,
    image: Option<ImageData<'static>>,
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
impl ClipboardBackup {
    fn capture(clipboard: &mut Clipboard) -> Self {
        Self {
            text: clipboard.get_text().ok(),
            html: clipboard.get().html().ok(),
            image: clipboard.get_image().ok().map(|img| img.to_owned()),
        }
    }

    fn restore(self, clipboard: &mut Clipboard) {
        let ClipboardBackup { text, html, image } = self;

        if let Some(html) = html {
            let alt_text = text.clone();
            if clipboard
                .set()
                .exclude_from_history()
                .html(html, alt_text.clone())
                .is_ok()
            {
                return;
            }

            if let Some(text) = alt_text {
                let _ = set_text_excluding_history(clipboard, text);
                return;
            }
        }

        if let Some(image) = image {
            let _ = clipboard.set_image(image);
            return;
        }

        if let Some(text) = text {
            let _ = set_text_excluding_history(clipboard, text);
        } else {
            let _ = clipboard.clear();
        }
    }
}

#[cfg(all(test, target_os = "macos"))]
mod host_smoke_tests {
    use super::*;
    use std::{env, process::Command, time::SystemTime};

    struct TextEditDocument;

    impl Drop for TextEditDocument {
        fn drop(&mut self) {
            let _ = run_osascript(
                r#"tell application "TextEdit"
                    try
                        close front document saving no
                    end try
                end tell"#,
            );
        }
    }

    fn run_osascript(script: &str) -> Result<String> {
        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| anyhow!("Failed to run osascript: {e}"))?;

        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(anyhow!("osascript failed: {stderr}"))
    }

    fn open_focused_textedit_document(initial_text: &str) -> Result<TextEditDocument> {
        let escaped = initial_text.replace('\\', "\\\\").replace('"', "\\\"");
        run_osascript(&format!(
            r#"tell application "TextEdit"
                activate
                make new document with properties {{text:"{escaped}"}}
            end tell
            delay 0.5
            tell application "System Events"
                tell process "TextEdit"
                    set frontmost to true
                    click text area 1 of scroll area 1 of window 1
                end tell
                keystroke "a" using command down
                key code 124
            end tell"#
        ))?;
        thread::sleep(Duration::from_millis(500));
        Ok(TextEditDocument)
    }

    fn frontmost_process_name() -> String {
        run_osascript(
            r#"tell application "System Events"
                get name of first process whose frontmost is true
            end tell"#,
        )
        .unwrap_or_else(|error| format!("unknown ({error})"))
    }

    fn textedit_document_value() -> Result<String> {
        run_osascript(
            r#"tell application "System Events"
                tell process "TextEdit"
                    get value of text area 1 of scroll area 1 of window 1
                end tell
            end tell"#,
        )
    }

    #[test]
    #[ignore = "requires macOS Accessibility/Input Monitoring permissions and a focused TextEdit document"]
    fn host_insertion_smoke_in_textedit() -> Result<()> {
        if env::var("LOOPER_HOST_INSERTION_SMOKE").ok().as_deref() != Some("1") {
            return Ok(());
        }

        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map_err(|e| anyhow!("System clock before UNIX_EPOCH: {e}"))?
            .as_millis();
        let initial_text = format!("Looper host insertion smoke baseline {unique}");
        let inserted_text = format!(" inserted-by-looper-{unique}");
        let _document = open_focused_textedit_document(&initial_text)?;
        let frontmost = frontmost_process_name();
        let ax_trusted = macos_ax::is_process_trusted_for_host_smoke();
        let focused_debug = macos_ax::focused_element_debug_for_host_smoke();
        let window_debug = macos_ax::focused_window_debug_for_host_smoke();

        let pre = focused_text_snapshot();
        if let Some(pre) = &pre {
            assert!(
                pre.value.contains(&initial_text),
                "focused snapshot is not the TextEdit smoke document: {:?}",
                pre
            );
        } else {
            eprintln!(
                "No focused TextEdit snapshot. AXIsProcessTrusted={ax_trusted}; frontmost_process={frontmost}; {focused_debug}; {window_debug}. Grant Accessibility/Input Monitoring permissions to the test process and ensure TextEdit can receive focus."
            );
            let textedit_value = textedit_document_value()?;
            assert!(
                textedit_value.contains(&initial_text),
                "TextEdit smoke document did not contain baseline text via System Events: {:?}",
                textedit_value
            );
        }

        let (outcome, undo) = insert_text(&inserted_text, pre.as_ref())?;
        assert!(
            !outcome.confirmed_failure,
            "host insertion reported confirmed failure via {:?}",
            outcome.method
        );

        let post = focused_text_snapshot();
        let textedit_value = post
            .as_ref()
            .map(|snapshot| snapshot.value.clone())
            .unwrap_or_else(|| textedit_document_value().unwrap_or_default());
        let cleanup_result = undo_insertion(undo);

        assert!(
            textedit_value.contains(&inserted_text),
            "TextEdit did not contain inserted text after {:?}; verified={}, value={:?}",
            outcome.method,
            outcome.verified,
            textedit_value
        );
        cleanup_result?;

        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn send_paste_keystroke() -> Result<()> {
    send_cmd_keystroke(resolve_keycode('v', FALLBACK_V_KEY))
}

#[cfg(target_os = "windows")]
fn send_paste_keystroke() -> Result<()> {
    let inputs = [
        keyboard_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_V, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_V, KEYEVENTF_KEYUP),
        keyboard_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent != inputs.len() as u32 {
        return Err(anyhow!("Failed to send Ctrl+V paste keystroke"));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn send_undo_keystroke() -> Result<()> {
    let inputs = [
        keyboard_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_Z, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_Z, KEYEVENTF_KEYUP),
        keyboard_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent != inputs.len() as u32 {
        return Err(anyhow!("Failed to send Ctrl+Z undo keystroke"));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn keyboard_input(key: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}
