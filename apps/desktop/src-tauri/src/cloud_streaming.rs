use std::collections::BTreeMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tokio::time::{interval, timeout, MissedTickBehavior};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::streaming_transcription::{StreamResampler, StreamingOutcome};
use crate::{cloud_speech, pill, AppRuntime, AppState};

const SAMPLE_RATE: u32 = 16_000;
const SEND_INTERVAL: Duration = Duration::from_millis(100);
const CHUNK_SAMPLES: usize = 1_600;
const MIN_FINAL_CHUNK_SAMPLES: usize = 800;
const STOP_TIMEOUT: Duration = Duration::from_secs(20);

pub struct CloudStreamingSession {
    stop_flag: Arc<AtomicBool>,
    result_rx: mpsc::Receiver<StreamingOutcome>,
    handle: Option<tauri::async_runtime::JoinHandle<()>>,
}

impl CloudStreamingSession {
    pub fn start(app: &AppHandle<AppRuntime>, language: String) -> Self {
        let stop_flag = Arc::new(AtomicBool::new(false));
        let task_stop_flag = Arc::clone(&stop_flag);
        let (result_tx, result_rx) = mpsc::sync_channel(1);
        let app = app.clone();
        let handle = tauri::async_runtime::spawn(async move {
            let outcome = match run_cloud_stream(app, language, task_stop_flag).await {
                Ok(transcript) => StreamingOutcome::Transcript(transcript),
                Err(err) => StreamingOutcome::Fallback(err.to_string()),
            };
            let _ = result_tx.send(outcome);
        });

        Self {
            stop_flag,
            result_rx,
            handle: Some(handle),
        }
    }

    pub fn stop(mut self) -> StreamingOutcome {
        self.stop_flag.store(true, Ordering::SeqCst);
        let outcome = self
            .result_rx
            .recv_timeout(STOP_TIMEOUT)
            .unwrap_or_else(|_| {
                StreamingOutcome::Fallback("Cloud streaming did not finish in time".into())
            });
        if let Some(handle) = self.handle.take() {
            handle.abort();
        }
        outcome
    }
}

impl Drop for CloudStreamingSession {
    fn drop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            handle.abort();
        }
    }
}

async fn run_cloud_stream(
    app: AppHandle<AppRuntime>,
    language: String,
    stop_flag: Arc<AtomicBool>,
) -> Result<String> {
    let state = app.state::<AppState>();
    let auth_token = state
        .cloud_auth_token()
        .ok_or_else(|| anyhow!("Sign in before starting Cloud transcription"))?;
    let client = state.http();
    let grant = cloud_speech::create_stream_session(&client, &auth_token)
        .await
        .context("Could not start Cloud streaming")?;
    if grant.mock {
        return Err(anyhow!("Cloud streaming is unavailable in mock mode"));
    }
    if grant.token.trim().is_empty() {
        return Err(anyhow!("Cloud streaming returned an empty token"));
    }

    let mut url = reqwest::Url::parse("wss://streaming.assemblyai.com/v3/ws")?;
    url.query_pairs_mut()
        .append_pair("sample_rate", &SAMPLE_RATE.to_string())
        .append_pair("speech_model", "universal-streaming-multilingual")
        .append_pair("format_turns", "true")
        .append_pair("token", &grant.token);

    let (mut socket, _) = timeout(Duration::from_secs(10), connect_async(url.as_str()))
        .await
        .context("Cloud streaming connection timed out")?
        .context("Could not connect to Cloud streaming")?;
    wait_for_begin(&mut socket).await?;

    let recorder = state.pill().recorder_handle();
    let mut turns = TurnAssembler::default();
    let mut buffer_offset = 0;
    let mut resampler = None;
    let mut pending = Vec::new();
    let mut ticker = interval(SEND_INTERVAL);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

    while !stop_flag.load(Ordering::SeqCst) {
        tokio::select! {
            _ = ticker.tick() => {
                read_audio(&recorder, &mut buffer_offset, &mut resampler, &mut pending);
                send_complete_chunks(&mut socket, &mut pending).await?;
            }
            message = socket.next() => {
                let message = message.ok_or_else(|| anyhow!("Cloud streaming closed unexpectedly"))??;
                if let Some(transcript) = turns.handle_message(message)? {
                    pill::emit_pill_mode(&app, true, &transcript);
                }
            }
        }
    }

    read_audio(&recorder, &mut buffer_offset, &mut resampler, &mut pending);
    send_complete_chunks(&mut socket, &mut pending).await?;
    if !pending.is_empty() {
        if pending.len() < MIN_FINAL_CHUNK_SAMPLES {
            pending.resize(MIN_FINAL_CHUNK_SAMPLES, 0.0);
        }
        socket
            .send(Message::Binary(pcm16_bytes(&pending).into()))
            .await?;
    }
    socket
        .send(Message::Text(r#"{"type":"Terminate"}"#.into()))
        .await?;

    timeout(Duration::from_secs(15), async {
        while let Some(message) = socket.next().await {
            let message = message?;
            if is_termination(&message)? {
                return Ok::<(), anyhow::Error>(());
            }
            if let Some(transcript) = turns.handle_message(message)? {
                pill::emit_pill_mode(&app, true, &transcript);
            }
        }
        Err(anyhow!("Cloud streaming closed before termination"))
    })
    .await
    .context("Cloud streaming termination timed out")??;

    let transcript = turns.transcript();
    if !transcript.is_empty() {
        if let Err(err) =
            cloud_speech::save_stream_transcript(&client, &auth_token, &transcript, &language).await
        {
            tracing::warn!("[cloud-streaming] Could not save stream transcript: {err}");
        }
    }
    Ok(transcript)
}

async fn wait_for_begin<S>(socket: &mut S) -> Result<()>
where
    S: StreamExt<Item = std::result::Result<Message, tokio_tungstenite::tungstenite::Error>>
        + Unpin,
{
    timeout(Duration::from_secs(10), async {
        while let Some(message) = socket.next().await {
            let message = message?;
            let Some(payload) = message_text(&message)? else {
                continue;
            };
            let event: StreamEvent = serde_json::from_str(payload)?;
            match event.kind.as_str() {
                "Begin" => return Ok(()),
                "Error" => {
                    return Err(anyhow!(
                        "AssemblyAI error: {}",
                        event.error.or(event.message).unwrap_or_default()
                    ))
                }
                _ => {}
            }
        }
        Err(anyhow!("Cloud streaming closed before it began"))
    })
    .await
    .context("Cloud streaming did not begin in time")?
}

fn read_audio(
    recorder: &crate::recorder::RecorderManager,
    buffer_offset: &mut usize,
    resampler: &mut Option<StreamResampler>,
    pending: &mut Vec<f32>,
) {
    let Some((samples, sample_rate, new_offset)) = recorder.read_live_samples(*buffer_offset)
    else {
        return;
    };
    *buffer_offset = new_offset;
    if sample_rate == SAMPLE_RATE {
        pending.extend_from_slice(&samples);
        return;
    }
    if resampler
        .as_ref()
        .is_none_or(|current| current.in_rate() != sample_rate)
    {
        *resampler = Some(StreamResampler::new(sample_rate, SAMPLE_RATE));
    }
    if let Some(resampler) = resampler {
        resampler.process(&samples, pending);
    }
}

async fn send_complete_chunks<S>(socket: &mut S, pending: &mut Vec<f32>) -> Result<()>
where
    S: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let mut consumed = 0;
    while consumed + CHUNK_SAMPLES <= pending.len() {
        let bytes = pcm16_bytes(&pending[consumed..consumed + CHUNK_SAMPLES]);
        socket.send(Message::Binary(bytes.into())).await?;
        consumed += CHUNK_SAMPLES;
    }
    if consumed > 0 {
        pending.drain(..consumed);
    }
    Ok(())
}

fn pcm16_bytes(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        let value = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16;
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

#[derive(Default)]
struct TurnAssembler {
    final_turns: BTreeMap<i64, String>,
    current_turn: String,
}

impl TurnAssembler {
    fn handle_message(&mut self, message: Message) -> Result<Option<String>> {
        let Some(payload) = message_text(&message)? else {
            return Ok(None);
        };
        let event: StreamEvent = serde_json::from_str(payload)?;
        match event.kind.as_str() {
            "Turn" => {
                let text = event.transcript.unwrap_or_default().trim().to_string();
                let order = event.turn_order.unwrap_or(self.final_turns.len() as i64);
                if event.end_of_turn.unwrap_or(false) {
                    if !text.is_empty() {
                        self.final_turns.insert(order, text);
                    }
                    self.current_turn.clear();
                } else {
                    self.current_turn = text;
                }
                Ok(Some(self.transcript()))
            }
            "Error" => Err(anyhow!(
                "AssemblyAI error: {}",
                event.error.or(event.message).unwrap_or_default()
            )),
            _ => Ok(None),
        }
    }

    fn transcript(&self) -> String {
        self.final_turns
            .values()
            .chain((!self.current_turn.is_empty()).then_some(&self.current_turn))
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string()
    }
}

#[derive(Deserialize)]
struct StreamEvent {
    #[serde(rename = "type")]
    kind: String,
    transcript: Option<String>,
    turn_order: Option<i64>,
    end_of_turn: Option<bool>,
    error: Option<String>,
    message: Option<String>,
}

fn message_text(message: &Message) -> Result<Option<&str>> {
    match message {
        Message::Text(text) => Ok(Some(text.as_ref())),
        Message::Binary(bytes) => Ok(Some(std::str::from_utf8(bytes)?)),
        _ => Ok(None),
    }
}

fn is_termination(message: &Message) -> Result<bool> {
    let Some(payload) = message_text(message)? else {
        return Ok(false);
    };
    Ok(serde_json::from_str::<StreamEvent>(payload)?.kind == "Termination")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assembles_final_and_partial_turns_in_order() {
        let mut turns = TurnAssembler::default();
        turns
            .handle_message(Message::Text(
                r#"{"type":"Turn","turn_order":1,"end_of_turn":true,"transcript":"world"}"#.into(),
            ))
            .unwrap();
        turns
            .handle_message(Message::Text(
                r#"{"type":"Turn","turn_order":0,"end_of_turn":true,"transcript":"Hello"}"#.into(),
            ))
            .unwrap();
        turns
            .handle_message(Message::Text(
                r#"{"type":"Turn","turn_order":2,"end_of_turn":false,"transcript":"again"}"#.into(),
            ))
            .unwrap();
        assert_eq!(turns.transcript(), "Hello world again");
    }

    #[test]
    fn encodes_clamped_little_endian_pcm16() {
        assert_eq!(
            pcm16_bytes(&[-2.0, 0.0, 0.5, 2.0]),
            vec![1, 128, 0, 0, 0, 64, 255, 127]
        );
    }

    #[test]
    fn detects_provider_errors() {
        let error = TurnAssembler::default()
            .handle_message(Message::Text(
                r#"{"type":"Error","error":"bad audio"}"#.into(),
            ))
            .unwrap_err();
        assert!(error.to_string().contains("bad audio"));
    }
}
