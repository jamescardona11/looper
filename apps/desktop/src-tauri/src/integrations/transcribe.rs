//! `looper transcribe …` - headless local transcription using Looper's
//! internal speech engine. LLM cleanup can reuse a running app session.

use std::path::PathBuf;

use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};

use super::{client, coded, has_flag, output, positionals, str_flag, wants_help};
use crate::{
    model_manager::ReadyModel,
    settings::{SettingsStore, UserSettings},
    transcription_api::TranscriptionSuccess,
};

const VALUE_FLAGS: &[&str] = &[
    "--output",
    "--output-dir",
    "--language",
    "--model",
    "--suffix",
    "--cache-dir",
];

struct HeadlessPlan<'a> {
    files: Vec<String>,
    destination: Destination<'a>,
    language: Option<&'a str>,
    model: Option<&'a str>,
    cache_dir: Option<&'a str>,
    cleanup: bool,
    json: bool,
}

impl<'a> HeadlessPlan<'a> {
    fn parse(args: &'a [String], json: bool) -> Result<Self> {
        let cleanup = has_flag(args, "--cleanup");
        if cleanup && has_flag(args, "--no-cleanup") {
            bail!("--cleanup and --no-cleanup cannot be used together");
        }

        let files = positionals(args, VALUE_FLAGS)
            .into_iter()
            .cloned()
            .collect::<Vec<_>>();
        if files.is_empty() {
            bail!("transcribe expects at least one audio file");
        }

        let output = str_flag(args, "--output")?;
        let output_dir = str_flag(args, "--output-dir")?;
        let suffix = str_flag(args, "--suffix")?;
        if files.len() > 1 && output.is_some() {
            bail!("--output works with a single file; use --output-dir for multiple inputs");
        }

        Ok(Self {
            files,
            destination: Destination::resolve(args, output, output_dir, suffix),
            language: str_flag(args, "--language")?,
            model: str_flag(args, "--model")?,
            cache_dir: str_flag(args, "--cache-dir")?,
            cleanup,
            json,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Destination<'a> {
    Stdout,
    Exact(&'a str),
    Directory { path: &'a str, suffix: &'a str },
    Alongside { suffix: &'a str },
}

impl<'a> Destination<'a> {
    fn resolve(
        args: &[String],
        output: Option<&'a str>,
        output_dir: Option<&'a str>,
        suffix: Option<&'a str>,
    ) -> Self {
        if has_flag(args, "--stdout")
            || (output.is_none() && output_dir.is_none() && suffix.is_none())
        {
            return Self::Stdout;
        }
        if let Some(path) = output {
            return Self::Exact(path);
        }
        let suffix = suffix.unwrap_or(".txt");
        match output_dir {
            Some(path) => Self::Directory { path, suffix },
            None => Self::Alongside { suffix },
        }
    }

    fn is_stdout(self) -> bool {
        matches!(self, Self::Stdout)
    }

    fn path_for(self, input: &str) -> Option<PathBuf> {
        match self {
            Self::Stdout => None,
            Self::Exact(path) => Some(PathBuf::from(path)),
            Self::Directory { path, suffix } => {
                Some(PathBuf::from(path).join(output_file_name(input, suffix)))
            }
            Self::Alongside { suffix } => {
                let input_path = PathBuf::from(input);
                Some(input_path.with_file_name(output_file_name(input, suffix)))
            }
        }
    }
}

fn output_file_name(input: &str, suffix: &str) -> String {
    let stem = PathBuf::from(input)
        .file_stem()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "transcript".to_string());
    format!("{stem}.{}", suffix.trim_start_matches('.'))
}

fn help() {
    super::print_command_help(
        "Transcribe a WAV file with Looper's internal local speech engine.",
        "looper transcribe <file>... [options]",
        &[(
            "OPTIONS",
            &[
                ("--output <path>", "Write the transcript to this file."),
                (
                    "--output-dir <dir>",
                    "Write one file per input into this directory.",
                ),
                (
                    "--suffix <ext>",
                    "Output extension when inferring paths (default .txt).",
                ),
                (
                    "--stdout",
                    "Print the transcript instead of writing a file.",
                ),
                ("--language <code>", "Override the language."),
                (
                    "--model <id>",
                    "Override the local model or configured remote:<provider>:<model>.",
                ),
                (
                    "--cache-dir <path>",
                    "Override the local model cache directory.",
                ),
                (
                    "--cleanup",
                    "Force LLM cleanup through a running Looper app.",
                ),
                ("--no-cleanup", "Skip LLM cleanup."),
                ("--json", "Output machine-readable JSON."),
            ],
        )],
    );
}

pub(crate) fn run(identifier: &str, args: &[String], json: bool) -> Result<()> {
    if wants_help(args) {
        help();
        return Ok(());
    }

    super::require_active_cli_license(identifier)?;
    run_headless(identifier, args, json)
}

fn run_headless(identifier: &str, args: &[String], json_output: bool) -> Result<()> {
    let plan = HeadlessPlan::parse(args, json_output)?;

    let mut settings = SettingsStore::for_cli(identifier)?.load()?;
    if let Some(language) = plan.language {
        settings.language = language.to_string();
    }
    let model_override = plan.model;
    let remote_requested = model_override
        .map(crate::speech::remote::is_remote_model)
        .unwrap_or_else(|| crate::speech::remote::is_configured(&settings));
    if let Some(remote_model) =
        model_override.filter(|model| crate::speech::remote::is_remote_model(model))
    {
        apply_remote_override(&mut settings, remote_model)?;
    }
    if remote_requested && !crate::speech::remote::has_valid_config(&settings) {
        bail!("The selected remote speech provider is not fully configured");
    }
    let local_model_id = model_override
        .filter(|model| !crate::speech::remote::is_remote_model(model))
        .unwrap_or(&settings.local_model)
        .to_string();
    let models_dir = plan
        .cache_dir
        .map(PathBuf::from)
        .unwrap_or(crate::settings::cli_data_dir(identifier)?.join("models"));
    let remote_runtime = remote_requested
        .then(tokio::runtime::Runtime::new)
        .transpose()
        .map_err(|error| {
            coded(
                3,
                format!("Failed to start the headless speech runtime: {error}"),
            )
        })?;
    let remote_client = remote_requested.then(reqwest::Client::new);
    let mut local = None;

    let mut entries = Vec::new();
    for file in &plan.files {
        let absolute =
            std::fs::canonicalize(file).map_err(|_| coded(1, format!("File not found: {file}")))?;
        let (samples, sample_rate) = crate::transcribe::load_audio_for_transcription(&absolute)
            .map_err(|error| coded(3, format!("Failed to decode {file}: {error:#}")))?;
        let transcription = if remote_requested {
            let remote = remote_runtime
                .as_ref()
                .expect("remote runtime exists when requested")
                .block_on(crate::speech::remote::transcribe_file(
                    remote_client
                        .as_ref()
                        .expect("remote client exists when requested"),
                    &absolute,
                    &settings,
                    crate::speech::remote::TranscribeOptions::default(),
                ));
            match remote {
                Ok(success) => success.transcription,
                Err(remote_error) => {
                    let local_result = transcribe_local(
                        &mut local,
                        &models_dir,
                        &local_model_id,
                        &settings,
                        &samples,
                        sample_rate,
                        true,
                    );
                    match local_result {
                        Ok(transcription) => {
                            eprintln!(
                                "Remote speech failed ({remote_error}); using local model {}.",
                                transcription
                                    .speech_model
                                    .as_deref()
                                    .unwrap_or(&local_model_id)
                            );
                            transcription
                        }
                        Err(local_error) => {
                            return Err(coded(
                                3,
                                format!(
                                    "Remote speech failed: {remote_error}. Local fallback failed: {local_error:#}"
                                ),
                            ));
                        }
                    }
                }
            }
        } else {
            transcribe_local(
                &mut local,
                &models_dir,
                &local_model_id,
                &settings,
                &samples,
                sample_rate,
                false,
            )
            .map_err(|error| coded(3, format!("Local transcription failed: {error:#}")))?
        };
        let mut text = crate::dictionary::apply_replacements(
            &transcription.transcript,
            &settings.replacements,
        );
        let mut llm_cleaned = false;
        if plan.cleanup {
            (text, llm_cleaned) = cleanup_via_app(&text)?;
        }
        let data = json!({
            "text": text,
            "speech_model": transcription.speech_model,
            "llm_cleaned": llm_cleaned,
            "duration_seconds": samples.len() as f64 / sample_rate as f64,
        });
        let out_path = plan.destination.path_for(file);
        if let Some(path) = &out_path {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(path, &text)?;
        }
        entries.push(Entry {
            input: file.clone(),
            output: out_path,
            text,
            data,
        });
    }

    emit(&entries, plan.json, plan.destination.is_stdout());
    Ok(())
}

fn apply_remote_override(settings: &mut UserSettings, token: &str) -> Result<()> {
    let remote = token
        .trim()
        .strip_prefix(crate::speech::remote::SPEECH_MODEL_REMOTE_PREFIX)
        .ok_or_else(|| anyhow!("Invalid remote speech model: {token}"))?;
    let mut parts = remote.splitn(2, ':');
    let provider = parts.next().unwrap_or_default().trim();
    if provider.is_empty() {
        bail!("Remote speech model must include a provider");
    }
    if !provider.eq_ignore_ascii_case(settings.remote_speech_provider.trim()) {
        bail!(
            "Remote provider `{provider}` is not the configured provider `{}`. Configure that \
             provider in Looper before using it from the CLI.",
            settings.remote_speech_provider.trim()
        );
    }
    settings.remote_speech_enabled = true;
    if let Some(model) = parts
        .next()
        .map(str::trim)
        .filter(|model| !model.is_empty())
    {
        settings.remote_speech_model = model.to_string();
    }
    Ok(())
}

struct HeadlessLocal {
    ready_model: ReadyModel,
    transcriber: crate::speech::engine::LocalTranscriber,
    dictionary: Vec<String>,
}

fn transcribe_local(
    local: &mut Option<HeadlessLocal>,
    models_dir: &std::path::Path,
    model_id: &str,
    settings: &UserSettings,
    samples: &[i16],
    sample_rate: u32,
    prefer_any_installed: bool,
) -> Result<TranscriptionSuccess> {
    if local.is_none() {
        let ready_model = if prefer_any_installed {
            crate::model_manager::ensure_local_fallback_model_at(models_dir, model_id)?
        } else {
            crate::model_manager::ensure_model_ready_at(models_dir, model_id)?
        };
        let transcriber = crate::speech::engine::LocalTranscriber::new(models_dir.to_path_buf());
        transcriber.preload_and_warm(&ready_model)?;
        let dictionary = crate::dictionary::dictionary_entries_for_model(&ready_model, settings);
        *local = Some(HeadlessLocal {
            ready_model,
            transcriber,
            dictionary,
        });
    }

    let local = local.as_ref().expect("local transcriber initialized above");
    let policy = crate::speech::engine::chunk_policy(local.ready_model.engine);
    let (chunk_seconds, overlap_seconds) = (policy.chunk_seconds, policy.overlap_seconds);
    crate::transcribe::transcribe_local_chunked(
        &local.transcriber,
        &local.ready_model,
        samples,
        sample_rate,
        crate::transcribe::LocalChunkingConfig {
            dictionary: &local.dictionary,
            language: Some(settings.language.as_str()),
            chunk_seconds: chunk_seconds as f32,
            overlap_seconds: overlap_seconds as f32,
            cancel_token: None,
            strip_hallucinated_thank_you: false,
        },
    )
}

fn cleanup_via_app(text: &str) -> Result<(String, bool)> {
    let payload = json!({ "text": text });
    let data = match client::try_request("transcribe.cleanup", payload)? {
        Some(response) if response.ok => response.data,
        Some(response) => {
            return Err(coded(
                3,
                response
                    .error
                    .unwrap_or_else(|| "transcription cleanup failed".to_string()),
            ));
        }
        None => {
            return Err(coded(
                2,
                "Looper must be running to use --cleanup because the LLM credentials are \
                 owned by the app session.",
            ));
        }
    };

    let cleaned = data
        .get("text")
        .and_then(Value::as_str)
        .ok_or_else(|| coded(3, "Looper returned cleanup without text"))?
        .to_string();
    let llm_cleaned = data
        .get("llm_cleaned")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Ok((cleaned, llm_cleaned))
}

struct Entry {
    input: String,
    output: Option<PathBuf>,
    text: String,
    data: Value,
}

fn emit(entries: &[Entry], json: bool, to_stdout: bool) {
    if json {
        let files: Vec<Value> = entries
            .iter()
            .map(|entry| {
                json!({
                    "input": entry.input,
                    "output": entry.output.as_ref().map(|p| p.to_string_lossy()),
                    "text": entry.text,
                    "word_count": entry.text.split_whitespace().count(),
                    "speech_model": entry.data.get("speech_model"),
                    "llm_cleaned": entry.data.get("llm_cleaned").and_then(Value::as_bool).unwrap_or(false),
                    "duration_seconds": entry.data.get("duration_seconds"),
                })
            })
            .collect();
        output::print_json(&json!({ "ok": true, "files": files }));
    } else {
        for entry in entries {
            match (&entry.output, to_stdout) {
                (Some(path), _) => println!("{}", path.display()),
                (None, _) => println!("{}", entry.text),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn plan_defaults_to_stdout_and_rejects_ambiguous_requests() {
        let default_args = args(&["voice.wav"]);
        let default = HeadlessPlan::parse(&default_args, false).expect("default plan");
        assert_eq!(default.files, ["voice.wav"]);
        assert_eq!(default.destination, Destination::Stdout);

        let conflict =
            HeadlessPlan::parse(&args(&["voice.wav", "--cleanup", "--no-cleanup"]), false)
                .err()
                .expect("cleanup conflict");
        assert!(conflict.to_string().contains("--cleanup and --no-cleanup"));

        let multiple = HeadlessPlan::parse(
            &args(&["one.wav", "two.wav", "--output", "result.txt"]),
            false,
        )
        .err()
        .expect("single output cannot serve multiple inputs");
        assert!(multiple
            .to_string()
            .contains("--output works with a single file"));
    }

    #[test]
    fn destination_policy_keeps_exact_directory_and_sibling_paths() {
        assert_eq!(
            Destination::Exact("result.txt").path_for("audio/voice.wav"),
            Some(PathBuf::from("result.txt"))
        );
        assert_eq!(
            Destination::Directory {
                path: "results",
                suffix: ".md",
            }
            .path_for("audio/voice.wav"),
            Some(PathBuf::from("results/voice.md"))
        );
        assert_eq!(
            Destination::Alongside { suffix: "txt" }.path_for("audio/voice.wav"),
            Some(PathBuf::from("audio/voice.txt"))
        );
        assert_eq!(Destination::Stdout.path_for("voice.wav"), None);
    }

    #[test]
    fn remote_override_reuses_only_the_configured_provider_credentials() {
        let mut settings = UserSettings {
            remote_speech_provider: "openai".to_string(),
            remote_speech_model: "auto".to_string(),
            ..UserSettings::default()
        };

        apply_remote_override(&mut settings, "remote:openai:gpt-4o-transcribe")
            .expect("matching provider");

        assert!(settings.remote_speech_enabled);
        assert_eq!(settings.remote_speech_provider, "openai");
        assert_eq!(settings.remote_speech_model, "gpt-4o-transcribe");
    }

    #[test]
    fn remote_override_rejects_a_provider_without_matching_credentials() {
        let mut settings = UserSettings {
            remote_speech_provider: "openai".to_string(),
            ..UserSettings::default()
        };

        let error =
            apply_remote_override(&mut settings, "remote:groq:whisper-large-v3").unwrap_err();

        assert!(error.to_string().contains("is not the configured provider"));
        assert_eq!(settings.remote_speech_provider, "openai");
    }
}
