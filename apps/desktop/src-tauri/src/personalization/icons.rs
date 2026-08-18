mod cache_policy;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[cfg(any(target_os = "windows", test))]
use self::cache_policy::executable_name;
use self::cache_policy::{
    app_cache_path, cached_website_icons, icon_needs_refresh, remote_icon_allowed, select_websites,
    website_cache_path,
};
use crate::{platform, AppRuntime};

const FETCH_AGENT: &str = concat!(env!("CARGO_PKG_NAME"), "/", env!("CARGO_PKG_VERSION"));
const MAX_DOWNLOAD_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
    pub name: String,
    pub identifier: String,
    pub path: String,
    pub icon_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebsiteIcon {
    pub site: String,
    pub icon_path: Option<String>,
}

fn ensure_cache_directory(app: &AppHandle<AppRuntime>, leaf: &str) -> Option<PathBuf> {
    let base = app.path().app_data_dir().ok()?;
    let destination = ["local", "cache", leaf]
        .iter()
        .fold(base, |path, component| path.join(component));
    std::fs::create_dir_all(&destination).ok()?;
    Some(destination)
}

pub(crate) fn app_icon_cache_dir(app: &AppHandle<AppRuntime>) -> Option<PathBuf> {
    ensure_cache_directory(app, "appicons")
}

pub(crate) fn website_icon_cache_dir(app: &AppHandle<AppRuntime>) -> Option<PathBuf> {
    ensure_cache_directory(app, "siteicons")
}

pub(crate) fn icon_cache_file_path(source_path: &Path, cache_dir: &Path) -> PathBuf {
    app_cache_path(source_path, cache_dir)
}

pub(crate) fn should_refresh_icon(source: &Path, cached: &Path) -> bool {
    icon_needs_refresh(source, cached)
}

#[cfg(any(target_os = "windows", test))]
pub(crate) fn executable_identifier(path: &Path) -> Option<String> {
    executable_name(path)
}

fn fetch_client() -> Option<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .user_agent(FETCH_AGENT)
        .timeout(Duration::from_secs(4))
        .connect_timeout(Duration::from_secs(3))
        .build()
        .ok()
}

fn download_icon(site: &str, destination: &Path, client: &reqwest::blocking::Client) -> Option<()> {
    if !remote_icon_allowed(site) {
        return None;
    }
    let response = client
        .get(format!("https://icons.duckduckgo.com/ip3/{site}.ico"))
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let payload = response.bytes().ok()?;
    if payload.is_empty() || payload.len() > MAX_DOWNLOAD_BYTES {
        return None;
    }
    std::fs::write(destination, payload).ok()
}

fn warm_missing_icons(sites: Vec<String>, cache_dir: PathBuf) {
    if sites.is_empty() {
        return;
    }
    std::thread::spawn(move || {
        let Some(client) = fetch_client() else {
            return;
        };
        for site in sites {
            let destination = website_cache_path(&site, &cache_dir);
            let _ = download_icon(&site, &destination, &client);
        }
    });
}

fn discard_unused_icons(live_sites: &[String], cache_dir: &Path) {
    let live_paths: HashSet<_> = live_sites
        .iter()
        .map(|site| website_cache_path(site, cache_dir))
        .collect();
    let Ok(directory) = std::fs::read_dir(cache_dir) else {
        return;
    };
    directory
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "ico"))
        .filter(|path| !live_paths.contains(path))
        .for_each(|path| {
            let _ = std::fs::remove_file(path);
        });
}

pub fn list_website_icons(
    sites: Vec<String>,
    app: AppHandle<AppRuntime>,
) -> Result<Vec<WebsiteIcon>, String> {
    let selection = select_websites(sites);
    let Some(cache_dir) = website_icon_cache_dir(&app) else {
        return Ok(selection
            .visible
            .into_iter()
            .map(|site| WebsiteIcon {
                site,
                icon_path: None,
            })
            .collect());
    };

    discard_unused_icons(&selection.all, &cache_dir);
    let cache_state = cached_website_icons(selection.visible, &cache_dir);
    let result = cache_state
        .entries
        .into_iter()
        .map(|entry| WebsiteIcon {
            site: entry.site,
            icon_path: entry
                .cached_path
                .map(|path| path.to_string_lossy().into_owned()),
        })
        .collect();
    warm_missing_icons(cache_state.missing, cache_dir);
    Ok(result)
}

pub fn list_installed_apps(app: AppHandle<AppRuntime>) -> Result<Vec<InstalledApp>, String> {
    #[cfg(target_os = "macos")]
    return platform::macos::icons::list_installed_apps(&app);

    #[cfg(target_os = "windows")]
    return platform::windows::icons::list_installed_apps(&app);

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use super::executable_identifier;
    use std::path::Path;

    #[test]
    fn executable_identifier_keeps_the_file_name_and_extension() {
        assert_eq!(
            executable_identifier(Path::new(r"C:\Program Files\Looper\Looper.exe")),
            if cfg!(windows) {
                Some("Looper.exe".to_string())
            } else {
                Some(r"C:\Program Files\Looper\Looper.exe".to_string())
            }
        );
        assert_eq!(
            executable_identifier(Path::new("/Applications/Looper.app")),
            Some("Looper.app".to_string())
        );
    }
}
