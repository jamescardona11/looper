use crate::field_format::FieldFormat;
use crate::settings::{
    AppBinding, ModeRule, ModeRuleTrigger, Personality, UserSettings, WorkflowField,
};
use crate::{
    accessibility_context::{self, ActiveContext},
    permissions,
    personalization_snippets::{expand_personalization_snippets, SnippetContext},
};

#[derive(Debug, Clone)]
pub struct ModeContextMode {
    pub name: String,
    pub instructions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct HostName(String);

impl HostName {
    fn parse(candidate: &str) -> Option<Self> {
        let normalized = candidate.trim().to_lowercase();
        let after_scheme = normalized
            .split_once("://")
            .map_or(normalized.as_str(), |(_, remainder)| remainder);
        let authority = after_scheme
            .split(['/', '?', '#'])
            .next()
            .unwrap_or_default();
        let host_and_port = authority.rsplit('@').next().unwrap_or_default();
        let mut host = Self::without_port(host_and_port);

        while let Some(remainder) = host.strip_prefix("www.") {
            host = remainder;
        }

        (!host.is_empty()).then(|| Self(host.to_owned()))
    }

    fn without_port(authority: &str) -> &str {
        match authority.strip_prefix('[') {
            Some(ipv6) => ipv6
                .split_once(']')
                .map(|(host, _)| host)
                .unwrap_or_else(|| authority.split(':').next().unwrap_or(authority)),
            None => authority.split(':').next().unwrap_or(authority),
        }
    }

    fn accepts(&self, candidate: &str) -> bool {
        let Some(candidate) = Self::parse(candidate) else {
            return false;
        };
        candidate == *self
            || candidate
                .0
                .strip_suffix(&self.0)
                .is_some_and(|prefix| prefix.ends_with('.'))
    }

    fn specificity(&self) -> usize {
        self.0.len()
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ApplicationName(Vec<String>);

impl ApplicationName {
    fn parse(label: &str) -> Self {
        let normalized = label.trim().to_lowercase();
        let executable = normalized.trim_end_matches(".exe");
        Self(
            executable
                .split(|character: char| !character.is_ascii_alphanumeric())
                .filter(|token| !token.is_empty())
                .map(str::to_owned)
                .collect(),
        )
    }

    fn is_present(&self) -> bool {
        !self.0.is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum MatchSource {
    LegacyApplication,
    IdentifiedApplication,
    Website,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct MatchStrength {
    source: MatchSource,
    specificity: usize,
}

struct ContextMatcher<'a> {
    active: &'a ActiveContext,
}

impl<'a> ContextMatcher<'a> {
    fn new(active: &'a ActiveContext) -> Self {
        Self { active }
    }

    fn personality_strength(&self, personality: &Personality) -> Option<MatchStrength> {
        self.website_strength(personality)
            .or_else(|| self.application_strength(personality))
    }

    fn website_strength(&self, personality: &Personality) -> Option<MatchStrength> {
        personality
            .websites
            .iter()
            .filter_map(|pattern| self.website_specificity(pattern))
            .max()
            .map(|specificity| MatchStrength {
                source: MatchSource::Website,
                specificity,
            })
    }

    fn website_specificity(&self, pattern: &str) -> Option<usize> {
        let expected = HostName::parse(pattern)?;
        let matches = match self.active.url.as_deref() {
            Some(url) => expected.accepts(url),
            None => {
                expected.accepts(&self.active.window_title)
                    || expected.accepts(&self.active.app_name)
            }
        };
        matches.then(|| expected.specificity())
    }

    fn application_strength(&self, personality: &Personality) -> Option<MatchStrength> {
        let has_identifier_match = personality
            .apps
            .iter()
            .any(|binding| binding.identifier.is_some() && self.application_matches(binding));
        if has_identifier_match {
            return Some(MatchStrength {
                source: MatchSource::IdentifiedApplication,
                specificity: 0,
            });
        }

        personality
            .apps
            .iter()
            .any(|binding| binding.identifier.is_none() && self.application_matches(binding))
            .then_some(MatchStrength {
                source: MatchSource::LegacyApplication,
                specificity: 0,
            })
    }

    fn application_matches(&self, binding: &AppBinding) -> bool {
        match binding.identifier.as_deref() {
            Some(expected) => self
                .active
                .bundle_id
                .as_deref()
                .is_some_and(|actual| actual.eq_ignore_ascii_case(expected)),
            None => {
                let actual = ApplicationName::parse(&self.active.app_name);
                actual.is_present() && actual == ApplicationName::parse(&binding.name)
            }
        }
    }
}

struct RankedPersonality<'a> {
    personality: &'a Personality,
    strength: MatchStrength,
}

impl<'a> RankedPersonality<'a> {
    fn keep_preferred(current: Option<Self>, candidate: Self) -> Option<RankedPersonality<'a>> {
        match current {
            Some(selected) if selected.strength >= candidate.strength => Some(selected),
            _ => Some(candidate),
        }
    }
}

pub(crate) fn resolve_personality_for_context(
    settings: &UserSettings,
    context: &ActiveContext,
) -> Option<Personality> {
    let matcher = ContextMatcher::new(context);
    settings
        .personalities
        .iter()
        .filter(|personality| personality.enabled)
        .filter_map(|personality| {
            matcher
                .personality_strength(personality)
                .map(|strength| RankedPersonality {
                    personality,
                    strength,
                })
        })
        .fold(None, RankedPersonality::keep_preferred)
        .map(|selection| selection.personality.clone())
}

#[derive(Default)]
struct GuidanceDocument {
    sections: Vec<String>,
}

impl GuidanceDocument {
    fn append_mode(&mut self, mode: &ModeContextMode, snippets: Option<&SnippetContext>) {
        let bullets = mode
            .instructions
            .iter()
            .filter_map(|instruction| Self::bullet(instruction, snippets))
            .collect::<Vec<_>>();
        if bullets.is_empty() {
            return;
        }

        let mut section = String::from("Mode: ");
        section.push_str(&mode.name);
        for bullet in bullets {
            section.push('\n');
            section.push_str(&bullet);
        }
        self.sections.push(section);
    }

    fn bullet(instruction: &str, snippets: Option<&SnippetContext>) -> Option<String> {
        let content = instruction.trim().trim_start_matches('-').trim();
        if content.is_empty() {
            return None;
        }
        let expanded = expand_personalization_snippets(content, snippets);
        Some(format!("- {expanded}"))
    }

    fn finish(self) -> Option<String> {
        (!self.sections.is_empty()).then(|| self.sections.join("\n"))
    }
}

fn render_guidance(modes: &[ModeContextMode], snippets: Option<&SnippetContext>) -> Option<String> {
    let mut document = GuidanceDocument::default();
    for mode in modes {
        document.append_mode(mode, snippets);
    }
    document.finish()
}

fn permitted_active_context() -> Option<ActiveContext> {
    permissions::check_accessibility_permission()
        .then(accessibility_context::get_active_context)
        .flatten()
}

pub fn format_active_cleanup_style_guidance(settings: &UserSettings) -> Option<String> {
    let context = permitted_active_context()?;
    let personality = resolve_personality_for_context(settings, &context)?;
    let snippets = SnippetContext::from_active_context(&context);
    render_guidance(
        &[ModeContextMode {
            name: personality.name,
            instructions: personality.instructions,
        }],
        Some(&snippets),
    )
}

pub fn format_cleanup_style_guidance_for_personality(personality: &Personality) -> Option<String> {
    let active_context = permitted_active_context();
    let snippets = active_context
        .as_ref()
        .map(SnippetContext::from_active_context);
    render_guidance(
        &[ModeContextMode {
            name: personality.name.clone(),
            instructions: personality.instructions.clone(),
        }],
        snippets.as_ref(),
    )
}

pub fn resolve_active_personality(settings: &UserSettings) -> Option<Personality> {
    let context = permitted_active_context()?;
    resolve_personality_for_context(settings, &context)
}

struct RuleEnvironment<'a> {
    active: &'a ActiveContext,
    field_format: Option<FieldFormat>,
}

impl RuleEnvironment<'_> {
    fn accepts(&self, rule: &ModeRule) -> bool {
        match &rule.trigger {
            ModeRuleTrigger::BundleId { bundle_id } => self
                .active
                .bundle_id
                .as_deref()
                .is_some_and(|active| active.eq_ignore_ascii_case(bundle_id)),
            ModeRuleTrigger::UrlPattern { url_pattern } => {
                self.active.url.as_deref().is_some_and(|url| {
                    HostName::parse(url_pattern).is_some_and(|host| host.accepts(url))
                })
            }
            ModeRuleTrigger::Field { field } => Self::field_matches(*field, self.field_format),
            ModeRuleTrigger::Hotkey { .. } | ModeRuleTrigger::Manual => false,
        }
    }

    fn field_matches(expected: WorkflowField, actual: Option<FieldFormat>) -> bool {
        matches!(
            (expected, actual),
            (WorkflowField::Email, Some(FieldFormat::Email))
                | (WorkflowField::Chat, Some(FieldFormat::Chat))
                | (WorkflowField::Document, Some(FieldFormat::Document))
                | (WorkflowField::Prompt, Some(FieldFormat::Prompt))
        )
    }
}

#[cfg(test)]
fn rule_matches(rule: &ModeRule, active: &ActiveContext) -> bool {
    RuleEnvironment {
        active,
        field_format: None,
    }
    .accepts(rule)
}

fn explicit_rule_decision(settings: &UserSettings) -> Option<Option<ModeRule>> {
    settings.active_workflow_id.as_deref().map(|selected_id| {
        settings
            .mode_rules
            .iter()
            .find(|rule| rule.enabled && rule.id == selected_id)
            .cloned()
    })
}

pub fn resolve_active_mode_rule(settings: &UserSettings) -> Option<ModeRule> {
    if let Some(decision) = explicit_rule_decision(settings) {
        return decision;
    }

    let active = permitted_active_context()?;
    let environment = RuleEnvironment {
        active: &active,
        field_format: crate::field_format::detect(),
    };
    settings
        .mode_rules
        .iter()
        .find(|rule| rule.enabled && environment.accepts(rule))
        .cloned()
}

#[cfg(test)]
mod contract_tests {
    use super::*;
    use crate::settings::{WorkflowEngine, WorkflowInput, WorkflowOutput};

    struct Fixture {
        settings: UserSettings,
        context: ActiveContext,
    }

    impl Fixture {
        fn new(app_name: &str) -> Self {
            Self {
                settings: UserSettings::default(),
                context: ActiveContext {
                    app_name: app_name.to_owned(),
                    window_title: String::new(),
                    url: None,
                    bundle_id: None,
                },
            }
        }

        fn with_bundle(mut self, bundle_id: &str) -> Self {
            self.context.bundle_id = Some(bundle_id.to_owned());
            self
        }

        fn with_url(mut self, url: &str) -> Self {
            self.context.url = Some(url.to_owned());
            self
        }

        fn with_title(mut self, title: &str) -> Self {
            self.context.window_title = title.to_owned();
            self
        }

        fn personalities(mut self, personalities: Vec<Personality>) -> Self {
            self.settings.personalities = personalities;
            self
        }

        fn selected_personality(&self) -> Option<Personality> {
            resolve_personality_for_context(&self.settings, &self.context)
        }
    }

    fn profile(name: &str) -> Personality {
        Personality {
            id: name.to_lowercase().replace(' ', "-"),
            name: name.to_owned(),
            enabled: true,
            apps: Vec::new(),
            websites: Vec::new(),
            instructions: vec!["Be concise".to_owned()],
        }
    }

    fn for_legacy_app(name: &str, app_name: &str) -> Personality {
        let mut personality = profile(name);
        personality.apps.push(AppBinding::legacy(app_name));
        personality
    }

    fn for_identified_app(name: &str, app_name: &str, identifier: &str) -> Personality {
        let mut personality = profile(name);
        personality.apps.push(AppBinding {
            name: app_name.to_owned(),
            identifier: Some(identifier.to_owned()),
        });
        personality
    }

    fn for_site(name: &str, site: &str) -> Personality {
        let mut personality = profile(name);
        personality.websites.push(site.to_owned());
        personality
    }

    fn workflow(id: &str, trigger: ModeRuleTrigger) -> ModeRule {
        ModeRule {
            id: id.to_owned(),
            name: format!("Workflow {id}"),
            enabled: true,
            trigger,
            input: WorkflowInput::Dictation,
            engine: WorkflowEngine::Auto,
            language: None,
            transform_preset: None,
            custom_prompt: None,
            deterministic_only: false,
            output: WorkflowOutput::Insert,
            auto_send_on_insert: false,
        }
    }

    #[test]
    fn host_parser_keeps_authority_semantics() {
        let cases = [
            (" HTTPS://WWW.Example.COM:443/path?q=1#x ", "example.com"),
            ("user:secret@docs.example.com/a", "docs.example.com"),
            ("http://[::1]:8080/path", "::1"),
            ("www.www.example.com", "example.com"),
        ];
        for (candidate, expected) in cases {
            assert_eq!(
                HostName::parse(candidate),
                Some(HostName(expected.to_owned()))
            );
        }
        assert_eq!(HostName::parse("   "), None);
    }

    #[test]
    fn host_match_allows_real_subdomains_but_not_suffix_spoofing() {
        let site = HostName::parse("example.com").unwrap();
        assert!(site.accepts("https://example.com/path"));
        assert!(site.accepts("https://deep.docs.example.com/path"));
        assert!(!site.accepts("https://notexample.com"));
        assert!(!site.accepts("https://example.com.attacker.test"));
    }

    #[test]
    fn legacy_app_matching_normalizes_executable_and_separators() {
        let fixture = Fixture::new("Visual_Studio-Code.EXE.exe")
            .personalities(vec![for_legacy_app("Editor", "visual studio code")]);
        assert_eq!(fixture.selected_personality().unwrap().name, "Editor");
    }

    #[test]
    fn legacy_app_matching_rejects_partial_names() {
        let fixture = Fixture::new("Visual Studio Code")
            .personalities(vec![for_legacy_app("Older editor", "Visual Studio")]);
        assert!(fixture.selected_personality().is_none());
    }

    #[test]
    fn stable_identifier_is_case_insensitive_and_does_not_fall_back_to_name() {
        let matching = Fixture::new("Renamed")
            .with_bundle("COM.OPENAI.CODEX")
            .personalities(vec![for_identified_app(
                "Codex",
                "Old name",
                "com.openai.codex",
            )]);
        assert_eq!(matching.selected_personality().unwrap().name, "Codex");

        let mismatching = Fixture::new("Old name")
            .with_bundle("com.example.other")
            .personalities(vec![for_identified_app(
                "Codex",
                "Old name",
                "com.openai.codex",
            )]);
        assert!(mismatching.selected_personality().is_none());
    }

    #[test]
    fn website_outranks_identifier_and_legacy_application() {
        let fixture = Fixture::new("Safari")
            .with_bundle("com.apple.safari")
            .with_url("https://mail.example.com/inbox")
            .personalities(vec![
                for_legacy_app("Legacy browser", "Safari"),
                for_identified_app("Browser", "Safari", "com.apple.safari"),
                for_site("Mailbox", "example.com"),
            ]);
        assert_eq!(fixture.selected_personality().unwrap().name, "Mailbox");
    }

    #[test]
    fn most_specific_matching_website_wins() {
        let fixture = Fixture::new("Browser")
            .with_url("https://docs.example.com/document/1")
            .personalities(vec![
                for_site("General", "example.com"),
                for_site("Documents", "docs.example.com"),
            ]);
        assert_eq!(fixture.selected_personality().unwrap().name, "Documents");
    }

    #[test]
    fn equal_strength_keeps_first_configured_personality() {
        let fixture = Fixture::new("Notes").personalities(vec![
            for_legacy_app("First", "Notes"),
            for_legacy_app("Second", "Notes"),
        ]);
        assert_eq!(fixture.selected_personality().unwrap().name, "First");
    }

    #[test]
    fn disabled_personalities_do_not_participate() {
        let mut disabled = for_site("Disabled", "example.com");
        disabled.enabled = false;
        let fixture = Fixture::new("Browser")
            .with_url("https://example.com")
            .personalities(vec![disabled]);
        assert!(fixture.selected_personality().is_none());
    }

    #[test]
    fn website_uses_title_fallback_only_when_url_is_absent() {
        let personality = for_site("Mail", "mail.example.com");
        let without_url = Fixture::new("Browser")
            .with_title("mail.example.com")
            .personalities(vec![personality.clone()]);
        assert_eq!(without_url.selected_personality().unwrap().name, "Mail");

        let with_other_url = Fixture::new("Browser")
            .with_title("mail.example.com")
            .with_url("https://example.org")
            .personalities(vec![personality]);
        assert!(with_other_url.selected_personality().is_none());
    }

    #[test]
    fn guidance_preserves_mode_order_and_expands_context_snippets() {
        let snippets = SnippetContext {
            app_name: Some("Notes".to_owned()),
            window_title: None,
            website: None,
            url: None,
        };
        let modes = vec![
            ModeContextMode {
                name: "Writing".to_owned(),
                instructions: vec![" -- Use {{app}} terminology ".to_owned(), " ".to_owned()],
            },
            ModeContextMode {
                name: "Tone".to_owned(),
                instructions: vec!["Friendly".to_owned()],
            },
        ];
        assert_eq!(
            render_guidance(&modes, Some(&snippets)).as_deref(),
            Some("Mode: Writing\n- Use Notes terminology\nMode: Tone\n- Friendly")
        );
    }

    #[test]
    fn guidance_omits_modes_without_real_instructions() {
        let modes = [ModeContextMode {
            name: "Empty".to_owned(),
            instructions: vec!["".to_owned(), "---   ".to_owned()],
        }];
        assert_eq!(render_guidance(&modes, None), None);
    }

    #[test]
    fn bundle_rule_requires_identifier_and_ignores_case() {
        let rule = workflow(
            "bundle",
            ModeRuleTrigger::BundleId {
                bundle_id: "com.apple.Safari".to_owned(),
            },
        );
        assert!(rule_matches(
            &rule,
            &Fixture::new("Safari")
                .with_bundle("COM.APPLE.SAFARI")
                .context
        ));
        assert!(!rule_matches(&rule, &Fixture::new("Safari").context));
    }

    #[test]
    fn url_rule_never_uses_app_or_title_fallback() {
        let rule = workflow(
            "url",
            ModeRuleTrigger::UrlPattern {
                url_pattern: "github.com".to_owned(),
            },
        );
        let matching = Fixture::new("Safari").with_url("https://gist.github.com/1");
        assert!(rule_matches(&rule, &matching.context));

        let title_only = Fixture::new("github.com").with_title("github.com");
        assert!(!rule_matches(&rule, &title_only.context));
    }

    #[test]
    fn field_rules_cover_supported_formats_only() {
        let cases = [
            (WorkflowField::Email, Some(FieldFormat::Email), true),
            (WorkflowField::Chat, Some(FieldFormat::Chat), true),
            (WorkflowField::Document, Some(FieldFormat::Document), true),
            (WorkflowField::Prompt, Some(FieldFormat::Prompt), true),
            (WorkflowField::Code, Some(FieldFormat::Document), false),
            (WorkflowField::Form, Some(FieldFormat::Email), false),
            (WorkflowField::Email, None, false),
        ];
        for (expected, detected, matches) in cases {
            assert_eq!(RuleEnvironment::field_matches(expected, detected), matches);
        }
    }

    #[test]
    fn manual_and_hotkey_rules_are_not_automatic_matches() {
        let context = Fixture::new("Anything").context;
        let manual = workflow("manual", ModeRuleTrigger::Manual);
        let hotkey = workflow(
            "hotkey",
            ModeRuleTrigger::Hotkey {
                shortcut: "Cmd+K".to_owned(),
            },
        );
        assert!(!rule_matches(&manual, &context));
        assert!(!rule_matches(&hotkey, &context));
    }

    #[test]
    fn explicit_rule_selection_requires_enabled_exact_id_without_automatic_fallback() {
        let mut disabled = workflow("disabled", ModeRuleTrigger::Manual);
        disabled.enabled = false;
        let selected = workflow("selected", ModeRuleTrigger::Manual);
        let mut settings = UserSettings {
            active_workflow_id: Some("selected".to_owned()),
            mode_rules: vec![disabled, selected.clone()],
            ..UserSettings::default()
        };
        assert_eq!(explicit_rule_decision(&settings), Some(Some(selected)));

        settings.active_workflow_id = Some("disabled".to_owned());
        assert_eq!(explicit_rule_decision(&settings), Some(None));

        settings.active_workflow_id = None;
        assert_eq!(explicit_rule_decision(&settings), None);
    }

    #[test]
    fn automatic_rule_search_keeps_configured_order() {
        let context = Fixture::new("Safari")
            .with_bundle("com.apple.safari")
            .context;
        let first = workflow(
            "first",
            ModeRuleTrigger::BundleId {
                bundle_id: "com.apple.safari".to_owned(),
            },
        );
        let second = workflow(
            "second",
            ModeRuleTrigger::BundleId {
                bundle_id: "com.apple.safari".to_owned(),
            },
        );
        let environment = RuleEnvironment {
            active: &context,
            field_format: None,
        };
        let selected = [first.clone(), second]
            .into_iter()
            .find(|rule| environment.accepts(rule));
        assert_eq!(selected, Some(first));
    }
}
