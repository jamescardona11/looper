//! `looper meeting …` - control and inspect the meeting recorder in the running app.

use anyhow::{bail, Result};
use serde_json::{json, Value};

use super::{client, has_flag, output, str_flag, wants_help};

fn help() {
    super::print_command_help(
        "Record a meeting and capture timestamped audio notes.",
        "looper meeting <subcommand> [options]",
        &[
            (
                "SUBCOMMANDS",
                &[
                    ("start", "Start a meeting recording."),
                    ("status", "Show the current recording state."),
                    ("note", "Capture the previous 30 seconds as a note."),
                    ("stop", "Stop recording and start transcription."),
                ],
            ),
            (
                "OPTIONS",
                &[
                    ("--model <id>", "Speech model to use (start)."),
                    ("--mic-only", "Record without system audio (start)."),
                    ("--json", "Output machine-readable JSON."),
                ],
            ),
        ],
    );
}

pub(crate) fn run(_identifier: &str, args: &[String], json_output: bool) -> Result<()> {
    if args.is_empty() || wants_help(args) {
        help();
        return Ok(());
    }

    let (subcommand, rest) = args.split_first().expect("non-empty checked above");
    let (command, payload) = match subcommand.as_str() {
        "start" => ("meeting.start", start_payload(rest)?),
        "status" => ("meeting.status", json!({})),
        "note" => ("meeting.note", json!({})),
        "stop" => ("meeting.stop", json!({})),
        other => {
            bail!("Unknown meeting subcommand: {other}. Run 'looper meeting --help'.")
        }
    };

    let data = client::request_data(command, payload)?;
    if json_output {
        output::print_json(&json!({ "ok": true, "meeting": data }));
    } else {
        print_human_result(subcommand, &data);
    }
    Ok(())
}

fn start_payload(args: &[String]) -> Result<Value> {
    let mut payload = json!({
        "system_audio_enabled": !has_flag(args, "--mic-only"),
    });
    if let Some(model) = str_flag(args, "--model")? {
        payload["model"] = json!(model);
    }
    Ok(payload)
}

fn print_human_result(subcommand: &str, data: &Value) {
    if subcommand == "note" {
        let start = data.get("start_ms").and_then(Value::as_u64).unwrap_or(0);
        let end = data.get("end_ms").and_then(Value::as_u64).unwrap_or(0);
        println!("Meeting note captured: {start}–{end} ms");
        return;
    }

    let phase = data
        .get("phase")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let id = data.get("id").and_then(Value::as_str).unwrap_or("");
    if id.is_empty() {
        println!("Meeting: {phase}");
    } else {
        println!("Meeting: {phase}\t{id}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn start_records_system_audio_by_default() {
        assert_eq!(
            start_payload(&[]).unwrap(),
            json!({ "system_audio_enabled": true })
        );
    }

    #[test]
    fn start_accepts_explicit_model_and_mic_only_mode() {
        assert_eq!(
            start_payload(&args(&["--model", "parakeet", "--mic-only"])).unwrap(),
            json!({ "system_audio_enabled": false, "model": "parakeet" })
        );
    }
}
