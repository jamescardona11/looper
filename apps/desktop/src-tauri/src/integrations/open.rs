//! Navigation command for bringing an existing or newly launched app forward.

use anyhow::Result;
use serde_json::Value;

use super::{client, output, positionals, str_flag, wants_help};

const VALUE_FLAGS: &[&str] = &["--tab", "--id"];

#[derive(Debug, Eq, PartialEq)]
struct NavigationRequest {
    target: Option<String>,
    tab: Option<String>,
    item_id: Option<String>,
}

impl NavigationRequest {
    fn parse(args: &[String]) -> Result<Self> {
        let target = positionals(args, VALUE_FLAGS).first().map(|value| {
            let value: &String = value;
            value.to_owned()
        });

        Ok(Self {
            target,
            tab: str_flag(args, "--tab")?.map(str::to_owned),
            item_id: str_flag(args, "--id")?.map(str::to_owned),
        })
    }

    fn into_payload(self) -> Value {
        let mut fields = serde_json::Map::new();
        insert_optional(&mut fields, "target", self.target);
        insert_optional(&mut fields, "tab", self.tab);
        insert_optional(&mut fields, "id", self.item_id);
        Value::Object(fields)
    }
}

fn help() {
    super::print_command_help(
        "Open the Looper app.",
        "looper open [target] [options]",
        &[
            (
                "ARGUMENTS",
                &[
                    ("settings", "Open the main window (default)."),
                    ("history", "Open the history view."),
                    ("models", "Open the models view."),
                ],
            ),
            (
                "OPTIONS",
                &[
                    ("--tab <name>", "Settings tab: general, models, history."),
                    ("--id <id>", "Item to open within the target view."),
                    ("--json", "Output machine-readable JSON."),
                ],
            ),
        ],
    );
}

pub(crate) fn run(args: &[String], json: bool) -> Result<()> {
    if wants_help(args) {
        help();
        return Ok(());
    }

    let navigation = NavigationRequest::parse(args)?;
    let data = client::request_data("open", navigation.into_payload())?;
    if json {
        output::print_json(&opened_response(&data));
    }
    Ok(())
}

fn insert_optional(fields: &mut serde_json::Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value {
        fields.insert(key.to_owned(), Value::String(value));
    }
}

fn opened_response(data: &Value) -> Value {
    serde_json::json!({ "ok": true, "opened": data.get("opened") })
}

#[cfg(test)]
mod tests {
    use super::{opened_response, NavigationRequest};

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn navigation_payload_keeps_target_tab_and_item_keys() {
        let request =
            NavigationRequest::parse(&args(&["history", "--tab", "models", "--id", "item-7"]))
                .unwrap();

        assert_eq!(
            request.into_payload(),
            serde_json::json!({ "target": "history", "tab": "models", "id": "item-7" })
        );
    }

    #[test]
    fn navigation_payload_is_empty_when_no_destination_is_given() {
        assert_eq!(
            NavigationRequest::parse(&[]).unwrap().into_payload(),
            serde_json::json!({})
        );
    }

    #[test]
    fn json_acknowledgement_echoes_the_opened_field() {
        let data = serde_json::json!({ "opened": "history", "ignored": true });

        assert_eq!(
            opened_response(&data),
            serde_json::json!({ "ok": true, "opened": "history" })
        );
    }
}
