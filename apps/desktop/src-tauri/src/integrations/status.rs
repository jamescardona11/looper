//! Runtime status command. The client probe never launches the GUI.

use anyhow::Result;
use serde_json::{json, Value};

use super::ipc::Response;
use super::{client, coded, output, wants_help};

enum RuntimeStatus {
    Running(Value),
    NotRunning,
}

struct PlainStatus<'a> {
    pill: &'a str,
    active_model: &'a str,
}

impl<'a> PlainStatus<'a> {
    fn from_data(data: &'a Value) -> Self {
        Self {
            pill: string_field(data, "pill"),
            active_model: string_field(data, "active_model"),
        }
    }
}

impl std::fmt::Display for PlainStatus<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "app_running:   true\npill:          {}\nactive_model:  {}",
            self.pill, self.active_model
        )
    }
}

fn help() {
    super::print_command_help(
        "Show whether Looper is running.",
        "looper status [options]",
        &[("OPTIONS", &[("--json", "Output machine-readable JSON.")])],
    );
}

pub(crate) fn run(args: &[String], json: bool) -> Result<()> {
    if wants_help(args) {
        help();
        return Ok(());
    }
    let response = client::try_request("status", json!({}))?;
    render(classify_response(response)?, json);
    Ok(())
}

fn classify_response(response: Option<Response>) -> Result<RuntimeStatus> {
    match response {
        Some(response) if response.ok => Ok(RuntimeStatus::Running(response.data)),
        Some(response) => Err(coded(
            3,
            response.error.unwrap_or_else(|| "status failed".to_owned()),
        )),
        None => Ok(RuntimeStatus::NotRunning),
    }
}

fn render(status: RuntimeStatus, json_output: bool) {
    match (status, json_output) {
        (RuntimeStatus::Running(data), true) => output::print_json(&successful_data(data)),
        (RuntimeStatus::Running(data), false) => println!("{}", PlainStatus::from_data(&data)),
        (RuntimeStatus::NotRunning, true) => {
            output::print_json(&json!({ "ok": true, "app_running": false }));
        }
        (RuntimeStatus::NotRunning, false) => println!("app_running:   false"),
    }
}

fn successful_data(mut data: Value) -> Value {
    if let Some(fields) = data.as_object_mut() {
        fields.insert("ok".to_owned(), Value::Bool(true));
    }
    data
}

fn string_field<'a>(data: &'a Value, key: &str) -> &'a str {
    data.get(key).and_then(Value::as_str).unwrap_or("unknown")
}

#[cfg(test)]
mod tests {
    use super::{classify_response, successful_data, PlainStatus, RuntimeStatus};
    use crate::integrations::ipc::Response;

    #[test]
    fn running_json_adds_or_replaces_the_success_marker() {
        let value = successful_data(serde_json::json!({ "ok": false, "pill": "idle" }));

        assert_eq!(value, serde_json::json!({ "ok": true, "pill": "idle" }));
    }

    #[test]
    fn scalar_status_payload_is_left_unchanged() {
        assert_eq!(successful_data(serde_json::json!("ready")), "ready");
    }

    #[test]
    fn plain_status_preserves_labels_and_unknown_fallbacks() {
        let data = serde_json::json!({ "pill": "recording" });

        assert_eq!(
            PlainStatus::from_data(&data).to_string(),
            "app_running:   true\npill:          recording\nactive_model:  unknown"
        );
    }

    #[test]
    fn failed_probe_keeps_exit_code_three_and_default_message() {
        let error = match classify_response(Some(Response {
            ok: false,
            data: serde_json::Value::Null,
            error: None,
        })) {
            Ok(RuntimeStatus::Running(_) | RuntimeStatus::NotRunning) => panic!("expected error"),
            Err(error) => error,
        };
        let coded = error
            .downcast_ref::<crate::integrations::CodedError>()
            .unwrap();

        assert_eq!(coded.code, 3);
        assert_eq!(coded.message, "status failed");
    }
}
