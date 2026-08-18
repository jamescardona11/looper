use std::collections::HashSet;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::personalization::icons::{
    app_icon_cache_dir, executable_identifier, icon_cache_file_path, should_refresh_icon,
    InstalledApp,
};
use crate::AppRuntime;

const ICON_SIDE: i32 = 64;

struct Shortcut {
    location: PathBuf,
    name: String,
}

impl Shortcut {
    fn recognize(location: PathBuf) -> Option<Self> {
        if !has_extension(&location, "lnk") {
            return None;
        }
        let name = location.file_stem()?.to_str()?.trim().to_owned();
        if name.is_empty() || ShortcutNamePolicy::excluded(&name) {
            return None;
        }
        Some(Self { location, name })
    }
}

struct ShortcutJob {
    location: PathBuf,
}

struct ShortcutInventory<'a> {
    cache: Option<&'a Path>,
    applications: Vec<InstalledApp>,
    names: HashSet<String>,
    icon_jobs: Vec<ShortcutJob>,
}

impl<'a> ShortcutInventory<'a> {
    fn new(cache: Option<&'a Path>) -> Self {
        Self {
            cache,
            applications: Vec::new(),
            names: HashSet::new(),
            icon_jobs: Vec::new(),
        }
    }

    fn search(&mut self, root: &Path) {
        let Ok(children) = std::fs::read_dir(root) else {
            return;
        };
        for child in children.flatten() {
            if child.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let path = child.path();
            if path.is_dir() {
                self.search(&path);
            } else if let Some(shortcut) = Shortcut::recognize(path) {
                self.record(shortcut);
            }
        }
    }

    fn record(&mut self, shortcut: Shortcut) {
        if !self.names.insert(shortcut.name.to_lowercase()) {
            return;
        }
        let identifier = shortcut_target(&shortcut.location)
            .as_deref()
            .and_then(executable_identifier)
            .unwrap_or_else(|| format!("{}.exe", shortcut.name));
        let icon_path = self.cached_icon_or_schedule(&shortcut.location);
        self.applications.push(InstalledApp {
            name: shortcut.name,
            identifier,
            path: shortcut.location.to_string_lossy().into_owned(),
            icon_path,
        });
    }

    fn cached_icon_or_schedule(&mut self, shortcut: &Path) -> Option<String> {
        let cache = self.cache?;
        let destination = icon_cache_file_path(shortcut, cache);
        let available = destination.exists();
        if !available || shortcut_cache_outdated(shortcut, &destination) {
            self.icon_jobs.push(ShortcutJob {
                location: shortcut.to_owned(),
            });
        }
        available.then(|| destination.to_string_lossy().into_owned())
    }

    fn finish(mut self) -> (Vec<InstalledApp>, Vec<ShortcutJob>) {
        self.applications
            .sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
        (self.applications, self.icon_jobs)
    }
}

struct ShortcutNamePolicy;

impl ShortcutNamePolicy {
    fn excluded(name: &str) -> bool {
        const SHELL_ENTRIES: &[&str] = &[
            "desktop",
            "documents",
            "downloads",
            "file explorer",
            "help",
            "run",
            "settings",
            "this pc",
            "windows powershell",
        ];
        const NOISE_WORDS: &[&str] = &[
            "install",
            "installer",
            "license",
            "readme",
            "setup",
            "uninstall",
            "uninstaller",
            "update",
            "updater",
        ];

        let normalized = name.to_lowercase();
        if SHELL_ENTRIES.iter().any(|entry| *entry == normalized) {
            return true;
        }
        let excluded = words(&normalized).any(|word| NOISE_WORDS.contains(&word));
        excluded
    }
}

fn words(value: &str) -> impl Iterator<Item = &str> {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
}

fn has_extension(path: &Path, expected: &str) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case(expected))
}

fn start_menu_roots() -> Vec<PathBuf> {
    [
        ("PROGRAMDATA", "Microsoft/Windows/Start Menu/Programs"),
        ("APPDATA", "Microsoft/Windows/Start Menu/Programs"),
    ]
    .into_iter()
    .filter_map(|(variable, suffix)| {
        std::env::var(variable)
            .ok()
            .map(|base| PathBuf::from(base).join(suffix))
    })
    .collect()
}

fn nul_terminated_wide(path: &Path) -> Vec<u16> {
    path.as_os_str().encode_wide().chain([0]).collect()
}

fn read_wide_text(buffer: &[u16]) -> Option<String> {
    let boundary = buffer
        .iter()
        .position(|character| *character == 0)
        .unwrap_or(buffer.len());
    if boundary == 0 {
        return None;
    }
    let decoded = String::from_utf16_lossy(&buffer[..boundary]);
    let trimmed = decoded.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

struct ComApartment {
    close_on_drop: bool,
}

impl ComApartment {
    fn enter() -> Self {
        use windows::Win32::Foundation::S_OK;
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};

        let status = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        Self {
            close_on_drop: status == S_OK,
        }
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        if self.close_on_drop {
            unsafe { windows::Win32::System::Com::CoUninitialize() };
        }
    }
}

struct LoadedShortcut {
    link: windows::Win32::UI::Shell::IShellLinkW,
    _apartment: ComApartment,
}

impl LoadedShortcut {
    fn open(path: &Path) -> Option<Self> {
        use windows::core::{Interface, PCWSTR};
        use windows::Win32::System::Com::{
            CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ,
        };
        use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

        let apartment = ComApartment::enter();
        let link: IShellLinkW =
            unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()? };
        let persisted: IPersistFile = link.cast().ok()?;
        let encoded = nul_terminated_wide(path);
        unsafe { persisted.Load(PCWSTR(encoded.as_ptr()), STGM_READ).ok()? };
        Some(Self {
            link,
            _apartment: apartment,
        })
    }

    fn target(&self) -> Option<PathBuf> {
        let mut buffer = vec![0; 260];
        unsafe {
            self.link
                .GetPath(&mut buffer, std::ptr::null_mut(), 0)
                .ok()?;
        }
        read_wide_text(&buffer).map(PathBuf::from)
    }

    fn icon_source(&self) -> Option<IconSource> {
        let mut buffer = vec![0; 260];
        let mut resource_index = 0;
        if unsafe {
            self.link
                .GetIconLocation(&mut buffer, &mut resource_index)
                .is_ok()
        } {
            if let Some(location) = read_wide_text(&buffer).map(PathBuf::from) {
                if location.exists() {
                    return Some(IconSource {
                        location,
                        resource_index,
                    });
                }
            }
        }

        let target = self.target()?;
        target.exists().then_some(IconSource {
            location: target,
            resource_index: 0,
        })
    }
}

fn shortcut_target(shortcut: &Path) -> Option<PathBuf> {
    LoadedShortcut::open(shortcut)?.target()
}

struct IconSource {
    location: PathBuf,
    resource_index: i32,
}

impl IconSource {
    fn from_shortcut(shortcut: &Path) -> Option<Self> {
        has_extension(shortcut, "lnk")
            .then(|| LoadedShortcut::open(shortcut))
            .flatten()?
            .icon_source()
    }
}

fn shortcut_cache_outdated(shortcut: &Path, cached: &Path) -> bool {
    IconSource::from_shortcut(shortcut)
        .is_none_or(|source| should_refresh_icon(&source.location, cached))
}

struct OwnedIcon(windows::Win32::UI::WindowsAndMessaging::HICON);

impl Drop for OwnedIcon {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::DestroyIcon(self.0);
        }
    }
}

fn extract_icon(source: &IconSource) -> Option<OwnedIcon> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Controls::{IImageList, ILD_TRANSPARENT};
    use windows::Win32::UI::Shell::{
        ExtractIconExW, SHGetFileInfoW, SHGetImageList, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
        SHGFI_SYSICONINDEX, SHIL_EXTRALARGE, SHIL_JUMBO,
    };

    let encoded = nul_terminated_wide(&source.location);
    let mut extracted_icon = windows::Win32::UI::WindowsAndMessaging::HICON::default();
    let extracted = unsafe {
        ExtractIconExW(
            PCWSTR(encoded.as_ptr()),
            source.resource_index,
            Some(&mut extracted_icon),
            None,
            1,
        )
    };
    if extracted > 0 && !extracted_icon.is_invalid() {
        return Some(OwnedIcon(extracted_icon));
    }

    let mut shell_file = SHFILEINFOW::default();
    let system_index = unsafe {
        SHGetFileInfoW(
            PCWSTR(encoded.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut shell_file),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_SYSICONINDEX,
        )
    };
    if system_index != 0 {
        for image_size in [SHIL_JUMBO, SHIL_EXTRALARGE] {
            let Ok(image_list) = (unsafe { SHGetImageList::<IImageList>(image_size as i32) })
            else {
                continue;
            };
            let Ok(icon) = (unsafe { image_list.GetIcon(shell_file.iIcon, ILD_TRANSPARENT.0) })
            else {
                continue;
            };
            if !icon.is_invalid() {
                return Some(OwnedIcon(icon));
            }
        }
    }

    let mut shell_file = SHFILEINFOW::default();
    let fallback = unsafe {
        SHGetFileInfoW(
            PCWSTR(encoded.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut shell_file),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };
    (fallback != 0 && !shell_file.hIcon.is_invalid()).then_some(OwnedIcon(shell_file.hIcon))
}

fn rgba_from_bgra(pixels: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    let expected = width.checked_mul(height)?.checked_mul(4)? as usize;
    if pixels.len() != expected {
        return None;
    }
    let mut rgba = Vec::with_capacity(expected);
    for pixel in pixels.chunks_exact(4) {
        rgba.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
    }
    Some(rgba)
}

fn repair_legacy_alpha(pixels: &mut [u8]) {
    for pixel in pixels.chunks_exact_mut(4) {
        let transparent_colored = pixel[3] == 0 && pixel[..3].iter().any(|channel| *channel != 0);
        if transparent_colored {
            pixel[3] = u8::MAX;
        }
    }
}

fn capture_icon_pixels(icon: &OwnedIcon) -> Option<Vec<u8>> {
    use std::ffi::c_void;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{DrawIconEx, DI_NORMAL};

    let bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: ICON_SIDE,
            biHeight: -ICON_SIDE,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            biSizeImage: (ICON_SIDE * ICON_SIDE * 4) as u32,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: Default::default(),
    };

    let context = unsafe { CreateCompatibleDC(None) };
    if context.is_invalid() {
        return None;
    }
    let mut raw_pixels: *mut c_void = std::ptr::null_mut();
    let bitmap = match unsafe {
        CreateDIBSection(None, &bitmap_info, DIB_RGB_COLORS, &mut raw_pixels, None, 0)
    } {
        Ok(bitmap) => bitmap,
        Err(_) => {
            unsafe {
                let _ = DeleteDC(context);
            }
            return None;
        }
    };

    let previous = unsafe { SelectObject(context, bitmap.into()) };
    let drawn = unsafe {
        DrawIconEx(
            context, 0, 0, icon.0, ICON_SIDE, ICON_SIDE, 0, None, DI_NORMAL,
        )
        .is_ok()
    };
    let mut pixels = if drawn && !raw_pixels.is_null() {
        let length = (ICON_SIDE * ICON_SIDE * 4) as usize;
        unsafe { std::slice::from_raw_parts(raw_pixels.cast::<u8>(), length) }.to_vec()
    } else {
        Vec::new()
    };
    if !previous.is_invalid() {
        unsafe {
            SelectObject(context, previous);
        }
    }
    unsafe {
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(context);
    }

    if pixels.is_empty() {
        return None;
    }
    repair_legacy_alpha(&mut pixels);
    Some(pixels)
}

fn staging_path(destination: &Path) -> Option<PathBuf> {
    let parent = destination.parent()?;
    let file_name = destination.file_name()?.to_string_lossy();
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_nanos();
    Some(parent.join(format!(
        ".{file_name}.{}.{}.tmp",
        std::process::id(),
        unique
    )))
}

fn encode_png(path: &Path, width: u32, height: u32, rgba: &[u8]) -> Option<()> {
    let file = std::fs::File::create(path).ok()?;
    let mut encoder = png::Encoder::new(file, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().ok()?;
    writer.write_image_data(rgba).ok()
}

fn replace_file(staging: &Path, destination: &Path) -> Option<()> {
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let staging = nul_terminated_wide(staging);
    let destination = nul_terminated_wide(destination);
    unsafe {
        MoveFileExW(
            windows::core::PCWSTR(staging.as_ptr()),
            windows::core::PCWSTR(destination.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
        .ok()
    }
}

fn persist_pixels(destination: &Path, bgra: &[u8]) -> Option<()> {
    let rgba = rgba_from_bgra(bgra, ICON_SIDE as u32, ICON_SIDE as u32)?;
    let staging = staging_path(destination)?;
    let saved = encode_png(&staging, ICON_SIDE as u32, ICON_SIDE as u32, &rgba)
        .and_then(|()| replace_file(&staging, destination));
    if saved.is_none() {
        let _ = std::fs::remove_file(staging);
    }
    saved
}

fn ensure_cached_icon(shortcut: &Path, cache: &Path) -> Option<PathBuf> {
    let destination = icon_cache_file_path(shortcut, cache);
    let source = IconSource::from_shortcut(shortcut)?;
    if !should_refresh_icon(&source.location, &destination) {
        return Some(destination);
    }
    let icon = extract_icon(&source)?;
    let pixels = capture_icon_pixels(&icon)?;
    persist_pixels(&destination, &pixels).map(|()| destination)
}

fn launch_icon_warmup(jobs: Vec<ShortcutJob>, cache: PathBuf) {
    if jobs.is_empty() {
        return;
    }
    std::thread::spawn(move || {
        for job in jobs {
            let _ = ensure_cached_icon(&job.location, &cache);
        }
    });
}

pub fn list_installed_apps(app: &AppHandle<AppRuntime>) -> Result<Vec<InstalledApp>, String> {
    let cache = app_icon_cache_dir(app);
    let mut inventory = ShortcutInventory::new(cache.as_deref());
    for root in start_menu_roots() {
        inventory.search(&root);
    }
    let (applications, jobs) = inventory.finish();
    if let Some(cache) = cache {
        launch_icon_warmup(jobs, cache);
    }
    Ok(applications)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortcut_name_policy_preserves_exact_and_token_rules() {
        for excluded in [
            "Settings",
            "Windows PowerShell",
            "Acme Setup",
            "Readme - Acme",
            "Acme_uninstaller_tool",
        ] {
            assert!(ShortcutNamePolicy::excluded(excluded), "{excluded}");
        }
        for retained in ["SetupPro", "UpdaterPro", "ReadmeNow", "Acme Help Center"] {
            assert!(!ShortcutNamePolicy::excluded(retained), "{retained}");
        }
    }

    #[test]
    fn wide_text_stops_at_nul_and_rejects_blank_values() {
        assert_eq!(
            read_wide_text(&[32, 76, 111, 111, 112, 101, 114, 32, 0, 88]),
            Some("Looper".to_owned())
        );
        assert_eq!(read_wide_text(&[0, 76]), None);
        assert_eq!(read_wide_text(&[32, 32]), None);
    }

    #[test]
    fn pixel_conversion_swaps_red_blue_and_validates_dimensions() {
        assert_eq!(
            rgba_from_bgra(&[1, 2, 3, 4, 10, 20, 30, 40], 2, 1),
            Some(vec![3, 2, 1, 4, 30, 20, 10, 40])
        );
        assert_eq!(rgba_from_bgra(&[1, 2, 3], 1, 1), None);
        assert_eq!(rgba_from_bgra(&[], u32::MAX, u32::MAX), None);
    }

    #[test]
    fn legacy_alpha_repair_keeps_black_transparency_and_existing_alpha() {
        let mut pixels = [1, 2, 3, 0, 0, 0, 0, 0, 8, 9, 10, 20];
        repair_legacy_alpha(&mut pixels);
        assert_eq!(pixels, [1, 2, 3, 255, 0, 0, 0, 0, 8, 9, 10, 20]);
    }

    #[test]
    fn inventory_recurses_sorts_and_deduplicates_names_case_insensitively() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("Nested")).unwrap();
        std::fs::write(root.path().join("Zulu.lnk"), b"not-a-real-shortcut").unwrap();
        std::fs::write(root.path().join("Nested/alpha.LNK"), b"not-a-real-shortcut").unwrap();
        std::fs::write(root.path().join("Nested/ALPHA.lnk"), b"duplicate").unwrap();
        std::fs::write(root.path().join("Nested/Acme Setup.lnk"), b"filtered").unwrap();

        let mut inventory = ShortcutInventory::new(None);
        inventory.search(root.path());
        let (apps, jobs) = inventory.finish();

        assert!(jobs.is_empty());
        assert_eq!(
            apps.iter().map(|app| app.name.as_str()).collect::<Vec<_>>(),
            ["alpha", "Zulu"]
        );
        assert_eq!(apps[0].identifier, "alpha.exe");
        assert_eq!(apps[1].identifier, "Zulu.exe");
        assert!(apps.iter().all(|app| app.icon_path.is_none()));
    }
}
