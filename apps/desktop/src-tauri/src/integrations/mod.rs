//! Terminal-facing commands and the local control channel used by the desktop app.

mod client;
mod dictionary;
mod handlers;
mod history;
mod ipc;
mod library;
mod mcp;
mod meeting;
mod model;
mod models;
mod open;
mod output;
mod replacements;
mod server;
mod status;
mod transcribe;

pub(crate) use server::start as start_control_server;

use std::fmt::Write as _;
use std::path::PathBuf;

use anyhow::{bail, Result};

type CommandRunner = fn(&str, &[String], bool) -> Result<()>;

struct CommandSpec {
    verb: &'static str,
    summary: &'static str,
    run: CommandRunner,
}

const COMMANDS: &[CommandSpec] = &[
    CommandSpec {
        verb: "transcribe",
        summary: "Transcribe a file to text.",
        run: run_transcribe,
    },
    CommandSpec {
        verb: "library",
        summary: "Import and transcribe files in the background.",
        run: run_library,
    },
    CommandSpec {
        verb: "meeting",
        summary: "Record meetings and capture timestamped notes.",
        run: run_meeting,
    },
    CommandSpec {
        verb: "history",
        summary: "Read dictation history.",
        run: run_history,
    },
    CommandSpec {
        verb: "mcp",
        summary: "Expose local History and Library to MCP clients.",
        run: run_mcp,
    },
    CommandSpec {
        verb: "dictionary",
        summary: "Manage custom dictionary words.",
        run: run_dictionary,
    },
    CommandSpec {
        verb: "replacements",
        summary: "Manage text replacements.",
        run: run_replacements,
    },
    CommandSpec {
        verb: "model",
        summary: "Choose the active speech model.",
        run: run_model,
    },
    CommandSpec {
        verb: "models",
        summary: "Install or remove speech models.",
        run: run_models,
    },
    CommandSpec {
        verb: "status",
        summary: "Show whether Looper is running.",
        run: run_status,
    },
    CommandSpec {
        verb: "open",
        summary: "Open the Looper app.",
        run: run_open,
    },
];

fn command(verb: &str) -> Option<&'static CommandSpec> {
    COMMANDS.iter().find(|entry| entry.verb == verb)
}

pub fn is_integration_command(verb: &str) -> bool {
    command(verb).is_some()
}

pub(crate) type HelpSection<'a> = (&'a str, &'a [(&'a str, &'a str)]);

pub(crate) fn print_command_help(overview: &str, usage: &str, sections: &[HelpSection]) {
    print!("{}", render_command_help(overview, usage, sections));
}

fn render_command_help(overview: &str, usage: &str, sections: &[HelpSection]) -> String {
    let label_width = sections
        .iter()
        .flat_map(|(_, entries)| entries.iter().map(|(label, _)| label.len()))
        .max()
        .unwrap_or_default();
    let mut text = String::new();
    writeln!(text, "OVERVIEW: {overview}\n").expect("writing to String cannot fail");
    writeln!(text, "USAGE: {usage}").expect("writing to String cannot fail");
    for (title, entries) in sections {
        writeln!(text, "\n{title}:").expect("writing to String cannot fail");
        for (label, description) in *entries {
            writeln!(text, "  {label:<label_width$}  {description}")
                .expect("writing to String cannot fail");
        }
    }
    text
}

pub fn print_help() {
    let commands = COMMANDS
        .iter()
        .map(|entry| (entry.verb, entry.summary))
        .collect::<Vec<_>>();
    print_command_help(
        "Local dictation and transcription from the terminal.",
        "looper <command> [options]",
        &[
            (
                "OPTIONS",
                &[
                    ("--cache-dir <path>", "Override the model cache directory."),
                    ("--json", "Output machine-readable JSON."),
                    ("-h, --help", "Show help information."),
                ],
            ),
            ("SUBCOMMANDS", &commands),
        ],
    );
    println!("\n  See 'looper <command> --help' for command details.");
}

pub fn dispatch(identifier: &str, args: &[String]) -> Result<()> {
    ipc::init_socket_label(identifier);
    let json_output = Arguments(args).contains("--json");
    match run(identifier, args, json_output) {
        Ok(()) => Ok(()),
        Err(error) => terminate(FailureReport::from_error(&error, json_output)),
    }
}

struct FailureReport {
    exit_code: i32,
    message: String,
    json: bool,
}

impl FailureReport {
    fn from_error(error: &anyhow::Error, json: bool) -> Self {
        Self {
            exit_code: error
                .downcast_ref::<CodedError>()
                .map(|coded| coded.code)
                .unwrap_or(1),
            message: error.to_string(),
            json,
        }
    }

    fn emit(&self) {
        if self.json {
            output::print_error_json(&self.message);
        } else {
            eprintln!("{}", self.message);
        }
    }
}

fn terminate(report: FailureReport) -> ! {
    report.emit();
    std::process::exit(report.exit_code)
}

fn run(identifier: &str, args: &[String], json_output: bool) -> Result<()> {
    let (verb, command_args) = args
        .split_first()
        .expect("dispatch is only called with a leading verb");
    let spec = command(verb).ok_or_else(|| anyhow::anyhow!("Unknown command: {verb}"))?;
    (spec.run)(identifier, command_args, json_output)
}

fn run_transcribe(identifier: &str, args: &[String], json: bool) -> Result<()> {
    transcribe::run(identifier, args, json)
}

fn run_library(identifier: &str, args: &[String], json: bool) -> Result<()> {
    library::run(identifier, args, json)
}

fn run_meeting(identifier: &str, args: &[String], json: bool) -> Result<()> {
    meeting::run(identifier, args, json)
}

fn run_history(identifier: &str, args: &[String], json: bool) -> Result<()> {
    history::run(identifier, args, json)
}

fn run_mcp(identifier: &str, args: &[String], _json: bool) -> Result<()> {
    mcp::run(identifier, args)
}

fn run_dictionary(identifier: &str, args: &[String], json: bool) -> Result<()> {
    dictionary::run(identifier, args, json)
}

fn run_replacements(identifier: &str, args: &[String], json: bool) -> Result<()> {
    replacements::run(identifier, args, json)
}

fn run_model(identifier: &str, args: &[String], json: bool) -> Result<()> {
    model::run(identifier, args, json)
}

fn run_models(identifier: &str, args: &[String], json: bool) -> Result<()> {
    models::run(identifier, args, json)
}

fn run_status(_identifier: &str, args: &[String], json: bool) -> Result<()> {
    status::run(args, json)
}

fn run_open(_identifier: &str, args: &[String], json: bool) -> Result<()> {
    open::run(args, json)
}

#[derive(Debug)]
pub(crate) struct CodedError {
    pub code: i32,
    pub message: String,
}

impl std::fmt::Display for CodedError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for CodedError {}

pub(crate) fn coded(code: i32, message: impl Into<String>) -> anyhow::Error {
    CodedError {
        code,
        message: message.into(),
    }
    .into()
}

pub(crate) fn require_active_cli_license(identifier: &str) -> Result<()> {
    if license_check_is_bypassed() {
        return Ok(());
    }

    let store = crate::settings::SettingsStore::for_cli(identifier)?;
    refresh_license_if_needed(&store)?;
    if crate::license::active_license_gate(&store) {
        Ok(())
    } else {
        bail!("{}", inactive_license_message())
    }
}

fn license_check_is_bypassed() -> bool {
    cfg!(debug_assertions) && option_env!("LOOPER_FORCE_LICENSE_GATE") != Some("1")
}

fn refresh_license_if_needed(store: &crate::settings::SettingsStore) -> Result<()> {
    let was_active = crate::license::active_license_gate(store);
    let refresh_needed =
        crate::license::secure_grant_refresh_needed(store).map_err(anyhow::Error::msg)?;
    if !refresh_needed {
        return Ok(());
    }

    let runtime = tokio::runtime::Runtime::new()?;
    let refresh = runtime.block_on(crate::license::refresh_license(
        reqwest::Client::new(),
        store,
    ));
    if let Err(error) = refresh {
        if !was_active {
            bail!("{}", refresh_failed_message(&error.to_string()));
        }
    }
    Ok(())
}

fn inactive_license_message() -> &'static str {
    "An active Looper license is required to use the CLI.\n\
     Open Looper > Settings > Account to check or activate your license."
}

fn refresh_failed_message(error: &str) -> String {
    format!(
        "An active Looper license is required to use the CLI.\n\
         The saved license could not be refreshed: {error}\n\
         Open Looper > Settings > Account to check or activate your license."
    )
}

pub(crate) fn open_storage(identifier: &str) -> Result<crate::storage::StorageManager> {
    let database = crate::settings::cli_data_dir(identifier)?.join("transcriptions.db");
    open_existing_storage(database)
}

fn open_existing_storage(database: PathBuf) -> Result<crate::storage::StorageManager> {
    if !database.exists() {
        bail!("No Looper database found. Run Looper at least once first.");
    }
    crate::storage::StorageManager::new(database)
}

#[derive(Clone, Copy)]
struct Arguments<'a>(&'a [String]);

impl<'a> Arguments<'a> {
    fn requests_help(self) -> bool {
        self.0
            .iter()
            .any(|argument| matches!(argument.as_str(), "-h" | "--help"))
    }

    fn contains(self, flag: &str) -> bool {
        self.0.iter().any(|argument| argument == flag)
    }

    fn value(self, flag: &str) -> Result<Option<&'a str>> {
        let Some(index) = self.0.iter().position(|argument| argument == flag) else {
            return Ok(None);
        };
        let value = self
            .0
            .get(index + 1)
            .ok_or_else(|| anyhow::anyhow!("{flag} requires a value"))?;
        if flag_like(value) {
            bail!("{flag} requires a value");
        }
        Ok(Some(value))
    }

    fn positional(self, value_flags: &[&str]) -> Vec<&'a String> {
        let mut values = Vec::new();
        let mut index = 0;
        while let Some(argument) = self.0.get(index) {
            if value_flags.contains(&argument.as_str()) {
                index += 2;
            } else {
                if !flag_like(argument) {
                    values.push(argument);
                }
                index += 1;
            }
        }
        values
    }
}

fn flag_like(value: &str) -> bool {
    value.starts_with("--") || (value.starts_with('-') && value.len() > 1)
}

pub(crate) fn wants_help(args: &[String]) -> bool {
    Arguments(args).requests_help()
}

pub(crate) fn usize_flag(args: &[String], flag: &str, default: usize) -> Result<usize> {
    let Some(value) = Arguments(args).value(flag)? else {
        return Ok(default);
    };
    value
        .parse()
        .map_err(|_| anyhow::anyhow!("{flag} must be a non-negative integer"))
}

pub(crate) fn str_flag<'a>(args: &'a [String], flag: &str) -> Result<Option<&'a str>> {
    Arguments(args).value(flag)
}

pub(crate) fn has_flag(args: &[String], flag: &str) -> bool {
    Arguments(args).contains(flag)
}

pub(crate) fn positionals<'a>(args: &'a [String], value_flags: &[&str]) -> Vec<&'a String> {
    Arguments(args).positional(value_flags)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn registry_owns_the_public_verbs_in_help_order() {
        assert_eq!(
            COMMANDS.iter().map(|entry| entry.verb).collect::<Vec<_>>(),
            [
                "transcribe",
                "library",
                "meeting",
                "history",
                "mcp",
                "dictionary",
                "replacements",
                "model",
                "models",
                "status",
                "open",
            ]
        );
        assert!(is_integration_command("history"));
        assert!(!is_integration_command("unknown"));
    }

    #[test]
    fn help_renderer_uses_one_shared_label_width_and_exact_spacing() {
        let rendered = render_command_help(
            "Overview",
            "looper demo",
            &[("OPTIONS", &[("-h", "Help"), ("--long", "Long option")])],
        );

        assert_eq!(
            rendered,
            "OVERVIEW: Overview\n\nUSAGE: looper demo\n\nOPTIONS:\n  -h      Help\n  --long  Long option\n"
        );
    }

    #[test]
    fn coded_and_plain_errors_keep_documented_exit_selection() {
        let coded = coded(4, "cancelled");
        let coded_report = FailureReport::from_error(&coded, true);
        assert_eq!(coded_report.exit_code, 4);
        assert_eq!(coded_report.message, "cancelled");
        assert!(coded_report.json);

        let plain = anyhow::anyhow!("bad input");
        let plain_report = FailureReport::from_error(&plain, false);
        assert_eq!(plain_report.exit_code, 1);
        assert_eq!(plain_report.message, "bad input");
        assert!(!plain_report.json);
    }

    #[test]
    fn help_and_presence_checks_match_only_exact_tokens() {
        let values = args(&["--helpful", "-h", "--json=true", "--json"]);
        assert!(wants_help(&values));
        assert!(has_flag(&values, "--json"));
        assert!(!has_flag(&values, "--missing"));
    }

    #[test]
    fn valued_flags_keep_first_match_and_public_validation_errors() {
        let values = args(&["--model", "first", "--model", "second"]);
        assert_eq!(str_flag(&values, "--model").unwrap(), Some("first"));
        assert_eq!(usize_flag(&args(&[]), "--limit", 20).unwrap(), 20);
        assert_eq!(
            usize_flag(&args(&["--limit", "7"]), "--limit", 20).unwrap(),
            7
        );
        assert_eq!(
            str_flag(&args(&["--model", "--json"]), "--model")
                .unwrap_err()
                .to_string(),
            "--model requires a value"
        );
        assert_eq!(
            usize_flag(&args(&["--limit", "-1"]), "--limit", 20)
                .unwrap_err()
                .to_string(),
            "--limit requires a value"
        );
        assert_eq!(
            usize_flag(&args(&["--limit", "many"]), "--limit", 20)
                .unwrap_err()
                .to_string(),
            "--limit must be a non-negative integer"
        );
    }

    #[test]
    fn positional_scan_skips_known_flag_values_but_not_unknown_flag_values() {
        let values = args(&[
            "alpha",
            "--model",
            "parakeet",
            "--unknown",
            "unknown-value",
            "-",
            "omega",
        ]);
        let parsed = positionals(&values, &["--model"])
            .into_iter()
            .map(String::as_str)
            .collect::<Vec<_>>();

        assert_eq!(parsed, ["alpha", "unknown-value", "-", "omega"]);
    }

    #[test]
    fn missing_storage_is_rejected_without_creating_a_database() {
        let directory = tempfile::tempdir().unwrap();
        let database = directory.path().join("missing.sqlite3");

        assert_eq!(
            open_existing_storage(database.clone())
                .err()
                .unwrap()
                .to_string(),
            "No Looper database found. Run Looper at least once first."
        );
        assert!(!database.exists());
    }

    #[test]
    fn existing_storage_is_opened_and_migrated_headlessly() {
        let directory = tempfile::tempdir().unwrap();
        let database = directory.path().join("existing.sqlite3");
        std::fs::File::create(&database).unwrap();

        let storage = open_existing_storage(database).unwrap();

        assert!(storage.get_all().unwrap().is_empty());
    }

    #[test]
    fn license_messages_keep_account_guidance_and_refresh_detail() {
        assert_eq!(
            inactive_license_message(),
            "An active Looper license is required to use the CLI.\nOpen Looper > Settings > Account to check or activate your license."
        );
        assert_eq!(
            refresh_failed_message("offline"),
            "An active Looper license is required to use the CLI.\nThe saved license could not be refreshed: offline\nOpen Looper > Settings > Account to check or activate your license."
        );
    }
}
