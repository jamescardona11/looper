use anyhow::Result;
use std::ffi::OsString;

use super::contracts::AppRuntime;

#[derive(Default)]
struct GlobalOptions {
    json: bool,
    cache_dir: Option<String>,
    command_index: usize,
}

impl GlobalOptions {
    fn parse(arguments: &[String]) -> Option<Self> {
        let mut parsed = Self::default();
        while let Some(argument) = arguments.get(parsed.command_index) {
            match argument.as_str() {
                "--json" => {
                    parsed.json = true;
                    parsed.command_index += 1;
                }
                "--cache-dir" => {
                    parsed.cache_dir = Some(arguments.get(parsed.command_index + 1)?.clone());
                    parsed.command_index += 2;
                }
                value if value.starts_with("--cache-dir=") => {
                    parsed.cache_dir = value.split_once('=').map(|pair| pair.1.to_owned());
                    parsed.command_index += 1;
                }
                _ => break,
            }
        }
        Some(parsed)
    }
}

pub fn run_cli() -> Result<()> {
    let raw: Vec<String> = std::env::args_os()
        .skip(1)
        .map(|value| value.to_string_lossy().into_owned())
        .collect();
    if let Some(command) = integration_arguments(&raw) {
        let context = app_context();
        return crate::integrations::dispatch(&context.config().identifier, &command);
    }
    if asks_for_help(std::env::args_os().skip(1)) && is_root_help(&raw) || raw.is_empty() {
        crate::integrations::print_help();
        return Ok(());
    }
    anyhow::bail!("Unknown command: {}. Run `looper --help`.", raw.join(" "))
}

pub(crate) fn app_context() -> tauri::Context<AppRuntime> {
    tauri::generate_context!()
}

fn integration_arguments(arguments: &[String]) -> Option<Vec<String>> {
    let global = GlobalOptions::parse(arguments)?;
    let verb = arguments.get(global.command_index)?;
    if !crate::integrations::is_integration_command(verb) {
        return None;
    }
    let mut forwarded = Vec::with_capacity(arguments.len());
    forwarded.push(verb.clone());
    forwarded.extend_from_slice(&arguments[global.command_index + 1..]);
    if matches!(verb.as_str(), "model" | "models" | "transcribe") {
        if let Some(cache) = global.cache_dir {
            forwarded.extend(["--cache-dir".to_owned(), cache]);
        }
    }
    if global.json && !forwarded.iter().any(|argument| argument == "--json") {
        forwarded.push("--json".to_owned());
    }
    Some(forwarded)
}

fn asks_for_help(arguments: impl IntoIterator<Item = OsString>) -> bool {
    for (position, argument) in arguments.into_iter().enumerate() {
        if argument == "--" {
            break;
        }
        if matches!(argument.to_str(), Some("-h" | "--help"))
            || (position == 0 && argument == "help")
        {
            return true;
        }
    }
    false
}

fn is_root_help(arguments: &[String]) -> bool {
    arguments.len() == 1
        && matches!(
            arguments.first().map(String::as_str),
            Some("-h" | "--help" | "help")
        )
}

#[cfg(test)]
mod tests {
    use super::{asks_for_help, integration_arguments, is_root_help};
    use std::ffi::OsString;

    fn os(values: &[&str]) -> Vec<OsString> {
        values.iter().copied().map(OsString::from).collect()
    }

    #[test]
    fn help_detection_stops_at_the_argument_separator() {
        assert!(asks_for_help(os(&["--help"])));
        assert!(asks_for_help(os(&["transcribe", "--help"])));
        assert!(asks_for_help(os(&["help", "transcribe"])));
        assert!(!asks_for_help(os(&["transcribe", "--", "--help"])));
    }

    #[test]
    fn only_single_argument_help_is_top_level() {
        for token in ["help", "-h", "--help"] {
            assert!(is_root_help(&[token.to_owned()]));
        }
        assert!(!is_root_help(&["help".into(), "models".into()]));
        assert!(!is_root_help(&["models".into(), "--help".into()]));
    }

    #[test]
    fn globals_are_forwarded_only_where_the_cli_contract_allows_them() {
        let history =
            ["--cache-dir", "/tmp/models", "--json", "history", "list"].map(str::to_owned);
        assert_eq!(
            integration_arguments(&history),
            Some(vec!["history".into(), "list".into(), "--json".into()])
        );
        assert_eq!(
            integration_arguments(&["mcp".into()]),
            Some(vec!["mcp".into()])
        );
        assert!(integration_arguments(&["--cache-dir".into(), "status".into()]).is_none());
    }
}
