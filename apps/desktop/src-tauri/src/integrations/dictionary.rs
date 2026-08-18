//! Dictionary CLI boundary: headless reads and app-owned mutations.

use anyhow::{bail, Result};
use serde_json::Value;

use super::{client, output, positionals, wants_help};
use crate::settings::SettingsStore;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DictionaryAction {
    List,
    Add,
    Remove,
}

impl DictionaryAction {
    fn parse(value: &str) -> Result<Self> {
        match value {
            "list" => Ok(Self::List),
            "add" => Ok(Self::Add),
            "remove" => Ok(Self::Remove),
            other => {
                bail!("Unknown dictionary subcommand: {other}. Run 'looper dictionary --help'.")
            }
        }
    }

    fn wire_command(self) -> Option<&'static str> {
        match self {
            Self::List => None,
            Self::Add => Some("dictionary.add"),
            Self::Remove => Some("dictionary.remove"),
        }
    }
}

struct DictionaryMutation {
    command: &'static str,
    words: Vec<String>,
}

impl DictionaryMutation {
    fn from_args(action: DictionaryAction, args: &[String]) -> Result<Self> {
        let words: Vec<String> = positionals(args, &[]).into_iter().cloned().collect();
        if words.is_empty() {
            bail!("expected at least one word");
        }
        Ok(Self {
            command: action
                .wire_command()
                .expect("only mutation actions reach the mutation parser"),
            words,
        })
    }

    fn payload(&self) -> Value {
        serde_json::json!({ "words": self.words })
    }
}

fn help() {
    super::print_command_help(
        "Manage custom dictionary words.",
        "looper dictionary <subcommand> [options]",
        &[
            (
                "SUBCOMMANDS",
                &[
                    ("list", "List custom words."),
                    (
                        "add <word>...",
                        "Add words. Requires the app; launches it if needed.",
                    ),
                    ("remove <word>...", "Remove words."),
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
    match DictionaryAction::parse(sub)? {
        DictionaryAction::List => list(identifier, json),
        action @ (DictionaryAction::Add | DictionaryAction::Remove) => {
            mutate(DictionaryMutation::from_args(action, rest)?, json)
        }
    }
}

fn mutate(mutation: DictionaryMutation, json: bool) -> Result<()> {
    let data = client::request_data(mutation.command, mutation.payload())?;
    report_words(saved_words(&data), json);
    Ok(())
}

fn saved_words(data: &Value) -> Vec<String> {
    data.get("words")
        .and_then(|value| value.as_array())
        .map(|words| {
            words
                .iter()
                .filter_map(|word| word.as_str().map(str::to_owned))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn report_words(words: Vec<String>, json_output: bool) {
    if json_output {
        output::print_json(&serde_json::json!({ "ok": true, "words": words }));
    } else {
        for word in words {
            println!("{word}");
        }
    }
}

fn list(identifier: &str, json: bool) -> Result<()> {
    let store = SettingsStore::for_cli(identifier)?;
    let words = store.load()?.dictionary;
    report_words(words, json);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{saved_words, DictionaryAction, DictionaryMutation};

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn mutation_maps_actions_to_stable_wire_commands() {
        let add = DictionaryMutation::from_args(DictionaryAction::Add, &args(&["Looper"]))
            .expect("valid mutation");
        let remove = DictionaryMutation::from_args(DictionaryAction::Remove, &args(&["obsolete"]))
            .expect("valid mutation");

        assert_eq!(add.command, "dictionary.add");
        assert_eq!(add.payload(), serde_json::json!({ "words": ["Looper"] }));
        assert_eq!(remove.command, "dictionary.remove");
    }

    #[test]
    fn mutation_requires_at_least_one_positional_word() {
        let error = DictionaryMutation::from_args(DictionaryAction::Add, &[])
            .err()
            .expect("missing words must fail");

        assert_eq!(error.to_string(), "expected at least one word");
    }

    #[test]
    fn response_decoder_keeps_only_string_words() {
        let data = serde_json::json!({ "words": ["alpha", 7, null, "beta"] });

        assert_eq!(saved_words(&data), vec!["alpha", "beta"]);
        assert!(saved_words(&serde_json::json!({})).is_empty());
    }
}
