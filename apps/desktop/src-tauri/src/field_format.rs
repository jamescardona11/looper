use crate::{accessibility_context::ActiveContext, assistive::FocusedTextSnapshot};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldFormat {
    Email,
    Chat,
    Document,
    Prompt,
}

impl FieldFormat {
    pub fn cleanup_guidance(self) -> &'static str {
        match self {
            Self::Email => {
                "The focused destination is an email composer. Use clear, professional sentences. Do not invent a recipient, greeting, subject, or sign-off that the user did not dictate."
            }
            Self::Chat => {
                "The focused destination is a chat message. Keep the result concise and conversational. Do not add an email-style greeting or sign-off unless the user dictated one."
            }
            Self::Document => {
                "The focused destination is a document editor. Preserve intentional paragraphs, headings, and lists, and use complete prose without forcing email or chat conventions."
            }
            Self::Prompt => {
                "The focused destination is an AI prompt field. Preserve the user's request as a direct, clear instruction for another model. Do not answer or execute the request."
            }
        }
    }
}

fn normalized_context(context: &ActiveContext, snapshot: &FocusedTextSnapshot) -> String {
    [
        context.app_name.as_str(),
        context.bundle_id.as_deref().unwrap_or_default(),
        context.url.as_deref().unwrap_or_default(),
        context.window_title.as_str(),
        snapshot.role.as_deref().unwrap_or_default(),
        snapshot.subrole.as_deref().unwrap_or_default(),
    ]
    .join(" ")
    .to_lowercase()
}

fn contains_any(value: &str, candidates: &[&str]) -> bool {
    candidates.iter().any(|candidate| value.contains(candidate))
}

fn is_text_destination(snapshot: &FocusedTextSnapshot) -> bool {
    let role = snapshot.role.as_deref().unwrap_or_default().to_lowercase();
    let subrole = snapshot
        .subrole
        .as_deref()
        .unwrap_or_default()
        .to_lowercase();

    contains_any(
        &format!("{role} {subrole}"),
        &[
            "axtextfield",
            "axtextarea",
            "axwebarea",
            "edit",
            "document",
            // Windows UI Automation control type IDs.
            "50004",
            "50030",
        ],
    )
}

pub fn classify(context: &ActiveContext, snapshot: &FocusedTextSnapshot) -> Option<FieldFormat> {
    if !is_text_destination(snapshot) {
        return None;
    }

    let value = normalized_context(context, snapshot);

    if contains_any(
        &value,
        &[
            "mail.google.com",
            "outlook.live.com",
            "outlook.office.com",
            "com.apple.mail",
            "microsoft outlook",
            "thunderbird",
            "superhuman",
            "readdle.smartemail",
            "spark mail",
        ],
    ) {
        return Some(FieldFormat::Email);
    }

    if contains_any(
        &value,
        &[
            "chatgpt.com",
            "chat.openai.com",
            "claude.ai",
            "gemini.google.com",
            "perplexity.ai",
            "copilot.microsoft.com",
            "com.openai.chat",
            "com.anthropic.claudefordesktop",
        ],
    ) {
        return Some(FieldFormat::Prompt);
    }

    if contains_any(
        &value,
        &[
            "app.slack.com",
            "discord.com",
            "web.whatsapp.com",
            "teams.microsoft.com",
            "com.tinyspeck.slackmacgap",
            "com.hnc.discord",
            "com.apple.messages",
            "whatsapp",
            "telegram",
            "signal",
            "microsoft teams",
        ],
    ) {
        return Some(FieldFormat::Chat);
    }

    if contains_any(
        &value,
        &[
            "docs.google.com/document",
            "notion.so",
            "com.microsoft.word",
            "com.apple.pages",
            "com.apple.textedit",
            "notion",
            "obsidian",
            "craft",
            "bear",
        ],
    ) {
        return Some(FieldFormat::Document);
    }

    let role = snapshot.role.as_deref().unwrap_or_default().to_lowercase();
    let subrole = snapshot
        .subrole
        .as_deref()
        .unwrap_or_default()
        .to_lowercase();
    contains_any(
        &format!("{role} {subrole}"),
        &["axwebarea", "document", "50030"],
    )
    .then_some(FieldFormat::Document)
}

pub fn detect() -> Option<FieldFormat> {
    let context = crate::accessibility_context::get_active_context()?;
    let snapshot = crate::assistive::focused_text_snapshot()?;
    classify(&context, &snapshot)
}

#[cfg(test)]
mod tests {
    use super::{classify, FieldFormat};
    use crate::{accessibility_context::ActiveContext, assistive::FocusedTextSnapshot};

    fn context(app: &str, bundle_id: Option<&str>, url: Option<&str>) -> ActiveContext {
        ActiveContext {
            app_name: app.to_string(),
            window_title: String::new(),
            url: url.map(str::to_string),
            bundle_id: bundle_id.map(str::to_string),
        }
    }

    fn field(role: &str, subrole: Option<&str>) -> FocusedTextSnapshot {
        FocusedTextSnapshot {
            pid: 1,
            role: Some(role.to_string()),
            subrole: subrole.map(str::to_string),
            value: String::new(),
            frame: None,
            selection: None,
        }
    }

    #[test]
    fn classifies_known_email_chat_document_and_prompt_destinations() {
        assert_eq!(
            classify(
                &context(
                    "Safari",
                    Some("com.apple.Safari"),
                    Some("https://mail.google.com/mail/u/0/#inbox?compose=new"),
                ),
                &field("AXTextArea", None),
            ),
            Some(FieldFormat::Email)
        );
        assert_eq!(
            classify(
                &context("Slack", Some("com.tinyspeck.slackmacgap"), None),
                &field("AXTextArea", None),
            ),
            Some(FieldFormat::Chat)
        );
        assert_eq!(
            classify(
                &context("Pages", Some("com.apple.Pages"), None),
                &field("AXTextArea", None),
            ),
            Some(FieldFormat::Document)
        );
        assert_eq!(
            classify(
                &context(
                    "Chrome",
                    Some("com.google.Chrome"),
                    Some("https://claude.ai/new"),
                ),
                &field("AXTextArea", None),
            ),
            Some(FieldFormat::Prompt)
        );
    }

    #[test]
    fn rejects_non_text_controls_and_unknown_single_line_fields() {
        assert_eq!(
            classify(
                &context(
                    "Safari",
                    Some("com.apple.Safari"),
                    Some("https://example.com")
                ),
                &field("AXButton", None),
            ),
            None
        );
        assert_eq!(
            classify(&context("Unknown", None, None), &field("AXTextField", None),),
            None
        );
    }

    #[test]
    fn generic_document_roles_degrade_to_document_format() {
        assert_eq!(
            classify(
                &context("Unknown", None, None),
                &field("50030", Some("document")),
            ),
            Some(FieldFormat::Document)
        );
    }

    #[test]
    fn guidance_never_invents_email_or_executes_prompts() {
        assert!(FieldFormat::Email
            .cleanup_guidance()
            .contains("Do not invent"));
        assert!(FieldFormat::Prompt
            .cleanup_guidance()
            .contains("Do not answer or execute"));
    }
}
