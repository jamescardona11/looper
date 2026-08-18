use std::collections::{hash_map::DefaultHasher, HashSet};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

const WEBSITE_LIMIT: usize = 256;

pub(super) struct WebsiteSelection {
    pub all: Vec<String>,
    pub visible: Vec<String>,
}

pub(super) struct WebsiteCacheEntry {
    pub site: String,
    pub cached_path: Option<PathBuf>,
}

pub(super) struct WebsiteCacheState {
    pub entries: Vec<WebsiteCacheEntry>,
    pub missing: Vec<String>,
}

fn remove_prefix<'a>(value: &'a str, alternatives: &[&str]) -> &'a str {
    alternatives
        .iter()
        .find_map(|prefix| value.strip_prefix(prefix))
        .unwrap_or(value)
}

fn website_host(value: &str) -> Option<String> {
    let lowercase = value.trim().to_lowercase();
    let without_feed = remove_prefix(&lowercase, &["feed://", "feed:"]);
    let without_scheme = remove_prefix(without_feed, &["https://", "http://"]);
    let without_www = remove_prefix(without_scheme, &["www."]);
    let boundary = without_www
        .char_indices()
        .find_map(|(index, character)| "/?#:".contains(character).then_some(index))
        .unwrap_or(without_www.len());
    let host = &without_www[..boundary];
    (!host.is_empty()).then(|| host.to_owned())
}

pub(super) fn select_websites(candidates: Vec<String>) -> WebsiteSelection {
    let mut identities = HashSet::new();
    let all: Vec<_> = candidates
        .into_iter()
        .filter_map(|candidate| website_host(&candidate))
        .filter(|site| identities.insert(site.clone()))
        .collect();
    WebsiteSelection {
        visible: all.iter().take(WEBSITE_LIMIT).cloned().collect(),
        all,
    }
}

fn hashed_file(value: impl Hash, cache_dir: &Path, extension: &str) -> PathBuf {
    let mut digest = DefaultHasher::new();
    value.hash(&mut digest);
    cache_dir.join(format!("{:016x}.{extension}", digest.finish()))
}

pub(super) fn website_cache_path(site: &str, cache_dir: &Path) -> PathBuf {
    hashed_file(site, cache_dir, "ico")
}

pub(super) fn app_cache_path(source: &Path, cache_dir: &Path) -> PathBuf {
    let mut digest = DefaultHasher::new();
    #[cfg(target_os = "windows")]
    "windows-target-icon-v4-png-crate".hash(&mut digest);
    source.to_string_lossy().hash(&mut digest);
    cache_dir.join(format!("{:016x}.png", digest.finish()))
}

pub(super) fn icon_needs_refresh(source: &Path, cached: &Path) -> bool {
    let modification = |path: &Path| {
        std::fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
    };
    match (modification(source), modification(cached)) {
        (Some(source_time), Some(cache_time)) => source_time > cache_time,
        _ => true,
    }
}

#[cfg(any(target_os = "windows", test))]
pub(super) fn executable_name(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
}

pub(super) fn remote_icon_allowed(site: &str) -> bool {
    let host = site.trim().trim_end_matches('.').to_ascii_lowercase();
    let reserved_suffix = host
        .rsplit_once('.')
        .map(|(_, suffix)| suffix)
        .is_some_and(|suffix| {
            matches!(
                suffix,
                "local" | "internal" | "lan" | "home" | "intranet" | "corp" | "localdomain"
            )
        });
    !(host.is_empty()
        || host == "localhost"
        || host.parse::<std::net::IpAddr>().is_ok()
        || !host.contains('.')
        || reserved_suffix)
}

pub(super) fn cached_website_icons(visible: Vec<String>, cache_dir: &Path) -> WebsiteCacheState {
    let mut missing = Vec::new();
    let entries = visible
        .into_iter()
        .map(|site| {
            let path = website_cache_path(&site, cache_dir);
            let cached_path = path.exists().then_some(path);
            if cached_path.is_none() {
                missing.push(site.clone());
            }
            WebsiteCacheEntry { site, cached_path }
        })
        .collect();
    WebsiteCacheState { entries, missing }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn website_selection_normalizes_deduplicates_and_preserves_order() {
        let selection = select_websites(vec![
            " HTTPS://WWW.Example.COM:8443/path?q=1 ".to_owned(),
            "feed://example.com/other".to_owned(),
            "feed:https://News.Example.org/story".to_owned(),
            "  ".to_owned(),
        ]);

        assert_eq!(selection.all, ["example.com", "news.example.org"]);
        assert_eq!(selection.visible, selection.all);
    }

    #[test]
    fn website_selection_caps_only_the_visible_projection() {
        let selection = select_websites(
            (0..300)
                .map(|index| format!("site-{index}.example.com"))
                .collect(),
        );

        assert_eq!(selection.all.len(), 300);
        assert_eq!(selection.visible.len(), WEBSITE_LIMIT);
        assert_eq!(selection.visible.last().unwrap(), "site-255.example.com");
    }

    #[test]
    fn remote_fetch_policy_rejects_local_and_address_targets() {
        for blocked in [
            "",
            "localhost",
            "printer",
            "127.0.0.1",
            "8.8.8.8",
            "service.internal.",
            "host.localdomain",
        ] {
            assert!(!remote_icon_allowed(blocked), "{blocked}");
        }
        assert!(remote_icon_allowed("example.com"));
    }

    #[test]
    fn cache_projection_reports_existing_and_missing_sites_in_order() {
        let root =
            std::env::temp_dir().join(format!("looper-icon-policy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let cached = website_cache_path("cached.example", &root);
        std::fs::write(&cached, b"icon").unwrap();

        let state = cached_website_icons(
            vec!["cached.example".to_owned(), "missing.example".to_owned()],
            &root,
        );

        assert_eq!(state.entries[0].cached_path.as_ref(), Some(&cached));
        assert_eq!(state.entries[1].cached_path, None);
        assert_eq!(state.missing, ["missing.example"]);
        std::fs::remove_dir_all(root).unwrap();
    }
}
