use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::AppHandle;

use crate::personalization::icons::{
    app_icon_cache_dir, icon_cache_file_path, should_refresh_icon, InstalledApp,
};
use crate::AppRuntime;

const SEARCH_LEVELS: usize = 3;

struct Bundle {
    location: PathBuf,
    name: String,
}

impl Bundle {
    fn recognize(location: PathBuf) -> Option<Self> {
        if !has_extension(&location, "app") {
            return None;
        }
        let name = location.file_stem()?.to_str()?.to_owned();
        (!name.is_empty() && !AppNamePolicy::excluded(&name)).then_some(Self { location, name })
    }

    fn serialized_path(&self) -> String {
        self.location.to_string_lossy().into_owned()
    }
}

struct IconJob {
    bundle: PathBuf,
    name: String,
}

struct MacInventory<'a> {
    cache: Option<&'a Path>,
    applications: Vec<InstalledApp>,
    visited_bundles: HashSet<String>,
    icon_jobs: Vec<IconJob>,
}

impl<'a> MacInventory<'a> {
    fn new(cache: Option<&'a Path>) -> Self {
        Self {
            cache,
            applications: Vec::new(),
            visited_bundles: HashSet::new(),
            icon_jobs: Vec::new(),
        }
    }

    fn search(&mut self, root: &Path) {
        self.visit_directory(root, SEARCH_LEVELS);
    }

    fn visit_directory(&mut self, directory: &Path, levels_left: usize) {
        if levels_left == 0 {
            return;
        }
        let Ok(children) = std::fs::read_dir(directory) else {
            return;
        };

        for child in children.flatten() {
            if child.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let path = child.path();
            if has_extension(&path, "app") {
                if let Some(bundle) = Bundle::recognize(path) {
                    self.record(bundle);
                }
                continue;
            }
            if path.is_dir() {
                self.visit_directory(&path, levels_left - 1);
            }
        }
    }

    fn record(&mut self, bundle: Bundle) {
        let serialized_path = bundle.serialized_path();
        if !self.visited_bundles.insert(serialized_path.clone()) {
            return;
        }

        let identifier = bundle_identifier(&bundle.location).unwrap_or_else(|| bundle.name.clone());
        let icon_path = self.cached_icon_or_schedule(&bundle);
        self.applications.push(InstalledApp {
            name: bundle.name,
            identifier,
            path: serialized_path,
            icon_path,
        });
    }

    fn cached_icon_or_schedule(&mut self, bundle: &Bundle) -> Option<String> {
        let cache = self.cache?;
        let destination = icon_cache_file_path(&bundle.location, cache);
        if destination.exists() {
            return Some(destination.to_string_lossy().into_owned());
        }
        self.icon_jobs.push(IconJob {
            bundle: bundle.location.clone(),
            name: bundle.name.clone(),
        });
        None
    }

    fn finish(mut self) -> (Vec<InstalledApp>, Vec<IconJob>) {
        self.applications
            .sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
        (self.applications, self.icon_jobs)
    }
}

struct AppNamePolicy;

impl AppNamePolicy {
    fn excluded(name: &str) -> bool {
        const SYSTEM_TOOLS: &[&str] = &[
            "activity monitor",
            "audio midi setup",
            "boot camp assistant",
            "console",
            "disk utility",
            "font book",
            "image capture",
            "keychain access",
            "migration assistant",
            "script editor",
            "system information",
            "system settings",
            "terminal",
            "time machine",
        ];
        const NOISY_SUFFIXES: &[&str] = &["installer", "uninstaller", "updater", "agent"];

        let normalized = name.to_lowercase();
        if SYSTEM_TOOLS.iter().any(|tool| *tool == normalized) {
            return true;
        }
        trailing_word(&normalized).is_some_and(|word| NOISY_SUFFIXES.contains(&word))
    }
}

fn trailing_word(value: &str) -> Option<&str> {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .rev()
        .find(|word| !word.is_empty())
}

fn has_extension(path: &Path, expected: &str) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case(expected))
}

fn bundle_identifier(bundle: &Path) -> Option<String> {
    let manifest = plist::Value::from_file(bundle.join("Contents/Info.plist")).ok()?;
    let value = manifest
        .as_dictionary()?
        .get("CFBundleIdentifier")?
        .as_string()?
        .trim();
    (!value.is_empty()).then(|| value.to_owned())
}

struct BundleIcon<'a> {
    bundle: &'a Path,
    app_name: &'a str,
}

impl<'a> BundleIcon<'a> {
    fn new(bundle: &'a Path, app_name: &'a str) -> Self {
        Self { bundle, app_name }
    }

    fn source(&self) -> Option<PathBuf> {
        self.declared_source().or_else(|| self.fallback_source())
    }

    fn resources(&self) -> PathBuf {
        self.bundle.join("Contents/Resources")
    }

    fn declared_source(&self) -> Option<PathBuf> {
        let plist = self.bundle.join("Contents/Info.plist");
        let mut query = Command::new("/usr/libexec/PlistBuddy");
        query.args(["-c", "Print :CFBundleIconFile"]).arg(plist);
        let result = query.output().ok()?;
        if !result.status.success() {
            return None;
        }
        let declared = String::from_utf8(result.stdout).ok()?;
        let declared = declared.trim();
        if declared.is_empty() {
            return None;
        }

        let resources = self.resources();
        let exact = resources.join(declared);
        if exact.exists() {
            return Some(exact);
        }
        let with_extension = resources.join(format!("{declared}.icns"));
        with_extension.exists().then_some(with_extension)
    }

    fn fallback_source(&self) -> Option<PathBuf> {
        let resources = self.resources();
        let lowercase_name = self.app_name.to_lowercase();
        let preferred = [
            format!("{lowercase_name}.icns"),
            "AppIcon.icns".to_owned(),
            "app.icns".to_owned(),
        ];
        for file_name in preferred {
            let candidate = resources.join(file_name);
            if candidate.exists() {
                return Some(candidate);
            }
        }
        std::fs::read_dir(resources)
            .ok()?
            .flatten()
            .map(|entry| entry.path())
            .find(|path| has_extension(path, "icns"))
    }

    fn render_into(&self, destination: &Path) -> Option<()> {
        let source = self.source()?;
        if !should_refresh_icon(&source, destination) {
            return Some(());
        }

        let converted = Command::new("/usr/bin/sips")
            .args(["-s", "format", "png", "-z", "64", "64"])
            .arg(source)
            .arg("--out")
            .arg(destination)
            .status()
            .ok()?
            .success();
        (converted && destination.exists()).then_some(())
    }
}

fn launch_icon_warmup(jobs: Vec<IconJob>, cache: PathBuf) {
    if jobs.is_empty() {
        return;
    }
    std::thread::spawn(move || {
        for job in jobs {
            let destination = icon_cache_file_path(&job.bundle, &cache);
            let _ = BundleIcon::new(&job.bundle, &job.name).render_into(&destination);
        }
    });
}

fn application_roots() -> Vec<PathBuf> {
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    roots
}

pub fn list_installed_apps(app: &AppHandle<AppRuntime>) -> Result<Vec<InstalledApp>, String> {
    let cache = app_icon_cache_dir(app);
    let mut inventory = MacInventory::new(cache.as_deref());
    for root in application_roots() {
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

    fn make_bundle(path: &Path, identifier: &str) {
        std::fs::create_dir_all(path.join("Contents/Resources")).unwrap();
        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>{identifier}</string></dict></plist>"#
        );
        std::fs::write(path.join("Contents/Info.plist"), xml).unwrap();
    }

    #[test]
    fn name_policy_filters_system_tools_and_noisy_suffixes_only() {
        for excluded in [
            "Terminal",
            "System Settings",
            "Acme Installer",
            "Acme-updater.app agent",
        ] {
            assert!(AppNamePolicy::excluded(excluded), "{excluded}");
        }
        for retained in ["Agent Smith", "Update Center", "Terminal Notes"] {
            assert!(!AppNamePolicy::excluded(retained), "{retained}");
        }
    }

    #[test]
    fn inventory_keeps_depth_identifiers_sorting_and_path_deduplication() {
        let root = tempfile::tempdir().unwrap();
        make_bundle(&root.path().join("Zulu.app"), "dev.looper.zulu");
        make_bundle(&root.path().join("one/two/Alpha.app"), "dev.looper.alpha");
        make_bundle(
            &root.path().join("one/two/three/TooDeep.app"),
            "dev.looper.deep",
        );
        make_bundle(&root.path().join("Terminal.app"), "dev.looper.terminal");
        make_bundle(
            &root.path().join("Terminal.app/Contents/Sneaky.app"),
            "dev.looper.sneaky",
        );
        make_bundle(&root.path().join(".Hidden.app"), "dev.looper.hidden");

        let mut inventory = MacInventory::new(None);
        inventory.search(root.path());
        inventory.search(root.path());
        let (apps, jobs) = inventory.finish();

        assert!(jobs.is_empty());
        assert_eq!(
            apps.iter().map(|app| app.name.as_str()).collect::<Vec<_>>(),
            ["Alpha", "Zulu"]
        );
        assert_eq!(apps[0].identifier, "dev.looper.alpha");
        assert_eq!(apps[1].identifier, "dev.looper.zulu");
        assert!(apps.iter().all(|app| app.icon_path.is_none()));
    }

    #[test]
    fn cache_contract_returns_existing_icons_and_schedules_only_missing_ones() {
        let root = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        let cached_bundle = root.path().join("Cached.app");
        let missing_bundle = root.path().join("Missing.app");
        make_bundle(&cached_bundle, "dev.looper.cached");
        make_bundle(&missing_bundle, "dev.looper.missing");
        let cached_icon = icon_cache_file_path(&cached_bundle, cache.path());
        std::fs::write(&cached_icon, b"png").unwrap();

        let mut inventory = MacInventory::new(Some(cache.path()));
        inventory.search(root.path());
        let (apps, jobs) = inventory.finish();

        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].bundle, missing_bundle);
        assert_eq!(
            apps.iter()
                .find(|app| app.name == "Cached")
                .and_then(|app| app.icon_path.as_deref()),
            Some(cached_icon.to_string_lossy().as_ref())
        );
        assert!(apps
            .iter()
            .find(|app| app.name == "Missing")
            .is_some_and(|app| app.icon_path.is_none()));
    }

    #[test]
    fn fallback_icon_selection_preserves_preferred_order() {
        let root = tempfile::tempdir().unwrap();
        let bundle = root.path().join("Looper.app");
        make_bundle(&bundle, "dev.looper.app");
        let resources = bundle.join("Contents/Resources");
        let generic = resources.join("AppIcon.icns");
        let named = resources.join("looper.icns");
        std::fs::write(&generic, b"generic").unwrap();
        std::fs::write(&named, b"named").unwrap();

        assert_eq!(
            BundleIcon::new(&bundle, "Looper").fallback_source(),
            Some(named)
        );
    }
}
