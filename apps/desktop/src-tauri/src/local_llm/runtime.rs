use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

use super::protocol::{SidecarRequest, SidecarResponse};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const GENERATION_TIMEOUT: Duration = Duration::from_secs(300);
const IDLE_TIMEOUT: Duration = Duration::from_secs(120);

struct ProcessState {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

#[derive(Clone)]
pub struct LocalLlmRuntime {
    process: Arc<Mutex<Option<ProcessState>>>,
    activity_generation: Arc<AtomicU64>,
}

impl LocalLlmRuntime {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            activity_generation: Arc::new(AtomicU64::new(0)),
        }
    }

    pub async fn generate(
        &self,
        model_path: &std::path::Path,
        system_prompt: &str,
        user_prompt: &str,
        max_tokens: u32,
    ) -> Result<String> {
        let request_id = uuid::Uuid::new_v4().to_string();
        let request = SidecarRequest::Generate {
            request_id: request_id.clone(),
            model_path: model_path.to_string_lossy().into_owned(),
            system_prompt: system_prompt.to_string(),
            user_prompt: user_prompt.to_string(),
            max_tokens,
        };
        let line = serde_json::to_string(&request)?;
        let mut process = self.process.lock().await;
        if process.is_none() {
            *process = Some(spawn_process().await?);
        }

        let result = tokio::time::timeout(GENERATION_TIMEOUT, async {
            let current = process
                .as_mut()
                .ok_or_else(|| anyhow!("local LLM process is unavailable"))?;
            current.stdin.write_all(line.as_bytes()).await?;
            current.stdin.write_all(b"\n").await?;
            current.stdin.flush().await?;

            let mut response_line = String::new();
            let bytes = current.stdout.read_line(&mut response_line).await?;
            if bytes == 0 {
                return Err(anyhow!("local LLM process exited unexpectedly"));
            }
            let response: SidecarResponse =
                serde_json::from_str(response_line.trim()).context("parse local LLM response")?;
            match response {
                SidecarResponse::Generated {
                    request_id: response_id,
                    text,
                } if response_id == request_id => Ok(text),
                SidecarResponse::Error { message, .. } => Err(anyhow!(message)),
                _ => Err(anyhow!("local LLM returned an unexpected response")),
            }
        })
        .await;

        let output = match result {
            Ok(Ok(output)) => output,
            Ok(Err(error)) => {
                shutdown_locked(&mut process).await;
                return Err(error);
            }
            Err(_) => {
                shutdown_locked(&mut process).await;
                return Err(anyhow!("local LLM generation timed out"));
            }
        };
        drop(process);
        self.schedule_idle_shutdown();
        Ok(output)
    }

    pub async fn shutdown(&self) {
        let mut process = self.process.lock().await;
        shutdown_locked(&mut process).await;
        self.activity_generation.fetch_add(1, Ordering::SeqCst);
    }

    fn schedule_idle_shutdown(&self) {
        let generation = self.activity_generation.fetch_add(1, Ordering::SeqCst) + 1;
        let process = Arc::clone(&self.process);
        let activity_generation = Arc::clone(&self.activity_generation);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(IDLE_TIMEOUT).await;
            if activity_generation.load(Ordering::SeqCst) != generation {
                return;
            }
            let mut current = process.lock().await;
            shutdown_locked(&mut current).await;
        });
    }
}

async fn spawn_process() -> Result<ProcessState> {
    let executable = std::env::current_exe().context("resolve Looper executable")?;
    let mut command = Command::new(executable);
    command
        .arg("--local-llm-sidecar")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true);

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x00004000;
        command.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
    }

    let mut child = command.spawn().context("start local LLM process")?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow!("local LLM stdin is unavailable"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("local LLM stdout is unavailable"))?;
    Ok(ProcessState {
        child,
        stdin,
        stdout: BufReader::new(stdout),
    })
}

async fn shutdown_locked(process: &mut Option<ProcessState>) {
    let Some(mut current) = process.take() else {
        return;
    };
    if let Ok(line) = serde_json::to_string(&SidecarRequest::Shutdown) {
        let _ = current.stdin.write_all(line.as_bytes()).await;
        let _ = current.stdin.write_all(b"\n").await;
        let _ = current.stdin.flush().await;
    }
    if tokio::time::timeout(Duration::from_secs(2), current.child.wait())
        .await
        .is_err()
    {
        let _ = current.child.kill().await;
    }
}
