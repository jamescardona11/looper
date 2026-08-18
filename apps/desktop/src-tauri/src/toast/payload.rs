use serde::Serialize;

#[derive(Clone, Debug, Default, Serialize)]
pub struct Payload {
    #[serde(rename = "type")]
    pub toast_type: String,
    pub title: Option<String>,
    pub message: String,
    #[serde(rename = "autoDismiss")]
    pub auto_dismiss: Option<bool>,
    pub duration: Option<u64>,
    #[serde(rename = "retryId")]
    pub retry_id: Option<String>,
    pub mode: Option<String>,
    pub action: Option<String>,
    #[serde(rename = "actionLabel")]
    pub action_label: Option<String>,
    #[serde(rename = "secondaryAction")]
    pub secondary_action: Option<String>,
    #[serde(rename = "secondaryActionLabel")]
    pub secondary_action_label: Option<String>,
}

impl Payload {
    pub(super) fn passive(toast_type: &str, title: Option<&str>, message: &str) -> Self {
        Self::base(toast_type.to_owned(), message.to_owned()).with_title(title.map(str::to_owned))
    }

    pub(super) fn actionable(
        toast_type: &str,
        title: Option<&str>,
        message: &str,
        action: &str,
        action_label: &str,
    ) -> Self {
        Self::passive(toast_type, title, message)
            .with_primary_action(action.to_owned(), action_label.to_owned())
    }

    pub(super) fn diagnostic(
        toast_type: String,
        message: String,
        action: Option<String>,
        action_label: Option<String>,
    ) -> Self {
        let mut payload = Self::base(toast_type, message).with_lifetime(8_000);
        payload.action = action;
        payload.action_label = action_label;
        payload
    }

    pub(super) fn celebration() -> Self {
        Self::base(
            "celebration".to_owned(),
            "Welcome to Looper Cloud!".to_owned(),
        )
        .with_title(Some("Upgrade Complete!".to_owned()))
        .with_lifetime(6_000)
    }

    pub(super) fn is_permission_request(&self) -> bool {
        matches!(
            self.action.as_deref(),
            Some("open_accessibility_settings" | "open_microphone_settings")
        )
    }

    fn base(toast_type: String, message: String) -> Self {
        Self {
            toast_type,
            message,
            ..Self::default()
        }
    }

    fn with_title(mut self, title: Option<String>) -> Self {
        self.title = title;
        self
    }

    fn with_primary_action(mut self, action: String, label: String) -> Self {
        self.action = Some(action);
        self.action_label = Some(label);
        self
    }

    fn with_lifetime(mut self, duration: u64) -> Self {
        self.auto_dismiss = Some(true);
        self.duration = Some(duration);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::Payload;
    use serde_json::json;

    #[test]
    fn passive_payload_keeps_the_frontend_wire_shape() {
        let payload = Payload::passive("error", Some("Microphone"), "Permission denied");

        assert_eq!(
            serde_json::to_value(payload).unwrap(),
            json!({
                "type": "error",
                "title": "Microphone",
                "message": "Permission denied",
                "autoDismiss": null,
                "duration": null,
                "retryId": null,
                "mode": null,
                "action": null,
                "actionLabel": null,
                "secondaryAction": null,
                "secondaryActionLabel": null,
            })
        );
    }

    #[test]
    fn specialized_payloads_keep_actions_and_lifetimes() {
        let action = Payload::actionable(
            "warning",
            None,
            "Allow access",
            "open_microphone_settings",
            "Open Settings",
        );
        let diagnostic = Payload::diagnostic(
            "info".to_owned(),
            "Debug".to_owned(),
            Some("open_library".to_owned()),
            Some("Open".to_owned()),
        );
        let celebration = Payload::celebration();

        assert!(action.is_permission_request());
        assert_eq!(action.action.as_deref(), Some("open_microphone_settings"));
        assert_eq!(action.action_label.as_deref(), Some("Open Settings"));
        assert_eq!(diagnostic.auto_dismiss, Some(true));
        assert_eq!(diagnostic.duration, Some(8_000));
        assert_eq!(celebration.duration, Some(6_000));
        assert_eq!(celebration.message, "Welcome to Looper Cloud!");
    }
}
