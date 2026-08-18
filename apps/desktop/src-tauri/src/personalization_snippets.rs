use std::env;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::OnceLock;

use chrono::{Datelike, Local};

use crate::accessibility_context::ActiveContext;

const MAX_DYNAMIC_TEXT_LEN: usize = 20_000;

#[derive(Debug, Clone, Default)]
pub struct SnippetContext {
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub website: Option<String>,
    pub url: Option<String>,
}

impl SnippetContext {
    pub fn from_active_context(context: &ActiveContext) -> Self {
        Self {
            app_name: present(context.app_name.trim()),
            window_title: present(context.window_title.trim()),
            website: context
                .url
                .as_deref()
                .and_then(host_from_candidate)
                .or_else(|| host_from_candidate(&context.window_title)),
            url: context.url.as_deref().and_then(present),
        }
    }
}

fn present(value: &str) -> Option<String> {
    if value.is_empty() {
        None
    } else {
        Some(value.to_owned())
    }
}

fn host_from_candidate(candidate: &str) -> Option<String> {
    let normalized = candidate.trim().to_lowercase();
    if normalized.is_empty() {
        return None;
    }

    let after_scheme = normalized
        .find("://")
        .map(|position| &normalized[(position + 3)..])
        .unwrap_or(&normalized);
    let authority_end = after_scheme
        .find(|character: char| matches!(character, '/' | '?' | '#') || character.is_whitespace())
        .unwrap_or(after_scheme.len());
    let authority = &after_scheme[..authority_end];
    let host_and_port = authority.split('@').next_back().unwrap_or(authority);
    let host = bracket_aware_host(host_and_port);
    present(host.trim_start_matches("www."))
}

fn bracket_aware_host(host_and_port: &str) -> &str {
    let Some(unclosed) = host_and_port.strip_prefix('[') else {
        return host_and_port.split(':').next().unwrap_or(host_and_port);
    };
    unclosed
        .find(']')
        .map(|end| &unclosed[..end])
        .unwrap_or_else(|| host_and_port.split(':').next().unwrap_or(host_and_port))
}

#[derive(Clone, Copy)]
enum CalendarSnippet {
    Date,
    Tomorrow,
    Yesterday,
    Day,
    ShortDay,
    Month,
    Year,
    Time,
    Time24,
    DateTime,
    Timezone,
}

impl CalendarSnippet {
    fn render(self) -> String {
        let now = Local::now();
        match self {
            Self::Date => now.format("%B %-d, %Y").to_string(),
            Self::Tomorrow => (now + chrono::Duration::days(1))
                .format("%B %-d, %Y")
                .to_string(),
            Self::Yesterday => (now - chrono::Duration::days(1))
                .format("%B %-d, %Y")
                .to_string(),
            Self::Day => now.format("%A").to_string(),
            Self::ShortDay => now.format("%a").to_string(),
            Self::Month => now.format("%B").to_string(),
            Self::Year => now.year().to_string(),
            Self::Time => now.format("%-I:%M %p").to_string(),
            Self::Time24 => now.format("%H:%M").to_string(),
            Self::DateTime => now.format("%B %-d, %Y at %-I:%M %p").to_string(),
            Self::Timezone => now.format("%Z").to_string(),
        }
    }
}

#[derive(Clone, Copy)]
enum ContextSnippet {
    Application,
    WindowTitle,
    Website,
    Url,
}

impl ContextSnippet {
    fn read(self, context: Option<&SnippetContext>) -> Option<String> {
        let context = context?;
        match self {
            Self::Application => context.app_name.clone(),
            Self::WindowTitle => context.window_title.clone(),
            Self::Website => context.website.clone(),
            Self::Url => context.url.clone(),
        }
    }
}

enum SnippetKind {
    Calendar(CalendarSnippet),
    Context(ContextSnippet),
    Browser,
    UserName,
    FirstName,
    Language,
}

impl SnippetKind {
    fn parse(name: &str) -> Option<Self> {
        let normalized = name.trim().to_ascii_lowercase();
        Some(match normalized.as_str() {
            "date" => Self::Calendar(CalendarSnippet::Date),
            "tomorrow" => Self::Calendar(CalendarSnippet::Tomorrow),
            "yesterday" => Self::Calendar(CalendarSnippet::Yesterday),
            "day" => Self::Calendar(CalendarSnippet::Day),
            "day_short" => Self::Calendar(CalendarSnippet::ShortDay),
            "month" => Self::Calendar(CalendarSnippet::Month),
            "year" => Self::Calendar(CalendarSnippet::Year),
            "time" => Self::Calendar(CalendarSnippet::Time),
            "time_24" => Self::Calendar(CalendarSnippet::Time24),
            "datetime" | "date_time" => Self::Calendar(CalendarSnippet::DateTime),
            "timezone" => Self::Calendar(CalendarSnippet::Timezone),
            "app" | "application" | "app_name" => Self::Context(ContextSnippet::Application),
            "window" | "window_title" | "title" => Self::Context(ContextSnippet::WindowTitle),
            "site" | "website" | "domain" => Self::Context(ContextSnippet::Website),
            "url" => Self::Context(ContextSnippet::Url),
            "browser" => Self::Browser,
            "user_name" => Self::UserName,
            "first_name" => Self::FirstName,
            "language" => Self::Language,
            _ => return None,
        })
    }

    fn resolve(self, context: Option<&SnippetContext>) -> Option<String> {
        match self {
            Self::Calendar(value) => Some(value.render()),
            Self::Context(value) => value.read(context),
            Self::Browser => context
                .and_then(|details| details.app_name.as_deref())
                .and_then(browser_display_name),
            Self::UserName => user_name(),
            Self::FirstName => {
                user_name().and_then(|name| name.split_whitespace().next().map(str::to_owned))
            }
            Self::Language => language(),
        }
    }
}

fn snippet_pattern() -> &'static regex::Regex {
    static PATTERN: OnceLock<regex::Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        regex::Regex::new(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}")
            .expect("personalization snippet pattern is valid")
    })
}

pub fn expand_personalization_snippets(text: &str, context: Option<&SnippetContext>) -> String {
    snippet_pattern()
        .replace_all(text, |captures: &regex::Captures| {
            SnippetKind::parse(&captures[1])
                .and_then(|snippet| snippet.resolve(context))
                .unwrap_or_else(|| captures[0].to_owned())
        })
        .into_owned()
}

fn bounded_dynamic_text(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(MAX_DYNAMIC_TEXT_LEN).collect())
}

#[cfg(target_os = "macos")]
fn successful_command_text(program: &str, arguments: &[&str]) -> Option<String> {
    let result = Command::new(program).args(arguments).output().ok()?;
    if !result.status.success() {
        return None;
    }
    String::from_utf8(result.stdout)
        .ok()
        .and_then(bounded_dynamic_text)
}

fn browser_display_name(app_name: &str) -> Option<String> {
    const BROWSERS: [(&str, &str); 12] = [
        ("safari", "Safari"),
        ("google chrome", "Chrome"),
        ("chrome", "Chrome"),
        ("microsoft edge", "Edge"),
        ("edge", "Edge"),
        ("firefox", "Firefox"),
        ("mozilla firefox", "Firefox"),
        ("arc", "Arc"),
        ("brave browser", "Brave"),
        ("brave", "Brave"),
        ("opera", "Opera"),
        ("opera browser", "Opera"),
    ];

    let candidate = app_name
        .trim()
        .trim_end_matches(".exe")
        .to_ascii_lowercase();
    BROWSERS
        .iter()
        .find_map(|(alias, display)| (*alias == candidate).then(|| (*display).to_owned()))
}

#[cfg(target_os = "macos")]
fn user_name() -> Option<String> {
    successful_command_text("id", &["-F"])
        .or_else(|| env::var("USER").ok().and_then(bounded_dynamic_text))
}

#[cfg(not(target_os = "macos"))]
fn user_name() -> Option<String> {
    env::var("USERNAME")
        .or_else(|_| env::var("USER"))
        .ok()
        .and_then(bounded_dynamic_text)
}

fn language() -> Option<String> {
    let locale = env::var("LC_ALL")
        .or_else(|_| env::var("LC_MESSAGES"))
        .or_else(|_| env::var("LANG"))
        .ok()?;
    let locale_without_encoding = locale.split('.').next().unwrap_or(&locale).trim();
    let language_code = locale_without_encoding
        .split(['_', '-'])
        .next()
        .unwrap_or(locale_without_encoding);
    language_name(language_code)
}

fn language_name(code: &str) -> Option<String> {
    const LANGUAGES: [(&str, &str); 13] = [
        ("ar", "Arabic"),
        ("de", "German"),
        ("en", "English"),
        ("es", "Spanish"),
        ("fr", "French"),
        ("hi", "Hindi"),
        ("it", "Italian"),
        ("ja", "Japanese"),
        ("ko", "Korean"),
        ("nl", "Dutch"),
        ("pt", "Portuguese"),
        ("ru", "Russian"),
        ("zh", "Chinese"),
    ];

    let normalized = code.trim().to_ascii_lowercase();
    if let Some((_, display)) = LANGUAGES
        .iter()
        .find(|(language_code, _)| *language_code == normalized)
    {
        return present(display);
    }
    present(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full_context() -> SnippetContext {
        SnippetContext {
            app_name: Some("Google Chrome".to_owned()),
            window_title: Some("Inbox".to_owned()),
            website: Some("example.com".to_owned()),
            url: Some("https://example.com/inbox".to_owned()),
        }
    }

    #[test]
    fn context_aliases_expand_case_insensitively_and_in_place() {
        let expanded = expand_personalization_snippets(
            "{{APP}}|{{ application }}|{{app_name}}|{{window}}|{{ TITLE }}|{{site}}|{{DOMAIN}}|{{url}}",
            Some(&full_context()),
        );

        assert_eq!(
            expanded,
            "Google Chrome|Google Chrome|Google Chrome|Inbox|Inbox|example.com|example.com|https://example.com/inbox"
        );
    }

    #[test]
    fn calendar_aliases_and_adjacent_tokens_are_all_resolved() {
        let expanded = expand_personalization_snippets(
            "{{date}}{{tomorrow}}{{yesterday}}{{day}}{{day_short}}{{month}}{{year}}{{time}}{{time_24}}{{datetime}}{{date_time}}{{timezone}}",
            None,
        );

        assert!(!expanded.contains("{{"));
        assert!(!expanded.is_empty());
    }

    #[test]
    fn unknown_unavailable_and_invalid_tokens_remain_literal() {
        assert_eq!(
            expand_personalization_snippets(
                "{{missing}} {{app}} {{bad-name}} {{}} {{ spaced unknown }}",
                None,
            ),
            "{{missing}} {{app}} {{bad-name}} {{}} {{ spaced unknown }}"
        );
    }

    #[test]
    fn host_parser_keeps_userinfo_ports_ipv6_and_window_fallback_rules() {
        let cases = [
            (
                "HTTPS://User@example.com:8443/path?q=1",
                Some("example.com"),
            ),
            ("www.example.com/path", Some("example.com")),
            ("https://[2001:db8::1]:443/path", Some("2001:db8::1")),
            ("example.com title", Some("example.com")),
            ("   ", None),
        ];
        for (candidate, expected) in cases {
            assert_eq!(host_from_candidate(candidate).as_deref(), expected);
        }
    }

    #[test]
    fn active_context_trims_labels_but_preserves_the_original_nonempty_url() {
        let active = ActiveContext {
            app_name: "  Safari  ".to_owned(),
            window_title: " https://window.example/path ".to_owned(),
            url: Some("  ".to_owned()),
            bundle_id: None,
        };

        let snippets = SnippetContext::from_active_context(&active);

        assert_eq!(snippets.app_name.as_deref(), Some("Safari"));
        assert_eq!(
            snippets.window_title.as_deref(),
            Some("https://window.example/path")
        );
        assert_eq!(snippets.website.as_deref(), Some("window.example"));
        assert_eq!(snippets.url.as_deref(), Some("  "));
    }

    #[test]
    fn browser_mapping_preserves_existing_suffix_and_alias_behavior() {
        let mappings = [
            ("Chrome.exe", Some("Chrome")),
            ("Microsoft Edge", Some("Edge")),
            ("Mozilla Firefox", Some("Firefox")),
            ("Brave Browser", Some("Brave")),
            ("CHROME.EXE", None),
            ("Vivaldi", None),
        ];
        for (candidate, expected) in mappings {
            assert_eq!(browser_display_name(candidate).as_deref(), expected);
        }
    }

    #[test]
    fn dynamic_text_is_trimmed_bounded_by_unicode_scalars_and_rejects_blank_values() {
        let value = format!("  {}tail  ", "🎙".repeat(MAX_DYNAMIC_TEXT_LEN));
        let bounded = bounded_dynamic_text(value).expect("bounded dynamic text");

        assert_eq!(bounded.chars().count(), MAX_DYNAMIC_TEXT_LEN);
        assert!(bounded.chars().all(|character| character == '🎙'));
        assert_eq!(bounded_dynamic_text(" \n ".to_owned()), None);
    }

    #[test]
    fn language_catalog_preserves_known_names_and_unknown_code_spelling() {
        assert_eq!(language_name("EN").as_deref(), Some("English"));
        assert_eq!(language_name("es").as_deref(), Some("Spanish"));
        assert_eq!(language_name("Custom").as_deref(), Some("Custom"));
        assert_eq!(language_name("  ").as_deref(), Some("  "));
    }

    #[test]
    fn browser_snippet_uses_context_without_changing_other_fields() {
        assert_eq!(
            expand_personalization_snippets("{{browser}} {{window_title}}", Some(&full_context())),
            "Chrome Inbox"
        );
    }
}
