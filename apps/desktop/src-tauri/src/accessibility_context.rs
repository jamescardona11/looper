use crate::permissions;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActiveContext {
    pub app_name: String,
    pub window_title: String,
    pub url: Option<String>,
    /// Stable platform app identifier used by Smart Modes. This is a bundle
    /// identifier on macOS and the executable file name on Windows.
    pub bundle_id: Option<String>,
}

#[cfg(target_os = "macos")]
mod macos {
    use super::ActiveContext;
    use core_foundation::array::CFArray;
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::string::CFString;
    use std::ffi::c_void;
    use std::process::{Child, Command, Stdio};
    use std::ptr::NonNull;
    use std::time::{Duration, Instant};

    type ProcessId = i32;

    const ACCESSIBILITY_MESSAGE_TIMEOUT: f32 = 2.0;
    const APPLE_EVENT_DEADLINE: Duration = Duration::from_secs(2);
    const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(20);
    const MAX_AX_TREE_NODES: usize = 400;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateApplication(pid: ProcessId) -> *mut c_void;
        fn AXUIElementCreateSystemWide() -> *mut c_void;
        fn AXUIElementCopyAttributeValue(
            element: *mut c_void,
            attribute: *const c_void,
            value: *mut *mut c_void,
        ) -> i32;
        fn AXUIElementSetMessagingTimeout(element: *mut c_void, timeout: f32) -> i32;
        fn CFRelease(value: *const c_void);
    }

    #[derive(Clone, Copy)]
    struct AxNode(NonNull<c_void>);

    impl AxNode {
        fn from_raw(raw: *mut c_void) -> Option<Self> {
            NonNull::new(raw).map(Self)
        }

        fn raw(self) -> *mut c_void {
            self.0.as_ptr()
        }

        fn set_deadline(self) {
            unsafe {
                let _ = AXUIElementSetMessagingTimeout(self.raw(), ACCESSIBILITY_MESSAGE_TIMEOUT);
            }
        }

        fn copy_raw_attribute(self, name: &str) -> Option<NonNull<c_void>> {
            let key = CFString::new(name);
            let mut value = std::ptr::null_mut();
            let status = unsafe {
                AXUIElementCopyAttributeValue(
                    self.raw(),
                    key.as_concrete_TypeRef().cast(),
                    &mut value,
                )
            };
            (status == 0).then(|| NonNull::new(value)).flatten()
        }

        fn copy_element(self, name: &str) -> Option<OwnedAxNode> {
            self.copy_raw_attribute(name).map(OwnedAxNode)
        }

        fn string_attribute(self, name: &str) -> Option<String> {
            let raw = self.copy_raw_attribute(name)?;
            let value = unsafe { CFType::wrap_under_create_rule(raw.as_ptr().cast_const()) };
            value.downcast::<CFString>().map(|text| text.to_string())
        }

        fn children(self) -> Option<CFArray<CFType>> {
            let raw = self.copy_raw_attribute("AXChildren")?;
            Some(unsafe { CFArray::wrap_under_create_rule(raw.as_ptr() as *const _) })
        }
    }

    struct OwnedAxNode(NonNull<c_void>);

    impl OwnedAxNode {
        fn application(process_id: ProcessId) -> Option<Self> {
            AxNode::from_raw(unsafe { AXUIElementCreateApplication(process_id) })
                .map(|node| Self(node.0))
        }

        fn system() -> Option<Self> {
            AxNode::from_raw(unsafe { AXUIElementCreateSystemWide() }).map(|node| Self(node.0))
        }

        fn node(&self) -> AxNode {
            AxNode(self.0)
        }
    }

    impl Drop for OwnedAxNode {
        fn drop(&mut self) {
            unsafe { CFRelease(self.0.as_ptr().cast_const()) }
        }
    }

    struct TimedChild {
        child: Child,
        expires_at: Instant,
    }

    impl TimedChild {
        fn spawn(mut command: Command, timeout: Duration) -> Option<Self> {
            command.stdout(Stdio::piped()).stderr(Stdio::null());
            let child = command.spawn().ok()?;
            Some(Self {
                child,
                expires_at: Instant::now() + timeout,
            })
        }

        fn stdout(mut self) -> Option<Vec<u8>> {
            loop {
                match self.child.try_wait() {
                    Ok(Some(status)) => {
                        return status
                            .success()
                            .then(|| {
                                self.child
                                    .wait_with_output()
                                    .ok()
                                    .map(|output| output.stdout)
                            })
                            .flatten();
                    }
                    Ok(None) if Instant::now() < self.expires_at => {
                        std::thread::sleep(PROCESS_POLL_INTERVAL);
                    }
                    Ok(None) => {
                        let _ = self.child.kill();
                        let _ = self.child.wait();
                        return None;
                    }
                    Err(_) => return None,
                }
            }
        }
    }

    fn run_apple_script(source: &str) -> Option<String> {
        let mut command = Command::new("osascript");
        command.args(["-e", source]);
        let bytes = TimedChild::spawn(command, APPLE_EVENT_DEADLINE)?.stdout()?;
        String::from_utf8(bytes).ok()
    }

    struct ForegroundApplication {
        display_name: String,
        process_id: ProcessId,
        bundle_id: Option<String>,
    }

    impl ForegroundApplication {
        fn parse(script_output: &str) -> Option<Self> {
            let mut fields = script_output.trim().splitn(3, '|');
            let display_name = fields.next()?.trim();
            let process_id = fields.next()?.trim().parse().ok()?;
            let raw_identifier = fields.next()?.trim();
            if display_name.is_empty() {
                return None;
            }

            Some(Self {
                display_name: display_name.to_owned(),
                process_id,
                bundle_id: (!raw_identifier.is_empty()).then(|| raw_identifier.to_owned()),
            })
        }

        fn query() -> Option<Self> {
            let source = r#"
tell application "System Events"
    set foregroundProcess to first application process whose frontmost is true
    set processName to name of foregroundProcess
    set processNumber to unix id of foregroundProcess
    set identifierText to ""
    try
        set identifierText to bundle identifier of foregroundProcess
    end try
    return processName & "|" & processNumber & "|" & identifierText
end tell
"#;
            Self::parse(&run_apple_script(source)?)
        }
    }

    const SCRIPTABLE_BROWSER_IDS: [&str; 4] = [
        "com.google.Chrome",
        "com.brave.Browser",
        "com.microsoft.edgemac",
        "company.thebrowser.Browser",
    ];

    fn allowlisted_browser_id(candidate: &str) -> Option<&'static str> {
        SCRIPTABLE_BROWSER_IDS
            .into_iter()
            .find(|known| known.eq_ignore_ascii_case(candidate))
    }

    fn browser_tab_url(bundle_id: &str) -> Option<String> {
        let target = allowlisted_browser_id(bundle_id)?;
        let source =
            format!("tell application id \"{target}\" to get URL of active tab of front window");
        normalize_browser_url(&run_apple_script(&source)?)
    }

    fn normalize_browser_url(raw: &str) -> Option<String> {
        let candidate = raw.trim();
        if candidate.is_empty() || candidate.eq_ignore_ascii_case("missing value") {
            return None;
        }
        if candidate
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
        {
            return None;
        }

        let (scheme, remainder) = candidate.split_once("://")?;
        if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
            return None;
        }
        let host = remainder.split(['/', '?', '#']).next()?;
        (!host.is_empty()).then(|| candidate.to_owned())
    }

    struct FocusedWindowSnapshot {
        title: String,
        document_url: Option<String>,
    }

    impl FocusedWindowSnapshot {
        fn read(process_id: ProcessId) -> Option<Self> {
            let application = OwnedAxNode::application(process_id)?;
            application.node().set_deadline();
            let window = application.node().copy_element("AXFocusedWindow");
            if let Some(window) = window.as_ref() {
                window.node().set_deadline();
            }

            let title = window
                .as_ref()
                .and_then(|element| element.node().string_attribute("AXTitle"))
                .unwrap_or_default()
                .trim()
                .to_owned();
            let document_url = window
                .as_ref()
                .and_then(|element| element.node().string_attribute("AXDocument"))
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty());

            Some(Self {
                title,
                document_url,
            })
        }
    }

    pub fn get_active_context() -> Option<ActiveContext> {
        let foreground = ForegroundApplication::query()?;
        let window = FocusedWindowSnapshot::read(foreground.process_id)?;
        let url = window
            .document_url
            .or_else(|| foreground.bundle_id.as_deref().and_then(browser_tab_url));
        let identifier = foreground
            .bundle_id
            .or_else(|| Some(foreground.display_name.clone()));

        Some(ActiveContext {
            app_name: foreground.display_name,
            window_title: window.title,
            url,
            bundle_id: identifier,
        })
    }

    struct VisibleTextCollector {
        text: String,
        nodes_left: usize,
        character_limit: usize,
    }

    impl VisibleTextCollector {
        fn new(character_limit: usize) -> Self {
            Self {
                text: String::new(),
                nodes_left: MAX_AX_TREE_NODES,
                character_limit,
            }
        }

        fn exhausted(&self) -> bool {
            self.nodes_left == 0 || self.text.len() >= self.character_limit
        }

        fn visit(&mut self, node: AxNode) {
            if self.exhausted() {
                return;
            }
            self.nodes_left -= 1;

            if node.string_attribute("AXRole").as_deref() == Some("AXSecureTextField") {
                return;
            }

            for attribute in ["AXValue", "AXTitle"] {
                let Some(value) = node.string_attribute(attribute) else {
                    continue;
                };
                let value = value.trim();
                if value.is_empty() {
                    continue;
                }
                if !self.text.is_empty() {
                    self.text.push('\n');
                }
                self.text.push_str(value);
                if self.exhausted() {
                    return;
                }
            }

            let Some(children) = node.children() else {
                return;
            };
            for child in children.iter() {
                if self.exhausted() {
                    break;
                }
                let Some(child_node) = AxNode::from_raw(child.as_CFTypeRef().cast_mut().cast())
                else {
                    continue;
                };
                child_node.set_deadline();
                self.visit(child_node);
            }
        }

        fn finish(self) -> Option<String> {
            let visible: String = self
                .text
                .trim()
                .chars()
                .take(self.character_limit)
                .collect();
            (!visible.is_empty()).then_some(visible)
        }
    }

    pub(super) fn capture_focused_window_text(max_chars: usize) -> Option<String> {
        let system = OwnedAxNode::system()?;
        system.node().set_deadline();
        let application = system.node().copy_element("AXFocusedApplication")?;
        application.node().set_deadline();
        let window = application.node().copy_element("AXFocusedWindow")?;
        window.node().set_deadline();

        let mut collector = VisibleTextCollector::new(max_chars);
        collector.visit(window.node());
        collector.finish()
    }

    #[cfg(test)]
    mod tests {
        use super::{allowlisted_browser_id, normalize_browser_url, ForegroundApplication};

        #[test]
        fn frontmost_application_parser_requires_all_fields_and_a_name() {
            let app = ForegroundApplication::parse("Safari|42|com.apple.Safari\n").unwrap();
            assert_eq!(app.display_name, "Safari");
            assert_eq!(app.process_id, 42);
            assert_eq!(app.bundle_id.as_deref(), Some("com.apple.Safari"));
            assert!(ForegroundApplication::parse("|42|com.apple.Safari").is_none());
            assert!(ForegroundApplication::parse("Safari|not-a-pid|").is_none());
            assert!(ForegroundApplication::parse("Safari|42").is_none());
        }

        #[test]
        fn frontmost_application_accepts_a_process_without_bundle_id() {
            let app = ForegroundApplication::parse("Helper|7|").unwrap();
            assert_eq!(app.bundle_id, None);
        }

        #[test]
        fn browser_url_accepts_http_variants_and_preserves_original_text() {
            assert_eq!(
                normalize_browser_url(" HTTPS://Example.com/Path?q=1#result\n").as_deref(),
                Some("HTTPS://Example.com/Path?q=1#result")
            );
            assert_eq!(
                normalize_browser_url("http://localhost:3000/app").as_deref(),
                Some("http://localhost:3000/app")
            );
        }

        #[test]
        fn browser_url_rejects_missing_hosts_unsafe_schemes_and_whitespace() {
            for rejected in [
                "",
                "missing value",
                "https://",
                "https:///path",
                "chrome://settings",
                "file:///tmp/page",
                "https://exa mple.com",
                "https://a.test\nhttps://b.test",
            ] {
                assert_eq!(
                    normalize_browser_url(rejected),
                    None,
                    "accepted {rejected:?}"
                );
            }
        }

        #[test]
        fn browser_automation_is_restricted_to_known_bundle_ids() {
            assert_eq!(
                allowlisted_browser_id("COM.GOOGLE.CHROME"),
                Some("com.google.Chrome")
            );
            assert_eq!(allowlisted_browser_id("com.apple.Safari"), None);
            assert_eq!(allowlisted_browser_id("\" & do shell script \"bad"), None);
        }
    }
}

#[cfg(target_os = "macos")]
pub use macos::get_active_context;

/// Page context opt-in cap for untrusted visible-window text sent to cleanup.
pub const SCREEN_CONTEXT_MAX_CHARS: usize = 6000;

struct ContextCandidates {
    accessibility: Option<String>,
    ocr: Option<String>,
}

impl ContextCandidates {
    fn richest(self) -> Option<String> {
        match (self.accessibility, self.ocr) {
            (Some(accessibility), Some(ocr))
                if ocr.chars().count() > accessibility.chars().count() =>
            {
                Some(ocr)
            }
            (Some(accessibility), _) => Some(accessibility),
            (None, ocr) => ocr,
        }
    }
}

fn has_substantial_text(text: &str) -> bool {
    let line_count = text.lines().filter(|line| !line.trim().is_empty()).count();
    line_count > 1 || text.split_whitespace().count() >= 12
}

/// Captures visible text through AX and falls back to an authorized, on-device
/// Vision OCR screenshot when AX returns only a small fragment.
#[cfg(target_os = "macos")]
pub fn capture_screen_context() -> Option<String> {
    permissions::check_accessibility_permission().then_some(())?;
    let accessibility = macos::capture_focused_window_text(SCREEN_CONTEXT_MAX_CHARS);
    if accessibility.as_deref().is_some_and(has_substantial_text) {
        return accessibility;
    }

    let ocr = tauri::async_runtime::block_on(crate::screen_ocr::capture_active_window_text(
        SCREEN_CONTEXT_MAX_CHARS,
    ));
    ContextCandidates { accessibility, ocr }.richest()
}

#[cfg(not(target_os = "macos"))]
pub fn capture_screen_context() -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
mod windows_context {
    use super::ActiveContext;
    use crate::personalization::icons::executable_identifier;
    use std::path::{Path, PathBuf};
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    struct ForegroundWindow(HWND);

    impl ForegroundWindow {
        fn current() -> Option<Self> {
            let handle = unsafe { GetForegroundWindow() };
            (!handle.is_invalid()).then_some(Self(handle))
        }

        fn process_id(&self) -> Option<u32> {
            let mut process_id = 0;
            unsafe { GetWindowThreadProcessId(self.0, Some(&mut process_id)) };
            (process_id != 0).then_some(process_id)
        }

        fn title(&self) -> String {
            let length = unsafe { GetWindowTextLengthW(self.0) };
            if length <= 0 {
                return String::new();
            }
            let mut units = vec![0; length as usize + 1];
            let written = unsafe { GetWindowTextW(self.0, &mut units) };
            if written <= 0 {
                return String::new();
            }
            String::from_utf16_lossy(&units[..written as usize])
                .trim()
                .to_owned()
        }
    }

    struct ProcessHandle(HANDLE);

    impl ProcessHandle {
        fn open(process_id: u32) -> Option<Self> {
            let handle =
                unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).ok()? };
            Some(Self(handle))
        }

        fn executable_path(&self) -> Option<PathBuf> {
            let mut units = vec![0u16; 32_768];
            let mut length = units.len() as u32;
            unsafe {
                QueryFullProcessImageNameW(
                    self.0,
                    PROCESS_NAME_FORMAT(0),
                    PWSTR(units.as_mut_ptr()),
                    &mut length,
                )
                .ok()?;
            }
            Some(PathBuf::from(String::from_utf16_lossy(
                &units[..length as usize],
            )))
        }
    }

    impl Drop for ProcessHandle {
        fn drop(&mut self) {
            let _ = unsafe { CloseHandle(self.0) };
        }
    }

    fn display_name(path: &Path) -> String {
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or_else(|| path.to_str().unwrap_or_default())
            .trim()
            .to_owned()
    }

    pub fn get_active_context() -> Option<ActiveContext> {
        let window = ForegroundWindow::current()?;
        let process = ProcessHandle::open(window.process_id()?)?;
        let executable = process.executable_path()?;
        let identifier = executable_identifier(&executable)?;

        Some(ActiveContext {
            app_name: display_name(&executable),
            window_title: window.title(),
            url: None,
            bundle_id: Some(identifier),
        })
    }
}

#[cfg(target_os = "windows")]
pub use windows_context::get_active_context;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn get_active_context() -> Option<ActiveContext> {
    None
}

fn clipped(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

impl ActiveContext {
    fn window_log_value(&self) -> String {
        if self.window_title.is_empty() {
            "(none)".to_owned()
        } else {
            clipped(&self.window_title, 120)
        }
    }

    fn url_log_value(&self) -> String {
        self.url
            .as_deref()
            .map(|url| clipped(url, 160))
            .unwrap_or_else(|| "(none)".to_owned())
    }
}

pub fn log_active_context() {
    if !permissions::check_accessibility_permission() {
        return;
    }
    let Some(context) = get_active_context() else {
        return;
    };

    tracing::debug!(
        "[Accessibility] Active app: {} | Window: {} | URL: {}",
        context.app_name,
        context.window_log_value(),
        context.url_log_value()
    );
}

#[cfg(test)]
mod tests {
    use super::{clipped, has_substantial_text, ActiveContext, ContextCandidates};

    #[test]
    fn substantial_context_needs_multiple_lines_or_twelve_words() {
        assert!(!has_substantial_text("Window title"));
        assert!(has_substantial_text("First line\nSecond line"));
        assert!(has_substantial_text(
            "one two three four five six seven eight nine ten eleven twelve"
        ));
    }

    #[test]
    fn candidate_selection_prefers_more_characters_and_ax_on_ties() {
        assert_eq!(
            ContextCandidates {
                accessibility: Some("Title".into()),
                ocr: Some("Visible canvas text".into()),
            }
            .richest()
            .as_deref(),
            Some("Visible canvas text")
        );
        assert_eq!(
            ContextCandidates {
                accessibility: Some("same".into()),
                ocr: Some("size".into()),
            }
            .richest()
            .as_deref(),
            Some("same")
        );
        assert_eq!(
            ContextCandidates {
                accessibility: None,
                ocr: Some("OCR only".into()),
            }
            .richest()
            .as_deref(),
            Some("OCR only")
        );
    }

    #[test]
    fn log_values_keep_original_limits_and_empty_markers() {
        let context = ActiveContext {
            app_name: "Editor".into(),
            window_title: "é".repeat(121),
            url: Some(format!("https://example.test/{}", "x".repeat(200))),
            bundle_id: Some("com.example.Editor".into()),
        };
        assert_eq!(context.window_log_value().chars().count(), 120);
        assert_eq!(context.url_log_value().chars().count(), 160);
        assert_eq!(clipped("áβ🙂", 2), "áβ");

        let empty = ActiveContext {
            app_name: "Helper".into(),
            window_title: String::new(),
            url: None,
            bundle_id: Some("Helper".into()),
        };
        assert_eq!(empty.window_log_value(), "(none)");
        assert_eq!(empty.url_log_value(), "(none)");
    }
}
