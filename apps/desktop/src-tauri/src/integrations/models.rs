//! Headless model management backed by Looper's internal `looper-ts` store.

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use looper_ts::{InstallEvent, InstallOptions, ModelStore};
use serde_json::json;

use super::{output, positionals, str_flag, wants_help};
use crate::settings;
use crate::speech::catalog;

const VALUE_FLAGS: &[&str] = &["--cache-dir"];

fn help() {
    super::print_command_help(
        "Install and remove Looper's local speech models.",
        "looper models <subcommand> [model-id] [options]",
        &[
            (
                "SUBCOMMANDS",
                &[
                    ("list", "List public models and installation status."),
                    ("install <model-id>", "Download and verify a model."),
                    ("delete <model-id>", "Delete a model from local storage."),
                ],
            ),
            (
                "OPTIONS",
                &[
                    ("--cache-dir <path>", "Override the model cache directory."),
                    (
                        "--all",
                        "Include hidden experimental and archived model metadata.",
                    ),
                    ("--json", "Output machine-readable JSON."),
                ],
            ),
        ],
    );
}

pub(crate) fn run(identifier: &str, args: &[String], json_output: bool) -> Result<()> {
    if args.is_empty() || wants_help(args) {
        help();
        return Ok(());
    }

    super::require_active_cli_license(identifier)?;
    let (subcommand, rest) = args.split_first().expect("non-empty checked above");
    let cache_dir = cache_dir(identifier, rest)?;
    let store = ModelStore::new(cache_dir);

    match subcommand.as_str() {
        "list" => list(&store, rest, json_output),
        "install" => install(&store, rest, json_output),
        "delete" => delete(&store, rest, json_output),
        other => bail!("Unknown models subcommand: {other}. Run 'looper models --help'."),
    }
}

fn cache_dir(identifier: &str, args: &[String]) -> Result<PathBuf> {
    if let Some(path) = str_flag(args, "--cache-dir")? {
        return Ok(PathBuf::from(path));
    }
    Ok(settings::cli_data_dir(identifier)?.join("models"))
}

fn model_id<'a>(args: &'a [String], command: &str) -> Result<&'a str> {
    positionals(args, VALUE_FLAGS)
        .first()
        .map(|value| value.as_str())
        .ok_or_else(|| anyhow::anyhow!("models {command} expects a model id"))
}

fn list(store: &ModelStore, args: &[String], json_output: bool) -> Result<()> {
    let mut entries = catalog::list_local_models()
        .into_iter()
        .map(|model| {
            let spec = catalog::install_spec(&model.key).expect("catalog entry has install spec");
            let status = store.status(&spec)?;
            Ok(json!({
                "id": model.key,
                "label": model.label,
                "availability": "public",
                "installed": status.installed,
                "bytesOnDisk": status.bytes_on_disk,
                "missingFiles": status.missing_files,
                "directory": status.directory,
            }))
        })
        .collect::<Result<Vec<_>>>()?;

    if args.iter().any(|arg| arg == "--all") {
        for model in catalog::list_inactive_models() {
            let directory = store.model_dir(&model.id)?;
            entries.push(json!({
                "id": model.id,
                "label": model.label,
                "availability": model.availability,
                "installed": false,
                "cachePresent": directory.exists(),
                "directory": directory,
                "sizeMb": model.size_mb,
                "engineId": model.engine_id,
                "variant": model.variant,
                "capabilities": model.capabilities,
                "artifacts": model.artifacts,
            }));
        }
    }

    if json_output {
        output::print_json(&json!({ "ok": true, "models": entries }));
    } else {
        for entry in entries {
            let installed = if entry["installed"].as_bool().unwrap_or(false) {
                "installed"
            } else {
                "available"
            };
            println!(
                "{:<38} {:<14} {}",
                entry["id"].as_str().unwrap_or_default(),
                entry["availability"].as_str().unwrap_or(installed),
                entry["label"].as_str().unwrap_or_default()
            );
        }
    }
    Ok(())
}

fn install(store: &ModelStore, args: &[String], json_output: bool) -> Result<()> {
    let id = model_id(args, "install")?;
    catalog::ensure_model_mirror_configured()?;
    let spec = catalog::install_spec(id).ok_or_else(|| anyhow::anyhow!("Unknown model: {id}"))?;
    let progress = |event: InstallEvent| {
        if !json_output {
            eprint!(
                "\rDownloading {}: {:>5.1}%",
                event.file,
                event.percent.clamp(0.0, 100.0)
            );
        }
    };
    let runtime = tokio::runtime::Runtime::new().context("Failed to start model installer")?;
    let status = runtime.block_on(store.install(
        &spec,
        InstallOptions {
            cancel_token: None,
            progress: Some(&progress),
        },
    ))?;
    if !json_output {
        eprintln!();
        println!("Installed {}", status.id);
    } else {
        output::print_json(&json!({
            "ok": true,
            "id": status.id,
            "installed": status.installed,
            "bytesOnDisk": status.bytes_on_disk,
            "directory": status.directory,
        }));
    }
    Ok(())
}

fn delete(store: &ModelStore, args: &[String], json_output: bool) -> Result<()> {
    let id = model_id(args, "delete")?;
    if !catalog::known_model_id(id) {
        bail!("Unknown model: {id}");
    }
    let status = store.delete(id)?;
    if json_output {
        output::print_json(&json!({
            "ok": true,
            "id": status.id,
            "installed": status.installed,
            "bytesOnDisk": status.bytes_on_disk,
            "directory": status.directory,
        }));
    } else {
        println!("Deleted {id}");
    }
    Ok(())
}
