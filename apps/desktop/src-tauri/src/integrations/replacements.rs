//! Replacement CLI boundary: headless reads and app-owned mutations.

use anyhow::{bail, Result};
use serde_json::Value;

use super::{client, output, str_flag, wants_help};
use crate::settings::{Replacement, SettingsStore};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ReplacementAction {
    List,
    Add,
    Remove,
}

impl ReplacementAction {
    fn parse(value: &str) -> Result<Self> {
        match value {
            "list" => Ok(Self::List),
            "add" => Ok(Self::Add),
            "remove" => Ok(Self::Remove),
            other => {
                bail!("Unknown replacements subcommand: {other}. Run 'looper replacements --help'.")
            }
        }
    }
}

struct ReplacementMutation<'a> {
    command: &'static str,
    from: &'a str,
    to: Option<&'a str>,
}

impl<'a> ReplacementMutation<'a> {
    fn from_args(action: ReplacementAction, args: &'a [String]) -> Result<Self> {
        let from = required_flag(args, "--from")?;
        match action {
            ReplacementAction::Add => Ok(Self {
                command: "replacements.add",
                from,
                to: Some(required_flag(args, "--to")?),
            }),
            ReplacementAction::Remove => Ok(Self {
                command: "replacements.remove",
                from,
                to: None,
            }),
            ReplacementAction::List => unreachable!("list does not create a mutation"),
        }
    }

    fn payload(&self) -> Value {
        match self.to {
            Some(to) => serde_json::json!({ "from": self.from, "to": to }),
            None => serde_json::json!({ "from": self.from }),
        }
    }
}

fn help() {
    super::print_command_help(
        "Manage text replacements.",
        "looper replacements <subcommand> [options]",
        &[
            (
                "SUBCOMMANDS",
                &[
                    ("list", "List replacements."),
                    ("add --from <a> --to <b>", "Add or update a replacement."),
                    ("remove --from <a>", "Remove a replacement."),
                ],
            ),
            ("OPTIONS", &[("--json", "Output machine-readable JSON.")]),
        ],
    );
}

pub(crate) fn run(identifier: &str, args: &[String], json: bool) -> Result<()> {
    if args.is_empty() || wants_help(args) {
        help();
        return Ok(());
    }
    let (sub, rest) = args.split_first().expect("non-empty checked above");
    match ReplacementAction::parse(sub)? {
        ReplacementAction::List => list(identifier, json),
        action @ (ReplacementAction::Add | ReplacementAction::Remove) => {
            mutate(ReplacementMutation::from_args(action, rest)?, json)
        }
    }
}

fn required_flag<'a>(args: &'a [String], flag: &str) -> Result<&'a str> {
    str_flag(args, flag)?.ok_or_else(|| anyhow::anyhow!("{flag} is required"))
}

fn mutate(mutation: ReplacementMutation<'_>, json: bool) -> Result<()> {
    let data = client::request_data(mutation.command, mutation.payload())?;
    report(&data, json);
    Ok(())
}

fn report(data: &Value, json: bool) {
    if json {
        output::print_json(&serde_json::json!({
            "ok": true,
            "replacements": data.get("replacements")
        }));
    } else {
        for line in replacement_lines(data) {
            println!("{line}");
        }
    }
}

fn replacement_lines(data: &Value) -> Vec<String> {
    data.get("replacements")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|item| {
            let from = item.get("from").and_then(Value::as_str).unwrap_or("");
            let to = item.get("to").and_then(Value::as_str).unwrap_or("");
            format!("{from} -> {to}")
        })
        .collect()
}

fn list(identifier: &str, json: bool) -> Result<()> {
    let store = SettingsStore::for_cli(identifier)?;
    let replacements = store.load()?.replacements;
    if json {
        output::print_json(&serde_json::json!({ "ok": true, "replacements": replacements }));
    } else {
        for line in stored_replacement_lines(replacements) {
            println!("{line}");
        }
    }
    Ok(())
}

fn stored_replacement_lines(replacements: Vec<Replacement>) -> Vec<String> {
    replacements
        .into_iter()
        .map(|item| format!("{} -> {}", item.from, item.to))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{replacement_lines, ReplacementAction, ReplacementMutation};

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn add_and_remove_keep_the_established_wire_payloads() {
        let add_args = args(&["--from", "teh", "--to", "the"]);
        let remove_args = args(&["--from", "teh"]);
        let add = ReplacementMutation::from_args(ReplacementAction::Add, &add_args).unwrap();
        let remove =
            ReplacementMutation::from_args(ReplacementAction::Remove, &remove_args).unwrap();

        assert_eq!(add.command, "replacements.add");
        assert_eq!(
            add.payload(),
            serde_json::json!({ "from": "teh", "to": "the" })
        );
        assert_eq!(remove.command, "replacements.remove");
        assert_eq!(remove.payload(), serde_json::json!({ "from": "teh" }));
    }

    #[test]
    fn missing_required_flag_keeps_the_public_error_text() {
        let error = ReplacementMutation::from_args(ReplacementAction::Add, &args(&["--from", "a"]))
            .err()
            .unwrap();

        assert_eq!(error.to_string(), "--to is required");
    }

    #[test]
    fn plain_response_keeps_empty_fields_and_arrow_format() {
        let data = serde_json::json!({
            "replacements": [{ "from": "a", "to": "b" }, { "from": "missing" }, null]
        });

        assert_eq!(replacement_lines(&data), ["a -> b", "missing -> ", " -> "]);
    }
}
