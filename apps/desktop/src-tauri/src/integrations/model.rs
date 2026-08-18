//! Commands for inspecting the speech-model catalog and changing its active route.

use std::fmt;
use std::path::PathBuf;

use anyhow::{bail, Result};
use serde::Serialize;
use serde_json::{json, Value};

use super::{client, output, positionals, str_flag, wants_help};
use crate::settings::{self, SettingsStore, UserSettings};
use crate::speech::catalog::{self, SpeechModel};

const VALUE_FLAGS: &[&str] = &["--cache-dir"];
const SUBCOMMAND_HELP: &[(&str, &str)] = &[
    ("list", "List speech models. The active one is marked."),
    (
        "set <model-id>",
        "Switch to a local model. Requires the app.",
    ),
    ("set remote", "Enable remote speech."),
];
const OPTION_HELP: &[(&str, &str)] = &[
    ("--installed-only", "List only installed models (list)."),
    ("--json", "Output machine-readable JSON."),
];

pub(crate) fn run(identifier: &str, args: &[String], json_output: bool) -> Result<()> {
    match Invocation::decode(args)? {
        Invocation::Help => show_help(),
        Invocation::List(list_args) => list(identifier, list_args, json_output)?,
        Invocation::Set(set_args) => set(set_args, json_output)?,
    }
    Ok(())
}

#[derive(Debug)]
enum Invocation<'a> {
    Help,
    List(&'a [String]),
    Set(&'a [String]),
}

impl<'a> Invocation<'a> {
    fn decode(args: &'a [String]) -> Result<Self> {
        if args.is_empty() || wants_help(args) {
            return Ok(Self::Help);
        }

        match args[0].as_str() {
            "list" => Ok(Self::List(&args[1..])),
            "set" => Ok(Self::Set(&args[1..])),
            other => bail!("Unknown model subcommand: {other}. Run 'looper model --help'."),
        }
    }
}

fn show_help() {
    super::print_command_help(
        "Choose the active speech model.",
        "looper model <subcommand> [options]",
        &[("SUBCOMMANDS", SUBCOMMAND_HELP), ("OPTIONS", OPTION_HELP)],
    );
}

#[derive(Debug, PartialEq, Eq)]
enum RequestedModel {
    Remote,
    Local(String),
}

impl RequestedModel {
    fn parse(args: &[String]) -> Result<Self> {
        let requested = positionals(args, VALUE_FLAGS)
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("expected a model id or `remote`"))?;

        Ok(match requested.as_str() {
            "remote" => Self::Remote,
            model => Self::Local(model.to_owned()),
        })
    }

    fn request(&self) -> Value {
        match self {
            Self::Remote => json!({ "target": "remote" }),
            Self::Local(model) => json!({ "target": "local", "model": model }),
        }
    }
}

fn set(args: &[String], json_output: bool) -> Result<()> {
    let requested = RequestedModel::parse(args)?;
    let reply = client::request_data("model.set", requested.request())?;

    if json_output {
        output::print_json(&json!({ "ok": true, "active": reply.get("active") }));
    } else if let Some(active) = reply.get("active").and_then(Value::as_str) {
        println!("Active model: {active}");
    }
    Ok(())
}

fn list(identifier: &str, args: &[String], json_output: bool) -> Result<()> {
    let settings = SettingsStore::for_cli(identifier)?.load()?;
    let directory = model_directory(identifier, args)?;
    let policy = CatalogPolicy::new(&settings, args);
    let catalog = ModelCatalog::build(catalog::list_models_at(&directory, &settings), policy);

    if json_output {
        catalog.print_json();
    } else {
        catalog.print_table();
    }
    Ok(())
}

fn model_directory(identifier: &str, args: &[String]) -> Result<PathBuf> {
    if let Some(override_path) = str_flag(args, "--cache-dir")? {
        return Ok(PathBuf::from(override_path));
    }
    Ok(settings::cli_data_dir(identifier)?.join("models"))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ActiveRoute<'a> {
    Remote,
    Local(&'a str),
}

impl<'a> ActiveRoute<'a> {
    fn from_settings(settings: &'a UserSettings) -> Self {
        if settings.remote_speech_enabled {
            Self::Remote
        } else {
            Self::Local(&settings.local_model)
        }
    }

    fn marks(self, remote: bool, key: &str) -> bool {
        match self {
            Self::Remote => remote,
            Self::Local(selected) => !remote && key == selected,
        }
    }
}

#[derive(Clone, Copy)]
struct CatalogPolicy<'a> {
    route: ActiveRoute<'a>,
    installed_only: bool,
}

impl<'a> CatalogPolicy<'a> {
    fn new(settings: &'a UserSettings, args: &[String]) -> Self {
        Self {
            route: ActiveRoute::from_settings(settings),
            installed_only: args.iter().any(|arg| arg == "--installed-only"),
        }
    }

    fn includes(self, remote: bool, installed: bool) -> bool {
        !self.installed_only || installed || remote
    }

    fn project(self, model: SpeechModel) -> ModelEntry {
        let active = self.route.marks(model.remote, &model.key);
        ModelEntry {
            id: model.id,
            key: model.key,
            label: model.label,
            remote: model.remote,
            installed: model.installed,
            active,
        }
    }
}

struct ModelCatalog {
    entries: Vec<ModelEntry>,
}

impl ModelCatalog {
    fn build(models: Vec<SpeechModel>, policy: CatalogPolicy<'_>) -> Self {
        let entries = models
            .into_iter()
            .filter(|model| policy.includes(model.remote, model.installed))
            .map(|model| policy.project(model))
            .collect();
        Self { entries }
    }

    fn active_key(&self) -> Option<&str> {
        self.entries
            .iter()
            .find(|entry| entry.active)
            .map(|entry| entry.key.as_str())
    }

    fn print_json(&self) {
        output::print_json(&json!({
            "ok": true,
            "active": self.active_key(),
            "models": self.entries,
        }));
    }

    fn print_table(&self) {
        for entry in &self.entries {
            println!("{entry}");
        }
    }
}

#[derive(Debug, PartialEq, Eq, Serialize)]
struct ModelEntry {
    id: String,
    key: String,
    label: String,
    remote: bool,
    installed: bool,
    active: bool,
}

impl ModelEntry {
    fn availability(&self) -> &'static str {
        match (self.remote, self.installed) {
            (true, _) => "remote",
            (false, true) => "installed",
            (false, false) => "available",
        }
    }
}

impl fmt::Display for ModelEntry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let marker = if self.active { '*' } else { ' ' };
        write!(
            formatter,
            "{marker} {:<28} {:<10} {}",
            self.key,
            self.availability(),
            self.label
        )
    }
}

#[cfg(test)]
mod tests {
    use super::{ActiveRoute, CatalogPolicy, Invocation, ModelCatalog, ModelEntry, RequestedModel};
    use serde_json::json;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    fn entry(key: &str, remote: bool, installed: bool, active: bool) -> ModelEntry {
        ModelEntry {
            id: format!("id-{key}"),
            key: key.to_owned(),
            label: format!("Label {key}"),
            remote,
            installed,
            active,
        }
    }

    #[test]
    fn invocation_help_takes_precedence_wherever_the_flag_appears() {
        assert!(matches!(
            Invocation::decode(&args(&["unknown", "--help"])).unwrap(),
            Invocation::Help
        ));
        assert_eq!(
            Invocation::decode(&args(&["unknown"]))
                .unwrap_err()
                .to_string(),
            "Unknown model subcommand: unknown. Run 'looper model --help'."
        );
    }

    #[test]
    fn requested_model_preserves_remote_and_local_wire_payloads() {
        let remote = RequestedModel::parse(&args(&["remote"])).unwrap();
        let local = RequestedModel::parse(&args(&["parakeet-v3"])).unwrap();

        assert_eq!(remote.request(), json!({ "target": "remote" }));
        assert_eq!(
            local.request(),
            json!({ "target": "local", "model": "parakeet-v3" })
        );
    }

    #[test]
    fn selection_ignores_flags_and_their_values_before_the_model() {
        let parsed = RequestedModel::parse(&args(&[
            "--installed-only",
            "--cache-dir",
            "/tmp/models",
            "cohere",
            "unused",
        ]))
        .unwrap();

        assert_eq!(parsed, RequestedModel::Local("cohere".to_owned()));
        assert_eq!(
            RequestedModel::parse(&args(&["--installed-only"]))
                .unwrap_err()
                .to_string(),
            "expected a model id or `remote`"
        );
    }

    #[test]
    fn active_route_never_marks_a_local_model_while_remote_is_selected() {
        assert!(ActiveRoute::Remote.marks(true, "provider/model"));
        assert!(!ActiveRoute::Remote.marks(false, "parakeet-v3"));
        assert!(ActiveRoute::Local("parakeet-v3").marks(false, "parakeet-v3"));
        assert!(!ActiveRoute::Local("parakeet-v3").marks(true, "parakeet-v3"));
    }

    #[test]
    fn installed_filter_keeps_remote_routes_visible() {
        let everything = CatalogPolicy {
            route: ActiveRoute::Remote,
            installed_only: false,
        };
        let installed = CatalogPolicy {
            route: ActiveRoute::Remote,
            installed_only: true,
        };

        assert!(everything.includes(false, false));
        assert!(installed.includes(false, true));
        assert!(installed.includes(true, false));
        assert!(!installed.includes(false, false));
    }

    #[test]
    fn catalog_reports_the_first_marked_key_without_reordering_rows() {
        let catalog = ModelCatalog {
            entries: vec![
                entry("remote-a", true, false, true),
                entry("remote-b", true, false, true),
                entry("local", false, true, false),
            ],
        };

        assert_eq!(catalog.active_key(), Some("remote-a"));
        assert_eq!(catalog.entries[1].key, "remote-b");
    }

    #[test]
    fn model_entry_keeps_wire_fields_and_terminal_state_labels() {
        let installed = entry("local", false, true, true);
        assert_eq!(
            serde_json::to_value(&installed).unwrap(),
            json!({
                "id": "id-local",
                "key": "local",
                "label": "Label local",
                "remote": false,
                "installed": true,
                "active": true
            })
        );
        assert_eq!(
            installed.to_string(),
            "* local                        installed  Label local"
        );
        assert_eq!(entry("cloud", true, false, false).availability(), "remote");
        assert_eq!(
            entry("download", false, false, false).availability(),
            "available"
        );
    }
}
