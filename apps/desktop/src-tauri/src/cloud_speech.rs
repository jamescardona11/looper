use std::path::Path;

use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::transcription_api::{normalize_transcript, TranscriptionSuccess};

const PRODUCTION_CONVEX_URL: &str = "https://adventurous-barracuda-553.convex.cloud";

#[derive(Deserialize)]
struct ConvexEnvelope<T> {
    status: String,
    value: Option<T>,
    #[serde(rename = "errorMessage")]
    error_message: Option<String>,
}

#[derive(Deserialize)]
struct ProviderConfiguration {
    configured: bool,
    provider: Option<String>,
}

#[derive(Deserialize)]
struct UploadResponse {
    #[serde(rename = "storageId")]
    storage_id: String,
}

#[derive(Deserialize)]
struct TranscribeResponse {
    text: String,
}

#[derive(Deserialize)]
pub struct StreamGrant {
    pub token: String,
    pub mock: bool,
}

fn convex_url() -> String {
    std::env::var("LOOPER_CONVEX_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| PRODUCTION_CONVEX_URL.to_string())
}

async fn invoke<T: DeserializeOwned>(
    client: &Client,
    token: &str,
    kind: &str,
    path: &str,
    args: Value,
) -> Result<T> {
    let response = client
        .post(format!("{}/api/{kind}", convex_url()))
        .bearer_auth(token)
        .json(&json!({
            "path": path,
            "format": "convex_encoded_json",
            "args": [args],
        }))
        .send()
        .await
        .context("Could not reach Looper Cloud")?;
    let status = response.status();
    let body = response
        .text()
        .await
        .context("Could not read Looper Cloud response")?;
    if !status.is_success() {
        return Err(anyhow!("Looper Cloud returned HTTP {status}: {body}"));
    }

    let envelope: ConvexEnvelope<T> =
        serde_json::from_str(&body).context("Looper Cloud returned an invalid response")?;
    if envelope.status != "success" {
        return Err(anyhow!(
            "{}",
            envelope
                .error_message
                .unwrap_or_else(|| "Looper Cloud request failed".to_string())
        ));
    }
    envelope
        .value
        .ok_or_else(|| anyhow!("Looper Cloud response did not include a value"))
}

pub async fn transcribe(
    client: &Client,
    token: &str,
    wav_path: &Path,
    language: &str,
) -> Result<TranscriptionSuccess> {
    let configuration: ProviderConfiguration = invoke(
        client,
        token,
        "query",
        "stt/transcribe:configuration",
        json!({}),
    )
    .await?;
    let provider = configuration
        .provider
        .filter(|_| configuration.configured)
        .ok_or_else(|| anyhow!("Looper Cloud transcription is not configured"))?;

    let upload_url: String = invoke(
        client,
        token,
        "mutation",
        "stt/transcribe:generateUploadUrl",
        json!({}),
    )
    .await?;
    let audio = tokio::fs::read(wav_path)
        .await
        .context("Could not read the recording")?;
    let upload = client
        .post(upload_url)
        .header(reqwest::header::CONTENT_TYPE, "audio/wav")
        .body(audio)
        .send()
        .await
        .context("Could not upload the recording to Looper Cloud")?;
    let upload_status = upload.status();
    if !upload_status.is_success() {
        return Err(anyhow!(
            "Looper Cloud upload failed with HTTP {upload_status}"
        ));
    }
    let uploaded: UploadResponse = upload
        .json()
        .await
        .context("Looper Cloud returned an invalid upload response")?;

    let mut args = json!({
        "audioStorageId": uploaded.storage_id,
        "provider": provider,
        "contentType": "audio/wav",
        "retainAudio": false,
    });
    if !language.trim().is_empty() && language != "auto" {
        args["language"] = json!(language);
    }
    let result: TranscribeResponse =
        invoke(client, token, "action", "stt/transcribe:transcribe", args).await?;

    Ok(TranscriptionSuccess {
        transcript: normalize_transcript(&result.text),
        speech_model: Some(format!("cloud:{provider}")),
        segments: None,
        words: None,
    })
}

pub async fn create_stream_session(client: &Client, token: &str) -> Result<StreamGrant> {
    invoke(
        client,
        token,
        "action",
        "stt/stream:createStreamSession",
        json!({ "provider": "assemblyai" }),
    )
    .await
}

pub async fn save_stream_transcript(
    client: &Client,
    token: &str,
    text: &str,
    language: &str,
) -> Result<()> {
    let mut args = json!({
        "provider": "assemblyai",
        "text": text,
    });
    if !language.trim().is_empty() && language != "auto" {
        args["language"] = json!(language);
    }
    invoke::<Value>(
        client,
        token,
        "mutation",
        "stt/stream:saveStreamTranscript",
        args,
    )
    .await
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn convex_envelope_accepts_scalar_values() {
        let parsed: ConvexEnvelope<String> =
            serde_json::from_str(r#"{"status":"success","value":"https://upload.example"}"#)
                .unwrap();
        assert_eq!(parsed.value.as_deref(), Some("https://upload.example"));
    }

    #[test]
    fn convex_envelope_reads_error_messages() {
        let parsed: ConvexEnvelope<Value> =
            serde_json::from_str(r#"{"status":"error","errorMessage":"credits exhausted"}"#)
                .unwrap();
        assert_eq!(parsed.error_message.as_deref(), Some("credits exhausted"));
    }
}
